# Shatsu 🎧 — listen together

**Version 0.4.0-alpha** · Node.js 20+ web/server app + native Android companion.

Shatsu lets friends create a private room, search Audius for free with no API key or account, explore other supported music catalogs, share a queue and chat, and use **their own player** to hear the same song with approximate synchronization. The host controls shared Auto Play, Auto Next, Shuffle, Repeat and previous-track history. Volume affects only the local YouTube player. Available providers in this alpha:

- **Audius (default free music source):** official Audius public read-only API for song-title and artist search, and direct full-track streaming of independently published music where artist permissions allow. No premium, sign-in or key required; catalog differs from Spotify/YouTube. Host controls, queue and Auto Next synchronize the timeline. API uptime, catalog coverage and region/stream availability aren't guaranteed.\n- **YouTube / YouTube Music video links:** official visible YouTube IFrame player in Shatsu's website. This **does not control the native YouTube Music app** and does not bypass background-play or ad rules.
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

## Android background audio (v0.4 alpha)

Shatsu now includes an opt-in Android **foreground music service** for supported publicly streamable Audius tracks. It uses an Android `MediaPlayer`, a platform `MediaSession` and a persistent media notification. When a room is playing Audius, tap **🎧 Play in background** inside the Audius player and approve once. The Android service follows the room state using your room session token even if the web interface is not running, so you can lock your device, switch apps, or swipe the Shatsu activity away without intentionally stopping music. The host's background service can send **Auto Next** to the room when the track ends. Guests follow the same room timeline; Android media notification provides pause/play and a host-only Next action.

This is an **experimental alpha**. Android battery management, OEM restrictions, connectivity, stream availability and users explicitly force-stopping the app can interrupt playback. Shatsu must be launched again after a force stop. A user-initiated foreground media service remains visible in Android notifications until stopped. Tap **■ Stop background audio** or Stop in the notification to end it. On returning to Shatsu, the web player avoids duplicating audio while the native service is active.

**Restrictions:** YouTube's official embedded player is foreground only; its policies prohibit third-party API clients from continuing background playback after being minimized. Do not extract or proxy YouTube audio to work around this. Spotify already supports background playback through its official app for eligible accounts; Shatsu's Spotify integration remains separate and unverified. Audius has a smaller/different catalog than YouTube or Spotify. A mainstream, free, background-capable cross-service library cannot be promised without valid licensing or provider support.

## Free, no-setup music search and automatic playback (v0.3.2)

1. Open Shatsu in the Android app or Brave, create a room.
2. Under Music Library choose **Audius · Free** (the default). Search by song title or artist.
3. Choose a result. The host plays it; guests can queue it. The built-in Audius player syncs to the host timeline and uses the official Audius streaming API directly.
4. On mobile, everyone may need to tap **▶** once to permit audio playback.
5. Use Auto Play, Auto Next, Shuffle, Repeat, Previous and per-device volume.

Other sources remain selectable: YouTube and YouTube Music video URLs work without credentials, while **YouTube catalog search by song name still needs the owner's YouTube Data API key**. Spotify search and playback need its own authorized client configuration and eligible accounts. Audius covers an independent music catalog and may not have mainstream songs.

Audio is never copied or proxied through the Shatsu backend. Public Audius API access may be rate-limited or change; live two-device testing remains necessary.

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
