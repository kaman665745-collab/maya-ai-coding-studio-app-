export interface CapacitorCliConfig {
  appId: string;
  appName: string;
  webDir: string;
  bundledWebRuntime?: boolean;
  server?: {
    androidScheme?: 'https' | 'http';
    cleartext?: boolean;
    url?: string;
  };
  android?: {
    allowMixedContent?: boolean;
    webContentsDebuggingEnabled?: boolean;
  };
}

const config: CapacitorCliConfig = {
  appId: 'io.acs.studio',
  appName: 'Advanced Coding Studio',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
