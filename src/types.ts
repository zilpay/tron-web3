export const MESSAGE_TYPE = {
  REQUEST: 'BEARBY_REQUEST',
  RESPONSE: 'BEARBY_RESPONSE',
  EVENT: 'BEARBY_EVENT',
} as const;

export const BEARBY_INJECTED_EVENT = '@/BearBy/injected-script';
export const BEARBY_CONTENT_EVENT = '@/BearBy/content-script';

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

export interface ProviderRpcError extends Error {
  message: string;
  code: number;
  data?: unknown;
}

export interface MetaData {
  description: string | null;
  title: string | null;
  colors: {
    primary?: string;
    secondary?: string;
    background?: string;
    text?: string;
  } | null;
}

export interface BearbyEventData {
  event: string;
  data: ProviderConnectInfo | ProviderRpcError | string | string[] | ProviderMessage;
}

export interface ProviderConnectInfo {
  readonly chainId: string;
}

export interface ProviderMessage {
  readonly type: string;
  readonly data: unknown;
}

export const enum RpcErrorCode {
  USER_REJECTED = 4001,
  UNAUTHORIZED = 4100,
  UNSUPPORTED_METHOD = 4200,
  DISCONNECTED = 4900,
  CHAIN_DISCONNECTED = 4901,
  GENERIC_ERROR = 4000,
}

declare global {
  interface Window {
    tron?: any;
    tronWeb?: any;
    tronLink?: any;
    flutter_inappwebview?: {
      callHandler(handlerName: string, ...args: any[]): Promise<any>;
    };
    handleBearbyEvent?: (eventData: BearbyEventData) => void;
  }
}