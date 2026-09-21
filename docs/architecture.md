# Architecture

Three frontends over one Supabase backend, with the rules that are easy to get
wrong extracted into plain TypeScript that all three share.

The backend is not part of this story: the migrations, the crawler and the
aligner know nothing about a frontend.

## Why there is a native app

Background playback with lock-screen controls. An installed PWA on iOS stops
roughly 30 seconds after being paused from the lock screen, which kills the one
use case that matters — a 70-minute set left running.

Native did not have to mean React Native. Capacitor around the previous Nuxt app
would have reached the same OS integration via `@capgo/native-audio`. React
Native was a deliberate choice to learn the stack on a project worth caring
about, taken with the cost understood.

## Layout

```
apps/
  mobile/   Expo SDK 57 · Expo Router · expo-audio · NativeWind v5
  player/   Vite · React · TanStack Router · Tailwind 4 · shadcn/ui
  admin/    Vite · React · TanStack Router · Tailwind 4 · shadcn/ui   (workbench)
packages/
  core/      segment model, row mapper, repeat, timings — no framework
  playback/  Zustand store + audio drivers (expo-audio | HTMLAudio)
  api/       Supabase client, TanStack Query hooks, Zod schemas
  shared/    types, stations, ragas
  ui/        shadcn/ui on Base UI — web and admin
  ui-native/ React Native Reusables — the same model for the phone, on NativeWind
  tokens/    design tokens → one CSS variable set for web and native
```

## What can and cannot be shared

Components cannot. One renders DOM, the other renders native views, and no
amount of structure changes that. React Native Web and Tamagui would, at the
cost of the whole web app inheriting RN's component vocabulary — a bad trade for
a data-dense admin workbench that is keyboard-driven, with a real
`<input type="range">` on the timeline, a `<table>` for the permission matrix,
and focus management that comes free from Base UI.

What is shared instead is the _vocabulary_. `packages/ui` and
`packages/ui-native` are both shadcn, and both style themselves from the same CSS
variables in `packages/tokens`, so `bg-primary` means one colour in a Vite build
and in Metro. A component has a twin on the other side rather than a translation.

The duplication that remains is about four components — ArtTile, ShabadRow,
QueueList and the shabad search — against roughly four thousand lines of logic
that genuinely are shared. That ratio is the whole argument for this shape.

Everything else goes in `packages/`. The rule: **if it does not render, it does
not belong in an app.**

## Components

`packages/ui` is shadcn on Base UI, shared by player and admin. Its components
import relative paths rather than a `@/` alias, so consuming apps need no alias
config; each app's stylesheet adds `@source` for the package, or Tailwind scans
only the app and strips every class the components use.

`packages/ui-native` is the same idea for the phone. Three things about it are
worth knowing before running the CLI:

- It writes `@/lib/utils` imports, which shadcn projects resolve through a
  tsconfig path. That cannot work here — Metro resolves aliases globally rather
  than per package, so `@/` inside the package would point at whichever app is
  bundling. `scripts/derelative.mjs` rewrites them, and `pnpm add` runs it.
- The registry targets **NativeWind v4** and we are on the v5 RC. `cssInterop` is
  gone in v5 (its replacement is `styled`, which returns a wrapped component
  rather than mutating), and `placeholderClassName` is now a `placeholder:`
  variant. Both are patched locally; the components are ours once copied.
- The package typechecks standalone (`pnpm --filter @kp/ui-native typecheck`).
  That is the only way those errors surface, because an app compiles only what
  it imports — thirty unused components would otherwise sit there broken and
  silent.

All 32 components are present; Button, Input and Badge are adopted so far.

Icons come from `lucide-react-native`, which draws through `react-native-svg`.
Nothing in the app imports `react-native-svg` directly, so a dependency audit
will offer to remove it — and removing it blanks every icon in the app.

## Decisions

**expo-audio, not react-native-track-player.** RNTP v5 went commercial in May
2026 — EUR 99/month or 999/year, with no documented exemption for open source. v4
stays Apache-2.0 but is frozen. Putting core playback on that footing is the same
trade we refused when we passed on Uniwind for paywalling Reanimated 4.
expo-audio ships in the SDK, does background playback, `setActiveForLockScreen()`
and `seekTo`, and its config plugin writes Android's foreground service so no
native code lives here.

**Zustand, not React Context.** There is exactly one audio element app-wide, and
the direct port of that is Context — which re-renders every consumer on any
change. At a 100ms status interval that is the whole subtree, ten times a second,
forever. Zustand with selector subscriptions keeps it to the seek bar and the
read-along.

**100ms status updates, not the 500ms default.** The read-along follows sparse
`lineTimings`, and half-second granularity visibly lags the singing. It also sets
how precisely playback can stop at a segment's end.

**`interruptionMode: 'doNotMix'`.** Required alongside `setActiveForLockScreen`,
which in turn is required or Android stops background playback after about three
minutes.

**NativeWind v5 RC, pinned exact.** Taken knowingly: v5 has sat on `5.0.0-rc.0`
for a while and `react-native-css` is also an RC. The payoff is Tailwind 4 on
both web and mobile, so `packages/tokens` emits one shape rather than two.
Neither RC may carry a caret. The cost shows up in the Reusables port above.

**MMKV, not AsyncStorage.** The player writes on every track change and again
whenever a resume position is worth keeping, which during playback is every few
seconds. MMKV is synchronous and in-process. The read matters more than the
write: `hydrate()` awaits three keys before the restored queue can paint. The
storage seam stays async because `@kp/playback` and `@kp/api` ask for that and a
web build fulfils it with localStorage. v4 is `createMMKV()`, not `new MMKV()`.

**Native tabs, not a hand-written bar.** The transport must sit above the tabs
and outside every screen or it unmounts on each tab change and playback stops —
and it cannot be a sibling of the navigator, because react-native-screens renders
into native views that paint over anything JS puts beside them. That once forced
a custom tab bar. `NativeTabs.BottomAccessory` is the slot iOS 26 puts above the
tab bar for exactly this, so the workaround became the platform's own answer.
Five tabs, because iOS hides the sixth onward behind "More"; playlists moved out
of the group and are reached from Saved.

**Reanimated needs a Babel config.** NativeWind v5 needs no preset — styling runs
through Metro — so this app had no `babel.config.js` at all, and Reanimated was
installed and quietly unusable. Worklets are ordinary functions until a plugin
rewrites them to run on the UI thread, and without it `useAnimatedStyle` fails at
runtime rather than at build time. In v4 the plugin lives in
`react-native-worklets`, and it must go last.

## Testing

`pnpm test` runs the workspace: 139 tests across `core`, `playback` and `api`.
They cover the parts that are pure and easy to get wrong — the clamps in
`progressPct`, landing half a second short of `endSec`, the sparse-timing lookup
where a gap is alaap and "no line" is the right answer, the row mapper's refusal
to mint `NaN` bounds, and the PostgREST filter escaping that a comma in a search
term used to break.

That coverage stops at the app boundary, and the gap is real. Every bug this
project shipped recently lived past it: favourites written through a
`localStorage` global React Native does not have, a sign-in button that set a
flag only the web renders, Next doing nothing on a queue of one, a 24pt touch
target. All four typechecked perfectly.

Nothing automated closes that gap today. Four Maestro flows were written for it
and then deleted unrun: they cost a third-party Homebrew tap and a JVM to
execute, and inspection showed they would have failed anyway — wrong bundle id,
and `id:` selectors aimed at testIDs this app does not set, since it labels
controls for VoiceOver with `accessibilityLabel` instead. Unrun flows are worse
than none, because they read as coverage.

If E2E comes back, the shape to keep is a flow per bug — one exists because
something got through, not because a screen exists — and the first four should
be the four above.

## Building and shipping

Local development is `npx expo run:ios` — fast, free, no queue. EAS is for
anything that leaves the machine, mostly because it manages Apple code signing.

The project is `@beejaysoft/kirtan-player`, bundle id
`com.beejaysoft.kirtanplayer` (reverse-DNS of kirtanplayer.beejaysoft.com), with
development, preview and production profiles in `eas.json`.

`.env` is gitignored and never uploaded, and `src/lib/supabase.ts` throws without
its two variables — so a cloud build reads them from EAS rather than from a file.
`apps/mobile/.env.example` carries the commands. The publishable key is plaintext
on purpose: it is public by design and already ships in the web bundle.

**Netlify still needs changing by hand.** Each site's build command and publish
directory live in the dashboard, not in `netlify.toml`. Both want a Vite SPA:
build `pnpm build:player` / `pnpm build:admin`, publish `apps/<app>/dist`, with
an SPA redirect so client-side routes resolve.

## Known gaps

- The tab bar does not minimise on scroll, and the reason is upstream. The prop
  reaches UIKit, but UIKit minimizes against a scroll view registered through
  `setContentScrollView` — which react-native-screens only calls from
  `registerDescendantScrollView`, compiled in behind the `RNS_GAMMA_ENABLED`
  pod-install flag (off by default) and driven by a `ScrollViewMarker` the
  package does not export. A plain FlatList is never registered. Enabling an
  experimental flag across the navigation layer is not worth a scroll
  animation; the prop starts working when gamma ships by default.
- SGPC refuses the artist-roster endpoint from GitHub's IP ranges: 200 from a
  residential connection, 403 from a runner. The weekly crawl tolerates it;
  photos refresh with `pnpm crawl:artists && pnpm seed:artists` from a laptop.
- No end-to-end run is automated, on a machine or in CI. Unit tests stop at the
  app boundary and every bug this project shipped recently lived past it, so
  this is the largest real gap — see Testing for what was tried.

## History

The frontends were Nuxt/Vue until 2026. `layers/ui` held 61 shadcn-vue
components, and shadcn-vue is itself a port of shadcn/ui, so the React apps
started from the original rather than from hand-written markup — same names, same
props, same classes. The Nuxt apps, `layers/ui`, `shared-theme/` and the root
`components.json` were deleted at cutover and the React apps took their names.
