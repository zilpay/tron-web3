import { EventEmitter } from "./event-emitter.js";
import type { RequestHandler } from "./request-handler.js";
import type { BaseTunnel } from "./tunnel.js";
import type { InitProviderData, NotifyEvent, ProviderRpcError } from "./types.js";
import { getSiteMetadata, isFunction, isTronAddress } from "./utils.js";

const ETH_REQUEST_ACCOUNTS = "eth_requestAccounts";

function createTronWebStub(data?: InitProviderData) {
  const stub: any = {
    ready: false,
    defaultAddress: { hex: false, base58: false },
  };

  if (data?.isAuth && isTronAddress(data.address)) {
    stub.ready = true;
    stub.defaultAddress = {
      hex: false,
      base58: data.address,
      name: data.name,
      type: data.type,
    };
  }

  return stub;
}

export class TronProvider {
  private tronProvider: any;
  private chainId?: string;

  constructor(
    private eventTunnel: BaseTunnel,
    private requestHandler: RequestHandler,
    private notifyEventName: string = "notify"
  ) {
    this.tronProvider = new Proxy(new EventEmitter(), {
      deleteProperty: () => true,
    });
  }

  public async init(): Promise<void> {
    this.bindNotifyEvents();
    await this.initTronProvider();
    this.setWindowTron(this.tronProvider);
    this.announceTip6963Event(this.tronProvider);
  }

  private async initTronProvider(): Promise<any> {
    this.tronProvider.isBearby = true;
    this.tronProvider.request = (args: any) => this.doTronRequest(args);

    const data = await this.getProviderInitData();
    this.chainId = data?.chainId;
    this.tronProvider.tronWeb = this.buildTronWebStub(data);

    this.runFnAfterWindowLoaded(() => {
      this.tronProvider.tronlinkParams = getSiteMetadata();
    });

    setTimeout(() => {
      this.tronProvider.emit("connect", { chainId: this.chainId });
    }, 100);

    return this.tronProvider;
  }

  private buildTronWebStub(data?: InitProviderData): any {
    const stub = createTronWebStub(data);

    stub.trx = {
      sign: this.sign.bind(this),
      signMessageV2: this.signMessageV2.bind(this),
      multiSign: this.multiSign.bind(this),
      _signTypedData: this._signTypedData.bind(this),
    };

    return stub;
  }

  private async refreshState(): Promise<void> {
    const data = await this.getProviderInitData();
    this.chainId = data?.chainId;
    this.tronProvider.tronWeb = this.buildTronWebStub(data);
  }

  private async doTronRequest(args: any): Promise<any> {
    if (args && args.method === ETH_REQUEST_ACCOUNTS) {
      args.params = {
        ...args.params,
        ...this.tronProvider.tronlinkParams,
      };
    }
    try {
      return await this.requestHandler.send("tronProviderRequest", args);
    } catch (err: any) {
      const rpcError: ProviderRpcError = {
        code: err?.code ?? 4000,
        message: err?.message ?? String(err),
        data: err?.data,
      };
      throw rpcError;
    }
  }

  private async getProviderInitData(): Promise<InitProviderData | undefined> {
    try {
      return await this.requestHandler.send<InitProviderData>("getInitProviderData");
    } catch {}
  }

  private bindNotifyEvents(): void {
    this.eventTunnel.on(this.notifyEventName, async (event: NotifyEvent) => {
      if (!event.action) return;

      switch (event.action) {
        case "acceptWeb":
        case "connectWeb":
          await this.refreshState();
          this.tronProvider.emit(
            "accountsChanged",
            isTronAddress(event.data.data?.address) ? [event.data.data.address] : []
          );
          break;
        case "rejectWeb":
        case "disconnectWeb": {
          const disconnectAddress = event.data?.disconnectAddress;
          const currentAddress = this.tronProvider.tronWeb?.defaultAddress?.base58;

          await this.refreshState();

          if (disconnectAddress === currentAddress) {
            this.tronProvider.emit("accountsChanged", []);
          }
          break;
        }
        case "changeAddress": {
          const { address } = event.data;
          const currentAddress = this.tronProvider.tronWeb?.defaultAddress?.base58;

          if (address && address !== currentAddress) {
            await this.refreshState();
            this.tronProvider.emit(
              "accountsChanged",
              isTronAddress(address) && this.tronProvider.tronWeb?.ready
                ? [address]
                : []
            );
          }

          if (address === false) {
            await this.refreshState();
            this.tronProvider.emit("accountsChanged", []);
          }
          break;
        }
        case "setNode":
          await this.refreshState();
          this.tronProvider.emit("chainChanged", {
            chainId: event.data.node.chainId,
          });
          break;
      }
    });
  }

  public sign(transaction: any, privateKey: any = false, useTronHeader: any = true, callback: any = false): any {
    if (isFunction(privateKey)) {
      callback = privateKey;
      privateKey = false;
    }
    if (isFunction(useTronHeader)) {
      callback = useTronHeader;
      useTronHeader = true;
    }

    if (!callback) {
      return this.handlePromiseSign(this.sign.bind(this), transaction, privateKey, useTronHeader);
    }

    if (!this.tronProvider.tronWeb.ready) {
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

    this.requestHandler
      .send("sign", { transaction, useTronHeader, input: inputStr })
      .then((res) => callback(null, res))
      .catch((err) => callback(err));
  }

  public signMessageV2(message: any, privateKey: any = false, options: any = {}, callback: any = false): any {
    if (isFunction(options)) {
      callback = options;
      options = {};
    }
    if (isFunction(privateKey)) {
      callback = privateKey;
      privateKey = false;
    }

    if (!callback) {
      return this.handlePromiseSign(this.signMessageV2.bind(this), message, privateKey, options);
    }

    if (privateKey) {
      return callback("Direct private key signing is not supported");
    }

    if (!message) {
      return callback("Invalid transaction provided");
    }

    if (!this.tronProvider.tronWeb.ready) {
      return callback("User has not unlocked wallet");
    }

    this.requestHandler
      .send("sign", {
        transaction: message,
        options,
        input: message,
        isSignMessageV2: true,
      })
      .then((res) => callback(null, res))
      .catch((err) => callback(err));
  }

  public multiSign(transaction: any = false, privateKey: any = false, permissionId: any = false, callback: any = false): any {
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
      return this.handlePromiseSign(this.multiSign.bind(this), transaction, privateKey, permissionId);
    }

    if (!this.tronProvider.tronWeb.ready) {
      return callback("User has not unlocked wallet");
    }

    if (!transaction?.raw_data?.contract) {
      return callback("Invalid transaction provided");
    }

    if (privateKey) {
      return callback("Direct private key signing is not supported");
    }

    this.requestHandler
      .send("multiSign", {
        transaction,
        useTronHeader: true,
        input: (transaction as any).raw_data.contract[0].parameter.value,
        permissionId,
      })
      .then((res) => callback(null, res, permissionId))
      .catch((err) => callback(err));
  }

  public _signTypedData(domain: any, types: any, value: any, privateKey: any = false, callback: any = false): any {
    if (isFunction(privateKey)) {
      callback = privateKey;
      privateKey = false;
    }

    if (!callback) {
      return this.handlePromiseSign(this._signTypedData.bind(this), domain, types, value, privateKey);
    }

    if (privateKey) {
      return callback("Direct private key signing is not supported");
    }

    if (!this.tronProvider.tronWeb.ready) {
      return callback("User has not unlocked wallet");
    }

    if (!domain || !types || !value) {
      return callback("Invalid params provided");
    }

    this.requestHandler
      .send("_signTypedData", { domain, types, message: value })
      .then((res) => callback(null, res))
      .catch((err) => callback(err));
  }

  private handlePromiseSign(method: Function, ...args: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      method(...args, (err: any, res: any) => {
        if (err) return reject(err);
        resolve(res);
      });
    });
  }

  private setWindowTron(provider: any): void {
    window.tron = provider;
  }

  private announceTip6963Event(provider: any): void {
    const info = {
      uuid: "bearby",
      name: "Bearby Wallet",
      icon: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgdmlld0JveD0iMCAwIDUxMiA1MTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNMjM5LjEyNSAyMTUuMzY3QzI1OC4wMTQgMjA0LjM5MiAyNjEuNDc4IDE3NC44NDQgMjQ2Ljg2MSAxNDkuMzY4QzIzMi4yNDUgMTIzLjg5MiAxNDguOTkgNDUuMjAwNSAxNDMuMzY3IDQ4LjQ2NjlDMTM3Ljc0NCA1MS43MzMzIDE2My44NCAxNjMuNjMzIDE3OC40NTcgMTg5LjEwOUMxOTMuMDc0IDIxNC41ODUgMjIwLjIzNSAyMjYuMzQxIDIzOS4xMjUgMjE1LjM2N1pNMzQ1LjQ4NSAzOTcuNDc5QzM2MC42MDEgMzg4LjY5OCAzNzguNzQ3IDM4NS4yNzcgMzk2LjE3IDM4NC4yMTZDNDA3LjE5NiAzODMuNTQ1IDQxOC4yNCAzODAuMzU1IDQyOC40NTggMzc0LjQxOUM0NjMuNjQ5IDM1My45NzMgNDc1LjcwNiAzMDguNjkyIDQ1NS4zODggMjczLjI4QzQzNS4wNzEgMjM3Ljg2NyAzOTAuMDcyIDIyNS43MzUgMzU0Ljg4MSAyNDYuMThDMzQ3Ljc3MiAyNTAuMzA5IDMzOC41MjEgMjQ5Ljc5OSAzMzEuODgyIDI0NC45NDJDMzA5LjA4OSAyMjguMjY3IDI3Ny43NjUgMjI1LjYwNiAyNTEuNzg2IDI0MC42OTlDMjI2LjA2MiAyNTUuNjQ0IDIxMi42OTkgMjgzLjg1OCAyMTUuMzA2IDMxMS43ODlDMjE2LjEyNCAzMjAuNTU1IDIxMS41OTQgMzI5LjQyNiAyMDQuMDE3IDMzMy44MjlDMTY4LjgyNiAzNTQuMjc0IDE1Ni43NjggMzk5LjU1NSAxNzcuMDg2IDQzNC45NjhDMTk3LjQwMyA0NzAuMzggMjQyLjQwMiA0ODIuNTE0IDI3Ny41OTQgNDYyLjA2OEMyODYuNTQgNDU2Ljg3IDI5My45OTEgNDUwLjA2NyAyOTkuNzk1IDQ0Mi4yMjlDMzEyLjM2MSA0MjUuMjYyIDMyNy4yNzUgNDA4LjA1OSAzNDUuNDg1IDM5Ny40NzlaTTMyOC41NjUgMTI2LjI3M0MzNDMuNjYzIDE1Mi41OSAzNDIuNjg4IDE4MS42MDEgMzI2LjM4NyAxOTEuMDcxQzMxMC4wODQgMjAwLjU0MyAyODQuNjMgMTg2Ljg4NyAyNjkuNTMgMTYwLjU3MUMyNjQuNDc0IDE1MS43NTggMjYyLjg2IDEzOS44MTYgMjYxLjA0NiAxMjYuNEMyNTcuNDQ2IDk5Ljc1NzMgMjUzLjA1OCA2Ny4zMDc1IDIxOS4zNjIgNDIuMDMyOEMyNDUuMzM3IDI2Ljk0MjIgMzEzLjQ2NiA5OS45NTc2IDMyOC41NjUgMTI2LjI3M1pNMTc1LjA1NCAyNzguOTkzQzE1OC40OTMgMjg4LjYxNCAxMzIuODI5IDI3NS4wODEgMTE3LjcyOSAyNDguNzY0QzEwMi42MzEgMjIyLjQ0OSA3NC4xNzAyIDEyNi4zODYgMTAwLjU1NyAxMTEuMDU2QzEwNS4yMzIgMTUzLjE5MiAxMzEuMTM1IDE3My4xNDEgMTUyLjQwMyAxODkuNTIxQzE2My4xMTEgMTk3Ljc2NyAxNzIuNjQ0IDIwNS4xMDkgMTc3LjcwMSAyMTMuOTIyQzE5Mi43OTkgMjQwLjIzOSAxOTEuNjE0IDI2OS4zNzIgMTc1LjA1NCAyNzguOTkzWk00MTYuNjY0IDEzOS4wNDVDNDI0LjkzMyAxNjIuMDU2IDQxOC44OTMgMTg2LjM3OSA0MDMuMTc0IDE5My4zN0MzODcuNDU2IDIwMC4zNjIgMzY4LjAxIDE4Ny4zNzUgMzU5Ljc0MiAxNjQuMzY0QzM1Ni45NzMgMTU2LjY1NyAzNTcuNzI2IDE0Ni41MjYgMzU4LjU3MSAxMzUuMTQ1QzM2MC4yNDkgMTEyLjU0MSAzNjIuMjkzIDg1LjAwOTQgMzM3Ljg0MyA2MS43Njk4QzM2Mi44ODggNTAuNjI5NiA0MDguMzk1IDExNi4wMzMgNDE2LjY2NCAxMzkuMDQ1Wk0xMzUuNjMzIDM0OC44MDNDMTIxLjc0NiAzNTkuMDEzIDk3Ljc4MzYgMzUyLjEyMiA4Mi4xMTQgMzMzLjQxMUM2Ni40NDQ1IDMxNC42OTkgMzIuOTI1MSAyNDIuMzI5IDU1LjA1MzkgMjI2LjA1OUM2Mi44MTg2IDI1OC45OTQgODcuNTQyNCAyNzAuOTc0IDEwNy44NDEgMjgwLjgwOEMxMTguMDYyIDI4NS43NiAxMjcuMTYgMjkwLjE2NyAxMzIuNDA4IDI5Ni40MzRDMTQ4LjA3NyAzMTUuMTQ1IDE0OS41MjIgMzM4LjU5MSAxMzUuNjMzIDM0OC44MDNaIiBmaWxsPSJ1cmwoI3BhaW50MF9saW5lYXJfMTA4MV8yKSIvPgo8ZGVmcz4KPGxpbmVhckdyYWRpZW50IGlkPSJwYWludDBfbGluZWFyXzEwODFfMiIgeDE9IjE0Mi4wODkiIHkxPSI0OS4yMDk1IiB4Mj0iMzU1LjYxNiIgeTI9IjQxNi43MzgiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIj4KPHN0b3Agb2Zmc2V0PSIwLjQyNzA4MyIgc3RvcC1jb2xvcj0iI0U4MDA2RiIvPgo8c3RvcCBvZmZzZXQ9IjAuNzM5NTgzIiBzdG9wLWNvbG9yPSIjQUM1OUZGIi8+CjwvbGluZWFyR3JhZGllbnQ+CjwvZGVmcz4KPC9zdmc+Cg==",
      rdns: "io.bearby",
    };

    const event = new CustomEvent("TIP6963:announceProvider", {
      detail: Object.freeze({ info, provider }),
    });
    window.dispatchEvent(event);

    window.addEventListener("TIP6963:requestProvider", () => {
      window.dispatchEvent(event);
    });
  }

  private runFnAfterWindowLoaded(fn: () => void): void {
    if (document.readyState === "complete") {
      fn();
    } else {
      window.addEventListener("load", fn, { once: true });
    }
  }
}
