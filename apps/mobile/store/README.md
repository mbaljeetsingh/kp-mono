# Store submission pack

Everything needed to fill in App Store Connect and Play Console without
rediscovering it on submission day. Modelled on np-mono's, minus what EAS does
for us (signing, native versioning).

| File                                       | What it answers                                                    |
| ------------------------------------------ | ------------------------------------------------------------------ |
| [privacy-answers.md](./privacy-answers.md) | Apple App Privacy + Play Data safety, derived from code            |
| [listing.md](./listing.md)                 | Name, subtitle, descriptions, keywords, categories, screenshots    |
| [review-notes.md](./review-notes.md)       | App Review / Play "App access" notes and the one-time declarations |

## Public URLs

| What           | URL                                                 | Source                                         |
| -------------- | --------------------------------------------------- | ---------------------------------------------- |
| Privacy policy | https://kirtanplayer.beejaysoft.com/privacy/        | `apps/player/public/privacy/index.html`        |
| Delete account | https://kirtanplayer.beejaysoft.com/delete-account/ | `apps/player/public/delete-account/index.html` |
| Support / site | https://kirtanplayer.beejaysoft.com                 |                                                |
| Support email  | kirtanplayer@beejaysoft.com                         |                                                |

Static pages, so a future landing page takes them over as files. Keep the URLs:
both stores hold them.

## Before the first build

- [x] **EAS environment variables.** `EXPO_PUBLIC_SUPABASE_URL` and
      `EXPO_PUBLIC_SUPABASE_KEY` are set for production and preview
      (2026-10-07), plaintext, matching the player's Netlify values. A build
      without them throws on launch (`src/lib/supabase.ts`).
- [ ] **Migration `20261006000000_delete_own_account` on prod.** The app's
      Delete account calls it; without it the button errors.
- [ ] **Play/Apple records exist**: App Store Connect app for
      `com.beejaysoft.kirtanplayer`, Play Console app for the same package.
- [ ] **Demo account** created on production and signed into once (see
      review-notes.md).

## Open risks (decide before submitting)

1. **SGPC permission — none yet (2026-10-07).** The app streams the SGPC's
   archive and live stream from sgpc.net. Apple guideline 5.2.2 lets a
   reviewer ask for proof that the content's owner permits it, and Play's IP
   policy covers the same ground, so this is the likeliest rejection.
   - Write to SGPC asking for permission, and keep whatever comes back (even
     a "no objection", or proof of having asked) for the review notes.
   - Without it, a submission is a gamble that costs one review cycle if it
     fails, not the account. Play first, while waiting, is reasonable.
   - The listing already says the app is independent, not affiliated with
     SGPC, and streams from its public archive.
2. **Microphone string.** The app never records, so `app.json` drops the
   microphone permission (and blocks `RECORD_AUDIO` on Android). expo-audio's
   recorder is still compiled in, though, so App Store Connect may email an
   ITMS-90683 "missing purpose string" notice after the first upload. If it
   does, set expo-audio's `microphonePermission` to a specific sentence
   rather than restoring the generic default.
3. **The URLs above.** Play fetches the policy URL at review. Open both on
   the deploy preview (`/privacy/`, `/delete-account/`) before pasting them
   in. Vite's dev server sends them to the SPA, so check them on Netlify.

## Shared links and the expo-audio patch

- `/r/<id>` links open the app when it is installed. iOS checks
  `apps/player/public/.well-known/apple-app-site-association` on the live
  site (Universal Links). Android also needs
  `apps/player/public/.well-known/assetlinks.json`, which holds the SHA-256 of
  the **Play app signing** certificate (Play Console → App signing, added
  2026-10-07). Builds signed by anything else — the EAS upload key on a
  sideloaded `.aab`/`.apk` — are not verified and open links in the browser.
- `patches/expo-audio@57.0.5.patch` (iOS) adds lock-screen next/previous, a
  shabad-length scrub bar and no "LIVE" badge. Redo it on any expo-audio
  upgrade; each change in it is marked `kp-mono:`.

## Build and submit

From `apps/mobile`. EAS holds the signing credentials and the build numbers
(`appVersionSource: remote`, `autoIncrement`); `version` in app.json is the
user-facing one and moves only on a user-visible release.

```bash
npx eas-cli build --platform all --profile production
npx eas-cli submit --platform ios --profile production --latest
npx eas-cli submit --platform android --profile production --latest
```

- **iOS** goes to TestFlight. `appleTeamId` is BeeJaySoft's, copied from
  np-mono. `submit` asks for the App Store Connect app the
  first time; add its `ascAppId` to `eas.json` after that.
- **Android**: Play's API cannot create an app's first release, so upload the
  first `.aab` by hand in Play Console (Internal testing). After that,
  `submit` sends builds to the internal track as drafts (`eas.json`), to be
  promoted in the console.

## Track strategy

1. TestFlight and Play internal testing first. The real-device pass happens
   here: lock-screen and background audio, the media notification on Android,
   sign in, delete account.
2. Then production. Expect a day or two for Apple and several days for the
   first Play production review.

## Store assets

- The 1024 icon is `assets/images/icon.png` (no alpha, as Apple requires).
- Play also wants a 512×512 icon and a 1024×500 feature graphic, uploaded in
  the console. Export them from `packages/tokens/brand`.
- Screenshots: see listing.md.
