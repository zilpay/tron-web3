import { getFavicon } from './favicon';
import { getMetaDataFromTags } from './meta';
import { uuidv4 } from './uuid';
import { isFunction, isTronAddress } from './utils';
import TronWeb from 'tronweb';
import type { TronWeb, TronWeb as TronWebType } from 'tronweb';
import type {
  ProviderRpcError,
  ProviderConnectInfo,
  ProviderMessage,
  BearbyEventData,
  InitProviderData,
} from './types';
import { MESSAGE_TYPE, BEARBY_INJECTED_EVENT, BEARBY_CONTENT_EVENT, RpcErrorCode } from './types';
import type { NodeConfig } from './types';

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
  ]);

  #eventListeners: Map<string, Set<(...args: any[]) => void>> = new Map();
  #isFlutterMode: boolean;
  #tronProvider: TronWebType | null = null;
  #chainId?: string;
  #nodeConfig?: NodeConfig;

  constructor() {
    this.#isFlutterMode = typeof window !== 'undefined' && typeof (window as any).flutter_inappwebview !== 'undefined';
    this.#tronProvider = this.#createProviderProxy();
    this.#initializeEvents();
    this.#setupFlutterEventHandler();
    if (!this.#isFlutterMode) {
      this.#setupDocumentListener();
    }
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
              listeners.forEach(callback => callback(eventData.data as string[]));
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
        
        if (msg.type === MESSAGE_TYPE.EVENT && (window as any).handleBearbyEvent) {
          (window as any).handleBearbyEvent(msg.payload);
        }
      } catch (error) {
        console.error('Error parsing BearBy event:', error);
      }
    });
  }

  #handleInitProviderData(data: InitProviderData): void {
    const oldAddress = this.#tronProvider?.defaultAddress?.base58;
    const oldChainId = this.#chainId;

    this.#chainId = data.chainId;
    this.#nodeConfig = data.node;

    this.#tronProvider = this.#buildTronWebStub(data);
    this.#tronWebInstance = null;

    const newAddress = data.isAuth ? data.address : null;

    if (!oldAddress && newAddress) {
      this.emit('connect', { chainId: this.#chainId });
    }

    if (oldAddress !== newAddress) {
      this.emit('accountsChanged', newAddress ? [newAddress] : []);
    }

    if (oldChainId !== this.#chainId) {
      this.emit('chainChanged', this.#chainId);
    }

    this.#buildTronWebStub(data);
    this.emit('dataChanged', data);
  }

  #tronWebInstance: any | null = null;

  get tronWeb() {
    return this.#tronProvider ?? false;
  }

  getProvider(): any {
    return this;
  }

  async init(): Promise<void> {
    const data = await this.#getProviderInitData();
    this.#chainId = data?.chainId;
    this.#nodeConfig = data?.node;
    this.#tronProvider = this.#buildTronWebStub(data);
    this.emit('connect', { chainId: this.#chainId });
  }

  #buildTronWebStub(data?: InitProviderData): any {
    const stub: any = {
      ready: true,
      defaultAddress: { hex: false, base58: false },
    };

    if (data?.isAuth && isTronAddress(data.address)) {
      stub.defaultAddress = {
        hex: false,
        base58: data.address,
        name: data.name,
        type: data.type,
      };

      this.#nodeConfig = data.node;
      const fullHost = this.#nodeConfig?.fullNode || 'https://api.trongrid.io';
      this.#tronWebInstance = new TronWeb.TronWeb({
        fullHost,
      });
      this.#tronWebInstance.setAddress(data.address);
    }

    stub.trx = {
      sign: this.sign.bind(this),
      signMessageV2: this.signMessageV2.bind(this),
      multiSign: this.multiSign.bind(this),
      _signTypedData: this._signTypedData.bind(this),
    };

    stub.emit = (event: string, ...args: any[]) => {
      this.emit(event, ...args);
    };

    return stub;
  }

  async request(payload: { method: string; params?: any }): Promise<unknown> {

    if (!this.supportedMethods.has(payload.method)) {
      const error = {
        message: 'Unsupported method',
        code: RpcErrorCode.UNSUPPORTED_METHOD,
        data: { method: payload.method },
      } as ProviderRpcError;
      return Promise.reject(error);
    }

    try {
      let result: unknown;
      if (this.#isFlutterMode) {
        result = await this.#requestFlutter(payload);
      } else {
        result = await this.#requestExtension(payload);
      }
      return result;
    } catch (error: any) {
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

      if (typeof window === 'undefined' || !window || !(window as any).flutter_inappwebview) {
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
          if (data.payload?.error) {
            reject({
              message: data.payload.error.message,
              code: data.payload.error.code || RpcErrorCode.GENERIC_ERROR,
              data: data.payload.error.data,
            } as ProviderRpcError);
          } else {
            resolve(data.payload?.result);
          }
          window.removeEventListener('message', responseHandler);
        }
      };
    
      window.addEventListener('message', responseHandler);

      try {
        (window as any).flutter_inappwebview.callHandler('TIP6963TRON', JSON.stringify(message))
          .catch((error: any) => {
            window.removeEventListener('message', responseHandler);
            reject({
              message: `Failed to send request: ${error.message || 'Unknown error'}`,
              code: RpcErrorCode.GENERIC_ERROR,
              data: error,
            } as ProviderRpcError);
          });
      } catch (e: unknown) {
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

    return new Promise((resolve, reject) => {
      const responseHandler = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        if (!detail) return;

        try {
          const data = typeof detail === 'string' ? JSON.parse(detail) : detail;
          
          if (data.type === MESSAGE_TYPE.RESPONSE && data.uuid === id) {
            document.removeEventListener(BEARBY_INJECTED_EVENT, responseHandler);

            if (data.payload?.error) {
              reject({
                message: data.payload.error.message,
                code: data.payload.error.code || RpcErrorCode.GENERIC_ERROR,
                data: data.payload.error.data,
              } as ProviderRpcError);
            } else {
              resolve(data.payload?.result);
            }
          }
        } catch (error) {
          console.error('Error parsing response:', error);
        }
      };

      document.addEventListener(BEARBY_INJECTED_EVENT, responseHandler);

      try {
        const event = new CustomEvent(BEARBY_CONTENT_EVENT, {
          detail: JSON.stringify(message)
        });
        document.dispatchEvent(event);
      } catch (e: unknown) {
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
    try {
      return await this.request({ method: 'getInitProviderData' }) as InitProviderData | undefined;
    } catch {
      return undefined;
    }
  }

  sign(transaction: any, privateKey: any = false, useTronHeader: any = true, callback: any = false): any {
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

    this.request({ method: 'tron_sign', params: { transaction, useTronHeader, input: inputStr } })
      .then((res) => callback(null, res))
      .catch((err) => callback(err));
  }

  signMessageV2(message: any, privateKey: any = false, options: any = {}, callback: any = false): any {
    console.log('[BearbyProvider] signMessageV2 called with:', { message, privateKey, options });

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

    console.log('[BearbyProvider] Calling tron_signMessageV2 with:', { message, options });

    this.request({
      method: 'tron_signMessageV2',
      params: {
        transaction: message,
        options,
        input: message,
        isSignMessageV2: true,
      }
    })
      .then((res) => callback(null, res))
      .catch((err) => callback(err));
  }

  multiSign(transaction: any = false, privateKey: any = false, permissionId: any = false, callback: any = false): any {
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

    this.request({
      method: 'multiSign',
      params: {
        transaction,
        useTronHeader: true,
        input: (transaction as any).raw_data.contract[0].parameter.value,
        permissionId,
      }
    })
      .then((res) => callback(null, res, permissionId))
      .catch((err) => callback(err));
  }

  _signTypedData(domain: any, types: any, value: any, privateKey: any = false, callback: any = false): any {
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

    this.request({
      method: '_signTypedData',
      params: { domain, types, message: value }
    })
      .then((res) => callback(null, res))
      .catch((err) => callback(err));
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
    const listeners = this.#eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  emit(event: string, ...args: any[]): void {
    const listeners = this.#eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(...args));
    }
  }

  async enable(): Promise<string[]> {
    return this.request({ method: 'eth_requestAccounts' }) as Promise<string[]>;
  }
}
