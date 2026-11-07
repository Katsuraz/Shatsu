# Playback-provider architecture for Shatsu

The backend models a provider-neutral room timeline: `videoId`, `position`, `playing`, `updatedAt`, `revision`. The current implementation is **YouTube-only** and uses official visible IFrame embeds.

## YouTube / YouTube Music links (implemented)

Paste a `youtube.com/watch?v=...`, `youtu.be/...`, or `music.youtube.com/watch?v=...` URL. Shatsu extracts the 11-character video ID and loads it with the YouTube IFrame Player API on each participant's device. A YouTube Music link is **not** a control session in the YouTube Music native app. Autoplay and embedded video availability are subject to platform and browser restrictions. No background audio, audio extraction, download, or ad bypass.

## Spotify Android App Remote (planned, unimplemented)

1. Register Shatsu with Spotify for Developers and verify current development mode eligibility (Premium developer; authorized-user limits; provider approval for expanded distribution).
2. Add Android Kotlin/Compose application with Spotify Auth + Android App Remote SDK, configured for the **user's own Spotify app**. Never embed or share Spotify credentials or secret keys in the app.
3. Add `/api/rooms/:code` room transport to the Android client, using host-authoritative track URI, timeline and actions, and a `SpotifyAdapter` with supported methods `load(uri)`, `play()`, `pause()`, `seek(ms)`, `getState()`.
4. Each listener signs into **their own** Spotify account and streams tracks from Spotify independently; never broadcast Spotify audio to friends.
5. Resolve unavailable tracks, country restrictions, re-linking and playback-device differences, and test two simultaneous Premium accounts.
6. Respect Spotify API/SDK terms. Development-mode access is not a general public release authorization.

## Apple Music (possible later)

Research current MusicKit capabilities and user authorization. Map tracks to provider-specific IDs, use ISRC and title/artist/duration as imperfect matching signals, allow a person to reject a mismatched recording.

## Brave support

Brave can open the same HTTPS Shatsu room web app. It does not provide an unrestricted API for controlling arbitrary Spotify or YouTube Music tabs. Do not attempt to inject scripts into native service pages or circumvent streaming provider restrictions.

## Android direction

The earliest Android experience is the installable web app in Brave. Native Android integration is separate and requires hosting Shatsu at a real HTTPS URL before generating a production app that binds to that endpoint. The source code is deliberately modular: the room protocol remains provider-neutral while playback implementations are platform-specific.
