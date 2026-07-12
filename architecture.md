# Mull — Architecture

---

## Content Provider Model

All document types implement a shared `ContentProvider` interface. This means highlights, AI, search, Listen, bookmarks, and annotations don't care where content came from. Adding a new content type is a new provider — not a refactor.

```
ContentProvider (interface)
├── PDFProvider
├── ArticleProvider
├── EPUBProvider        ← V1.1
├── MarkdownProvider    ← V2
└── DOCXProvider        ← V2

Core services (consume any ContentProvider):
├── HighlightEngine
├── BookmarkEngine
├── AILayer
├── SearchIndex
├── ListenService
├── ReadingMemory
└── AnnotationStore
```

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js 16 + TypeScript | App Router, RSC, familiar stack |
| Auth + DB | Supabase | Auth, Postgres, RLS, Realtime |
| File Storage | Supabase Storage | PDFs, images, article snapshots |
| PDF Rendering | PDF.js | Browser-native original layout view |
| PDF Extraction | pdf-parse (primary) + pymupdf sidecar | Handles most PDFs; sidecar for complex layouts |
| Article Parsing | @mozilla/readability | Same engine as Firefox Reader Mode |
| AI | Multi-provider via Vercel AI SDK — Anthropic, OpenAI, Ollama (local), or any OpenAI-compatible endpoint | Self-hosters bring their own key or run fully local; operator-selected via `AI_PROVIDER` |
| Cross-doc AI | pgvector embeddings | Semantic search across entire library |
| Listen | Web SpeechSynthesis (V1) → ElevenLabs (V1.1) | Zero-dependency free; BYOK premium |
| Search | Postgres FTS (V1) → pgvector (V1.1) | Ship fast, upgrade to semantic post-launch |
| Self-hosting | Docker Compose | Single `docker-compose up` |

---

## AI Layer Design

```
User query
    ↓
Context builder
├── Current document chunks (vector similarity)
├── User highlights relevant to query
├── Prior AI conversation in this document
└── [V1.1] Cross-library embeddings
    ↓
Configured AI provider (Anthropic / OpenAI / Ollama / custom)
    ↓
Response + citations
    ↓
Citation resolver → links back to exact source location
```

**Cite-back standard:** Every Ask AI answer that draws on source material beyond what's already visible on screen must include a citation linking to the exact location (page number for PDFs, paragraph anchor for articles), enforced via a schema-validated response — not left to prompt engineering.

**Per-highlight Chat** is a narrower, separate pipeline — not a smaller version of the Ask AI context builder above:

```
Seed action (Explain/Define/Simplify/Translate) or freeform question
    ↓
Context: the highlighted passage + the single page it lives on + this
highlight's own conversation history (highlight_conversations, not
ai_conversations)
    ↓
Configured AI provider
    ↓
Response — no separate citation: the passage is already anchored to a
known page, shown in the Chat panel itself
```

---

## Graceful Degradation Map

| Missing config | Behavior |
|---|---|
| No AI provider configured (`AI_PROVIDER` unset or incomplete) | AI features hidden in UI — app fully functional |
| No `ELEVENLABS_API_KEY` | Listen falls back to browser voice — shows which mode is active |
| Scanned PDF (low text yield) | Surfaces notice — original view still available |
| Complex layout reflow failure | Falls back to original PDF view — never a blank screen |

---

## Database Schema (Core Tables)

```sql
users                    — Supabase Auth managed
documents                — id, user_id, type, title, source_url, storage_path, created_at
document_pages           — id, document_id, page_number, raw_text, embedding (vector)
highlights               — id, document_id, user_id, text, color, page_ref, created_at
bookmarks                — id, document_id, user_id, page_number, label, created_at
notes                    — id, highlight_id, user_id, content, created_at
ai_conversations         — id, document_id, user_id, messages (jsonb), created_at
highlight_conversations  — id, highlight_id, user_id, messages (jsonb), created_at, updated_at
reading_sessions         — id, document_id, user_id, started_at, ended_at, progress_pct
tags                     — id, user_id, name
document_tags            — document_id, tag_id
collections              — id, user_id, name
collection_docs          — collection_id, document_id
```

---

*Architecture v1 — June 2026*
