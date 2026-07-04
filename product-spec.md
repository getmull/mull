# Mull — Product Spec

---

## Feature Scope — V1

### 1. PDF Experience

**Core:**
- Upload PDF → auto-extract clean readable text (reflow mode)
- Toggle between original PDF layout and clean text view
- Page navigation, zoom, scroll position memory per document
- Reading progress tracking (% read, last position on return)
- Bookmarks — mark any page for quick return (Page 142 → "Chapter 6 starts here")
- Auto-detect scanned PDFs: if text extraction yields fewer than 50 chars/page on average, surface a notice: *"This PDF appears to be scanned. Text features may be limited."*

**Text Extraction Strategy:**
- Primary: `pdf-parse` (Node.js, fast, works for most text-based PDFs)
- Fallback: `pymupdf` via a lightweight Python sidecar for complex layouts
- Scanned/image-only: never fail silently

**Known Limitations (documented, not hidden):**
- Complex multi-column layouts may not reflow cleanly — original view is always available
- Scanned PDFs have limited AI features in V1; OCR (Tesseract) is V1.1

**Document view concept:**
```
+------------------------------------------+
|  [←] Attention Is All You Need    [⋯]   |
|------------------------------------------|
|  Summary · Key Concepts · 22 min read    |
|  [Ask AI]  [Listen]  [Original / Reflow] |
|------------------------------------------|
|                                          |
|   [PDF content renders here]             |
|                                          |
|------------------------------------------|
|  Highlights (12)  Bookmarks (3)  Chat    |
+------------------------------------------+
```

---

### 2. Web Article Saving

**V1 — Bookmarklet:**
- One-click save from any browser
- Clean reader view via `@mozilla/readability`
- Auto-extracts: title, author, publication date, read time, hero image
- Saves full HTML snapshot — readable even if the source goes offline

**V1.1 — Browser Extension (Chrome + Firefox):**
- Right-click to save selected text
- Visual indicator if the page is already saved
- Moved before OCR in V1.1: extensions acquire new users, OCR serves existing ones

---

### 3. Listen

Any saved document or article can be listened to. The feature is called **Listen** everywhere — on buttons, in settings, in documentation. Not "TTS," not "Listen Mode," not "Read Aloud." Just Listen.

**V1 — Free (no setup):**
- Browser-native voice, works out of the box
- Playback controls: play/pause, skip ±30s, speed (0.5×–2×)
- Highlights the sentence currently being read
- Remembers playback position per document

**V1.1 — ElevenLabs BYOK (natural voice):**
- Connect your own ElevenLabs API key in settings
- Natural, human-quality voice — billed to your ElevenLabs account
- Voice selection from your ElevenLabs library
- Same UI — just a better audio source

**Cloud Pro — ElevenLabs included:**
- Mull-managed key, no setup
- Included in Pro, subject to fair-use character limits

**Graceful degradation:** Always falls back to browser voice if no ElevenLabs key is set. Always shows which voice is active. Never fails silently.

---

### 4. AI Layer

AI is multi-provider (Anthropic, OpenAI, Ollama, or any OpenAI-compatible endpoint), operator-selected via `AI_PROVIDER`. No provider configured = AI features hidden, not broken. The app must be fully usable without AI.

**On Upload (automatic):**
- TL;DR summary (3–5 sentences)
- Key themes extracted
- Estimated reading time (density-adjusted)

**While Reading:**
- **Ask AI** — Q&A with citations back to source (page # for PDFs, paragraph anchor for articles)
- **Highlight → Explain** — select text, choose: Explain / Define / Simplify / Translate
- **Highlight → Ask** — free-form prompt against the selected passage

**Cite-back standard:** Every AI answer links to the exact source location. Non-negotiable.

---

### 5. Core Reading UX

- Highlights (colors: yellow, green, blue, pink) with inline notes
- Bookmarks — named page markers inside documents
- Tags (user-defined) and Collections (grouped document sets)
- Reading queue states: **Unread → Reading → Library → Archived**
  - *Library* = reference documents you return to, not tasks you complete
- Keyboard shortcuts (navigate, highlight, bookmark, archive, listen)

**Reading Memory:**

When a user reopens a document they haven't visited in a while, Mull surfaces a contextual recap:

```
Last opened 6 months ago.
You highlighted 18 passages and asked AI 7 questions.
Here's a 30-second refresher: [AI-generated summary of your highlights + notes]
```

This is the feature people talk about. It makes the library feel alive.

**Search — the full picture:**

Search isn't just a text box. It spans your entire workspace:

```
Search: "authentication"
────────────────────────────────
6 PDFs       matching content
4 articles   matching content
28 highlights  you made
11 notes     you wrote
3 AI conversations  on this topic
2 bookmarks  you named
```

Postgres full-text search in V1. Semantic search via pgvector in V1.1.

**Reading Timeline:**

A scrollable view of your reading history by month:

```
June 2026     12 documents
May 2026       8 documents
April 2026    21 documents  ← your biggest month
```

Tapable to see what you read in any given month. "Spotify Wrapped for your reading" — ships in V1.1.

---

### 6. Library Experience

The library is the homepage and the heart of the product — not the PDF viewer. Users should want to open Mull every day.

**Library view concept:**
```
+------------------------------------------+
|  Mull          [Search]        [+ Add]  |
|------------------------------------------|
|  Continue Reading                        |
|  › Attention Is All You Need   — 64%    |
|  › The Pragmatic Programmer    — 31%    |
|------------------------------------------|
|  Recently Added                          |
|  [PDF]  [Article]  [PDF]  [Article]     |
|------------------------------------------|
|  Your Library        [Filter] [Sort]     |
|  Unread (12)  Reading (3)  Library (47) |
+------------------------------------------+
```

---

### 7. Mobile Experience (V1)

No native app in V1 — but the web app must be fully usable on mobile:
- Responsive layout down to 375px
- Touch-friendly highlight and bookmark interactions
- PWA manifest + service worker — installable on iOS/Android home screen
- "Share to Mull" via iOS/Android share sheet

Native apps are V2.

---

### 8. Open Core Split

| Feature | Self-Hosted | Cloud Free | Cloud Pro |
|---|---|---|---|
| PDF upload + reading | ✅ | ✅ | ✅ |
| Article saving | ✅ | ✅ | ✅ |
| Highlights + annotations | ✅ | ✅ | ✅ |
| Bookmarks | ✅ | ✅ | ✅ |
| Tags + collections | ✅ | ✅ | ✅ |
| Full-text search | ✅ | ✅ | ✅ |
| Reading Memory | ✅ | ✅ | ✅ |
| Reading Timeline | ✅ | ✅ | ✅ |
| Multi-device sync | ✅ (own server) | ✅ | ✅ |
| Listen (browser voice) | ✅ | ✅ | ✅ |
| Listen (ElevenLabs BYOK) | ✅ | ✅ | ✅ |
| Listen (ElevenLabs included) | ❌ | ❌ | ✅ fair use |
| AI — BYOK (unlimited) | ✅ | ✅ | ✅ |
| AI — included | ❌ | 100 chats/mo | 1,500 chats/mo |
| Storage | ✅ Unlimited | 5 GB | 50 GB |
| Team sharing | ❌ V1.1 | ❌ | ✅ |
| Browser extension | ✅ V1.1 | ✅ V1.1 | ✅ V1.1 |

---

*Product Spec v1 — June 2026*
