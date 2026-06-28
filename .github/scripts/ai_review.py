import os, json, urllib.request, sys

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
    "Be concise. Flag real issues only — no style nitpicks. "
    "Format as a short markdown list. If nothing is wrong, say so in one line.\n\n"
    "Diff:\n\n" + diff
)

payload = {
    "model": "claude-sonnet-4-6",
    "max_tokens": 2048,
    "messages": [{"role": "user", "content": prompt}],
}

req = urllib.request.Request(
    "https://api.anthropic.com/v1/messages",
    data=json.dumps(payload).encode(),
    headers={
        "x-api-key": os.environ["ANTHROPIC_API_KEY"],
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    },
)
with urllib.request.urlopen(req) as resp:
    result = json.loads(resp.read())

review = result["content"][0]["text"]
comment = "## AI Code Review\n\n" + review + "\n\n---\n*Reviewed by Claude (`claude-sonnet-4-6`)*"

gh_req = urllib.request.Request(
    f"https://api.github.com/repos/{os.environ['REPO']}/issues/{os.environ['PR_NUMBER']}/comments",
    data=json.dumps({"body": comment}).encode(),
    headers={
        "Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
    },
)
urllib.request.urlopen(gh_req)
print("Review posted.")
