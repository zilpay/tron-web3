import { BearbyProviderImpl } from './src/bearby-provider';

export * from './src/types';
export * from './src/bearby-provider';

(function() {
  console.log('[BearbyTron] IIFE start');

  if (typeof window === 'undefined' || !window) {
    console.log('[BearbyTron] No window object — aborting injection');
    console.warn('No window object available for Bearby injection');
    return;
  }

  if ((window as any).__bearbyTronInjected) {
    console.log('[BearbyTron] Already injected — skipping');
    return;
  }

  try {
    console.log('[BearbyTron] Creating BearbyProviderImpl');
    const provider = new BearbyProviderImpl();
    const tronProvider = provider.getProvider();
    console.log('[BearbyTron] Provider created');

    if (!('tron' in window) || !window.tron) {
      try {
        Object.defineProperty(window, 'tron', {
          value: tronProvider,
          writable: false,
          configurable: true,
        });
        console.log('[BearbyTron] window.tron assigned via defineProperty');
      } catch (defineError) {
        (window as any).tron = tronProvider;
        console.log('[BearbyTron] window.tron assigned via fallback');
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
        console.log('[BearbyTron] window.tronLink assigned via defineProperty');
      } catch (defineError) {
        (window as any).tronLink = tronProvider;
        console.log('[BearbyTron] window.tronLink assigned via fallback');
      }
    }

    if (!('tronWeb' in window) || !window.tronWeb) {
      try {
        Object.defineProperty(window, 'tronWeb', {
          value: tronProvider,
          writable: false,
          configurable: true,
        });
        console.log('[BearbyTron] window.tronWeb assigned via defineProperty');
      } catch (defineError) {
        (window as any).tronWeb = tronProvider;
        console.log('[BearbyTron] window.tronWeb assigned via fallback');
      }
    }

    console.log('[BearbyTron] Calling provider.init()');
    provider.init();

    (window as any).__bearby_response_handlers = (window as any).__bearby_response_handlers || {};
    (window as any).__bearbyTronInjected = true;
    window.dispatchEvent(new Event('tron#initialized'));
    console.log('[BearbyTron] tron#initialized event dispatched');
    window.dispatchEvent(new Event('tronLink#initialized'));
    console.log('[BearbyTron] tronLink#initialized event dispatched');
  } catch (error) {
    try {
      console.log('[BearbyTron] IIFE catch error: ' + JSON.stringify(error));
    } catch (_) {
      console.log('[BearbyTron] IIFE catch error (non-serializable)');
    }
    console.error('Failed to inject Tron provider:', error);
  }
})();
