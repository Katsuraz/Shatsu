# Shatsu provider architecture — v0.2.0 alpha

Room timelines are **host-authoritative**: `{ provider, trackId, videoId, title, playing, position, updatedAt, revision }`. The server never receives music credentials, audio bytes or OAuth tokens. Each participant independently loads the supported track on the selected provider.

## YouTube and YouTube Music — web

Official visible IFrame playback with video IDs taken from `youtube.com` / `music.youtube.com` links. The host can control the group timeline, while each user's player makes its own network requests to YouTube. No native YouTube Music remote control, no audio extraction and no guaranteed background play.

## Spotify — web (alpha implementation, not device verified)

- Shatsu server exposes only a *public* Spotify client ID via `/api/config` (`SHATSU_SPOTIFY_CLIENT_ID`).
- Each participant in Brave/another full browser authorizes via PKCE with exact root redirect URI registered in the Spotify dashboard.
- Per-tab `sessionStorage` holds access/refresh tokens; browser calls Spotify's `GET /me/player`, `PUT /me/player/play`, `PUT /me/player/pause`, `PUT /me/player/seek` using the listener's token.
- Each Spotify user needs an active device and usually Premium; developer apps are restricted by Spotify's eligibility/access policies.
- Reconciliation checks are throttled to reduce excessive API usage. Playback may drift, fail due to unavailable tracks/devices or need user interaction. Spotify is not rebroadcast or recorded.
- A Spotify URL in a room does not automatically find and queue its YouTube equivalent. Future cross-service mapping requires metadata, rights/region handling and a provider selection UI.

## Android companion

The Android app is native Java + Android WebView with a configurable Shatsu server URL, a Brave shortcut and GitHub Actions APK artifact. It does **not** embed Spotify credentials, does **not** use the Spotify App Remote SDK yet, and does **not** include the Node server. Spotify authorization is meant for Brave on Android, because PKCE state and verifier are specific to one browser profile. Future Android App Remote SDK work can enable native Spotify sessions, after supplying developer app details and testing device authentication.

## Future priorities

1. Verify Spotify accounts and devices under current Spotify developer-mode restrictions, improve failures and queue metadata.
2. Test two-device drift and Android WebView YouTube iframe playback; handle autoplay and connectivity interruptions.
3. Persist rooms and tokens securely, implement rate limits, reconnect/ownership transfer and moderation.
4. Add native Android Spotify App Remote SDK if API access and Spotify policy permit it.
5. Add other lawful playback providers one at a time, and optional ISRC-based cross-service matching with user confirmation.
