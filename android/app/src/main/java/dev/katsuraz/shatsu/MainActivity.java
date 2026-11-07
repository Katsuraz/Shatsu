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

/** Shatsu Android companion: web room UI + supported YouTube embeds; Spotify sign-in uses external Brave. */
public final class MainActivity extends Activity {
    private static final String PREFS = "shatsu_prefs";
    private static final String SERVER = "server_url";
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
        settings.setUserAgentString(settings.getUserAgentString() + " ShatsuAndroid/0.2.0");
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
        serverUrl = getPreferences(MODE_PRIVATE).getString(SERVER, "");
        if (serverUrl.isEmpty()) showServerDialog(false);
        else browser.loadUrl(serverUrl);
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
            .setItems(new String[]{ "Change server address", "Open Shatsu in Brave", "Reload", "About" }, (d, which) -> {
                switch (which) {
                    case 0: showServerDialog(true); break;
                    case 1: openExternal(serverUrl); break;
                    case 2: if (serverUrl != null && !serverUrl.isEmpty()) browser.reload(); break;
                    case 3: new AlertDialog.Builder(this).setTitle("Shatsu v0.2.0 alpha")
                            .setMessage("Your own Shatsu server is required. YouTube rooms work in the embedded browser where supported. For Spotify sign-in, use Brave or another full browser. Spotify Premium and developer configuration are required.")
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
            browser.loadUrl(serverUrl);
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
        if (url == null || url.isEmpty()) { showServerDialog(false); return; }
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
