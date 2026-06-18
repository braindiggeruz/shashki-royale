package com.shashkiroyale.app;

import android.app.Application;
import android.os.Build;
import android.webkit.WebView;

public class ShashkiApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        // Help debug WebView issues; harmless on release builds.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            try {
                WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
            } catch (Throwable ignored) {}
        }
    }
}
