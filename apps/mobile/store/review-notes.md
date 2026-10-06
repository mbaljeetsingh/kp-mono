# App Review notes

## Review notes (App Store Connect "App Review Information"; Play "App access" takes the same text)

Create the demo account on production before submitting, and sign in with it
once: a reviewer hitting a dead login is an instant rejection.

> Kirtan Player streams recorded kirtan (Sikh devotional music) from the
> public archive of the Shiromani Gurdwara Parbandhak Committee (sgpc.net),
> the body that runs Sri Harmandir Sahib.
>
> Everything in the app works without an account. An account only syncs saved
> shabads and playlists between devices.
>
> Demo account: **<demo email>** / **<password>** (Saved tab → Sign in).
>
> - **Account deletion** (5.1.1(v)): Saved tab → Delete account. Also
>   described for people without the app at
>   https://kirtanplayer.beejaysoft.com/delete-account/.
> - **Background audio**: playback continues with the screen locked
>   (UIBackgroundModes audio), which is the point of a listening app.
> - **Content**: all audio is the SGPC's own public archive, streamed from
>   sgpc.net; the app hosts none. There are no purchases and no ads.

## Play Console declarations (one-time)

- Ads: **No**
- App access: some functionality needs an account → the demo account above
- Target audience: 13+ (accounts exist; nothing is child-directed)
- News app: **No**
- Content rating (IARC): music, no user-generated content in the app
- Data safety: from [privacy-answers.md](./privacy-answers.md)
- Account deletion URL: `https://kirtanplayer.beejaysoft.com/delete-account/`
- Foreground service (media playback): Android asks why the app runs one —
  playing audio the user started, with a media notification to control it.
