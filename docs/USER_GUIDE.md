# Shatsu 🎧 — Your quick start guide

You can listen together without creating an account or setting up a server.
The shared Shatsu server is already configured at **https://shatsu.onrender.com**.
Shatsu is experimental; it has not been verified with two real phones in the same room yet.

## 1. Install and open Shatsu

Get the newest Android APK from [Shatsu Releases](https://github.com/Katsuraz/Shatsu/releases).
The app connects automatically. There is **no server URL to enter**.
If you prefer, open https://shatsu.onrender.com in **Brave** — no APK required.

When Shatsu opens for the first time, a five-step guide explains the main controls.
You can reopen it by tapping **? How to use** at the top, or **⋮ → How to use Shatsu** in the Android app.

## 2. Create a listening room

1. Enter your nickname (anything you like).
2. Tap **Create room**.
3. Shatsu generates an 8-character invite code. You're the DJ, so you control play/pause and seeking.

## 3. Invite your friend

1. Tap **Invite friend ↗** in **Your room** and choose Messenger, WhatsApp or another app.
2. Your friend opens the link on their phone, enters their nickname and taps **Join room**.
3. If their link doesn't open automatically, share the **room code** and they can use **Join a room** on Shatsu's home screen.

## 4. Search and play songs free — no Google Cloud setup

**The easiest option is now Audius:**

1. In your Shatsu room, scroll to **Music Library**.
2. The provider will already say **Audius · Free**. Type a song title or artist name and tap **Search**.
3. Tap **Play** (host) or **+ Queue** (friend). A real Audius track is selected for the whole room.
4. On the first song, each phone may need one tap on **▶** or **Tap to start listening** due to Android/browser autoplay rules.
5. **Auto Play** and **Auto Next** use the queue. You can invite friends as usual.

**No Premium, API key, Google Cloud project or Audius account is required** for supported publicly streamable tracks. Audius has a different music library from Spotify/YouTube and emphasizes independent artists. Not every mainstream recording will be available. Some tracks may be unavailable or restricted by their artist.

If your favorite song isn't on Audius, choose **YouTube · Links** and paste its public video link in the same box. This works without Google's API key too. **YouTube song-title search** still needs an official YouTube Data API key, but you don't need that for the Audius catalog.

The optional Spotify source still uses the Spotify Web API, requires developer configuration and eligible playback accounts.

### 4B. Keep listening with the screen locked (Android APK v0.4)

1. Install Shatsu v0.4 or newer from GitHub Releases and open your listening room.
2. Choose **Audius · Free** and start a track in your room.
3. In the Audius player, tap **🎧 Play in background** and approve the one-time Android prompt.
4. Shatsu hands audio to its native Android service. You can now lock your screen, use other apps, or swipe away the Shatsu screen. The music notification shows **Play/Pause**, **Stop**, and **Next** for the room host.
5. The native audio service checks the room's timeline every few seconds and, as the host, can advance the queue when an Audius track finishes. If the phone's battery manager kills the process, playback may stop; reopen Shatsu to restart it.
6. To end background listening, tap **■ Stop background audio** in Shatsu or **Stop** in the media notification.

This background feature is currently **Audius-only** in the Android APK, not the Brave web app. A Spotify Premium account may play in the *official Spotify app* in the background, but Shatsu's Spotify controls still need authorized setup and testing. **YouTube and YouTube Music video embeds cannot continue playing after Shatsu is minimized** under YouTube's official API rules. Force-stopping Shatsu in Android Settings also stops its native service.

### Room controls

| Control | What it does |
| --- | --- |
| **▶ / Ⅱ** | Host starts or pauses the room |
| **⏭ Next** | Host skips to the next queued track |
| **⏮ Previous** | Host returns to a song from room playback history |
| **Auto Play** | Automatically starts newly selected tracks on the room timeline (on by default) |
| **Auto Next** | When the host's YouTube player reaches the end, starts the next queued song (on by default) |
| **Shuffle** | Randomizes which queued track plays next |
| **Repeat Off / One / All** | Plays normally, repeats current song or rotates played songs back through the queue |
| **Volume** | Adjusts your local Audius/YouTube playback volume |
| **↻** | Resynchronizes your local player to the host timeline |

**Auto Next uses tracks already in the queue; it does not invent recommended songs.**
If the queue is empty, music stops unless Repeat is enabled. Auto Next also works for Audius tracks when the host's audio ends. Spotify **automatic end detection is not implemented**; press Next manually for Spotify songs. Mobile browsers can block autoplay until every listener taps their player once.

Shatsu plays through official YouTube visible **video** embeds. It **does not** control the YouTube Music app directly, extract audio, bypass ads, or guarantee background playback with a locked screen. Not every YouTube video permits embedding.

## 5. Spotify (optional, Premium and configuration needed)

Spotify is more restricted. The owner must register Shatsu as a Spotify developer
application and configure its public client ID on the hosting service.
Each listener must sign in to an eligible Spotify account (usually Premium)
and have an active Spotify playback device.

1. Tap **Brave ↗** in the Android app (or open the Shatsu URL directly in Brave).
2. Join your Shatsu room, then tap **Connect Spotify**.
3. Authorize your own Spotify account when prompted; open the Spotify app and start a track once to activate playback.
4. Search Spotify inside the Music Library or paste a Spotify track link. Each phone streams through its own Spotify app.

The Spotify integration has not yet passed live-device testing. It may be unavailable
until developer approval is complete. You cannot listen to one song through YouTube
on one phone and Spotify on the other automatically in this version.

## Updates — automatic discovery, user-approved installation

Shatsu checks GitHub Releases for APK updates on launch. When an update appears,
choose **Download** to open the verified GitHub release. Android will ask permission
before installing. You can check again under **⋮ → Check for updates**.

**Important:** Debug releases may have different signing keys, so Android can say
"App not installed" when updating. If this happens, uninstall the older experimental
APK and install the new one; this clears local app settings. Proper production
signing is planned before a stable release.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| "Shatsu is waking up" | The free server may be sleeping. Keep the app open, then tap **Try again**. |
| YouTube search says not configured | Switch the service dropdown to **Audius · Free** for song-name search without any API key, or paste a YouTube video link. |\n| Blank page or YouTube video won't play | Use **Brave ↗**, check internet access, tap play on the video and try another embeddable link. |
| Friend cannot join | Make sure both use the **same active room link/code**. Room state can disappear when the free server restarts. |
| Background audio stops when screen locks | Use the **Android APK**, not just the Brave website. Enable the Audius background switch before locking the screen. Battery restrictions or force stop may still terminate playback. |\n| Audius search or audio fails | Check connectivity. Audius's public API or a particular artist's stream may be unavailable; try another track or a YouTube link. |\n| Music is behind | Tap **↻** on the slower phone. Precise, sample-perfect synchronization is not guaranteed. |
| Spotify button won't connect | Open the room in **Brave**, not the Android WebView; a developer client ID, account eligibility and an active device are required. |
| APK won't update | Download from **GitHub Releases** and, if necessary, remove the older debug app before installing. |

## For the project owner

- **Enable YouTube search**: Create a Google Cloud project with YouTube Data API v3 enabled, obtain an API key restricted to that API, and add `SHATSU_YOUTUBE_API_KEY` to the existing Shatsu Render service under Environment. Do not put the key in the repository, APK, or chat. A new server deployment is required after adding the key. Google imposes search quotas.\n- GitHub code: https://github.com/Katsuraz/Shatsu
- Live server: https://shatsu.onrender.com
- Render: https://dashboard.render.com — the Shatsu server is live, but **automatic deploys currently require linking the GitHub repository as a connected provider source**.
- GitHub Actions: https://github.com/Katsuraz/Shatsu/actions — runs tests and assembles a debug APK for Android changes.
- GitHub Releases: https://github.com/Katsuraz/Shatsu/releases — the current experimental APK.

The server stores rooms in memory, so free hosting restarts can delete rooms. For
production quality, persistent room state, moderation, stability testing, a
production signing key, and provider compliance review are still required.

## Owner: enable hands-off hosting updates (one-time authorization)

The Render service currently deploys successfully from a public Git repository URL,
but Render requires an **authorized Git provider connection** to trigger future
deploys automatically. Merely setting Auto-Deploy to On Commit is not enough
for a public-URL source.

1. In [Render Account Settings](https://dashboard.render.com/), open
   **Account Settings → Git Deployment Credentials → Add credential → GitHub**
   and authorize access to the **Katsuraz/Shatsu** repository.
2. Open your [existing Shatsu service](https://dashboard.render.com/web/srv-dbnbv63rjlhs738c1nr0)
   in Render. Go to **Settings → Build → Source → Edit** and choose **Katsuraz/Shatsu**
   from your *connected Git provider*, not the public Git URL source.
3. Keep branch **main**, runtime **Node**, build command `npm run check && npm test`,
   start command `npm start`, and the free plan unless you decide otherwise.
4. Under **Settings → Auto-Deploy**, select **On Commit** (or **After CI Checks Pass**).
5. Confirm that the next GitHub push creates a Render deploy automatically.

The Android GitHub Actions workflow already runs its APK build when Android
source changes, publishes a versioned *alpha* release, and the app checks that
release for updates when opened. **Android installation still requires a user
confirmation**. Production signing and Play Store distribution remain future work.
