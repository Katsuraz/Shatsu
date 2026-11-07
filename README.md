# Shatsu 🎧 — listen together

**Version:** 0.1.0 alpha · **Stack:** dependency-free Node.js 20+ + vanilla HTML/CSS/JavaScript + YouTube IFrame Player API.

Shatsu is a mobile-first, installable web app (PWA) where friends create private room codes, paste YouTube or YouTube Music links, view the same embedded video, share a queue, and synchronize play/pause/seek actions in near-real time. It is optimized for mobile browsers such as Brave and can be opened on Android.

## Run locally

```bash
cd shatsu
npm start
```

Open `http://localhost:4173` on your computer. To use it with multiple phones on the **same Wi-Fi**, run with `HOST=0.0.0.0 npm start`, find your computer's LAN IP, then open `http://YOUR-LAN-IP:4173` on both phones. **Browser media/embed and clipboard behavior can differ on insecure HTTP origins**, so publicly shared rooms should use an HTTPS deployment.

There are **no npm dependencies**. Run tests with:

```bash
npm run check
npm test
```

## Deploy for friends over the Internet

Deploy this Node HTTP server on a hosting service that supports persistent Node processes and server-sent events (SSE), attach an HTTPS domain, and set `PORT` according to your host. Examples include Render, Railway, a VPS, or a similar Node host. **The source ZIP is not a live, hosted service and no public URL is supplied.** Rooms are stored in memory; they disappear on restart and expire after 12 hours without activity. A single server process is required for this initial version.

## Features implemented

- Create room, join via invite link or code, resume within the same tab session.
- 8-character random room codes, 16-person room limit.
- Official visible YouTube iframe player; accepts `youtube.com`, `youtu.be`, and `music.youtube.com/watch?v=` links.
- Host-only play/pause/seek/skip and picking a queued track.
- Shared queue (any participant can enqueue), up to 60 items.
- Live room chat, up to 80 messages displayed and retained while room exists.
- Room updates via authenticated mutation endpoints and SSE event feed; client clock offset and periodic playback drift correction.
- Room presence updates; reconnect after connection loss.
- Installable PWA manifest + service worker shell cache; **music playback is not available offline**.
- YouTube embeds are preserved, not altered, hidden, extracted, or re-streamed.

## Known limitations

- **No Spotify playback yet.** The Android App Remote SDK needs a Spotify developer client ID, approved redirect, auth, Spotify app installation, eligible user accounts, and testing. Spotify's restrictions may limit production deployment.
- YouTube Music **links** can play through supported official YouTube embeds, but Shatsu **cannot remotely control the YouTube Music app**.
- Some YouTube videos have embeddings disabled, region restrictions, or age restrictions.
- The official YouTube video remains visible with normal player behavior; **not a screen-off/background YouTube audio player**.
- Mobile browsers can block autoplay. Each listener should tap the in-page video or “Tap to start listening” once. Exact sample-level sync is not possible; network/buffering can cause drift.
- Persistence, real accounts, moderation, admin controls, voice chat, and multi-server scaling are planned, not implemented.
- No signed Android APK is included. In Android, the PWA can be used in Brave and added to the home screen where the browser supports it.

## Architecture

- `server.js`: HTTP static server + JSON room API + SSE streaming.
- `lib/rooms.js`: room validation, permissions, queue, timelines, expiration.
- `public/app.js`: browser client + YouTube IFrame API and timestamp-based sync.
- `public/styles.css`: responsive music-room experience.
- `tests/rooms.test.js`: HTTP and data-model tests.
- `docs/providers.md`: next steps for Spotify and other services.

## Security notes

This release is an **early alpha**, not hardened public infrastructure. Anyone with the room code can join and read room messages. Playback commands require an unguessable per-participant token, with host-only authorization enforced on the server. Data is held in memory. Chat and titles are rendered as text nodes, never as untrusted HTML. Before public launch, add per-IP rate limiting, abuse controls, persistent state, privacy policy, structured logging, token revocation, and automated browser-level verification.

## Attribution

YouTube videos are played with the official YouTube IFrame API, subject to [YouTube API Services policies](https://developers.google.com/youtube/terms/developer-policies) and [YouTube IFrame API documentation](https://developers.google.com/youtube/iframe_api_reference). No YouTube audio is downloaded or extracted.
