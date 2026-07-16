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

Status as of 2026-07-16. ✅ done · 🟡 partial · ⬜ not started

- 🟡 PDF upload, reflow mode, original view, bookmarks — upload/extraction/original-view done; **no reflow mode, no bookmarks** (schema only)
- ⬜ Bookmarklet article saving — `@mozilla/readability` not installed, reader 404s non-PDF docs
- ⬜ Listen (browser voice)
- 🟡 AI: auto-summary, Ask AI (with citations), highlight-explain, highlight-chat — Ask AI + highlight actions + Chat done; **auto-summary not started**
- 🟡 Highlights, annotations, tags, collections — highlights + notes done; **tags/collections schema only, no API/UI**
- ⬜ Reading Memory (reopen recap)
- ⬜ Reading queue: Unread → Reading → Library → Archived — only one automatic unread→reading transition exists; no manual states, no queue UI
- ⬜ Full-text search (Postgres FTS)
- 🟡 Library homepage experience — flat chronological list only; no Continue Reading / Recently Added / queue filtering
- ⬜ Mobile-responsive PWA — no manifest, no service worker
- ✅ Docker Compose self-hosting

**Suggested build order for what's left** (small/unblocking → core-loop gaps → new subsystems → polish):
1. Reading progress + scroll position persistence, Bookmarks — schema ready, small, mirrors the highlights pattern already built
2. Article ingestion (bookmarklet + readability ContentProvider), Tags/Collections + reading-queue UI, Full-text search — closes the core Save→Read loop and makes the library homepage real
3. Auto-summary, Listen, Reading Memory — new subsystems, higher effort
4. Mobile-responsive PWA — cross-cutting, do last before launch

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
