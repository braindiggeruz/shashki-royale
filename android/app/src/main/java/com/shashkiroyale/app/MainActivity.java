package com.shashkiroyale.app;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

public class MainActivity extends AppCompatActivity {

    private static final String GAME_URL = "https://shashki-royale.pages.dev/?apk=143";

    private WebView webView;
    private SwipeRefreshLayout refreshLayout;
    private LinearLayout offlineView;
    private ProgressBar progress;
    private boolean lastLoadFailed = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Switch from the splash theme to the runtime theme BEFORE super.onCreate
        // so the Activity uses Theme.ShashkiRoyale (no special window bg) and we
        // never have to re-inflate the splash drawable.
        setTheme(R.style.Theme_ShashkiRoyale);
        super.onCreate(savedInstanceState);

        // Edge-to-edge
        try {
            WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
            getWindow().setStatusBarColor(Color.parseColor("#1A0800"));
            getWindow().setNavigationBarColor(Color.parseColor("#1A0800"));
        } catch (Throwable ignored) {}

        setContentView(R.layout.activity_main);

        refreshLayout = findViewById(R.id.swipe_refresh);
        webView = findViewById(R.id.web_view);
        offlineView = findViewById(R.id.offline_view);
        progress = findViewById(R.id.progress);
        Button retry = findViewById(R.id.btn_retry);
        TextView offlineTitle = findViewById(R.id.offline_title);
        TextView offlineDesc = findViewById(R.id.offline_desc);
        offlineTitle.setText(R.string.offline_title);
        offlineDesc.setText(R.string.offline_desc);

        // Apply system-bar safe-area insets onto the web container so the
        // page can lay out under transparent bars while CSS env() still works.
        ViewCompat.setOnApplyWindowInsetsListener(refreshLayout, (v, insets) -> {
            Insets sys = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(sys.left, sys.top, sys.right, sys.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        configureWebView();

        refreshLayout.setOnRefreshListener(() -> {
            lastLoadFailed = false;
            offlineView.setVisibility(View.GONE);
            webView.reload();
        });

        retry.setOnClickListener(v -> tryLoadInitial());

        tryLoadInitial();
    }

    private void tryLoadInitial() {
        progress.setVisibility(View.VISIBLE);
        if (!isOnline()) {
            showOffline();
            return;
        }
        offlineView.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        webView.loadUrl(GAME_URL);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setTextZoom(100);
        settings.setUserAgentString(settings.getUserAgentString() + " ShashkiRoyaleAPK/1.4.3");
        webView.setBackgroundColor(Color.parseColor("#0A0503"));

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri url = req.getUrl();
                String host = url.getHost();
                if (host != null && (host.contains("shashki-royale.pages.dev")
                        || host.contains("supabase.co")
                        || host.contains("supabase.in"))) {
                    return false; // stay in webview
                }
                try {
                    Intent i = new Intent(Intent.ACTION_VIEW, url);
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(i);
                } catch (Exception ignored) {}
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                progress.setVisibility(View.VISIBLE);
                lastLoadFailed = false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progress.setVisibility(View.GONE);
                refreshLayout.setRefreshing(false);
                if (!lastLoadFailed) {
                    offlineView.setVisibility(View.GONE);
                    webView.setVisibility(View.VISIBLE);
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                // Only treat main-frame failures as offline.
                if (request.isForMainFrame()) {
                    lastLoadFailed = true;
                    showOffline();
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) progress.setVisibility(View.VISIBLE);
                else progress.setVisibility(View.GONE);
            }
        });
    }

    private void showOffline() {
        progress.setVisibility(View.GONE);
        webView.setVisibility(View.GONE);
        offlineView.setVisibility(View.VISIBLE);
        refreshLayout.setRefreshing(false);
    }

    private boolean isOnline() {
        ConnectivityManager cm = (ConnectivityManager)
                getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            android.net.Network n = cm.getActiveNetwork();
            if (n == null) return false;
            android.net.NetworkCapabilities caps = cm.getNetworkCapabilities(n);
            return caps != null && caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } else {
            NetworkInfo info = cm.getActiveNetworkInfo();
            return info != null && info.isConnected();
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView != null && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onPause() { super.onPause(); if (webView != null) webView.onPause(); }

    @Override
    protected void onResume() { super.onResume(); if (webView != null) webView.onResume(); }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            ((android.view.ViewGroup) webView.getParent()).removeView(webView);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
