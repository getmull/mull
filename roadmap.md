# Mull — Roadmap

---

## Build Order (Pre-Launch Priority)

Before any roadmap items, nail these four things. Everything else depends on them:

1. **A genuinely excellent PDF reader** — this has to be the best part of the product
2. **Reliable ingestion** — every PDF and article should just work
3. **AI users can trust** — every answer cites the source; trust is the moat
4. **A beautiful library** — users should want to open Mull every day, not just when they remember they saved something

---

## V1 — Launch

- PDF upload, reflow mode, original view, bookmarks
- Bookmarklet article saving
- Listen (browser voice)
- AI: auto-summary, Ask AI (with citations), highlight-explain
- Highlights, annotations, tags, collections
- Reading Memory (reopen recap)
- Reading queue: Unread → Reading → Library → Archived
- Full-text search (Postgres FTS)
- Library homepage experience
- Mobile-responsive PWA
- Docker Compose self-hosting

---

## V1.1 — First 60 Days Post-Launch

*Acquisition before optimization.*

- **Browser extension** (Chrome + Firefox) — growth feature, new user acquisition
- **Cross-document AI** — "What have I read about X?" across the entire library
  - Powered by pgvector embeddings
  - This is the feature that makes people say "oh"
  - Differentiation > native apps; moved from V2
- **Listen — ElevenLabs BYOK** — natural voice, user-managed billing
- **Reading Timeline** — monthly reading history, "Spotify Wrapped for your library"
- **Document metadata dashboard** — per-document stats: uploaded date, last read, total reading time, completion %, highlight count, note count, AI conversation count
- **Semantic search** via pgvector
- **OCR pipeline** for scanned PDFs (Tesseract)
- **EPUB support** (new ContentProvider, no core changes)
- Team sharing (cloud tier)

---

## V2

- Native iOS + Android apps
- Offline reading (full content cached locally)
- Collaborative highlights / annotations
- Public reading lists / profiles (optional, opt-in)
- API integrations: Obsidian, Notion, Readwise export
- DOCX + Markdown support (new ContentProviders)

---

## What We Won't Build (Scope Guard)

Every feature request should answer: *Does this make reading and understanding long-form content meaningfully better?*

If the answer isn't clearly yes, it doesn't ship. Mull is a reading workspace. Not a writing tool, not a task manager, not a social network.

---

*Roadmap v1 — June 2026*
