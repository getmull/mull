# Mull — Self-Hosting Guide

---

## Goal

Zero to running Mull in under 10 minutes.

---

## Quickstart

```bash
git clone https://github.com/getmull/mull
make setup        # copies .env.example → .env and installs all deps
# fill in .env with your Supabase credentials
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

**Optional — AI features (hidden if omitted, not broken):**
```
ANTHROPIC_API_KEY=
```

**Optional — Natural voice for Listen (falls back to browser voice if omitted):**
```
ELEVENLABS_API_KEY=
```

---

## What's Included in Docker Compose

```yaml
services:
  web:        # Next.js frontend + API routes
  extractor:  # Python sidecar — pymupdf for complex PDF layouts
  # Supabase is external — use Supabase Cloud or self-host separately
```

---

## AI Philosophy

> AI enhances the experience. It never gates the core reading workflow.

If `ANTHROPIC_API_KEY` is not set:
- AI features are hidden in the UI
- All reading, highlighting, bookmarking, and search still work fully
- No errors, no broken states

If `ELEVENLABS_API_KEY` is not set:
- Listen uses browser-native voice automatically
- The UI shows which voice mode is active

---

## Telemetry

Mull collects zero telemetry by default.

Optional opt-in: set `MULL_PING=true` in your `.env` to send a daily anonymous ping (no personal data, no document data — just a deployment count). This helps us understand how many self-hosted instances are running. Fully documented, fully opt-in.

---

## Upgrading

```bash
git pull
docker-compose pull
docker-compose up --build
```

Database migrations run automatically on startup via Supabase migrations.

---

## Self-Hosted vs Cloud

| | Self-Hosted | Cloud |
|---|---|---|
| Cost | Free | Free / $8 / $20 per user |
| Storage | Unlimited (your disk) | 5GB / 50GB / Unlimited |
| AI | BYOK (unlimited) | 100 / 1,500 chats/mo (or BYOK) |
| Listen | Browser voice free, ElevenLabs BYOK | Browser voice free, ElevenLabs included on Pro |
| Maintenance | You manage it | Mull manages it |
| Data ownership | Fully yours | Mull's infrastructure |

---

*Self-Hosting Guide v1 — June 2026*
