import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.alexis.lexu',
  appName: 'Lexu',
  webDir: 'dist',
  ios: {
    customUrlScheme: 'lexu',
    swiftPackageManager: false
  } as any,
  android: {
    customUrlScheme: 'lexu'
  } as any
};

export default config;
