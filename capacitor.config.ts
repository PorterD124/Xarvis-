import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.groupdonovan.xarvis',
  appName: 'Xarvis',
  webDir: 'dist',
  server: {
    url: 'https://xarvis.groupdonovan.com',
    cleartext: true
  }
};

export default config;
