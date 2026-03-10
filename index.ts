import { BearbyProviderImpl } from './src/bearby-provider.ts';

export type * from './src/types.ts';
export { BearbyProviderImpl } from './src/bearby-provider.ts';

const win = window as Record<string, unknown>;

(function () {
  if (typeof window === 'undefined' || !window) return;
  if (win.__bearbyTronInjected) return;

  try {
    const provider = new BearbyProviderImpl();

    if (!('tron' in window)) {
      try {
        Object.defineProperty(window, 'tron', {
          value: provider,
          writable: false,
          configurable: true,
        });
      } catch {
        win.tron = provider;
      }
    }

    win.__bearbyTronInjected = true;
    window.dispatchEvent(new Event('tron#initialized'));
  } catch (error) {
    console.error('Failed to inject Tron provider:', error);
  }
})();
