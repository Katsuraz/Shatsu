# Shatsu 🎧 — listen together

**Version 0.2.1-alpha** · Node.js 20+ web/server app + native Android companion.

Shatsu lets friends create a private room, share a queue and chat, and use **their own player** to hear the same song with approximate synchronization. Available providers in this alpha:

- **YouTube / YouTube Music video links:** official visible YouTube IFrame player in Shatsu's website. This **does not control the native YouTube Music app** and does not bypass background-play or ad rules.
- **Spotify track links:** Spotify Web API, individual Spotify Premium accounts and their own active Spotify apps/devices. Each listener authorizes independently. This is **not Spotify audio streaming or rebroadcasting**. It is currently unverified on real Spotify accounts and may be restricted by Spotify developer access.
- **Brave:** open the Shatsu web app in Brave. Spotify sign-in should happen in a full browser, not the embedded Android WebView.

One room can queue tracks from either provider. Switching from YouTube to Spotify requires Spotify listeners to connect their accounts. **Cross-provider matching** (one user on Spotify, another playing the same recording on YouTube) is **not implemented**.

## Android: no server address required

Starting in Android **v0.2.1 alpha**, Shatsu looks up its online listening server from [config/server.json](config/server.json) in this GitHub repository. When that server is published and healthy, the app automatically loads the room UI. No one needs to enter a hosting URL.

**One-time hosting is still necessary.** Until the owner connects and deploys Shatsu on Render or another Node host, the config intentionally contains null. The app displays a clear setup notice instead of a blank screen or mandatory server form. After hosting is deployed, set `serverUrl` to the exact verified HTTPS origin in `config/server.json`. Everyone can then use the same APK without further setup. Manual server override remains in the Android Advanced menu.

## Start web app / server

```sh
npm start
```

Open `http://localhost:4173`. Local tests: `npm run check && npm test`. The server uses port `PORT` (default 4173) and host `HOST` (default `0.0.0.0`). To invite friends across the internet, deploy this Node server behind **HTTPS** on a host with long-running processes and SSE support. Room state is in memory and expires after inactivity, so **use a single server instance** for now. There is no deployed Shatsu server included with this source.

### Put Shatsu online (Android + friends)

The APK needs a publicly reachable Shatsu server. You can deploy one from this repository using [Deploy to Render](https://render.com/deploy?repo=https://github.com/Katsuraz/Shatsu). The repo includes `render.yaml` with a Node web service, a Singapore region, and an optional Spotify client ID setting.

1. Sign in to Render and approve access to `Katsuraz/Shatsu`.
2. Create the Blueprint service and complete the deployment (check hosting plan terms and current availability).
3. Copy its HTTPS address, such as `https://YOUR-SERVICE.onrender.com`.
4. Once the server is healthy, publish its verified HTTPS origin as `serverUrl` in `config/server.json`. Then open Shatsu; it connects automatically.
5. For Spotify, add the public `SHATSU_SPOTIFY_CLIENT_ID` environment variable on Render and register `https://YOUR-SERVICE.onrender.com/` as an exact redirect URI in your Spotify developer dashboard. Each friend must authorize their own eligible Spotify account.

**Free hosting may sleep during inactivity**, disrupting SSE connections and wiping Shatsu's in-memory rooms after a restart. For reliable everyday hosting, use a persistent server and eventually add durable room storage. This Blueprint does not deploy anything automatically; you must connect your hosting account and complete setup.

### Spotify setup (optional)

1. Create an application at [Spotify for Developers](https://developer.spotify.com/dashboard) with access to the Web API. Check development-mode user limits and Spotify terms; public availability is **not guaranteed**.
2. Set the exact redirect URI to `https://YOUR_SHATSU_DOMAIN/` on Spotify's app settings. For local testing, register `http://127.0.0.1:4173/` and open that exact address; the client redirects to `location.origin + '/'`.
3. Set the environment variable `SHATSU_SPOTIFY_CLIENT_ID` to your **public client ID** before launching the Node server. **Do not put a Spotify client secret in GitHub or browser code.**
4. On each listener's phone, open Shatsu in **Brave** or another regular browser, join the room and tap **Connect Spotify**. Each account must be authorized to use your developer app and eligible for playback (normally Spotify Premium).
5. Open the official Spotify app and start a song once to activate a playback device. Paste a Spotify `open.spotify.com/track/...` link into the room. The host controls play, pause and seek; the browser attempts to keep each authorized player's Spotify app close to the room position.

Spotify uses **OAuth Authorization Code + PKCE**. Access and refresh tokens are stored per browser tab in `sessionStorage` and sent **only to Spotify endpoints**; the Shatsu room server receives only track IDs and playback state. This is an alpha integration and still needs real-device testing for timing, device handoff, account limitations and rate limits.

## Build the Android APK

The native Android launcher lives in [`android/`](android/). It automatically discovers its published web server address, provides the Shatsu room UI in a WebView and offers a **Brave ↗** shortcut. The APK is **not a standalone server**; online rooms need a deployed Shatsu service. A custom server address is only available in Advanced settings.

**Recommended for Spotify:** use the launcher **Brave ↗** button and connect inside Brave. Spotify authorization in the Android embedded WebView is deliberately disabled because the OAuth verifier is browser-session-local.

On GitHub, open **Actions → Shatsu Android APK → latest run → Artifacts** and download `Shatsu-v0.2.1-alpha-debug-APK`. Installing this debug APK may require allowing installs from your browser/file manager. Debug APKs are signed with an ephemeral CI debug key, so future builds may require uninstalling the previous debug build (which deletes local app settings). Do not treat this as an official production-signed release.

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
- Simple Android installer with URL configuration and Brave shortcut.
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
