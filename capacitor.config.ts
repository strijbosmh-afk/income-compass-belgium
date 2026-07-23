import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'be.medincome.app',
  appName: 'MyFinState',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
    preferredContentMode: 'mobile',
  },
};

export default config;
