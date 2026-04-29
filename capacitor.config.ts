import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.shashki.royal',
  appName: 'Шашки Рояль',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystorePassword: undefined,
      keystoreAlias: undefined,
      keystoreAliasPassword: undefined,
      releaseType: 'APK'
    }
  }
};

export default config;
