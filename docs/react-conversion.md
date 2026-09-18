# React conversion

Moving the frontends from Nuxt/Vue to React and React Native. The backend does
not move: the 14 migrations, the crawler and the aligner know nothing about a
frontend and stay exactly as they are.

## Why at all

Background playback with lock-screen controls. An installed PWA on iOS stops
roughly 30 seconds after being paused from the lock screen, which kills the one
use case that matters — a 70-minute set left running. That needs native.

Native did not have to mean React Native: Capacitor around the existing Nuxt app
would have reached the same OS integration via `@capgo/native-audio`, which
clears all four of this app's constraints. React Native is a deliberate choice to
learn the stack on a project worth caring about, taken with the cost understood.

## Layout

```
apps/
  mobile/   Expo SDK 57 · Expo Router · expo-audio · NativeWind v5
  web/      Vite · React · TanStack Router · Tailwind 4 · shadcn/ui   (player)
  admin/    Vite · React · TanStack Router · Tailwind 4 · shadcn/ui   (workbench)
packages/
  core/     segment model, row mapper, repeat, timings — no framework
  player/   Zustand store + audio drivers (expo-audio | HTMLAudio)
  api/      Supabase client, TanStack Query hooks, Zod schemas
  shared/   types, stations, ragas — already existed
  ui/       shadcn/ui            (web + admin)
  ui-native/  React Native Reusables  (mobile)
  tokens/   design tokens as plain TS → Tailwind config per app
```

## What can and cannot be shared

Components cannot. One renders DOM, the other renders native views, and no
amount of structure changes that — React Native Web and Tamagui would, at the
cost of the whole web app inheriting RN's component vocabulary, which is a bad
trade for a data-dense admin workbench that is keyboard-driven.

Everything else can, and `packages/` is where it goes. The rule: if it does not
render, it does not belong in an app.

## Decisions

**expo-audio, not react-native-track-player.** RNTP v5 went commercial in May
2026 — EUR 99/month or 999/year, with no documented exemption for open source.
v4 stays Apache-2.0 but is frozen; npm `latest` has not moved since August 2025.
Putting core playback on that footing is the same trade we already refused when
we passed on Uniwind for paywalling Reanimated 4. expo-audio ships in the SDK,
does background playback, `setActiveForLockScreen()` and `seekTo`, and its config
plugin writes Android's foreground service so no native code lives here.

**Zustand, not React Context.** `usePlayer.ts` uses module-level refs because
there is exactly one audio element app-wide, and the direct port of that is
Context — which is wrong. Vue's reactivity is fine-grained, so only components
reading `currentTime` re-render; Context re-renders every consumer on any
change. At a 100ms update interval that is the whole subtree, ten times a
second, forever. Zustand with selector subscriptions keeps it to the seek bar
and the lyrics panel.

**100ms status updates, not the 500ms default.** The lyrics panel follows sparse
`lineTimings` and half-second granularity visibly lags the singing.

**`interruptionMode: 'doNotMix'`.** Required alongside `setActiveForLockScreen`,
which in turn is required or Android stops background playback after about
three minutes.

**NativeWind v5 RC, pinned exact.** Taken knowingly: v5 has sat on
`5.0.0-rc.0` for a while and `react-native-css` is also an RC, while v4.2.7 is
still actively maintained. The payoff is Tailwind 4 on both web and mobile, so
`packages/tokens` emits one config shape rather than two. Neither RC may carry a
caret and neither should be bumped by Renovate. The fallback is v4.2.7, which is
a version downgrade rather than a rewrite precisely because tokens are plain
TypeScript.

## Order

1. `packages/core` — the segment model, extracted and tested. **Done.**
2. `apps/mobile` — prove background playback and lock-screen control on a real
   device. Everything downstream assumes it.
3. `packages/player` and `packages/api` — factored out once the native side's
   shape is known rather than guessed at.
4. `apps/web` — the React player, reusing 1–3.
5. `apps/admin` — last. No mobile surface, no reference implementation pressure.

The Nuxt apps keep serving production until 4 and 5 land. Work happens on
`react-conversion`; `netlify-ignore.sh` and `turbo.json` both name `layers/ui`
and `shared-theme/`, which disappear in this conversion — update them with the
cutover or both sites quietly stop deploying.

## Testing

`pnpm test` runs the workspace. `packages/core` is pure functions and is
covered: the clamps in `progressPct`, the half-second short of `endSec`, the
sparse-timing lookup where a gap is alaap and "no line" is the right answer, and
the row mapper's refusal to mint `NaN` bounds for untagged recordings.
