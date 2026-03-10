import { BaseTunnel, type TunnelMessage } from "./tunnel.js";
import { getSiteMetadata, type SiteMetadata } from "./utils.js";

interface FlutterMessage {
  type: string;
  uuid: string;
  payload: {
    method: string;
    params?: unknown;
    result?: unknown;
    error?: unknown;
  };
  icon?: string;
  websiteName?: string;
  websiteIcon?: string;
}

interface FlutterNotifyMessage {
  type: "notify";
  payload: {
    action: string;
    data: unknown;
  };
}

type IncomingMessage = FlutterMessage | FlutterNotifyMessage;

export class FlutterTunnel extends BaseTunnel {
  private cachedMeta: SiteMetadata | null = null;

  constructor() {
    super();
    this.listenForMessages();
  }

  send(msg: TunnelMessage): void {
    const meta = this.getMeta();
    const message: FlutterMessage = {
      type: "request",
      uuid: msg.uuid || "",
      payload: {
        method: msg.action,
        params: msg.data,
      },
      icon: meta.websiteIcon,
      websiteName: meta.websiteName,
      websiteIcon: meta.websiteIcon,
    };

    (window as any).flutter_inappwebview
      .callHandler("TIP6963TRON", JSON.stringify(message))
      .catch(() => {});
  }

  private listenForMessages(): void {
    window.addEventListener("message", (event: MessageEvent) => {
      const data: IncomingMessage = event.data;
      if (!data || typeof data !== "object" || !data.type) return;

      if (data.type === "response") {
        const msg = data as FlutterMessage;
        this.emit("reply", {
          action: "reply",
          uuid: msg.uuid,
          data: msg.payload?.error || msg.payload?.result,
          success: !msg.payload?.error,
        } satisfies TunnelMessage);
        return;
      }

      if (data.type === "notify") {
        const msg = data as FlutterNotifyMessage;
        this.emit("notify", {
          action: msg.payload.action,
          data: msg.payload.data,
        });
      }
    });
  }

  private getMeta(): SiteMetadata {
    if (!this.cachedMeta) {
      this.cachedMeta = getSiteMetadata();
    }
    return this.cachedMeta;
  }
}
