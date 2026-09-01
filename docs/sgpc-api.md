# SGPC Kirtan data surface — verified 2026-07-31

## Dead (confirmed)
| URL | Used by | Status |
|---|---|---|
| `http://new.sgpc.net/kirtan-rec/index2.php` | live-kirtan-api `api/index.js` | 404 |
| `http://sgpc.net:8000/live`, `/live32`, `/live16` | live-kirtan-api `api/live.js` | conn refused |
| `https://sgpc.net/rec-kirtan/` | kirtanplayer `server/api/kirtan.get.js` | 404 |
| `https://sgpc.net/ragi-wise/` | kirtanplayer `server/api/raagis.get.js` | 404 |
| `https://old.sgpc.net/CDN/*.mp3` | kirtanplayer `useKirtan.js` nitnem | conn refused |

## Live JSON APIs (kirtan.sgpc.net)
- `GET /api/ragi-tracks.php?type=ragi&ragi=<name>` → `{tracks:[{src,title,date}]}`  (`%20` and `+` both OK)
- `GET /api/ragi-tracks.php?type=puratan&ragi=<name>` → same shape, `puratanlkirtan/` paths
- `GET /api/puratan-index.php?ragi=<name>` → `{titles:[...]}` (titles only, no src — use type=puratan instead)
- `GET /<page>.php?_spa=1` → `{html:"..."}` SPA fragment, not data. Pages: index, cards, date_wise, puratan, Kirtan_Duties
- Ragi roster: parse `cards.php?_spa=1` → 204 names as `ragi=Bhai+X+Singh`

## Live stream
Two Shoutcast mounts, both → 200, `audio/aacp`, `ACAO: *`, Range OK:
`https://live.sgpc.net:8443/stream` (~96 kbps, the one the player uses) and
`https://live.sgpc.net:8442/stream` (28 kbps fallback). SGPC's own live pages
label 8443 "128 kbps"; the server reports `icy-br: 96` and measures ~96.

## Traversable file trees (Apache autoindex — key finding)
- `https://sgpc.net/kirtan/` → `?dir=YYYY` → `/kirtan/YYYY/MM/` → 31 `.mp3` files, e.g.
  `(02;00 - 22;30 hours) 01 January2025.mp3`. Years 2006→present. Older years use `.wma`.
- `https://sgpc.net/ragiwise/` → `?dir=<Ragi Name>` → per-ragi mp3 list (380 links for one ragi)
- `https://sgpc.net/puratanlkirtan/<Ragi>/<Title>.mp3`

**There is no date-wise API.** `date_wise.php` client-side brute-forces ~10 speculative URL
patterns per date (mp3/wma, several naming conventions). Crawling the autoindex replaces this
with an exact catalog.

## Playback constraints
- Archive mp3: `HTTP 206`, `accept-ranges: bytes`, `content-length: 29578344`, `cf-cache-status: HIT`
  → seeking/scrubbing works, Cloudflare-cached.
- Data quality: misfiled tracks exist (`Bhai Agyapal Singh ...` returned under `ragi=Bhai Agyakar Singh`)
  → argument for owning the index rather than proxying.

## Gurbani text APIs (for read-along)
- `https://api.banidb.com/v2/search/<q>?searchtype=1` → 200 JSON
- `https://api.gurbaninow.com/v2/search/<q>` → 200
- No audio↔shabad timestamp alignment exists anywhere. Sync would have to be built.

## Notation
`live.kirtannotation.com` — no DNS record. `kirtannotation.com` live
("Kirtan Notation - Create and Share Kirtan Notations").

## Decision: build as `apps/player` inside np-mono
np-mono = Turborepo/pnpm, Nuxt 4, apps/{app,admin,web}, layers/{ui,app-base,kirtan,sangeet},
packages/{audio,notation,shared}, 82 supabase migrations, portless dev proxy.

Reusable: `layers/ui` (shadcn), `layers/app-base` (auth, theme, jwt-utils, PWA),
`layers/kirtan` (brand), `apps/app/app/services/shabad.ts` (BaniDB — promote to packages/shared).

NOT reusable: np-mono's player is a **notation synthesis engine** (Tone.js tabla/tanpura, MIDI,
`useNotationPlayer`, `packages/audio`). `components/common/AudioPlayer.vue` plays IndexedDB blobs.
Streaming a 29MB remote MP3 with scrub/queue shares no code — write from scratch.

### Constraints checked (both clear)
- **No paywall inherited.** Paddle/subscription code lives only in `apps/app`
  (`usePaddle.ts`, `useSubscriptionStatus.ts`). `layers/kirtan/config.ts:66` has a `paddle:`
  config block only. A new app extending the layers gets no subscription gate.
- **BaniDB CORS is not allow-listed in prod.** `api.banidb.com` echoes any `Origin` back in
  `access-control-allow-origin` (tested 2 arbitrary origins → 200). The dev-proxy comment at
  `apps/app/nuxt.config.ts:304-312` is over-cautious for production.

### Crawler notes
- Keep the crawler OUT of the Nuxt app — separate service/cron → own tables.
- **Two different listing mechanisms in the same tree**: `sgpc.net/kirtan/` serves a themed
  `?dir=YYYY` lister; `sgpc.net/kirtan/2025/` serves a plain Apache autoindex. One parser will
  silently miss one of them.

### Seam, not a solved feature
`packages/notation/src/note-lyrics-align.ts` aligns notes↔lyrics. It does NOT align audio↔time —
nothing maps minute 340 of a 20-hour recording to a shabad. Sync must still be built.
