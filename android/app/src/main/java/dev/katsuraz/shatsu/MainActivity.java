package dev.katsuraz.shatsu;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

/** Shatsu Android companion: web room UI + supported YouTube embeds; Spotify sign-in uses external Brave. */
public final class MainActivity extends Activity {
    private static final String PREFS = "shatsu_prefs";
    private static final String SERVER = "server_url";
    private static final String CONFIG_URL = "https://raw.githubusercontent.com/Katsuraz/Shatsu/main/config/server.json";
    private static final String HOSTING_URL = "https://render.com/deploy?repo=https://github.com/Katsuraz/Shatsu";
    private LinearLayout setupPanel;
    private TextView setupTitle, setupMessage;
    private Button setupRetry, setupHost;
    private boolean pageFailed = false;
    private int connectionAttempt = 0;
    private WebView browser;
    private String serverUrl;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private LinearLayout root;
    private LinearLayout toolbar;

    private int dp(int px) { return (int) (px * getResources().getDisplayMetrics().density + 0.5f); }

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(14, 13, 22));
        getWindow().setNavigationBarColor(Color.rgb(14, 13, 22));
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(14, 13, 22));
        setContentView(root);

        toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(14), dp(5), dp(14), dp(5));
        toolbar.setBackgroundColor(Color.rgb(30, 26, 45));
        TextView title = new TextView(this);
        title.setText("shatsu.");
        title.setTextColor(Color.rgb(204, 171, 255));
        title.setTextSize(22f);
        title.setTypeface(null, 1);
        toolbar.addView(title, new LinearLayout.LayoutParams(0, dp(50), 1f));
        Button brave = smallButton("Brave ↗", v -> openExternal(serverUrl));
        toolbar.addView(brave);
        Button menu = smallButton("⋮", v -> showMenu());
        toolbar.addView(menu);
        root.addView(toolbar);

        browser = new WebView(this);
        WebSettings settings = browser.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setUserAgentString(settings.getUserAgentString() + " ShatsuAndroid/0.2.1");
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        browser.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri destination = request.getUrl();
                if (destination.getHost() != null && serverUrl != null && destination.getHost().equalsIgnoreCase(Uri.parse(serverUrl).getHost())
                    && destination.getScheme() != null && destination.getScheme().equalsIgnoreCase(Uri.parse(serverUrl).getScheme())) return false;
                openExternal(destination.toString());
                if ("accounts.spotify.com".equalsIgnoreCase(destination.getHost()))
                    Toast.makeText(MainActivity.this, "Spotify authorization continues in your browser; keep listening there after sign-in.", Toast.LENGTH_LONG).show();
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (!pageFailed) {
                    if (setupPanel != null) setupPanel.setVisibility(View.GONE);
                    browser.setVisibility(View.VISIBLE);
                }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
                if (request.isForMainFrame()) {
                    pageFailed = true;
                    showSetup("Can't open Shatsu", "The listening server may be sleeping. Tap Try again.", false);
                }
            }
        });
        browser.setWebChromeClient(new WebChromeClient() {
            @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) { callback.onCustomViewHidden(); return; }
                customView = view;
                customViewCallback = callback;
                toolbar.setVisibility(View.GONE);
                browser.setVisibility(View.GONE);
                root.addView(view, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
            }
            @Override public void onHideCustomView() { closeFullScreen(); }
        });
        root.addView(browser, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        makeSetupPanel();
        browser.setVisibility(View.GONE);
        serverUrl = getPreferences(MODE_PRIVATE).getString(SERVER, "");
        if (serverUrl.isEmpty()) connectAutomatically();
        else loadServer(serverUrl);
    }


    private void makeSetupPanel() {
        setupPanel = new LinearLayout(this);
        setupPanel.setOrientation(LinearLayout.VERTICAL);
        setupPanel.setGravity(Gravity.CENTER);
        setupPanel.setPadding(dp(22), dp(26), dp(22), dp(26));
        setupPanel.setBackgroundColor(Color.rgb(14, 13, 22));
        TextView icon = new TextView(this);
        icon.setText("♫");
        icon.setTextColor(Color.rgb(204, 171, 255));
        icon.setTextSize(52);
        icon.setGravity(Gravity.CENTER);
        setupPanel.addView(icon);
        setupTitle = new TextView(this);
        setupTitle.setTextColor(Color.WHITE);
        setupTitle.setTextSize(23);
        setupTitle.setTypeface(null, 1);
        setupTitle.setGravity(Gravity.CENTER);
        setupPanel.addView(setupTitle);
        setupMessage = new TextView(this);
        setupMessage.setTextColor(Color.rgb(197, 187, 208));
        setupMessage.setTextSize(16);
        setupMessage.setGravity(Gravity.CENTER);
        setupMessage.setPadding(0, dp(16), 0, dp(24));
        setupPanel.addView(setupMessage);
        setupRetry = smallButton("Try again", v -> connectAutomatically());
        setupRetry.setTextSize(17);
        setupPanel.addView(setupRetry, new LinearLayout.LayoutParams(-1, dp(56)));
        setupHost = smallButton("Set up hosting", v -> openExternal(HOSTING_URL));
        setupPanel.addView(setupHost, new LinearLayout.LayoutParams(-1, dp(56)));
        root.addView(setupPanel, new LinearLayout.LayoutParams(-1, 0, 1f));
    }

    private void showSetup(String title, String message, boolean connecting) {
        if (setupPanel == null) return;
        browser.setVisibility(View.GONE);
        setupPanel.setVisibility(View.VISIBLE);
        setupTitle.setText(title);
        setupMessage.setText(message);
        setupRetry.setVisibility(connecting ? View.GONE : View.VISIBLE);
        setupHost.setVisibility(connecting ? View.GONE : View.VISIBLE);
    }

    private void connectAutomatically() {
        final int attempt = ++connectionAttempt;
        showSetup("Connecting automatically…", "Finding your listening space. You don't need to type a server address.", true);
        new Thread(() -> {
            try {
                JSONObject config = new JSONObject(readJson(CONFIG_URL));
                String candidate = config.optString("serverUrl", "");
                Uri endpoint = Uri.parse(candidate);
                String authority = endpoint.getEncodedAuthority();
                if (!"https".equalsIgnoreCase(endpoint.getScheme()) || endpoint.getHost() == null ||
                    authority == null || authority.contains("@") ||
                    endpoint.getQuery() != null || endpoint.getFragment() != null ||
                    (endpoint.getPath() != null && !endpoint.getPath().isEmpty() && !"/".equals(endpoint.getPath()))) {
                    runOnUiThread(() -> {
                        if (attempt == connectionAttempt) showSetup("Shatsu isn't online yet",
                            "The app is ready, but the owner needs to activate its cloud server once. After that, Shatsu will connect automatically.", false);
                    });
                    return;
                }
                String url = "https://" + authority;
                JSONObject health = new JSONObject(readJson(url + "/api/health"));
                if (!health.optBoolean("ok", false) || !"Shatsu".equals(health.optString("name")))
                    throw new IllegalStateException("Shatsu server unavailable");
                runOnUiThread(() -> { if (attempt == connectionAttempt) loadServer(url); });
            } catch (Exception err) {
                runOnUiThread(() -> {
                    if (attempt == connectionAttempt) showSetup("Connection unavailable",
                        "Check your internet connection and tap Try again. Hosting may not be ready yet.", false);
                });
            }
        }, "shatsu-cloud").start();
    }

    private String readJson(String url) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(8000);
        connection.setReadTimeout(8000);
        connection.setRequestProperty("Accept", "application/json");
        try {
            if (connection.getResponseCode() != 200) throw new IllegalStateException("Bad response");
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] chunk = new byte[512];
                int n;
                while ((n = input.read(chunk)) != -1) {
                    if (output.size() + n > 4096) throw new IllegalStateException("Response too large");
                    output.write(chunk, 0, n);
                }
                return output.toString(StandardCharsets.UTF_8.name());
            }
        } finally { connection.disconnect(); }
    }

    private void loadServer(String url) {
        serverUrl = url;
        pageFailed = false;
        showSetup("Opening Shatsu…", "Your listening room is getting ready.", true);
        browser.loadUrl(url);
    }

    private Button smallButton(String label, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextColor(Color.WHITE);
        button.setAllCaps(false);
        button.setTextSize(13);
        button.setOnClickListener(listener);
        return button;
    }

    private void showMenu() {
        new AlertDialog.Builder(this).setTitle("Shatsu")
            .setItems(new String[]{ "Reconnect automatically", "Open Shatsu in Brave", "Reload", "Advanced: custom server", "About" }, (d, which) -> {
                switch (which) {
                    case 0:
                        getPreferences(MODE_PRIVATE).edit().remove(SERVER).apply();
                        serverUrl = null;
                        connectAutomatically();
                        break;
                    case 1: openExternal(serverUrl); break;
                    case 2: if (serverUrl != null && !serverUrl.isEmpty()) browser.reload(); break;
                    case 3: showServerDialog(true); break;
                    case 4: new AlertDialog.Builder(this).setTitle("Shatsu v0.2.1 alpha")
                            .setMessage("Shatsu automatically connects to the cloud server published by its owner. Cloud hosting must be activated once. For Spotify sign-in, use Brave. Spotify Premium and developer authorization are required.")
                            .setPositiveButton("OK", null).show(); break;
                    default: break;
                }
            }).show();
    }

    private void showServerDialog(boolean cancellable) {
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setText(serverUrl);
        input.setHint("https://your-shatsu-server.example");
        input.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        LinearLayout box = new LinearLayout(this);
        box.setPadding(dp(20), dp(10), dp(20), dp(4));
        box.addView(input);
        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle("Connect to your Shatsu server")
            .setMessage("Enter the HTTPS address where the Shatsu Node server is deployed. LAN HTTP addresses may be used for local testing. This APK does not host rooms itself.")
            .setView(box)
            .setPositiveButton("Connect", null)
            .setNegativeButton(cancellable ? "Cancel" : "Exit", (d, w) -> { if (!cancellable) finish(); })
            .create();
        dialog.setCancelable(cancellable);
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String candidate = input.getText().toString().trim();
            Uri uri = Uri.parse(candidate);
            String scheme = uri.getScheme();
            if (uri.getHost() == null || scheme == null || !(scheme.equals("https") || scheme.equals("http")) || (uri.getEncodedAuthority() != null && uri.getEncodedAuthority().contains("@")) || uri.getQuery() != null || uri.getFragment() != null) {
                input.setError("Enter a complete http(s) server URL without a path, query, or password");
                return;
            }
            if (scheme.equals("http") && !isPrivateOrLocal(uri.getHost())) {
                input.setError("Public servers require HTTPS");
                return;
            }
            serverUrl = uri.getScheme() + "://" + uri.getAuthority();
            getPreferences(MODE_PRIVATE).edit().putString(SERVER, serverUrl).apply();
            loadServer(serverUrl);
            dialog.dismiss();
        }));
        dialog.show();
    }

    private static boolean isPrivateOrLocal(String host) {
        if ("localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host)) return true;
        if (!host.matches("\\d+\\.\\d+\\.\\d+\\.\\d+")) return false;
        String[] octets = host.split("\\.");
        int a, b;
        try {
            a = Integer.parseInt(octets[0]); b = Integer.parseInt(octets[1]);
            for (String octet : octets) if (Integer.parseInt(octet) > 255) return false;
        } catch (NumberFormatException error) { return false; }
        return a == 10 || a == 192 && b == 168 || a == 172 && b >= 16 && b <= 31 || a == 127;
    }

    private void openExternal(String url) {
        if (url == null || url.isEmpty()) {
            Toast.makeText(this, "Shatsu is not online yet", Toast.LENGTH_LONG).show();
            return;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        intent.setPackage("com.brave.browser");
        try { startActivity(intent); }
        catch (ActivityNotFoundException e) {
            intent.setPackage(null);
            try { startActivity(intent); }
            catch (ActivityNotFoundException noBrowser) { Toast.makeText(this, "No browser installed", Toast.LENGTH_LONG).show(); }
        }
    }

    private void closeFullScreen() {
        if (customView == null) return;
        root.removeView(customView);
        customView = null;
        toolbar.setVisibility(View.VISIBLE);
        browser.setVisibility(View.VISIBLE);
        if (customViewCallback != null) { customViewCallback.onCustomViewHidden(); customViewCallback = null; }
    }

    @Override public void onBackPressed() {
        if (customView != null) closeFullScreen();
        else if (browser.canGoBack()) browser.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (browser != null) { browser.destroy(); browser = null; }
        super.onDestroy();
    }
}
