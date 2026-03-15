import { getFavicon } from './favicon';
import { getMetaDataFromTags } from './meta';
import { uuidv4 } from './uuid';
import { isFunction, isTronAddress } from './utils';
import TronWeb from 'tronweb';
import type {
  ProviderRpcError,
  ProviderConnectInfo,
  ProviderMessage,
  BearbyEventData,
  InitProviderData,
} from './types';
import { MESSAGE_TYPE, BEARBY_INJECTED_EVENT, BEARBY_CONTENT_EVENT, RpcErrorCode } from './types';
import type { NodeConfig } from './types';

function safeStringify(data: any): string {
  try {
    return JSON.stringify(data);
  } catch (_) {
    return '[non-serializable]';
  }
}

export class BearbyProviderImpl {
  readonly isBearby: boolean = true;
  readonly isTronLink: boolean = true;
  readonly supportedMethods: Set<string> = new Set([
    'tron_requestAccounts',
    'tron_sign',
    'tron_signMessage',
    'tron_signMessageV2',
    'multiSign',
    '_signTypedData',
    'getInitProviderData',
    'tronProviderRequest',
    'eth_requestAccounts',
    'eth_accounts',
    'eth_chainId',
    'init',
  ]);

  #eventListeners: Map<string, Set<(...args: any[]) => void>> = new Map();
  #isFlutterMode: boolean;
  #tronProvider: any = null;
  #chainId?: string;
  #nodeConfig?: NodeConfig;

  constructor() {
    this.#isFlutterMode = typeof window !== 'undefined' && typeof (window as any).flutter_inappwebview !== 'undefined';
    console.log('[BearbyTron] constructor: isFlutterMode=' + this.#isFlutterMode);
    this.#tronProvider = this.#createProviderProxy();
    console.log('[BearbyTron] constructor: proxy created');
    this.#initializeEvents();
    console.log('[BearbyTron] constructor: events initialized');
    this.#setupFlutterEventHandler();
    console.log('[BearbyTron] constructor: flutter event handler setup');
    if (!this.#isFlutterMode) {
      this.#setupDocumentListener();
      console.log('[BearbyTron] constructor: document listener setup');
    }
  }

  #postTronLinkMessage(action: string, data: any): void {
    console.log('[BearbyTron] postTronLinkMessage: action=' + action + ' data=' + safeStringify(data));
    if (typeof window === 'undefined') return;
    window.postMessage({
      isTronLink: true,
      message: { action, data },
    }, '*');
  }

  #createProviderProxy(): any {
    return new Proxy({} as any, {
      deleteProperty: () => true,
    });
  }

  #initializeEvents(): void {
    this.#eventListeners.set('connect', new Set<(info: ProviderConnectInfo) => void>());
    this.#eventListeners.set('disconnect', new Set<(error: ProviderRpcError) => void>());
    this.#eventListeners.set('chainChanged', new Set<(chainId: string) => void>());
    this.#eventListeners.set('accountsChanged', new Set<(accounts: string[]) => void>());
    this.#eventListeners.set('message', new Set<(message: ProviderMessage) => void>());
    this.#eventListeners.set('dataChanged', new Set<(data: InitProviderData) => void>());
  }

  #setupFlutterEventHandler(): void {
    if (typeof window !== 'undefined' && window) {
      (window as any).handleBearbyEvent = (eventData: BearbyEventData) => {
        console.log('[BearbyTron] handleBearbyEvent: ' + safeStringify(eventData));
        const listeners = this.#eventListeners.get(eventData.event);
        if (listeners) {
          switch (eventData.event) {
            case 'connect':
              listeners.forEach(callback => callback(eventData.data as ProviderConnectInfo));
              break;
            case 'disconnect':
              listeners.forEach(callback => callback(eventData.data as ProviderRpcError));
              break;
            case 'chainChanged':
              listeners.forEach(callback => callback(eventData.data as string));
              break;
            case 'accountsChanged':
              const accounts = eventData.data as string[];
              const address = accounts.length > 0 ? accounts[0] : false;
              if (this.#tronProvider?.defaultAddress) {
                this.#tronProvider.defaultAddress.base58 = address;
              }
              this.#postTronLinkMessage('accountsChanged', { address });
              this.#postTronLinkMessage('setAccount', address || false);
              listeners.forEach(callback => callback(accounts));
              break;
            case 'message':
              listeners.forEach(callback => callback(eventData.data as ProviderMessage));
              break;
            case 'dataChanged':
              this.#handleInitProviderData(eventData.data as InitProviderData);
              break;
          }
        }
      };
    }
  }

  #setupDocumentListener(): void {
    if (typeof document === 'undefined') return;

    document.addEventListener(BEARBY_INJECTED_EVENT, (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail) return;

      try {
        const msg = typeof detail === 'string' ? JSON.parse(detail) : detail;
        console.log('[BearbyTron] documentListener: msg=' + safeStringify(msg));

        if (msg.type === MESSAGE_TYPE.EVENT && (window as any).handleBearbyEvent) {
          (window as any).handleBearbyEvent(msg.payload);
        }
      } catch (error) {
        console.log('[BearbyTron] documentListener parse error: ' + safeStringify(error));
        console.error('Error parsing BearBy event:', error);
      }
    });
  }

  #handleInitProviderData(data: InitProviderData): void {
    console.log('[BearbyTron] handleInitProviderData: data=' + safeStringify(data));
    const oldAddress = this.#tronProvider?.defaultAddress?.base58;
    const oldChainId = this.#chainId;
    const newAddress = data.isAuth ? data.address : null;
    const isInitialLoad = oldAddress === undefined;
    console.log('[BearbyTron] handleInitProviderData: oldAddress=' + oldAddress + ' newAddress=' + newAddress + ' oldChainId=' + oldChainId + ' newChainId=' + data.chainId + ' isInitialLoad=' + isInitialLoad);

    this.#chainId = data.chainId;
    this.#nodeConfig = data.node || {
      fullNode: 'https://api.trongrid.io',
      solidityNode: 'https://api.trongrid.io',
      eventServer: 'https://api.trongrid.io',
      chainId: data.chainId,
      chain: 'Mainnet',
    };
    console.log('[BearbyTron] handleInitProviderData: nodeConfig set=' + safeStringify(this.#nodeConfig));

    this.#tronProvider = this.#buildTronWeb(data);

    if (isInitialLoad || (!oldAddress && newAddress)) {
      console.log('[BearbyTron] handleInitProviderData: emitting connect');
      this.emit('connect', { chainId: this.#chainId });
      if (newAddress) {
        this.#postTronLinkMessage('connect', { address: newAddress });
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('tron#initialized'));
        console.log('[BearbyTron] tron#initialized event re-dispatched on connect');
        window.dispatchEvent(new Event('tronLink#initialized'));
        console.log('[BearbyTron] tronLink#initialized event re-dispatched on connect');
      }
    }

    console.log('[BearbyTron] handleInitProviderData: checking setNode condition isInitialLoad=' + isInitialLoad + ' nodeConfig=' + !!this.#nodeConfig);
    if (isInitialLoad && this.#nodeConfig) {
      console.log('[BearbyTron] handleInitProviderData: sending setNode on initial load');
      this.#postTronLinkMessage('setNode', {
        fullNode: this.#nodeConfig.fullNode,
        solidityNode: this.#nodeConfig.solidityNode,
        eventServer: this.#nodeConfig.eventServer,
      });
    }

    if (oldAddress !== newAddress) {
      console.log('[BearbyTron] handleInitProviderData: emitting accountsChanged');
      this.emit('accountsChanged', newAddress ? [newAddress] : []);
      this.#postTronLinkMessage('accountsChanged', { address: newAddress || false });
      this.#postTronLinkMessage('setAccount', newAddress || false);
    }

    if (oldChainId !== this.#chainId && this.#nodeConfig) {
      console.log('[BearbyTron] handleInitProviderData: emitting chainChanged');
      this.emit('chainChanged', this.#chainId);
      this.#postTronLinkMessage('setNode', {
        fullNode: this.#nodeConfig.fullNode,
        solidityNode: this.#nodeConfig.solidityNode,
        eventServer: this.#nodeConfig.eventServer,
      });
    } else {
      console.log('[BearbyTron] handleInitProviderData: chainChanged check failed oldChainId=' + oldChainId + ' chainId=' + this.#chainId + ' nodeConfig=' + !!this.#nodeConfig);
    }

    this.emit('dataChanged', data);
  }

  get ready(): boolean {
    return this.#tronProvider?.ready ?? false;
  }

  get tronWeb() {
    return this.#tronProvider ?? false;
  }

  get defaultAddress() {
    return this.#tronProvider?.defaultAddress ?? { hex: false, base58: false };
  }

  get node(): { fullNode: string; solidityNode: string; eventServer: string } | null {
    if (!this.#nodeConfig) return null;
    return {
      fullNode: this.#nodeConfig.fullNode,
      solidityNode: this.#nodeConfig.solidityNode,
      eventServer: this.#nodeConfig.eventServer,
    };
  }

  getProvider(): any {
    return this;
  }

  async init(): Promise<void> {
    console.log('[BearbyTron] init: start');
    const data = await this.#getProviderInitData();
    console.log('[BearbyTron] init: received data=' + safeStringify(data));
    if (data) {
      this.#handleInitProviderData(data);
    }
    console.log('[BearbyTron] init: complete');
  }

  #buildTronWeb(data?: InitProviderData): any {
    const isAuth = data?.isAuth && isTronAddress(data.address);
    console.log('[BearbyTron] buildTronWeb: isAuth=' + isAuth + ' address=' + (data?.address || 'none'));

    if (!isAuth) {
      return { ready: true, defaultAddress: { hex: false, base58: false } };
    }

    this.#nodeConfig = data!.node;
    const fullHost = this.#nodeConfig?.fullNode || 'https://api.trongrid.io';
    console.log('[BearbyTron] buildTronWeb: creating TronWeb fullHost=' + fullHost + ' address=' + data!.address);

    const tw = new TronWeb.TronWeb({ fullHost });
    tw.setAddress(data!.address);
    (tw as any).ready = true;
    (tw.defaultAddress as any).name = data!.name;
    (tw.defaultAddress as any).type = data!.type;
    tw.trx.sign = this.sign.bind(this);
    tw.trx.signMessageV2 = this.signMessageV2.bind(this);
    tw.trx.multiSign = this.multiSign.bind(this);
    tw.trx._signTypedData = this._signTypedData.bind(this);

    return tw;
  }

  async request(payload: { method: string; params?: any }): Promise<unknown> {
    console.log('[BearbyTron] request: method=' + payload.method + ' params=' + safeStringify(payload.params));

    if (payload.method === 'init') {
      const address = this.#tronProvider?.defaultAddress?.base58 || false;
      const node = this.node;
      console.log('[BearbyTron] request: init returning address=' + address + ' node=' + safeStringify(node));
      return { address, node };
    }

    if (!this.supportedMethods.has(payload.method)) {
      const error = {
        message: 'Unsupported method',
        code: RpcErrorCode.UNSUPPORTED_METHOD,
        data: { method: payload.method },
      } as ProviderRpcError;
      console.log('[BearbyTron] request: unsupported method=' + payload.method);
      return Promise.reject(error);
    }

    try {
      let result: unknown;
      if (this.#isFlutterMode) {
        console.log('[BearbyTron] request: routing to Flutter');
        result = await this.#requestFlutter(payload);
      } else {
        console.log('[BearbyTron] request: routing to Extension');
        result = await this.#requestExtension(payload);
      }
      console.log('[BearbyTron] request: success result=' + safeStringify(result));
      return result;
    } catch (error: any) {
      console.log('[BearbyTron] request: error=' + safeStringify(error));
      throw error;
    }
  }

  #requestFlutter(payload: { method: string; params?: any }): Promise<unknown> {
    const icon = getFavicon();

    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const meta = getMetaDataFromTags();
      const message = {
        type: MESSAGE_TYPE.REQUEST,
        uuid: id,
        payload,
        icon,
        ...meta,
      };

      console.log('[BearbyTron] requestFlutter: uuid=' + id + ' method=' + payload.method);
      console.log('[BearbyTron] requestFlutter: message=' + safeStringify(message));

      if (typeof window === 'undefined' || !window || !(window as any).flutter_inappwebview) {
        console.log('[BearbyTron] requestFlutter: flutter_inappwebview not available');
        reject({
          message: 'BearBy channel is not available',
          code: RpcErrorCode.DISCONNECTED,
          data: null,
        } as ProviderRpcError);
        return;
      }

      const responseHandler = (event: MessageEvent) => {
        const data = event.data;
        if (!data || typeof data !== 'object') return;

        if (data.type === MESSAGE_TYPE.RESPONSE && data.uuid === id) {
          console.log('[BearbyTron] requestFlutter: response matched uuid=' + id + ' data=' + safeStringify(data));
          if (data.payload?.error) {
            console.log('[BearbyTron] requestFlutter: response error=' + safeStringify(data.payload.error));
            reject({
              message: data.payload.error.message,
              code: data.payload.error.code || RpcErrorCode.GENERIC_ERROR,
              data: data.payload.error.data,
            } as ProviderRpcError);
          } else {
            console.log('[BearbyTron] requestFlutter: response success=' + safeStringify(data.payload?.result));
            let result = data.payload?.result;
            if (typeof result === 'string') {
              try {
                result = JSON.parse(result);
              } catch {
                // keep as string if parse fails
              }
            }
            resolve(result);
          }
          window.removeEventListener('message', responseHandler);
        }
      };

      window.addEventListener('message', responseHandler);

      try {
        console.log('[BearbyTron] requestFlutter: calling callHandler TIP6963TRON');
        (window as any).flutter_inappwebview.callHandler('TIP6963TRON', JSON.stringify(message))
          .then(() => {
            console.log('[BearbyTron] requestFlutter: callHandler sent confirmation');
          })
          .catch((error: any) => {
            console.log('[BearbyTron] requestFlutter: callHandler catch error=' + safeStringify(error));
            window.removeEventListener('message', responseHandler);
            reject({
              message: `Failed to send request: ${error.message || 'Unknown error'}`,
              code: RpcErrorCode.GENERIC_ERROR,
              data: error,
            } as ProviderRpcError);
          });
      } catch (e: unknown) {
        console.log('[BearbyTron] requestFlutter: callHandler throw error=' + safeStringify(e));
        window.removeEventListener('message', responseHandler);
        reject({
          message: `Failed to send request: ${(e as Error).message}`,
          code: RpcErrorCode.GENERIC_ERROR,
          data: e,
        } as ProviderRpcError);
      }
    });
  }

  #requestExtension(payload: { method: string; params?: any }): Promise<unknown> {
    if (typeof document === 'undefined') {
      console.log('[BearbyTron] requestExtension: document undefined');
      return Promise.reject({
        message: 'BearBy extension is not available',
        code: RpcErrorCode.DISCONNECTED,
        data: null,
      } as ProviderRpcError);
    }

    const icon = getFavicon();
    const id = uuidv4();
    const meta = getMetaDataFromTags();
    const message = {
      type: MESSAGE_TYPE.REQUEST,
      uuid: id,
      payload,
      icon,
      from: BEARBY_INJECTED_EVENT,
      ...meta,
    };

    console.log('[BearbyTron] requestExtension: uuid=' + id + ' message=' + safeStringify(message));

    return new Promise((resolve, reject) => {
      const responseHandler = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        if (!detail) return;

        try {
          const data = typeof detail === 'string' ? JSON.parse(detail) : detail;

          if (data.type === MESSAGE_TYPE.RESPONSE && data.uuid === id) {
            console.log('[BearbyTron] requestExtension: response matched uuid=' + id + ' data=' + safeStringify(data));
            document.removeEventListener(BEARBY_INJECTED_EVENT, responseHandler);

            if (data.payload?.error) {
              console.log('[BearbyTron] requestExtension: response error=' + safeStringify(data.payload.error));
              reject({
                message: data.payload.error.message,
                code: data.payload.error.code || RpcErrorCode.GENERIC_ERROR,
                data: data.payload.error.data,
              } as ProviderRpcError);
            } else {
              console.log('[BearbyTron] requestExtension: response success=' + safeStringify(data.payload?.result));
              let result = data.payload?.result;
              if (typeof result === 'string') {
                try {
                  result = JSON.parse(result);
                } catch {
                  // keep as string if parse fails
                }
              }
              resolve(result);
            }
          }
        } catch (error) {
          console.log('[BearbyTron] requestExtension: parse error=' + safeStringify(error));
          console.error('Error parsing response:', error);
        }
      };

      document.addEventListener(BEARBY_INJECTED_EVENT, responseHandler);

      try {
        const event = new CustomEvent(BEARBY_CONTENT_EVENT, {
          detail: JSON.stringify(message)
        });
        document.dispatchEvent(event);
        console.log('[BearbyTron] requestExtension: event dispatched');
      } catch (e: unknown) {
        console.log('[BearbyTron] requestExtension: dispatch error=' + safeStringify(e));
        document.removeEventListener(BEARBY_INJECTED_EVENT, responseHandler);
        reject({
          message: `Failed to send request: ${(e as Error).message}`,
          code: RpcErrorCode.GENERIC_ERROR,
          data: e,
        } as ProviderRpcError);
      }
    });
  }

  async #getProviderInitData(): Promise<InitProviderData | undefined> {
    console.log('[BearbyTron] getProviderInitData: start');
    try {
      const result = await this.request({ method: 'getInitProviderData' }) as InitProviderData | undefined;
      console.log('[BearbyTron] getProviderInitData: result=' + safeStringify(result));
      return result;
    } catch (e) {
      console.log('[BearbyTron] getProviderInitData: error=' + safeStringify(e));
      return undefined;
    }
  }

  sign(transaction: any, privateKey: any = false, useTronHeader: any = true, callback: any = false): any {
    console.log('[BearbyTron] sign: hasTransaction=' + !!transaction + ' hasPrivateKey=' + !!privateKey + ' useTronHeader=' + useTronHeader + ' hasCallback=' + !!callback);
    if (isFunction(privateKey)) {
      callback = privateKey;
      privateKey = false;
    }
    if (isFunction(useTronHeader)) {
      callback = useTronHeader;
      useTronHeader = true;
    }

    if (!callback) {
      return this.#handlePromiseSign(this.sign.bind(this), transaction, privateKey, useTronHeader);
    }

    if (!this.#tronProvider.ready) {
      return callback("User has not unlocked wallet");
    }

    if (privateKey) {
      return callback("Direct private key signing is not supported");
    }

    if (!transaction) {
      return callback("Invalid transaction provided");
    }

    const inputStr = typeof transaction === "string"
      ? transaction
      : transaction.raw_data?.contract[0]?.parameter?.value;

    const params = { transaction, useTronHeader, input: inputStr };
    console.log('[BearbyTron] sign: request params=' + safeStringify(params));
    this.request({ method: 'tron_sign', params })
      .then((res) => {
        console.log('[BearbyTron] sign: success result=' + safeStringify(res));
        callback(null, res);
      })
      .catch((err) => {
        console.log('[BearbyTron] sign: error=' + safeStringify(err));
        callback(err);
      });
  }

  signMessageV2(message: any, privateKey: any = false, options: any = {}, callback: any = false): any {
    console.log('[BearbyTron] signMessageV2: hasMessage=' + !!message + ' hasPrivateKey=' + !!privateKey + ' hasCallback=' + !!callback);
    if (isFunction(options)) {
      callback = options;
      options = {};
    }
    if (isFunction(privateKey)) {
      callback = privateKey;
      privateKey = false;
    }

    if (!callback) {
      return this.#handlePromiseSign(this.signMessageV2.bind(this), message, privateKey, options);
    }

    if (privateKey) {
      return callback("Direct private key signing is not supported");
    }

    if (!message) {
      return callback("Invalid transaction provided");
    }

    if (!this.#tronProvider.ready) {
      return callback("User has not unlocked wallet");
    }

    const params = {
      transaction: message,
      options,
      input: message,
      isSignMessageV2: true,
    };
    console.log('[BearbyTron] signMessageV2: request params=' + safeStringify(params));
    this.request({ method: 'tron_signMessageV2', params })
      .then((res) => {
        console.log('[BearbyTron] signMessageV2: success result=' + safeStringify(res));
        callback(null, res);
      })
      .catch((err) => {
        console.log('[BearbyTron] signMessageV2: error=' + safeStringify(err));
        callback(err);
      });
  }

  multiSign(transaction: any = false, privateKey: any = false, permissionId: any = false, callback: any = false): any {
    console.log('[BearbyTron] multiSign: hasTransaction=' + !!transaction + ' hasPrivateKey=' + !!privateKey + ' permissionId=' + permissionId + ' hasCallback=' + !!callback);
    if (isFunction(permissionId)) {
      callback = permissionId;
      permissionId = 0;
    }
    if (isFunction(privateKey)) {
      callback = privateKey;
      privateKey = false;
      permissionId = 0;
    }

    if (!callback) {
      return this.#handlePromiseSign(this.multiSign.bind(this), transaction, privateKey, permissionId);
    }

    if (!this.#tronProvider.ready) {
      return callback("User has not unlocked wallet");
    }

    if (!transaction?.raw_data?.contract) {
      return callback("Invalid transaction provided");
    }

    if (privateKey) {
      return callback("Direct private key signing is not supported");
    }

    const params = {
      transaction,
      useTronHeader: true,
      input: (transaction as any).raw_data.contract[0].parameter.value,
      permissionId,
    };
    console.log('[BearbyTron] multiSign: request params=' + safeStringify(params));
    this.request({ method: 'multiSign', params })
      .then((res) => {
        console.log('[BearbyTron] multiSign: success result=' + safeStringify(res));
        callback(null, res, permissionId);
      })
      .catch((err) => {
        console.log('[BearbyTron] multiSign: error=' + safeStringify(err));
        callback(err);
      });
  }

  _signTypedData(domain: any, types: any, value: any, privateKey: any = false, callback: any = false): any {
    console.log('[BearbyTron] _signTypedData: hasDomain=' + !!domain + ' hasTypes=' + !!types + ' hasValue=' + !!value + ' hasPrivateKey=' + !!privateKey + ' hasCallback=' + !!callback);
    if (isFunction(privateKey)) {
      callback = privateKey;
      privateKey = false;
    }

    if (!callback) {
      return this.#handlePromiseSign(this._signTypedData.bind(this), domain, types, value, privateKey);
    }

    if (privateKey) {
      return callback("Direct private key signing is not supported");
    }

    if (!this.#tronProvider.ready) {
      return callback("User has not unlocked wallet");
    }

    if (!domain || !types || !value) {
      return callback("Invalid params provided");
    }

    const params = { domain, types, message: value };
    console.log('[BearbyTron] _signTypedData: request params=' + safeStringify(params));
    this.request({ method: '_signTypedData', params })
      .then((res) => {
        console.log('[BearbyTron] _signTypedData: success result=' + safeStringify(res));
        callback(null, res);
      })
      .catch((err) => {
        console.log('[BearbyTron] _signTypedData: error=' + safeStringify(err));
        callback(err);
      });
  }

  #handlePromiseSign(method: Function, ...args: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      method(...args, (err: any, res: any) => {
        if (err) return reject(err);
        resolve(res);
      });
    });
  }

  on(event: 'connect', callback: (info: ProviderConnectInfo) => void): void;
  on(event: 'disconnect', callback: (error: ProviderRpcError) => void): void;
  on(event: 'chainChanged', callback: (chainId: string) => void): void;
  on(event: 'accountsChanged', callback: (accounts: string[]) => void): void;
  on(event: 'message', callback: (message: ProviderMessage) => void): void;
  on(event: string, callback: (...args: any[]) => void): void {
    console.log('[BearbyTron] on: event=' + event);
    const listeners = this.#eventListeners.get(event);
    if (listeners) {
      listeners.add(callback);
    }
  }

  removeListener(event: 'connect', callback: (info: ProviderConnectInfo) => void): void;
  removeListener(event: 'disconnect', callback: (error: ProviderRpcError) => void): void;
  removeListener(event: 'chainChanged', callback: (chainId: string) => void): void;
  removeListener(event: 'accountsChanged', callback: (accounts: string[]) => void): void;
  removeListener(event: 'message', callback: (message: ProviderMessage) => void): void;
  removeListener(event: string, callback: (...args: any[]) => void): void {
    console.log('[BearbyTron] removeListener: event=' + event);
    const listeners = this.#eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  emit(event: string, ...args: any[]): void {
    console.log('[BearbyTron] emit: event=' + event + ' args=' + safeStringify(args));
    const listeners = this.#eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(...args));
    }
  }

  async enable(): Promise<string[]> {
    console.log('[BearbyTron] enable: called');
    return this.request({ method: 'eth_requestAccounts' }) as Promise<string[]>;
  }
}
