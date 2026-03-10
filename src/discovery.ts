import { uuidv4 } from './uuid.ts';
import type { TronProvider, TIP6963ProviderInfo, TIP6963ProviderDetail } from './types.ts';
import { TIP6963_ANNOUNCE_PROVIDER, TIP6963_REQUEST_PROVIDER } from './types.ts';

export interface WalletInfo {
  name: string;
  icon: string;
  rdns: string;
}

export function announceProvider(provider: TronProvider, walletInfo: WalletInfo): void {
  if (typeof window === 'undefined') return;

  const info: TIP6963ProviderInfo = {
    uuid: uuidv4(),
    name: walletInfo.name,
    icon: walletInfo.icon,
    rdns: walletInfo.rdns,
  };

  const detail: TIP6963ProviderDetail = Object.freeze({ info, provider });
  const announceEvent = new CustomEvent(TIP6963_ANNOUNCE_PROVIDER, { detail });

  window.dispatchEvent(announceEvent);

  window.addEventListener(TIP6963_REQUEST_PROVIDER, () => {
    window.dispatchEvent(announceEvent);
  });
}