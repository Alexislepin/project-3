import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.alexis.lexu',
  appName: 'Lexu',
  webDir: 'dist',
  ios: {
    customUrlScheme: 'lexu'
  },
  android: {
    customUrlScheme: 'lexu'
  }
};

export default config;
