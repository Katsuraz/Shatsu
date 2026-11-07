package dev.katsuraz.shatsu;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.MediaMetadata;
import android.media.MediaPlayer;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Shatsu native background audio.
 *
 * IMPORTANT: only accepts public, authorized Audius audio streams.
 * Do not pass YouTube player/audio URLs or try to run embedded YouTube in the background.
 *
 * A foreground media service owns the player, polls the same authenticated room timeline
 * as the website, and advances the room when the host's Audius track finishes.
 * Force-stop and OS-specific battery restrictions can still stop background playback.
 */
public final class RoomPlaybackService extends Service {
    public static final String ACTION_START = "dev.katsuraz.shatsu.START_BACKGROUND";
    public static final String ACTION_STOP = "dev.katsuraz.shatsu.STOP_BACKGROUND";
    private static final String ACTION_PLAY = "dev.katsuraz.shatsu.PLAY";
    private static final String ACTION_PAUSE = "dev.katsuraz.shatsu.PAUSE";
    private static final String ACTION_NEXT = "dev.katsuraz.shatsu.NEXT";
    private static final String CHANNEL = "shatsu_audio";
    private static final int NOTIFICATION_ID = 4202;

    private static volatile boolean running = false;
    private static volatile String activeRoomCode = "";
    public static boolean isRunning() { return running; }
    public static boolean isRunningFor(String code) { return running && code != null && code.equals(activeRoomCode); }

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor();
    private MediaSession session;
    private MediaPlayer player;
    private String server = "", code = "", token = "", participantId = "";
    private String currentTrack = "", currentTitle = "Shatsu listening room";
    private long lastRevision = -1;
    private long completedRevision = -1;
    private long desiredPositionMs = 0;
    private boolean desiredPlaying = false;
    private boolean localPaused = false;
    private boolean prepared = false;
    private boolean host = false;
    private boolean started = false;
    private boolean dead = false;

    @Override public void onCreate() {
        super.onCreate();
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Shatsu background music",
                NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Playback controls for supported music sources");
            manager.createNotificationChannel(channel);
        }
        session = new MediaSession(this, "ShatsuAudio");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { controlPlay(); }
            @Override public void onPause() { controlPause(); }
            @Override public void onSkipToNext() { nextTrack(); }
        }, handler);
        session.setActive(true);
        publishState(PlaybackState.STATE_CONNECTING);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? "" : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_PLAY.equals(action)) { controlPlay(); return START_STICKY; }
        if (ACTION_PAUSE.equals(action)) { controlPause(); return START_STICKY; }
        if (ACTION_NEXT.equals(action)) { nextTrack(); return START_STICKY; }
        if (!ACTION_START.equals(action)) return START_NOT_STICKY;

        String newServer = intent.getStringExtra("server");
        String newCode = intent.getStringExtra("code");
        String newToken = intent.getStringExtra("token");
        String newId = intent.getStringExtra("participantId");
        if (newServer == null || !newServer.matches("https://[a-zA-Z0-9.-]+(?::443)?")
            || newCode == null || !newCode.matches("[A-Z2-9]{8}")
            || newToken == null || !newToken.matches("[0-9a-f]{48}")
            || newId == null || !newId.matches("[a-fA-F0-9-]{36}")) {
            stopSelf();
            return START_NOT_STICKY;
        }
        boolean sameRoom = newServer.equals(server) && newCode.equals(code) && newToken.equals(token);
        server = newServer;
        code = newCode;
        token = newToken;
        participantId = newId;
        if (!sameRoom) {
            clearPlayer();
            lastRevision = -1;
            completedRevision = -1;
        }
        localPaused = false;
        startAsForeground();
        running = true;
        activeRoomCode = code;
        if (!started) {
            started = true;
            executor.scheduleWithFixedDelay(() -> {
                try { pollRoom(); } catch (Exception ignored) { /* Retry on the next poll. */ }
            }, 0, 4, TimeUnit.SECONDS);
        } else executor.execute(() -> { try { pollRoom(); } catch (Exception ignored) {} });
        return START_STICKY;
    }

    private void startAsForeground() {
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else startForeground(NOTIFICATION_ID, notification);
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent openApp = PendingIntent.getActivity(this, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        boolean playing = prepared && player != null && player.isPlaying();
        Notification.Builder builder = new Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.shatsu_icon)
            .setContentTitle(currentTitle)
            .setContentText(playing ? "Shatsu • playing in your room" : "Shatsu • background listening")
            .setContentIntent(openApp)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(playing)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_TRANSPORT);
        builder.addAction(new Notification.Action.Builder(
            playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
            playing ? "Pause" : "Play", command(playing ? ACTION_PAUSE : ACTION_PLAY, 1)).build());
        if (host) {
            builder.addAction(new Notification.Action.Builder(android.R.drawable.ic_media_next,
                "Next", command(ACTION_NEXT, 2)).build());
        }
        builder.addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel,
            "Stop", command(ACTION_STOP, 3)).build());
        builder.setStyle(new Notification.MediaStyle()
            .setMediaSession(session.getSessionToken())
            .setShowActionsInCompactView(0, 1));
        return builder.build();
    }

    private PendingIntent command(String action, int requestCode) {
        Intent command = new Intent(this, RoomPlaybackService.class).setAction(action);
        return PendingIntent.getService(this, requestCode, command,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void updateNotification() {
        if (dead) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification());
    }

    private void publishState(int mode) {
        long position = prepared && player != null ? player.getCurrentPosition() : desiredPositionMs;
        session.setMetadata(new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, currentTitle)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, "Shatsu • Audius").build());
        session.setPlaybackState(new PlaybackState.Builder()
            .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                | (host ? PlaybackState.ACTION_SKIP_TO_NEXT : 0))
            .setState(mode, Math.max(0, position), 1f)
            .build());
        updateNotification();
    }

    private void controlPause() {
        localPaused = true;
        if (prepared && player != null && player.isPlaying()) player.pause();
        publishState(PlaybackState.STATE_PAUSED);
        if (host) postAction("pause", -1);
    }

    private void controlPlay() {
        localPaused = false;
        if (host) postAction("play", -1);
        if (desiredPlaying && prepared && player != null) {
            try { player.start(); } catch (IllegalStateException ignored) {}
        }
        publishState(desiredPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED);
        executor.execute(() -> { try { pollRoom(); } catch (Exception ignored) {} });
    }

    private void nextTrack() {
        if (!host) return;
        postAction("next", -1);
    }

    private void postAction(String type, long expectedRevision) {
        if (dead) return;
        executor.execute(() -> {
            try {
                JSONObject payload = new JSONObject().put("token", token).put("type", type);
                if (expectedRevision >= 0) {
                    payload.put("automatic", true);
                    payload.put("expectedRevision", expectedRevision);
                }
                request(server + "/api/rooms/" + code + "/action", payload);
                pollRoom();
            } catch (Exception ignored) { /* Next room poll can recover. */ }
        });
    }

    private static JSONObject request(String url, JSONObject payload) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(6500);
        connection.setReadTimeout(7000);
        connection.setRequestMethod("POST");
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("Accept", "application/json");
        try {
            byte[] data = payload.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream output = connection.getOutputStream()) { output.write(data); }
            int status = connection.getResponseCode();
            if (status != 200) throw new IllegalStateException("Room is unavailable: " + status);
            try (InputStream input = connection.getInputStream();
                 ByteArrayOutputStream result = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096];
                int n;
                while ((n = input.read(buffer)) >= 0) {
                    if (result.size() + n > 65536) throw new IllegalStateException("Room response too large");
                    result.write(buffer, 0, n);
                }
                return new JSONObject(result.toString(StandardCharsets.UTF_8.name()));
            }
        } finally { connection.disconnect(); }
    }

    private void pollRoom() throws Exception {
        if (dead || code.isEmpty()) return;
        long before = System.currentTimeMillis();
        JSONObject response = request(server + "/api/rooms/" + code + "/resume",
            new JSONObject().put("token", token));
        long after = System.currentTimeMillis();
        JSONObject state = response.optJSONObject("state");
        if (state == null) return;
        JSONObject pb = state.optJSONObject("playback");
        if (pb == null) return;
        boolean isHost = participantId.equals(state.optString("hostId"));
        long offset = state.optLong("serverNow", after) - (before + after) / 2;
        long serverTime = after + offset;
        long duration = pb.optBoolean("playing") ? Math.max(0, serverTime - pb.optLong("updatedAt", serverTime)) : 0;
        long position = Math.max(0, Math.round(pb.optDouble("position", 0) * 1000) + duration);
        handler.post(() -> applyRoom(pb, isHost, position));
    }

    private void applyRoom(JSONObject pb, boolean isHost, long position) {
        if (dead) return;
        host = isHost;
        String provider = pb.optString("provider");
        String trackId = pb.optString("trackId");
        if (!"audius".equals(provider) || !trackId.matches("[a-zA-Z0-9]{2,32}")) {
            // A video or Spotify track must never use this audio-only background service.
            stopSelf();
            return;
        }
        currentTitle = pb.optString("title", "Audius song").substring(0,
            Math.min(100, pb.optString("title", "Audius song").length()));
        desiredPlaying = pb.optBoolean("playing");
        desiredPositionMs = position;
        long revision = pb.optLong("revision", -1);
        boolean changed = !trackId.equals(currentTrack);
        if (changed) {
            currentTrack = trackId;
            lastRevision = revision;
            completedRevision = -1;
            prepareTrack(trackId);
            return;
        }
        if (prepared && player != null) {
            try {
                boolean repeatRestart = lastRevision != revision && player.getCurrentPosition() >= player.getDuration() - 1200
                    && position < 2000;
                if (repeatRestart || Math.abs(player.getCurrentPosition() - position) > 2200)
                    player.seekTo((int) Math.min(position, Integer.MAX_VALUE));
                if (desiredPlaying && !localPaused && !player.isPlaying()) player.start();
                else if ((!desiredPlaying || localPaused) && player.isPlaying()) player.pause();
            } catch (IllegalStateException ignored) {}
        }
        lastRevision = revision;
        publishState(prepared && player != null && player.isPlaying() ? PlaybackState.STATE_PLAYING :
            PlaybackState.STATE_PAUSED);
    }

    private void prepareTrack(String id) {
        clearPlayer();
        currentTrack = id;
        prepared = false;
        try {
            MediaPlayer created = new MediaPlayer();
            player = created;
            created.setAudioAttributes(new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .setUsage(AudioAttributes.USAGE_MEDIA).build());
            created.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);
            created.setDataSource("https://api.audius.co/v1/tracks/" + id + "/stream?app_name=Shatsu");
            created.setOnPreparedListener(mp -> {
                if (dead || player != mp) return;
                prepared = true;
                try {
                    if (desiredPositionMs > 0) mp.seekTo((int) Math.min(desiredPositionMs, Integer.MAX_VALUE));
                    if (desiredPlaying && !localPaused) mp.start();
                } catch (IllegalStateException ignored) {}
                publishState(mp.isPlaying() ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED);
            });
            created.setOnCompletionListener(mp -> {
                if (dead || mp != player || !host || !desiredPlaying || completedRevision == lastRevision) return;
                completedRevision = lastRevision;
                postAction("next", lastRevision);
            });
            created.setOnErrorListener((mp, what, extra) -> {
                if (mp != player) return true;
                currentTitle = "Audius track unavailable";
                publishState(PlaybackState.STATE_ERROR);
                return true;
            });
            created.prepareAsync();
            publishState(PlaybackState.STATE_BUFFERING);
        } catch (Exception error) {
            clearPlayer();
            currentTitle = "Couldn't play this Audius track";
            publishState(PlaybackState.STATE_ERROR);
        }
    }

    private void clearPlayer() {
        prepared = false;
        if (player != null) {
            try { player.reset(); } catch (Exception ignored) {}
            try { player.release(); } catch (Exception ignored) {}
            player = null;
        }
        currentTrack = "";
    }

    @Override public void onTaskRemoved(Intent rootIntent) {
        // Keep the foreground audio session alive when the user swipes the UI away.
        super.onTaskRemoved(rootIntent);
    }

    @Override public void onDestroy() {
        running = false;
        activeRoomCode = "";
        dead = true;
        executor.shutdownNow();
        clearPlayer();
        if (session != null) { session.setActive(false); session.release(); }
        stopForeground(true);
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
