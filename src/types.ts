export interface AddressInfo {
  address: string;
  name: string;
  type: number;
}

export interface NodeConfig {
  fullNode: string;
  solidityNode: string;
  eventServer: string;
  chainId: string;
  chain: string;
}

export interface ConnectNodeConfig {
  fullNode: string;
  solidityNode: string;
  eventServer: string;
}

export interface PhishingItem {
  url: string;
  isVisit?: boolean;
}

export interface InitProviderData {
  address: string;
  node: NodeConfig;
  name: string;
  type: number;
  phishingList?: PhishingItem[];
  connectNode?: ConnectNodeConfig | false;
  isAuth: boolean;
  chainId: string;
}

export interface NotifyEvent {
  action: string;
  data: any;
}

export interface ProviderRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export const enum RpcErrorCode {
  USER_REJECTED = 4001,
  UNAUTHORIZED = 4100,
  UNSUPPORTED_METHOD = 4200,
  DISCONNECTED = 4900,
  CHAIN_DISCONNECTED = 4901,
}

declare global {
  interface Window {
    tron?: any;
    tronWeb?: any;
    tronLink?: any;
    flutter_inappwebview?: {
      callHandler(handlerName: string, ...args: any[]): Promise<any>;
    };
  }
}