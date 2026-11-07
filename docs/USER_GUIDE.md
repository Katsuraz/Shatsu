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

## 4. Find a song inside Shatsu and keep the queue playing

1. Enter or join a room. Open **Music Library → Search song or artist**.
2. Choose **YouTube** or **Spotify** as the provider and tap **Search**. You can also paste a YouTube/YouTube Music video link straight into this same field and tap **Play link** without a search API key.
3. Tap **Play** on a result if you're the host. Guests see **+ Queue**, which adds a song for the host to play.
4. For YouTube, the owner must configure a **YouTube Data API v3 key** once on the server for live search. If search is not yet configured, use **Have a song link? Paste it here instead**. Any song you select is saved to **Recently Played** on your own device, so next time you can pick it directly without a URL.
5. Tap the player or **Tap to start listening** if your browser asks permission to play video/audio.

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
| **Volume** | Adjusts the YouTube player on only your phone |
| **↻** | Resynchronizes your local player to the host timeline |

**Auto Next uses tracks already in the queue; it does not invent recommended songs.**
If the queue is empty, music stops unless Repeat is enabled. Spotify **automatic end detection is not implemented**; press Next manually for Spotify songs. Mobile browsers can block autoplay until every listener taps their player once.

Shatsu plays through official YouTube visible **video** embeds. It **does not** control the YouTube Music app directly, extract audio, bypass ads, or guarantee background playback with a locked screen. Not every YouTube video permits embedding.

## 5. Spotify (optional, not plug-and-play yet)

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
| YouTube search says not configured | The Shatsu server owner needs to add a YouTube Data API key on Render. Until then use Recent or paste a link. |\n| Blank page or YouTube video won't play | Use **Brave ↗**, check internet access, tap play on the video and try another embeddable link. |
| Friend cannot join | Make sure both use the **same active room link/code**. Room state can disappear when the free server restarts. |
| Music is behind | Tap **↻** on the slower phone. Precise, sample-perfect synchronization is not guaranteed. |
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
