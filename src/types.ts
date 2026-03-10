export interface RequestPayload {
  method: string;
  params?: Array<unknown> | Record<string, unknown>;
}

export interface ProviderRpcError extends Error {
  message: string;
  code: number;
  data?: unknown;
}

export interface ProviderConnectInfo {
  readonly chainId: string;
}

export interface ProviderMessage {
  readonly type: string;
  readonly data: unknown;
}

export type EventCallback = (...args: unknown[]) => void;

export interface TronProvider {
  readonly isBearby: boolean;
  request(payload: RequestPayload): Promise<unknown>;
  on(event: 'connect', callback: (info: ProviderConnectInfo) => void): void;
  on(event: 'disconnect', callback: (error: ProviderRpcError) => void): void;
  on(event: 'chainChanged', callback: (chainId: string) => void): void;
  on(event: 'accountsChanged', callback: (accounts: string[]) => void): void;
  on(event: 'message', callback: (message: ProviderMessage) => void): void;
  removeListener(event: string, callback: EventCallback): void;
}

export interface BearbyEventData {
  event: string;
  data: ProviderConnectInfo | ProviderRpcError | string | string[] | ProviderMessage;
}

export interface BearbyResponseData {
  type: string;
  uuid: string;
  payload: {
    error?: ProviderRpcError;
    result: unknown;
  };
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
