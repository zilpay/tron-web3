import TronWeb from 'tronweb';
import { ProxiedProvider } from './proxied-provider.ts';
import type { TronProvider, NodeConfig } from './types.ts';

const win = typeof window !== 'undefined' ? window as unknown as Record<string, unknown> : {} as Record<string, unknown>;

function resolveSignInput(transaction: unknown): unknown {
  if (typeof transaction === 'string') return transaction;
  const tx = transaction as Record<string, any>;
  return tx.__payload__ ?? tx.raw_data?.contract?.[0]?.parameter?.value;
}

function promisify(fn: Function, ...args: unknown[]): Promise<unknown> {
  return new Promise((resolve, reject) => fn(...args).then(resolve).catch(reject));
}

function buildSignHandler(tronWeb: any, provider: TronProvider, proxiedSign: Function) {
  return (...args: unknown[]) => {
    let [transaction, privateKey, useTronHeader, callback] = args as [unknown, unknown, unknown, Function | undefined];

    if (typeof privateKey === 'function')    { callback = privateKey as Function;    privateKey = false; }
    if (typeof useTronHeader === 'function') { callback = useTronHeader as Function; useTronHeader = true; }

    if (!callback) return promisify(buildSignHandler(tronWeb, provider, proxiedSign), transaction, privateKey, useTronHeader);
    if (privateKey) return proxiedSign(transaction, privateKey, useTronHeader, callback);
    if (!transaction) return (callback as Function)('Invalid transaction provided');
    if (!tronWeb.ready) return (callback as Function)('User has not unlocked wallet');

    provider.request({
      method: 'tron_sign',
      params: { transaction, useTronHeader: useTronHeader ?? true, input: resolveSignInput(transaction) },
    })
      .then(res => (callback as Function)(null, res))
      .catch(err => (callback as Function)(err));
  };
}

function wireProviderEvents(tronWeb: any, provider: TronProvider, proxiedSetAddress: Function) {
  provider.on('setAccount', (address: string) => {
    if (!tronWeb.isAddress(address)) {
      tronWeb.defaultAddress = { hex: false, base58: false };
      tronWeb.ready = false;
    } else {
      proxiedSetAddress(address);
      tronWeb.ready = true;
    }
  });

  provider.on('setNode', (node: NodeConfig) => {
    tronWeb.fullNode.configure(node.fullNode);
    tronWeb.solidityNode.configure(node.solidityNode);
    tronWeb.eventServer.configure(node.eventServer);
  });
}

function applyInitResponse(tronWeb: any, res: unknown, proxiedSetAddress: Function) {
  const r = res as Record<string, any> | null | undefined;
  if (r?.address && tronWeb.isAddress(r.address)) {
    proxiedSetAddress(r.address);
    tronWeb.ready = true;
  }
  if (r?.node?.fullNode) {
    tronWeb.fullNode.configure(r.node.fullNode);
    tronWeb.solidityNode.configure(r.node.solidityNode);
    tronWeb.eventServer.configure(r.node.eventServer);
  }
}

export function injectTronWeb(provider: TronProvider): void {
  const existingTronWeb = win.tronWeb as any | undefined;
  const tronWeb = existingTronWeb ?? new (TronWeb as any)(
    new ProxiedProvider(),
    new ProxiedProvider(),
    new ProxiedProvider(),
  );

  const proxiedSetAddress = tronWeb.setAddress.bind(tronWeb);
  const proxiedSign = tronWeb.trx.sign.bind(tronWeb.trx);

  if (!existingTronWeb) {
    ['setPrivateKey', 'setAddress', 'setFullNode', 'setSolidityNode', 'setEventServer'].forEach(method => {
      tronWeb[method] = () => new Error('Bearby has disabled this method');
    });
  }

  tronWeb.trx.sign = buildSignHandler(tronWeb, provider, proxiedSign);

  wireProviderEvents(tronWeb, provider, proxiedSetAddress);

  provider.request({ method: 'tron_requestAccounts' })
    .then(res => applyInitResponse(tronWeb, res, proxiedSetAddress))
    .catch(() => {});

  if (!existingTronWeb) {
    win.tronWeb = tronWeb;
  }

  win.tronLink = provider;
}
