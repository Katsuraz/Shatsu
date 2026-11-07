# Shatsu 🎧 — listen together

**Version 0.3.0-alpha** · Node.js 20+ web/server app + native Android companion.

Shatsu lets friends create a private room, search the supported music catalogs, share a queue and chat, and use **their own player** to hear the same song with approximate synchronization. The host controls shared Auto Play, Auto Next, Shuffle, Repeat and previous-track history. Volume affects only the local YouTube player. Available providers in this alpha:

- **YouTube / YouTube Music video links:** official visible YouTube IFrame player in Shatsu's website. This **does not control the native YouTube Music app** and does not bypass background-play or ad rules.
- **Spotify track links:** Spotify Web API, individual Spotify Premium accounts and their own active Spotify apps/devices. Each listener authorizes independently. This is **not Spotify audio streaming or rebroadcasting**. It is currently unverified on real Spotify accounts and may be restricted by Spotify developer access.
- **Brave:** open the Shatsu web app in Brave. Spotify sign-in should happen in a full browser, not the embedded Android WebView.

One room can queue tracks from either provider. Switching from YouTube to Spotify requires Spotify listeners to connect their accounts. **Cross-provider matching** (one user on Spotify, another playing the same recording on YouTube) is **not implemented**.

## Android app — automatic connection and in-app guide (v0.2.2 alpha)

**Your listening server is deployed at [shatsu.onrender.com](https://shatsu.onrender.com).**
The Android app loads the published server address from [`config/server.json`](config/server.json)
and falls back to the verified public Render origin when GitHub is unavailable. It checks
`/api/health`, shows connection progress, and provides **Try again** if the free service
is waking up. Advanced server entry remains in `⋮` for developers only.

On the first visit the web app and Android WebView present a five-step guide:
create or join a room, share an invite, paste a YouTube / YouTube Music video,
allow playback on each phone, and optionally connect Spotify through Brave.
The guide is always available from **? How to use** at the top of Shatsu and
from the Android `⋮` menu. **Invite friend** opens Android's share sheet or
browser Web Share API; **Copy** is an alternative.

The Android app automatically checks GitHub Releases for newer Shatsu alpha APKs,
then offers a download. Android requires the user's confirmation to install an APK:
Shatsu does not silently sideload packages. The CI build automatically creates a
new versioned prerelease when `android/app/build.gradle`'s `versionName` changes.

See the [friendly step-by-step user guide](docs/USER_GUIDE.md) for current
usage, limitations and troubleshooting.

## Music discovery and automatic playback (v0.3)

- **Inside a room:** open the Music Library, type a song/artist, choose YouTube or Spotify, press Search and then Play (host) or + Queue (guest). Links still work under "Have a song link?".
- **Your own recent tracks:** searched/linked songs that you select appear in Recent on that phone, even before catalog search is enabled.
- **YouTube catalog search:** uses the official YouTube Data API v3. **Not operational until the server owner configures `SHATSU_YOUTUBE_API_KEY`** in the Render service's Environment settings. Enable YouTube Data API v3 in your Google Cloud project and create an API key limited to the YouTube Data API. The key is never shipped in the APK or browser. Render deploys after environment changes. YouTube imposes usage quotas, so Shatsu caches searches. Video embedding can still be unavailable per video or region.
- **Spotify catalog search:** requires an already-connected eligible Spotify user and a Spotify app client ID configured through `SHATSU_SPOTIFY_CLIENT_ID`. Use Shatsu in Brave for authorization. Spotify developer mode limits apply. Spotify controls each listener's **own** official app; this is not a free Spotify Premium bypass.
- **Auto Play:** starts newly selected tracks on the shared timeline by default; disabled if the host unchecks Auto Play.
- **Auto Next:** when the **host's** YouTube player reports the video ended, advance the room's queue. It may need an initial tap per phone because browsers block autoplay until a user interacts. Spotify automatic end-of-track detection isn't implemented yet; the host can press Next for Spotify.
- **Shuffle / Repeat:** host can shuffle queued tracks or repeat one track/all tracks. Previous moves back through room history. Each listener can set local YouTube volume.
- **Versioning:** Android launcher still uses the live site, and the app looks for new GitHub releases. Debug builds have changing signing keys, so updating might require reinstalling.
- **No automatic recommendations yet:** Auto Next plays the **existing queue**; it doesn't silently fetch unrequested tracks.

For a complete explanation, see [the listening guide](docs/USER_GUIDE.md).

## Start web app / server

```sh
npm start
```

Open `http://localhost:4173`. Local tests: `npm run check && npm test`. The server uses port `PORT` (default 4173) and host `HOST` (default `0.0.0.0`). To invite friends across the internet, deploy this Node server behind **HTTPS** on a host with long-running processes and SSE support. Room state is in memory and expires after inactivity, so **use a single server instance** for now. The public instance is https://shatsu.onrender.com; local testing remains optional.

### Spotify setup (optional)

1. Create an application at [Spotify for Developers](https://developer.spotify.com/dashboard) with access to the Web API. Check development-mode user limits and Spotify terms; public availability is **not guaranteed**.
2. Set the exact redirect URI to `https://YOUR_SHATSU_DOMAIN/` on Spotify's app settings. For local testing, register `http://127.0.0.1:4173/` and open that exact address; the client redirects to `location.origin + '/'`.
3. Set the environment variable `SHATSU_SPOTIFY_CLIENT_ID` to your **public client ID** before launching the Node server. **Do not put a Spotify client secret in GitHub or browser code.**
4. On each listener's phone, open Shatsu in **Brave** or another regular browser, join the room and tap **Connect Spotify**. Each account must be authorized to use your developer app and eligible for playback (normally Spotify Premium).
5. Open the official Spotify app and start a song once to activate a playback device. Paste a Spotify `open.spotify.com/track/...` link into the room. The host controls play, pause and seek; the browser attempts to keep each authorized player's Spotify app close to the room position.

Spotify uses **OAuth Authorization Code + PKCE**. Access and refresh tokens are stored per browser tab in `sessionStorage` and sent **only to Spotify endpoints**; the Shatsu room server receives only track IDs and playback state. This is an alpha integration and still needs real-device testing for timing, device handoff, account limitations and rate limits.

## Build the Android APK

The native Android launcher lives in [`android/`](android/). It loads the Shatsu room web UI in a WebView after automatically discovering the verified server URL, and provides a **Brave ↗** shortcut. The APK is **not a standalone server**; online use requires an already deployed Shatsu service. Manual server address entry is only available from **⋮ → Advanced: custom server**.

**Recommended for Spotify:** use the launcher **Brave ↗** button and connect inside Brave. Spotify authorization in the Android embedded WebView is deliberately disabled because the OAuth verifier is browser-session-local.

On GitHub, open **Actions → Shatsu Android APK → latest run → Artifacts** and download `Shatsu-v0.2.2-alpha-debug-APK`. Installing this debug APK may require allowing installs from your browser/file manager. Debug APKs are signed with an ephemeral CI debug key, so future builds may require uninstalling the previous debug build (which deletes local app settings). Do not treat this as an official production-signed release.

To build locally, install Android SDK platform 35, Java 17, Gradle 8.11.1, then run:

```sh
gradle -p android :app:assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`. The GitHub workflow builds this automatically on changes under `android/`.

## Features

- Private, randomly generated 8-character room codes with 16 listeners maximum.
- Queue, room chat, room permissions; host can play/pause/seek/skip.
- Official YouTube embedded player, visible in the room.
- Spotify track-link identification, browser PKCE authorization, Spotify Web API device playback commands.
- SSE events, client/server clock-offset calculation, drift correction and reconnects.
- Android launcher with automatic connection, integrated guide, native invite sharing, Brave shortcut and update notifications.
- Automated Node tests plus separate Android APK build workflow.

## Caveats, security and provider constraints

- **No audio is proxied, copied, downloaded, extracted, ad-blocked, or broadcast from Shatsu**. Every device uses an authorized official player.
- YouTube embeds can refuse particular videos, require user interaction, or pause during backgrounding/lock-screen. Shatsu does not provide hidden YouTube audio playback.
- Spotify controls may fail without Spotify Premium, an active playback device or an authorized developer app user. Multi-device precision cannot be guaranteed; expect timing drift on mobile networks.
- The native Android WebView is primarily for YouTube rooms; use Brave for full Spotify PKCE login. Android WebView YouTube embed compatibility may vary by OS version and WebView implementation.
- Room data is in memory and can be lost on restart. There are no permanent accounts, admin moderation, production rate limits, multi-server persistence or anti-abuse systems. Anyone with the room code can see room contents.
- Debug builds allow HTTP **only for private/LAN development addresses** in the UI. Always use HTTPS with a public server.

## Files

- [`server.js`](server.js) — Node HTTP room API, SSE and static files.
- [`lib/rooms.js`](lib/rooms.js), [`lib/track.js`](lib/track.js) — host-authoritative room timeline and provider-link validation.
- [`public/app.js`](public/app.js), [`public/spotify.js`](public/spotify.js) — room client, YouTube IFrame sync and Spotify PKCE control.
- [`android/`](android/) — Android native app shell.
- [`.github/workflows/android.yml`](.github/workflows/android.yml) — Android APK builder.
- [`docs/providers.md`](docs/providers.md) — provider architecture and next steps.

## Attribution

YouTube embeds use the [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference). Spotify control uses the [Spotify Web API](https://developer.spotify.com/documentation/web-api/) with [PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow). Provider terms and developer access requirements apply.

### Enable fully automatic Render deployments

The service is live at https://shatsu.onrender.com. Render currently sources it from a public repository URL, which **does not support push-triggered auto-deploys** even if the service setting displays On Commit. Connect GitHub under Render Account Settings → Git Deployment Credentials; then edit the existing Shatsu service's Settings → Build → Source to select the connected `Katsuraz/Shatsu` repository. See [the owner's one-time setup guide](docs/USER_GUIDE.md#owner-enable-hands-off-hosting-updates-one-time-authorization). This is a provider authorization step and cannot be bypassed from the Android app.
