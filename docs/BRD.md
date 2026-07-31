# Business Requirements Document — Kirtan Player

**Status:** Draft · **Last updated:** 2026-07-31 · **Owner:** Baljeet Singh

---

## 1. Problem

SGPC publishes ~49,000 kirtan recordings from Sri Harmandir Sahib going back to 2006,
plus a live stream. The archive is close to complete and effectively unusable.

Evidence from a full crawl of the source (2026-07-31, 489 requests, 0 errors):

| Problem | Measured |
|---|---|
| No index exists | `date_wise.php` brute-forces ~10 guessed URL patterns per date, client-side |
| No search of any kind | Navigation is directory listings by ragi name and by date |
| Recordings are unusably long | Whole-day files are **563 MB / ~20 hours** each; 3.0 TB total |
| No shabad-level access | Nothing maps a point in a recording to what is being sung |
| Metadata is filenames only | ~22% of files disagree with their own directory on the artist |

The result: the material people actually want — a specific shabad, a specific ragi's
rendition, something to listen to now — is present but unreachable.

## 2. Opportunity

Two assets make a materially better product possible, and neither requires SGPC's
cooperation or infrastructure:

1. **The archive is crawlable and hotlinkable.** Directory listings enumerate; audio
   serves `HTTP 206` with `accept-ranges: bytes` behind Cloudflare, from any origin,
   with no referer protection. An index can be built and the audio streamed directly.
2. **Range requests make shabad-level access free.** A tagged shabad is a database row
   — `(url, start_sec, end_sec)`. No transcoding, no storage, no bandwidth.

That second point is the whole business case: **the expensive-sounding feature is cheap,
and nobody has built it.**

## 3. Goals

| # | Goal | Measure |
|---|---|---|
| G1 | Make 20 years of kirtan searchable | Search returns relevant results across 204 artists |
| G2 | Make it listenable like a music app | Queue, scrub, resume, offline, lock-screen controls |
| G3 | Make individual shabads addressable | Tagged segments playable and searchable as tracks |
| G4 | Build a tagging community | Contributors tagging without direct supervision |
| G5 | Stay free and unauthenticated to listen | No login required to play anything |

**Explicit non-goal:** mirroring SGPC. Anyone wanting raw file-by-date lookup can use
their site. This product is about discovery and shabad-level access.

## 4. Users

| Segment | Need | Why today fails them |
|---|---|---|
| **Sangat (listeners)** — largest, global diaspora | Play kirtan now; find a shabad they heard | No search; 563 MB files unusable on mobile |
| **Students & practitioners** | Compare renditions of one shabad across artists and years | No shabad-level index exists anywhere |
| **Contributors** | Give back by tagging what they know | No mechanism exists |
| **Researchers / archivists** | Coverage by artist, era, raag | No structured metadata |

## 5. Value proposition

> **One shabad → every rendition of it, across every artist and twenty years.**

This is not achievable on SGPC's site, on YouTube, or on any existing Sikh audio product,
because all of them treat the *file* as the unit. Treating the *shabad* as the unit is
the differentiator, and Range requests make it economically trivial.

## 6. Constraints

**Content.** Recordings are SGPC's, not ours. We index and link; we never rehost. The
product must degrade gracefully if SGPC restricts access, and should not present the
content as our own. Reaching out to SGPC proactively is preferred over being a surprise.

**Technical** (all verified, see `docs/sgpc-api.md`):
- `kirtan.sgpc.net/api/*` sends no CORS headers — a server layer is mandatory
- Audio MP3s send no CORS headers — Web Audio is unavailable, so **no waveforms or
  visualizers** without proxying. Playback and scrubbing are unaffected.
- Live stream is a single **28 kbps** feed; the previous 92/32/16 tiers are gone
- SGPC has already reorganised this archive once, breaking a prior integration entirely

**Cost.** Audio streams directly from SGPC, so bandwidth is near zero. AI inference for
tagging assistance is on the order of hundreds of dollars for a full pass over the
archive. Neither is a binding constraint. **Human review time is the real cost driver.**

## 7. Success criteria

**Phase 1 — Foundation**
- Complete index of ~49k tracks, refreshed nightly with change detection
- Search across artists, titles, and dates returning results in under a second
- Playback with resume, queue, and lock-screen controls
- Live stream working

**Phase 2 — Tagging**
- Admin app in use, with at least one contributor outside the owner
- Puratan auto-matched to BaniDB with a measured accuracy figure
- First 1,000 human-verified segments

**Phase 3 — Shabad discovery**
- Shabad search returning multiple renditions
- Read-along lyrics on tagged segments
- Coverage growing without the owner tagging personally

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| SGPC restructures or blocks access | Severe — catalog breaks | Crawler fails loudly on unknown markup; keep last-good index; segments keyed to content identity, not URLs, so tags survive a reorg |
| Tagging never reaches critical mass | High — the differentiator doesn't materialise | Ship the untagged catalog first so the product is useful at zero coverage; auto-seed with puratan; demand-driven tagging from zero-result searches |
| Silent mis-tagging corrupts the catalog | High — erodes trust invisibly | Nothing publishes without review; agreement between independent signals, not self-reported confidence; bias toward the review queue |
| SGPC objects to the project | Moderate | No rehosting; attribution; proactive contact |
| Owner is the only contributor | Moderate | Contributor roles from day one; trust ladder rather than manual permissioning |

## 9. Assumptions to validate

- That contributors will materialise at all — untested, and G4 depends on it
- That listeners want shabad-level access enough to change habits
- That SGPC is indifferent to (or supportive of) an independent index

---

*Companion document: [PRD.md](PRD.md). Source-of-truth API reference: [sgpc-api.md](sgpc-api.md).*
