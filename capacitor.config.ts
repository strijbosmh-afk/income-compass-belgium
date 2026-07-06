import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'be.medincome.app',
  appName: 'MedIncome',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#f6f7f9',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#17324d',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#f6f7f9',
    },
  },
};

export default config;
