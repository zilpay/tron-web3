import { BearbyProviderImpl } from './src/bearby-provider';

export * from './src/types';
export * from './src/bearby-provider';

(function() {
  if (typeof window === 'undefined' || !window) {
    console.warn('No window object available for Bearby injection');
    return;
  }

  if ((window as any).__bearbyTronInjected) {
    return;
  }

  try {
    const provider = new BearbyProviderImpl();
    const tronProvider = provider.getProvider();

    if (!('tron' in window) || !window.tron) {
      try {
        Object.defineProperty(window, 'tron', {
          value: tronProvider,
          writable: false,
          configurable: true,
        });
      } catch (defineError) {
        (window as any).tron = tronProvider;
        console.warn('Using fallback assignment for tron due to:', defineError);
      }
    }

    if (!('tronLink' in window) || !window.tronLink) {
      try {
        Object.defineProperty(window, 'tronLink', {
          value: tronProvider,
          writable: false,
          configurable: true,
        });
      } catch (defineError) {
        (window as any).tronLink = tronProvider;
      }
    }

    if (!('tronWeb' in window) || !window.tronWeb) {
      try {
        Object.defineProperty(window, 'tronWeb', {
          value: tronProvider,
          writable: false,
          configurable: true,
        });
      } catch (defineError) {
        (window as any).tronWeb = tronProvider;
      }
    }

    provider.init();

    (window as any).__bearby_response_handlers = (window as any).__bearby_response_handlers || {};
    (window as any).__bearbyTronInjected = true;
    window.dispatchEvent(new Event('tron#initialized'));
  } catch (error) {
    console.error('Failed to inject Tron provider:', error);
  }
})();
