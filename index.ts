import { FlutterTunnel } from "./src/flutter-tunnel.js";
import { RequestHandler } from "./src/request-handler.js";
import { TronProvider } from "./src/tron-provider.js";

(function() {
  if (typeof window === 'undefined' || !window) {
    return;
  }

  if ((window as any).__bearbyTronInjected) {
    return;
  }

  try {
    const tunnel = new FlutterTunnel();
    const handler = new RequestHandler(tunnel);
    const providerObj = new TronProvider(tunnel, handler);
    const provider = providerObj.getProvider();

    if (!('tron' in window) || !window.tron) {
      try {
        Object.defineProperty(window, 'tron', {
          value: provider,
          writable: false,
          configurable: true,
        });
      } catch (e) {
        (window as any).tron = provider;
      }
    }

    providerObj.init();

    (window as any).__bearbyTronInjected = true;
    window.dispatchEvent(new Event('tron#initialized'));
  } catch (e) {
  }
})();
