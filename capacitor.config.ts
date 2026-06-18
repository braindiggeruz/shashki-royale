import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.shashkiroyale.webviewfix',
  appName: 'Шашки Рояль',
  webDir: 'dist',
  // Load production website directly so users always get the latest deploy.
  // The cache-busting `?apk_fix=140` proves the WebView is on v1.4.0.
  server: {
    url: 'https://shashki-royale.pages.dev/?apk=142',
    androidScheme: 'https',
    cleartext: false,
    allowNavigation: ['shashki-royale.pages.dev', '*.pages.dev', '*.supabase.co']
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#1A0800'
  }
};

export default config;
