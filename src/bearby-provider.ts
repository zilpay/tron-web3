import { getFavicon } from './favicon.ts';
import { getMetaData } from './meta.ts';
import type {
  ProviderRpcError,
  RequestPayload,
  TronProvider,
  BearbyEventData,
  EventCallback,
} from './types.ts';

const BEARBY_INJECTED_EVENT = '@/BearBy/injected-script';
const BEARBY_CONTENT_EVENT = '@/BearBy/content-script';

const MESSAGE_TYPE = {
  REQUEST: 'BEARBY_REQUEST',
  RESPONSE: 'BEARBY_RESPONSE',
  EVENT: 'BEARBY_EVENT',
} as const;

type EventName = 'connect' | 'disconnect' | 'chainChanged' | 'accountsChanged' | 'message';

const SUPPORTED_METHODS = new Set([
  'tron_requestAccounts',
  'tron_accounts',
  'tron_chainId',
  'tron_sign',
  'tron_signTransaction',
  'tron_sendTransaction',
  'tron_getBalance',
  'tron_getAccount',
  'tron_getTransactionById',
  'tron_getTransactionInfoById',
  'tron_triggerSmartContract',
  'tron_getContract',
  'tron_estimateEnergy',
  'tron_getBlockByNumber',
  'tron_getNowBlock',
  'tron_signMessageV2',
  'wallet_watchAsset',
  'wallet_switchTronChain',
  'wallet_addTronChain',
]);

const win = window as Record<string, unknown>;

export class BearbyProviderImpl implements TronProvider {
  readonly isBearby = true;
  #listeners = new Map<string, Set<EventCallback>>();
  #isFlutter = typeof window !== 'undefined' && typeof win.flutter_inappwebview !== 'undefined';

  constructor() {
    for (const event of ['connect', 'disconnect', 'chainChanged', 'accountsChanged', 'message'] as const) {
      this.#listeners.set(event, new Set());
    }

    this.#setupFlutterHandler();

    if (!this.#isFlutter) {
      this.#setupDocumentListener();
    }
  }

  #emitEvent(data: BearbyEventData) {
    this.#listeners.get(data.event)?.forEach(cb => cb(data.data));
  }

  #setupFlutterHandler() {
    if (typeof window === 'undefined') return;
    win.handleBearbyTronEvent = (eventData: unknown) => {
      this.#emitEvent(eventData as BearbyEventData);
    };
  }

  #setupDocumentListener() {
    if (typeof document === 'undefined') return;

    document.addEventListener(BEARBY_INJECTED_EVENT, (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail) return;

      try {
        const msg = typeof detail === 'string' ? JSON.parse(detail) : detail;
        if (msg.type === MESSAGE_TYPE.EVENT) {
          this.#emitEvent(msg.payload);
        }
      } catch {}
    });
  }

  async request(payload: RequestPayload): Promise<unknown> {
    if (!SUPPORTED_METHODS.has(payload.method)) {
      return Promise.reject(this.#rpcError('Unsupported method', 4200, { method: payload.method }));
    }

    return this.#isFlutter
      ? this.#sendFlutter(payload)
      : this.#sendExtension(payload);
  }

  #buildMessage(payload: RequestPayload, uuid: string) {
    return {
      type: MESSAGE_TYPE.REQUEST,
      uuid,
      payload,
      icon: getFavicon(),
      ...getMetaData(),
    };
  }

  #makeUuid(): string {
    return Math.random().toString(36).substring(2);
  }

  #rpcError(message: string, code: number, data: unknown = null): ProviderRpcError {
    return { message, code, data } as ProviderRpcError;
  }

  #resolveResponse(
    data: Record<string, unknown>,
    uuid: string,
    resolve: (v: unknown) => void,
    reject: (e: unknown) => void,
  ): boolean {
    if (data?.type !== MESSAGE_TYPE.RESPONSE || data.uuid !== uuid) return false;

    const payload = data.payload as Record<string, unknown> | undefined;
    const error = payload?.error as Record<string, unknown> | undefined;

    if (error) {
      reject(this.#rpcError(
        error.message as string,
        (error.code as number) || 4000,
        error.data,
      ));
    } else {
      resolve(payload?.result);
    }
    return true;
  }

  #sendFlutter(payload: RequestPayload): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const flutter = win.flutter_inappwebview as Record<string, Function> | undefined;
      if (!flutter) {
        reject(this.#rpcError('BearBy channel is not available', 4900));
        return;
      }

      const uuid = this.#makeUuid();
      const message = this.#buildMessage(payload, uuid);

      const handler = (event: MessageEvent) => {
        if (this.#resolveResponse(event.data as Record<string, unknown>, uuid, resolve, reject)) {
          window.removeEventListener('message', handler);
        }
      };

      window.addEventListener('message', handler);

      Promise.resolve(flutter.callHandler('TronChannel', JSON.stringify(message)))
        .catch((error: unknown) => {
          window.removeEventListener('message', handler);
          const msg = error instanceof Error ? error.message : 'Unknown error';
          reject(this.#rpcError(`Failed to send request: ${msg}`, 4000, error));
        });
    });
  }

  #sendExtension(payload: RequestPayload): Promise<unknown> {
    if (typeof document === 'undefined') {
      return Promise.reject(this.#rpcError('BearBy extension is not available', 4900));
    }

    const uuid = this.#makeUuid();
    const message = { ...this.#buildMessage(payload, uuid), from: BEARBY_INJECTED_EVENT };

    return new Promise((resolve, reject) => {
      const handler = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        if (!detail) return;

        try {
          const data = typeof detail === 'string' ? JSON.parse(detail) : detail;
          if (this.#resolveResponse(data, uuid, resolve, reject)) {
            document.removeEventListener(BEARBY_INJECTED_EVENT, handler);
          }
        } catch {}
      };

      document.addEventListener(BEARBY_INJECTED_EVENT, handler);

      try {
        document.dispatchEvent(new CustomEvent(BEARBY_CONTENT_EVENT, {
          detail: JSON.stringify(message),
        }));
      } catch (e: unknown) {
        document.removeEventListener(BEARBY_INJECTED_EVENT, handler);
        reject(this.#rpcError(`Failed to send request: ${(e as Error).message}`, 4000, e));
      }
    });
  }

  on(event: EventName, callback: EventCallback): void {
    this.#listeners.get(event)?.add(callback);
  }

  removeListener(event: string, callback: EventCallback): void {
    this.#listeners.get(event)?.delete(callback);
  }
}
