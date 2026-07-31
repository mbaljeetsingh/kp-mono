# Product Requirements Document — Kirtan Player

**Status:** Draft · **Last updated:** 2026-07-31 · Companion: [BRD.md](BRD.md)

---

## Product shape

Two apps over one database.

```
apps/player/   public, no login required to listen
apps/admin/    auth required, tagging workbench
packages/crawler/   nightly cron → Postgres (not in either app)
packages/shared/    types, filename parser
```

**Three data tiers, two surfaced:**

| Tier | Count | In the player? |
|---|---|---|
| Ragiwise — 70-min sets, artist + date + slot | 41,162 | **Yes** — the day-one catalog |
| Puratan — one shabad per track, title = first line | 1,051 | **Yes** — auto-taggable to BaniDB |
| Daywise — 563 MB, ~20 hrs, 3 TB total | 6,882 | **No** — indexed only, source material |

Day files stay out of browse and search. They cover only 95 days that ragiwise doesn't,
and they're unusable as tracks.

## Core concepts

**Track** — a file on sgpc.net. Identity is the content's natural key
(`tree | artist | date | slot`), **never the URL** — SGPC has reorganised before, and
URL-keyed IDs would orphan every tag attached to them.

**Segment** — a tagged region of a track: `(trackId, startSec, endSec, name, shabadId?)`.
This is the unit the player searches and plays. Costs one row; Range requests do the
seeking. A track with no segments plays as one full-length item.

## Player requirements

### P1 — Search first
Search is the primary action. Spans artist, title, date, and (once tagged) shabad.
Tagged segments rank above whole tracks. Date is a filter, not a browse mode.

### P2 — Browse shelves
Recent · Artists (204) · Puratan · Featured (curated table). No date-wise navigation.

### P3 — Player
- Queue, scrub (Range-backed), **resume position** — mandatory, not polish, at 70-min lengths
- MediaSession API for lock-screen, Bluetooth, and car controls
- Favorites and resume stored locally, keyed by **stable track/segment id** so they
  migrate cleanly to an account when auth lands
- Offline download for segments; **not** for 563 MB day files
- **No waveforms or visualizers** — no CORS on the MP3s makes Web Audio unavailable

### P4 — Live
`https://live.sgpc.net:8442/` — direct `<audio>`, `ACAO: *`, no proxy. Single 28 kbps
AAC feed. Its own tab, independent of the catalog.

### P5 — Artist pages
Work with zero tagging: artist, date, and time slot all come free from the directory and
filename. Grows from "241 recordings" to "241 recordings, 1,800 shabads" as coverage builds.

### P6 — Auth (deferred, not blocking)
Nothing requires login to listen. Accounts arrive with contributors; playlists and synced
favorites follow.

## Admin requirements

### A1 — Contribute freely, publish under review
Anyone can sign up and propose immediately. Nothing reaches the player unreviewed.

```
sign up → pick what you want to work on → tag → proposal → review → published
```

### A2 — One trust ladder, not five roles
`contributor → trusted → reviewer → admin`. Auto-promote on N approved contributions.

**Task preference is separate and multi-select** — segmenting, shabad tagging, music
tagging. It routes work; it grants nothing.

### A3 — Tagging workbench
Play a track, mark start/end, name it, save. **Name + boundaries is the only required
tag** — searchable immediately, no Gurbani literacy needed. Everything else is additive:

- BaniDB `shabadId` → cascades raag, ang, author, and lyrics for free
- Taal, instrument, tempo — human-only, no external source

### A4 — Consensus over review
Two independent contributors landing on the same boundary or shabad auto-approves it.
Human review is for contested and solitary tags only, or it becomes the bottleneck.

### A5 — Artist is not tagged
It comes from the directory name, full stop. Filename disagreement is recorded as an
informational flag, not a review queue — treating it as one produced ~8,000 items of
work that told us nothing.

## Assist (later, not blocking)

| Job | Approach | Status |
|---|---|---|
| Segment boundaries | Silence/energy detection — no LLM | The cheap win, ship early |
| Puratan → BaniDB | Normalize (`anvaad-js`) → retrieve → model re-rank | ~1,000 items, seeds the corpus |
| Segment → shabad | Audio-input model; fine-tune on accumulated tags | Needs seed data first |

Gate on **agreement between independent signals**, not self-reported confidence. Bias
toward the review queue: a queued item costs 20 seconds, a wrong auto-accept corrupts
search silently.

Every tag is training data — store `source` and exact offsets from day one.

## Out of scope for v1

Articles/CMS · day-file browsing · playlists · waveforms · auto-scrolling read-along
(nothing maps minute 340 of a 20-hour file to a shabad until segments exist) · duty roster
· mobile apps (PWA first).

## Build order

1. **Schema + load** — 49k crawled tracks into Postgres
2. **Admin** — auth, roles, tagging workbench *(the engine; contributors are day-one)*
3. **Player** — search, shelves, playback, live
4. Puratan → BaniDB matcher
5. Auto-segmentation assist
6. Playlists, offline, PWA

Admin before player: contributors were chosen as day-one, and the matcher's output needs
a review UI — which *is* the admin.
