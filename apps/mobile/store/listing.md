# Kirtan Player — listing copy

Limits: App Store name 30, subtitle 30, keywords 100; Play title 30, short
description 80, full description 4000.

## Identity

| Field                  | Value                                                                             |
| ---------------------- | --------------------------------------------------------------------------------- |
| Name (both stores)     | `Kirtan Player` (13)                                                              |
| Apple subtitle         | `Kirtan from Harmandir Sahib` (27)                                                |
| Play short description | `20 years of live kirtan from Sri Harmandir Sahib, with Gurbani read-along.` (74) |
| Apple primary category | Music                                                                             |
| Apple secondary        | Lifestyle                                                                         |
| Play category          | Music & Audio                                                                     |
| Support URL            | `https://kirtanplayer.beejaysoft.com`                                             |
| Privacy policy URL     | `https://kirtanplayer.beejaysoft.com/privacy/`                                    |
| Support email          | `kirtanplayer@beejaysoft.com`                                                     |
| Price                  | Free, no in-app purchases, no ads                                                 |

## Full description (both stores)

> Kirtan Player brings twenty years of kirtan recorded at Sri Harmandir Sahib
> to your phone, streamed from the SGPC's own archive.
>
> FIND ANY SHABAD
> Search by shabad, by ragi, or by a line of Gurbani, and play every rendition
> the archive holds of it.
>
> READ ALONG
> Follow the Gurbani as it is sung, line by line, in Gurmukhi with
> translation.
>
> LISTEN YOUR WAY
> Keep listening with the screen locked. Browse by ragi, tune into live radio,
> build playlists and save the shabads you return to.
>
> NO ACCOUNT NEEDED
> Everything plays without signing in. Create an account only if you want your
> saved shabads and playlists to follow you between devices.
>
> Kirtan Player is an independent app and is not affiliated with the
> Shiromani Gurdwara Parbandhak Committee. Recordings are streamed from the
> SGPC's public archive at sgpc.net.

## Apple keywords

`kirtan,gurbani,shabad,sikh,ragi,darbar sahib,golden temple,sgpc,gurmukhi,paath,keertan`

## Screenshots

Capture from the Simulator / emulator on production data, light and dark not
mixed within a set:

1. Home — what's playing and recent shabads
2. Now playing with the read-along
3. Search results for a shabad
4. A ragi's page
5. Radio

Apple: iPhone at 1206×2622 (one of the sizes App Store Connect accepted when
1320×2868 was rejected; the 6.9" captures are scaled down) and iPad (13",
2064×2752) now that `supportsTablet` is on. No alpha channel in either — Apple
rejects it. Play needs at least two phone screenshots at 9:16, 1080×1920, or it
asks to crop; the 1080×2160 emulator captures are widened with their own edge
pixels, then scaled.

The current set is in `store/screenshots/` (`ios-iphone`, `ios-ipad`,
`android-phone`), numbered in the order above, taken in light mode on the local
stack's sample data. Retake the ragi shot (4) on a fuller database if you want
more than two or three rows. There is no Android tablet set yet. Play's icon
and feature graphic are in the same folder (`play-icon.png`,
`play-feature-graphic.png`).
