package dev.katsuraz.shatsu;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Shatsu Android companion. Standard setup is zero-entry: look up the owner's
 * published cloud configuration and open the room UI automatically.
 *
 * Cloud hosting is still required for Internet rooms. This app never pretends
 * to create or deploy remote infrastructure without an authorized provider.
 */
public final class MainActivity extends Activity {
    private static final String PREFS = "shatsu_prefs";
    private static final String OVERRIDE = "server_url";
    private static final String CLOUD_CONFIG =
        "https://raw.githubusercontent.com/Katsuraz/Shatsu/main/config/server.json";
    private static final String DEFAULT_SERVER = "https://shatsu.onrender.com";
    private static final String RELEASES_API = "https://api.github.com/repos/Katsuraz/Shatsu/releases?per_page=5";
    private static final String APP_VERSION = "0.3.2-alpha";
    private static final int BG = Color.rgb(14, 13, 22);
    private static final int TEXT = Color.rgb(242, 235, 255);
    private static final int MUTED = Color.rgb(190, 180, 203);
    private static final int ACCENT = Color.rgb(183, 148, 255);

    private LinearLayout root;
    private LinearLayout toolbar;
    private FrameLayout content;
    private WebView browser;
    private LinearLayout connectionPanel;
    private ScrollView connectionOverlay;
    private TextView heading;
    private TextView detail;
    private ProgressBar spinner;
    private Button retry;
    private Button setup;
    private String serverUrl;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private boolean destroyed = false;
    private boolean webPageLoadFailed = false;
    private int requestId = 0;

    private int dp(float v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);

        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);
        setContentView(root);

        toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(16), dp(3), dp(10), dp(3));
        toolbar.setBackgroundColor(Color.rgb(30, 26, 45));
        TextView title = new TextView(this);
        title.setText("shatsu.");
        title.setTextColor(ACCENT);
        title.setTextSize(22f);
        title.setTypeface(null, 1);
        title.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.addView(title, new LinearLayout.LayoutParams(0, dp(52), 1f));
        toolbar.addView(smallButton("Brave ↗", v -> {
            if (serverUrl == null) {
                Toast.makeText(this, "Shatsu is not connected yet", Toast.LENGTH_SHORT).show();
            } else openExternal(serverUrl);
        }));
        toolbar.addView(smallButton("⋮", v -> showMenu()));
        root.addView(toolbar);

        content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1f));

        browser = new WebView(this);
        WebSettings settings = browser.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setUserAgentString(settings.getUserAgentString() + " ShatsuAndroid/0.3.2");
        browser.setBackgroundColor(BG);
        browser.setVisibility(View.INVISIBLE);
        // The bridge exposes only a validated, user-initiated Android share action.
        browser.addJavascriptInterface(new Object() {
            @JavascriptInterface public void shareInvite(String link) {
                try {
                    Uri uri = Uri.parse(link);
                    Uri own = Uri.parse(serverUrl != null ? serverUrl : DEFAULT_SERVER);
                    String code = uri.getQueryParameter("room");
                    if (uri.getScheme() == null || !uri.getScheme().equalsIgnoreCase(own.getScheme())
                        || uri.getHost() == null || !uri.getHost().equalsIgnoreCase(own.getHost())
                        || uri.getPort() != own.getPort() || !"/".equals(uri.getPath())
                        || code == null || !code.matches("[A-Z2-9]{8}")) return;
                    runOnUiThread(() -> {
                        Intent share = new Intent(Intent.ACTION_SEND);
                        share.setType("text/plain");
                        share.putExtra(Intent.EXTRA_TEXT, "Listen with me on Shatsu 🎧 " + link);
                        startActivity(Intent.createChooser(share, "Invite your friends"));
                    });
                } catch (Exception ignored) { /* Do not share untrusted URLs. */ }
            }
        }, "ShatsuAndroid");
        WebView.setWebContentsDebuggingEnabled(
            (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        browser.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri destination = request.getUrl();
                Uri origin = serverUrl == null ? null : Uri.parse(serverUrl);
                if (origin != null && destination.getHost() != null
                    && destination.getHost().equalsIgnoreCase(origin.getHost())
                    && destination.getScheme() != null
                    && destination.getScheme().equalsIgnoreCase(origin.getScheme())) return false;
                openExternal(destination.toString());
                if ("accounts.spotify.com".equalsIgnoreCase(destination.getHost()))
                    Toast.makeText(MainActivity.this,
                        "Continue Spotify sign-in in Brave.", Toast.LENGTH_LONG).show();
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                webPageLoadFailed = false;
                showLoading("Opening Shatsu…", "Getting your listening room ready.");
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request,
                                                  WebResourceError error) {
                if (request.isForMainFrame()) {
                    webPageLoadFailed = true;
                    showProblem("Can't open Shatsu right now",
                        "The listening server may be offline. Check your connection and try again.");
                }
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (!webPageLoadFailed) {
                    browser.setVisibility(View.VISIBLE);
                    connectionOverlay.setVisibility(View.GONE);
                }
            }
        });
        browser.setWebChromeClient(new WebChromeClient() {
            @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) { callback.onCustomViewHidden(); return; }
                customView = view;
                customViewCallback = callback;
                toolbar.setVisibility(View.GONE);
                content.setVisibility(View.GONE);
                root.addView(view, new LinearLayout.LayoutParams(-1, 0, 1f));
            }
            @Override public void onHideCustomView() { closeFullScreen(); }
        });
        content.addView(browser, new FrameLayout.LayoutParams(-1, -1));
        makeConnectionPanel();
        connectAutomatically();
        checkForUpdates(false);
    }

    private void makeConnectionPanel() {
        connectionOverlay = new ScrollView(this);
        connectionOverlay.setFillViewport(true);
        connectionOverlay.setBackgroundColor(BG);
        connectionPanel = new LinearLayout(this);
        connectionPanel.setOrientation(LinearLayout.VERTICAL);
        connectionPanel.setGravity(Gravity.CENTER);
        connectionPanel.setPadding(dp(26), dp(35), dp(26), dp(35));
        connectionOverlay.addView(connectionPanel, new ScrollView.LayoutParams(-1, -1));

        TextView emblem = new TextView(this);
        emblem.setText("♫");
        emblem.setTextSize(52);
        emblem.setGravity(Gravity.CENTER);
        emblem.setTextColor(ACCENT);
        connectionPanel.addView(emblem, new LinearLayout.LayoutParams(-1, dp(86)));

        heading = new TextView(this);
        heading.setTextColor(TEXT);
        heading.setTextSize(24);
        heading.setTypeface(null, 1);
        heading.setGravity(Gravity.CENTER);
        connectionPanel.addView(heading);

        detail = new TextView(this);
        detail.setTextColor(MUTED);
        detail.setTextSize(16);
        detail.setGravity(Gravity.CENTER);
        detail.setPadding(0, dp(18), 0, dp(24));
        connectionPanel.addView(detail);

        spinner = new ProgressBar(this);
        LinearLayout.LayoutParams spinnerParams = new LinearLayout.LayoutParams(dp(38), dp(38));
        spinnerParams.gravity = Gravity.CENTER_HORIZONTAL;
        spinnerParams.bottomMargin = dp(20);
        connectionPanel.addView(spinner, spinnerParams);

        retry = actionButton("Try again", () -> connectAutomatically());
        setup = actionButton("Open Shatsu in Brave", () -> openExternal(serverUrl == null ? DEFAULT_SERVER : serverUrl));
        connectionPanel.addView(retry, new LinearLayout.LayoutParams(-1, dp(56)));
        LinearLayout.LayoutParams setupParams = new LinearLayout.LayoutParams(-1, dp(56));
        setupParams.topMargin = dp(12);
        connectionPanel.addView(setup, setupParams);
        content.addView(connectionOverlay, new FrameLayout.LayoutParams(-1, -1));
    }

    private Button actionButton(String label, Runnable runnable) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextSize(16);
        button.setTextColor(Color.WHITE);
        button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(90, 65, 153)));
        button.setOnClickListener(v -> runnable.run());
        button.setMinHeight(dp(48));
        return button;
    }

    private Button smallButton(String label, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextColor(TEXT);
        button.setAllCaps(false);
        button.setTextSize(13);
        button.setOnClickListener(listener);
        return button;
    }

    private void showLoading(String headline, String message) {
        connectionOverlay.setVisibility(View.VISIBLE);
        browser.setVisibility(View.INVISIBLE);
        heading.setText(headline);
        detail.setText(message);
        spinner.setVisibility(View.VISIBLE);
        retry.setVisibility(View.GONE);
        setup.setVisibility(View.GONE);
    }

    private void showProblem(String headline, String message) {
        connectionOverlay.setVisibility(View.VISIBLE);
        browser.setVisibility(View.INVISIBLE);
        heading.setText(headline);
        detail.setText(message);
        spinner.setVisibility(View.GONE);
        retry.setVisibility(View.VISIBLE);
        setup.setVisibility(View.VISIBLE);
    }

    private void connectAutomatically() {
        final int thisRequest = ++requestId;
        showLoading("Connecting automatically…", "No server address needed. Shatsu is finding your listening space.");
        new Thread(() -> {
            try {
                String override = getPreferences(MODE_PRIVATE).getString(OVERRIDE, "");
                String url = null;
                if (!override.isEmpty()) url = validServer(override);
                else {
                    try { url = fetchPublishedServer(); } catch (Exception ignored) { /* GitHub may be blocked. */ }
                    if (url == null) url = DEFAULT_SERVER;
                }
                if (url == null) {
                    finishRequest(thisRequest, () -> showProblem("Custom server address is invalid",
                        "Use the menu to switch back to automatic connection."));
                    return;
                }
                if (!isServerHealthy(url)) {
                    // Render free services can take extra time to wake up.
                    try { Thread.sleep(2500); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
                    if (!isServerHealthy(url)) {
                        finishRequest(thisRequest, () -> showProblem("Shatsu is waking up",
                            "The server isn't responding yet. Wait for it to start, then tap Try again. "
                            + "You can also open Shatsu in Brave to check its status."));
                        return;
                    }
                }
                final String healthyUrl = url;
                finishRequest(thisRequest, () -> {
                    serverUrl = healthyUrl;
                    browser.loadUrl(serverUrl);
                });
            } catch (Exception exception) {
                finishRequest(thisRequest, () -> showProblem("Connection unavailable",
                    "Check your internet connection and tap Try again. Your Shatsu server settings "
                    + "will be found automatically when they are published."));
            }
        }, "shatsu-cloud-discovery").start();
    }

    private void finishRequest(int id, Runnable action) {
        runOnUiThread(() -> { if (!destroyed && id == requestId) action.run(); });
    }

    private String fetchPublishedServer() throws Exception {
        String config = fetchText(CLOUD_CONFIG, 4096);
        JSONObject value = new JSONObject(config);
        return validServer(value.optString("serverUrl", ""));
    }

    private boolean isServerHealthy(String url) {
        try {
            JSONObject response = new JSONObject(fetchText(url + "/api/health", 4096));
            return response.optBoolean("ok", false) && "Shatsu".equals(response.optString("name"));
        } catch (Exception ignored) { return false; }
    }

    private String fetchText(String url, int maxBytes) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(14000);
        conn.setInstanceFollowRedirects(true);
        conn.setRequestProperty("Accept", "application/json");
        try {
            if (conn.getResponseCode() != 200) throw new IllegalStateException("Unexpected HTTP status");
            try (InputStream input = conn.getInputStream(); ByteArrayOutputStream data = new ByteArrayOutputStream()) {
                byte[] chunk = new byte[512];
                int n;
                while ((n = input.read(chunk)) >= 0) {
                    if (data.size() + n > maxBytes) throw new IllegalStateException("Response too long");
                    data.write(chunk, 0, n);
                }
                return data.toString(StandardCharsets.UTF_8.name());
            }
        } finally { conn.disconnect(); }
    }

    private static String validServer(String value) {
        if (value == null || value.trim().isEmpty()) return null;
        Uri uri = Uri.parse(value.trim());
        if (uri.getHost() == null || uri.getHost().isEmpty() || uri.getScheme() == null
            || (uri.getEncodedAuthority() != null && uri.getEncodedAuthority().contains("@"))
            || uri.getQuery() != null || uri.getFragment() != null
            || (uri.getPath() != null && !uri.getPath().isEmpty() && !"/".equals(uri.getPath()))) return null;
        String scheme = uri.getScheme().toLowerCase(java.util.Locale.ROOT);
        if (!("https".equals(scheme) || ("http".equals(scheme) && isPrivateOrLocal(uri.getHost())))) return null;
        return scheme + "://" + uri.getAuthority();
    }

    private static boolean isPrivateOrLocal(String host) {
        if ("localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host)) return true;
        if (!host.matches("\\d+\\.\\d+\\.\\d+\\.\\d+")) return false;
        String[] octets = host.split("\\.");
        try {
            int a = Integer.parseInt(octets[0]), b = Integer.parseInt(octets[1]);
            for (String part : octets) if (Integer.parseInt(part) > 255) return false;
            return a == 10 || a == 192 && b == 168 || a == 172 && b >= 16 && b <= 31 || a == 127;
        } catch (NumberFormatException error) { return false; }
    }

    private void showMenu() {
        new AlertDialog.Builder(this).setTitle("Shatsu")
            .setItems(new String[]{"How to use Shatsu", "Reconnect automatically", "Open in Brave",
                "Check for updates", "Advanced: custom server", "Use automatic connection", "About"}, (d, which) -> {
                switch (which) {
                    case 0:
                        if (browser.getVisibility() == View.VISIBLE)
                            browser.evaluateJavascript("window.ShatsuGuide && window.ShatsuGuide.open()", null);
                        else openExternal(DEFAULT_SERVER + "/?guide=1");
                        break;
                    case 1: connectAutomatically(); break;
                    case 2: openExternal(serverUrl == null ? DEFAULT_SERVER : serverUrl); break;
                    case 3: checkForUpdates(true); break;
                    case 4: showServerDialog(); break;
                    case 5:
                        getPreferences(MODE_PRIVATE).edit().remove(OVERRIDE).apply();
                        serverUrl = null;
                        connectAutomatically();
                        break;
                    case 6:
                        new AlertDialog.Builder(this).setTitle("Shatsu v" + APP_VERSION)
                            .setMessage("Shatsu connects to the online listening service automatically. "
                                + "Use the built-in guide for rooms, invites, songs and synchronization. "
                                + "Spotify requires eligible Premium accounts and separate developer authorization. "
                                + "Android app updates require your permission to install.")
                            .setPositiveButton("OK", null).show(); break;
                    default: break;
                }
            }).show();
    }

    private int compareVersion(String remote, String current) {
        try {
            String[] a = remote.replaceFirst("^v", "").split("[-.]");
            String[] b = current.replaceFirst("^v", "").split("[-.]");
            for (int i = 0; i < 3; i++) {
                int difference = Integer.compare(Integer.parseInt(a[i]), Integer.parseInt(b[i]));
                if (difference != 0) return difference;
            }
        } catch (Exception ignored) { /* Ignore unknown version formats. */ }
        return 0;
    }

    private void checkForUpdates(boolean manual) {
        new Thread(() -> {
            try {
                JSONArray releases = new JSONArray(fetchText(RELEASES_API, 256000));
                for (int i = 0; i < releases.length(); i++) {
                    JSONObject release = releases.optJSONObject(i);
                    if (release == null || release.optBoolean("draft")) continue;
                    String tag = release.optString("tag_name");
                    if (!tag.matches("v[0-9]+\\.[0-9]+\\.[0-9]+-alpha") || compareVersion(tag, APP_VERSION) <= 0) continue;
                    JSONArray assets = release.optJSONArray("assets");
                    if (assets == null) continue;
                    for (int j = 0; j < assets.length(); j++) {
                        JSONObject asset = assets.optJSONObject(j);
                        if (asset == null || !asset.optString("name").endsWith(".apk")) continue;
                        String download = asset.optString("browser_download_url");
                        if (!download.startsWith("https://github.com/Katsuraz/Shatsu/releases/download/")) continue;
                        runOnUiThread(() -> {
                            if (destroyed || isFinishing()) return;
                            new AlertDialog.Builder(this)
                                .setTitle("Shatsu update available")
                                .setMessage("Version " + tag + " is ready. Download and install it from GitHub. "
                                    + "Android will ask you to confirm the installation. "
                                    + "Experimental debug builds may need the old app uninstalled first.")
                                .setPositiveButton("Download", (dialog, which) -> openExternal(download))
                                .setNegativeButton("Later", null).show();
                        });
                        return;
                    }
                }
                if (manual) runOnUiThread(() -> Toast.makeText(this,
                    "You're using the newest Shatsu alpha", Toast.LENGTH_LONG).show());
            } catch (Exception error) {
                if (manual) runOnUiThread(() -> Toast.makeText(this,
                    "Couldn't check for updates. Try again later.", Toast.LENGTH_LONG).show());
            }
        }, "shatsu-version-check").start();
    }

    private void showServerDialog() {
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setHint("https://your-shatsu-server.example");
        input.setText(getPreferences(MODE_PRIVATE).getString(OVERRIDE, ""));
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        LinearLayout box = new LinearLayout(this);
        box.setPadding(dp(22), dp(8), dp(22), dp(2));
        box.addView(input);
        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle("Advanced server override")
            .setMessage("Normally Shatsu connects automatically. Use this only if you run your own server.")
            .setView(box).setPositiveButton("Save", null)
            .setNegativeButton("Cancel", null).create();
        dialog.setOnShowListener(v -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(x -> {
            String url = validServer(input.getText().toString());
            if (url == null) { input.setError("Enter a valid HTTPS URL, or a local-network HTTP address"); return; }
            getPreferences(MODE_PRIVATE).edit().putString(OVERRIDE, url).apply();
            dialog.dismiss();
            connectAutomatically();
        }));
        dialog.show();
    }

    private void openExternal(String url) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        intent.setPackage("com.brave.browser");
        try { startActivity(intent); }
        catch (ActivityNotFoundException noBrave) {
            intent.setPackage(null);
            try { startActivity(intent); }
            catch (ActivityNotFoundException noBrowser) {
                Toast.makeText(this, "Install a browser to continue", Toast.LENGTH_LONG).show();
            }
        }
    }

    private void closeFullScreen() {
        if (customView == null) return;
        root.removeView(customView);
        customView = null;
        toolbar.setVisibility(View.VISIBLE);
        content.setVisibility(View.VISIBLE);
        if (customViewCallback != null) { customViewCallback.onCustomViewHidden(); customViewCallback = null; }
    }

    @Override public void onBackPressed() {
        if (customView != null) closeFullScreen();
        else if (browser != null && browser.getVisibility() == View.VISIBLE && browser.canGoBack()) browser.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        destroyed = true;
        requestId++;
        if (browser != null) {
            browser.destroy();
            browser = null;
        }
        super.onDestroy();
    }
}
