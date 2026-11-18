export type RuntimePlatform = 'web' | 'tauri-desktop' | 'capacitor-android';

export function detectRuntimePlatform(): RuntimePlatform {
  if (typeof window !== 'undefined') {
    const win = window as unknown as {
      __TAURI_INTERNALS__?: unknown;
      Capacitor?: { isNativePlatform?: () => boolean };
    };
    if (win.__TAURI_INTERNALS__) return 'tauri-desktop';
    if (win.Capacitor?.isNativePlatform?.()) return 'capacitor-android';
  }
  return 'web';
}
