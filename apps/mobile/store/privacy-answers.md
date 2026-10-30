# Privacy form answers — derived from code

Fill Apple's App Privacy section and Play's Data safety form from this file,
not from memory. If the code starts collecting something new (analytics, crash
reports), change this file, `apps/player/public/privacy/index.html` and both
store forms in the same release.

## What the app sends anywhere

| Data                      | Where                                    | Code                                                         |
| ------------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| Email address, password   | Supabase auth (password stored hashed)   | `src/app/sign-in.tsx` → `signInWithPassword` / `signUp`      |
| Saved shabads (signed in) | Supabase `favorites`                     | `useFavorites` in `@kp/api`, via `src/lib/session.tsx`       |
| Playlists                 | Supabase `playlists`, `playlist_items`   | `src/components/PlaylistsList.tsx`, `@kp/api`                |
| User ID                   | Supabase, as the owner of the rows above | `profiles` (`supabase/migrations/20260804000000_schema.sql`) |

Signed out, saved shabads, the queue, resume position and settings live on the
device only (MMKV, `src/lib/storage.ts`). On-device data is not "collected" in
either store's sense.

Other traffic, none of it carrying personal data: audio from sgpc.net, Gurbani
text from api.banidb.com (`src/lib/links.ts`).

**Not collected — do not declare:** analytics or usage data (there is no
analytics SDK in any app), crash or diagnostics data (no Sentry), location,
contacts, photos, audio (the app never records: the microphone permission is
removed in `app.json`), advertising identifiers, purchases.

## Apple — App Privacy

- Data used to track you: **None**. No ATT prompt;
  `NSUserTrackingUsageDescription` is absent and stays absent.
- Data linked to you:

| Apple category | Items                                         | Purpose           |
| -------------- | --------------------------------------------- | ----------------- |
| Contact Info   | Email Address                                 | App Functionality |
| User Content   | Other User Content (saved shabads, playlists) | App Functionality |
| Identifiers    | User ID                                       | App Functionality |

- Data not linked to you: none.

## Play — Data safety

- Collects data: **Yes** · Shares data: **No**
- Encrypted in transit: **Yes** (HTTPS only)
- Users can request deletion: **Yes** →
  `https://kirtanplayer.beejaysoft.com/delete-account/`
- Account creation: **Yes**, username and password; in-app deletion: Library
  → account button (top right) → Delete account.

| Play category | Type                         | Optional                   | Purpose                                 |
| ------------- | ---------------------------- | -------------------------- | --------------------------------------- |
| Personal info | Email address                | Yes — listening needs none | Account management                      |
| Personal info | User IDs                     | Yes                        | Account management                      |
| App activity  | Other user-generated content | Yes                        | App functionality (saves and playlists) |

## Apple export compliance

Standard HTTPS only. `ios.config.usesNonExemptEncryption: false` in
`app.json` sets `ITSAppUsesNonExemptEncryption`, so App Store Connect does not
ask on every build.

## Ratings

Devotional music, no user-to-user content in the app (tagging happens on the
web workbench, not here), no ads, no purchases. Expect Everyone / 4+.
