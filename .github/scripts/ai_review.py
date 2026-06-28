import os, json, sys, urllib.request, urllib.error

api_key = os.environ.get("ANTHROPIC_API_KEY")
if not api_key:
    print("ANTHROPIC_API_KEY not set — skipping review.")
    sys.exit(0)

with open("pr.diff") as f:
    diff = f.read()

if not diff.strip():
    print("Empty diff — skipping review.")
    sys.exit(0)

if len(diff) > 30000:
    diff = diff[:30000] + "\n\n[diff truncated — showing first 30k chars]"

prompt = (
    "You are reviewing a pull request for Mull — an open-source reading workspace "
    "(Next.js 14 + TypeScript + Python + Supabase).\n\n"
    "Review this diff for:\n"
    "- Bugs or logic errors\n"
    "- Security issues (XSS, SQL injection, RLS bypasses, exposed secrets)\n"
    "- Missing env var null checks (all API routes must degrade gracefully)\n"
    "- TypeScript `any` without an explanatory comment\n"
    "- AI responses missing source citations (cite-back is non-negotiable)\n"
    "- Binary data stored in Postgres instead of Supabase Storage\n\n"
    "Respond in this exact JSON format:\n"
    '{"has_issues": true | false, "review": "your findings as markdown"}\n\n'
    "If nothing is wrong, set has_issues to false and keep review brief.\n"
    "Flag real issues only — no style nitpicks.\n\n"
    "Diff:\n"
    "--- BEGIN DIFF ---\n"
    + diff +
    "\n--- END DIFF ---"
)

payload = {
    "model": "claude-sonnet-4-6",
    "max_tokens": 2048,
    "messages": [{"role": "user", "content": prompt}],
}

try:
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(payload).encode(),
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())
except urllib.error.HTTPError as e:
    print(f"Claude API error: {e.code} — skipping review.")
    sys.exit(0)

try:
    parsed = json.loads(result["content"][0]["text"])
    has_issues = parsed.get("has_issues", False)
    review_body = parsed.get("review", "No findings.")
except (json.JSONDecodeError, KeyError):
    has_issues = False
    review_body = result["content"][0]["text"]

event = "REQUEST_CHANGES" if has_issues else "APPROVE"
comment = f"## AI Code Review\n\n{review_body}\n\n---\n*Reviewed by Claude (`claude-sonnet-4-6`)*"

try:
    gh_req = urllib.request.Request(
        f"https://api.github.com/repos/{os.environ['REPO']}/pulls/{os.environ['PR_NUMBER']}/reviews",
        data=json.dumps({"body": comment, "event": event}).encode(),
        headers={
            "Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(gh_req) as resp:
        resp.read()
    print(f"Review submitted: {event}")
except urllib.error.HTTPError as e:
    print(f"GitHub API error: {e.code} — review not posted.")
    sys.exit(1)
