# Mull web app

Next.js 16 App Router frontend and API routes. Run workspace commands from the
repository root after copying the required Supabase configuration into
`apps/web/.env.local`. AI configuration is optional.

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm lint
pnpm build
```

## Reading-flow verification

Run `pnpm test:e2e` (or `pnpm test:e2e:reader`) after `pnpm exec playwright install chromium`.
The suite starts an isolated Next.js server on port 3107 and a test-only Supabase
HTTP fixture on port 54329. It covers PDF upload/extraction/rendering, bookmark
creation/deletion, page-position persistence, Continue Reading, and failed-save
recovery at 1280px, 640px, and 375px. Screenshots are written to `test-results/`.
It uses Chromium at all three widths; this does not validate Safari behavior.
An existing Chromium installation can be selected with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

This suite requires no database or AI credentials. The fixture is not an RLS test. Use the real database suite below to verify
migrations and ownership policies.
Resume restores the page number; exact vertical scroll position is not yet saved.


## Real Supabase verification

`pnpm test:e2e:supabase` covers real Auth, Storage, Postgres, and RLS, using only
normal signed-in users and the public anon key. It creates disposable local test
users and deletes their test documents/files afterward. Do not use a production
project or a service-role key. The runner rejects non-local Supabase URLs.

Use Docker and Supabase CLI **2.39.2** with `supabase/verification.toml`. This
small test configuration uses its own project (`mull-verify`) and ports
55321/55322 so an existing stack on 54321 is not modified. From the repo root:

```bash
mkdir -p /tmp/mull-local-verify/supabase
cp supabase/verification.toml /tmp/mull-local-verify/supabase/config.toml
ln -s "$PWD/supabase/migrations" /tmp/mull-local-verify/supabase/migrations
pnpm dlx supabase@2.39.2 start --workdir /tmp/mull-local-verify \
  --exclude studio,realtime,logflare,vector,supavisor,imgproxy,edge-runtime,postgres-meta,mailpit
```

The CLI applies all migrations on first start. For an existing verification
stack, run `supabase migration up --local --workdir /tmp/mull-local-verify`
using that same CLI version; no database reset is needed.

Get the local anon key with `supabase status --workdir /tmp/mull-local-verify`.
Then run from `apps/web`:

```bash
export MULL_TEST_SUPABASE_URL=http://127.0.0.1:55321
export MULL_TEST_SUPABASE_ANON_KEY='<local anon key>'
pnpm test:e2e:supabase
```

The suite starts Mull on port 3117 with explicit test configuration; it does not
change `.env.local`. Its ownership tests cover direct Supabase reads, inserts,
updates, deletes, bookmark reassignment to a foreign document, and the equivalent
Mull API write checks. The browser test signs in through the actual login form,
uploads a PDF, checks extracted pages and progress in Postgres, and verifies that
bookmarks and the saved page survive reopening.

Verification completed locally on 2026-11-20. The first run reproduced a bookmark
RLS gap: a user could attach their own bookmark to a foreign document through
direct Supabase access. Migration `20261120000001_bookmarks_document_ownership.sql`
adds parent-document ownership to both `USING` and `WITH CHECK`; the regression
suite passes with it applied. Deployments must apply all pending migrations,
including that policy fix.


## Long-document Ask AI verification

With the isolated local Supabase setup and `MULL_TEST_SUPABASE_*` variables above,
run `pnpm test:e2e:ai`. The test starts a deterministic local OpenAI-compatible
provider on port 4123 and Mull on port 3117. It uploads an 80-page PDF, asks about
a passage on page 76, verifies the saved citation and navigation to that page,
and checks that an invented page citation returns an error without changing the
saved conversation. No external provider, paid request, or AI key is required.

The unit/integration suite additionally covers passages beyond 1,000 database
rows, terms near the end of unusually long pages, distant-page comparisons,
follow-ups, highlight source selection, context limits, retrieval errors, and
structured-output/citation enforcement through the installed AI SDK. These tests
verify retrieval and application behavior with deterministic responses, not the
answer quality of a live model. V1 retrieval matches keywords; it can miss
paraphrases, and overview excerpts do not replace a full-document summary.
