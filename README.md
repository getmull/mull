# Mull

**Read everything. Understand anything.**

An open-source, self-hostable reading workspace for PDFs, articles, and technical documents. Combines a PDF-first reading experience with AI-powered comprehension.

Highlight. Search. Chat. Listen. Remember.

Self-host it or use our cloud.

---

## What It Does

- **PDF reader** — upload, extract text, reflow or original layout, zoom, bookmarks, reading progress
- **Article saving** — one-click bookmarklet using `@mozilla/readability` (Firefox Reader Mode engine)
- **AI layer** — auto-summary on upload, Ask AI with source citations, highlight → explain/define/simplify/translate
- **Listen** — read any document aloud (browser voice free, ElevenLabs natural voice optional)
- **Library** — reading queue (Unread → Reading → Library → Archived), tags, collections, full-text search
- **Reading Memory** — reopen a document after weeks and get a 30-second AI refresher on what you read

No AI key required. Everything works. AI makes it exceptional.

---

## Quickstart (Self-Hosting)

```bash
git clone https://github.com/getmull/mull
cp .env.example .env       # fill in required vars
docker-compose up
# → open http://localhost:3000
```

---

## Environment Variables

**Required:**
```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Optional — AI features hidden if omitted, not broken. Pick ONE provider:**
```
AI_PROVIDER=            # anthropic | openai | ollama | custom
ANTHROPIC_API_KEY=      # if AI_PROVIDER=anthropic
OPENAI_API_KEY=         # if AI_PROVIDER=openai
OLLAMA_BASE_URL=        # if AI_PROVIDER=ollama — default http://localhost:11434/v1, no key needed
```
See `self-hosting.md` for the full list (models, defaults, and the `custom` provider for any other OpenAI-compatible endpoint).

**Optional — Listen falls back to browser voice if omitted:**
```
ELEVENLABS_API_KEY=
```

---

## Tech Stack

- **Frontend:** Next.js 16 + TypeScript (App Router)
- **Auth + DB:** Supabase (Auth, Postgres, RLS)
- **PDF Rendering:** PDF.js
- **PDF Extraction:** `pdf-parse` + `pymupdf` Python sidecar
- **Article Parsing:** `@mozilla/readability`
- **AI:** Multi-provider via Vercel AI SDK — Anthropic, OpenAI, Ollama (local), or any OpenAI-compatible endpoint
- **Self-hosting:** Docker Compose

---

## License

[AGPL-3.0](LICENSE) — free to self-host and modify. Cloud providers who modify Mull must publish their changes.
