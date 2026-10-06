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

- [ ] **EAS environment variables.** `production` and `preview` have none
      (checked 2026-10-06), and a build without them throws on launch
      (`src/lib/supabase.ts`). The commands are in `../.env.example`.
- [ ] **Migration `20261006000000_delete_own_account` on prod.** The app's
      Delete account calls it; without it the button errors.
- [ ] **Play/Apple records exist**: App Store Connect app for
      `com.beejaysoft.kirtanplayer`, Play Console app for the same package.
- [ ] **Demo account** created on production and signed into once (see
      review-notes.md).

## Build and submit

From `apps/mobile`. EAS holds the signing credentials and the build numbers
(`appVersionSource: remote`, `autoIncrement`); `version` in app.json is the
user-facing one and moves only on a user-visible release.

```bash
npx eas-cli build --platform all --profile production
npx eas-cli submit --platform ios --profile production --latest
npx eas-cli submit --platform android --profile production --latest
```

- **iOS** goes to TestFlight. `submit` asks for the App Store Connect app the
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
