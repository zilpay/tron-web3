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
  on(event: string, callback: (...args: any[]) => void): void;
  removeListener(event: string, callback: (...args: any[]) => void): void;
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

export interface TIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface TIP6963ProviderDetail {
  info: TIP6963ProviderInfo;
  provider: TronProvider;
}

export interface TIP6963AnnounceProviderEvent extends CustomEvent<TIP6963ProviderDetail> {
  type: 'TIP6963:announceProvider';
}

export const TIP6963_ANNOUNCE_PROVIDER = 'TIP6963:announceProvider';
export const TIP6963_REQUEST_PROVIDER = 'TIP6963:requestProvider';
