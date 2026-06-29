# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What Mull Is

An open-source, self-hostable **reading workspace** for PDFs, articles, and technical documents — combining a PDF-first reading experience with AI-powered comprehension.

**Core loop:** Save → Read → Understand → Remember

Every feature decision should answer: *Does this make reading and understanding long-form content meaningfully better?*

---

## Tech Stack — Do Not Deviate Without Discussion

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 + TypeScript (App Router) |
| Auth + DB | Supabase (Auth, Postgres, RLS, Realtime) |
| File Storage | Supabase Storage |
| PDF Rendering | PDF.js (browser-native, original layout view) |
| PDF Text Extraction | `pdf-parse` (primary) + `pymupdf` Python sidecar (fallback) |
| Article Parsing | `@mozilla/readability` |
| AI | Claude API — model: `claude-sonnet-4-6` |
| Listen | Web `SpeechSynthesis` API (V1) → ElevenLabs API (V1.1) |
| Search | Postgres full-text search (V1) → pgvector (V1.1) |
| Self-hosting | Docker Compose |

---

## Repo Structure

```
/apps
  /web          ← Next.js frontend + API routes
  /extractor    ← Python sidecar (pymupdf for complex PDFs)
/packages
  /types        ← shared TypeScript types and interfaces
/docs           ← product specs, vision, roadmap, architecture
/docker-compose.yml
```

## Development Commands

**Web app (`apps/web`):**
```bash
pnpm dev          # start dev server
pnpm build        # production build
pnpm lint         # ESLint
pnpm test         # run test suite
pnpm test <file>  # run a single test file
```

**Python extractor (`apps/extractor`):**
```bash
uv sync --dev                        # install dependencies
uv run uvicorn main:app --reload     # start sidecar server
uv run pytest                        # run all tests
uv run pytest path/to/test_file.py  # run a single test file
```

**Full stack:**
```bash
docker-compose up         # start all services
docker-compose up --build # rebuild and start
```

---

## Architecture — ContentProvider Model

All document types implement a shared `ContentProvider` interface. Every core service consumes `ContentProvider` — they are agnostic to the source type.

```
ContentProvider (interface)
├── PDFProvider
├── ArticleProvider
└── [EPUBProvider, MarkdownProvider, DOCXProvider — V1.1/V2, not now]

Core services (work with any ContentProvider):
├── HighlightEngine
├── BookmarkEngine
├── AILayer
├── SearchIndex
├── ListenService
├── ReadingMemory
└── AnnotationStore
```

When adding a new content type, add a new Provider. Do not modify core services.

**AI Layer pipeline:**
```
User query
    ↓
Context builder
├── Current document chunks (vector similarity)
├── User highlights relevant to query
└── Prior AI conversation in this document
    ↓
Claude API (claude-sonnet-4-6)
    ↓
Response + citations
    ↓
Citation resolver → links to exact source location (page # / paragraph anchor)
```

---

## Database Schema

```sql
users            -- Supabase Auth managed
documents        -- id, user_id, type, title, source_url, storage_path, created_at
document_pages   -- id, document_id, page_number, raw_text, embedding (vector, V1.1)
highlights       -- id, document_id, user_id, text, color, page_ref, created_at
bookmarks        -- id, document_id, user_id, page_number, label, created_at
notes            -- id, highlight_id, user_id, content, created_at
ai_conversations -- id, document_id, user_id, messages (jsonb), created_at
reading_sessions -- id, document_id, user_id, started_at, ended_at, progress_pct
tags             -- id, user_id, name
document_tags    -- document_id, tag_id
collections      -- id, user_id, name
collection_docs  -- collection_id, document_id
```

---

## Environment Variables

```bash
# Required
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
NEXT_PUBLIC_APP_URL=

# Optional — AI features hidden if omitted, not broken
ANTHROPIC_API_KEY=

# Optional — Listen falls back to browser voice if omitted
ELEVENLABS_API_KEY=
```

---

## Non-Negotiable Rules

### AI Core Philosophy
AI enhances the experience — it never gates the core reading workflow. Mull must be fully usable with zero API keys configured.

**Graceful degradation:**
| Missing config | Required behavior |
|---|---|
| No `ANTHROPIC_API_KEY` | Hide AI features in UI — app fully functional |
| No `ELEVENLABS_API_KEY` | Listen falls back to browser voice — shows which mode is active |
| Scanned PDF (< 50 chars/page average) | Surface notice in UI — original PDF view always available |
| Complex layout reflow failure | Fall back to original PDF view — never a blank screen |

### Cite-Back Standard
Every AI answer that references source material must include a citation linking to the exact source location:
- PDFs: page number
- Articles: paragraph anchor

This is enforced at the architecture level. Do not ship an AI response without a citation.

### Code Quality
- TypeScript strict mode. No `any` without a comment explaining why.
- Every API route must handle missing env vars gracefully — check before calling, return a clear disabled state, not a 500.
- Supabase Row-Level Security must be enabled on all user-data tables. Never bypass RLS.
- All file uploads go through Supabase Storage. Never store binary data in Postgres.
- Env var presence is the feature flag — no feature flags library needed in V1.

---

## Naming Conventions — Enforced Everywhere

- The audio reading feature is **Listen** — not TTS, not Listen Mode, not Read Aloud. In UI, code, and docs.
- Reading states are **Unread, Reading, Library, Archived** — not "Done," not "Complete." Library = reference documents.
- The AI Q&A feature on a document is **Ask AI** — not Chat, not Q&A.
- The reopen recap is **Reading Memory** — not Summary, not Recap.
- Highlight actions: **Explain / Define / Simplify / Translate** — these exact words.

---

## V1 Scope — What to Build Now

- PDF upload, text extraction, reflow mode, original layout toggle
- Page navigation, zoom, scroll position memory, reading progress
- Bookmarks (named page markers inside documents)
- Web article saving via bookmarklet (`@mozilla/readability`)
- AI: auto-summary on upload, Ask AI (with source citations), highlight → explain/define/simplify/translate
- Highlights with colors (yellow, green, blue, pink) + inline notes
- Tags, collections, reading queue (Unread → Reading → Library → Archived)
- Reading Memory (recap when reopening a document after a gap)
- Full-text search across documents, highlights, notes, bookmarks
- Library homepage (Continue Reading, Recently Added, queue states)
- Listen — browser voice (play/pause, skip ±30s, speed control, sentence highlighting, position memory)
- Mobile-responsive PWA (375px minimum, share sheet support)
- Docker Compose self-hosting

## V1.1 and Beyond — Do Not Build Yet

- Browser extension, cross-document AI, ElevenLabs BYOK, Reading Timeline, OCR/Tesseract, semantic search via pgvector, EPUB support, team sharing, native apps, offline reading, third-party integrations.

---

*CLAUDE.md v2 — June 2026*
