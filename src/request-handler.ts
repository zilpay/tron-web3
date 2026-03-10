import { BaseTunnel } from "./tunnel.js";
import type { TunnelMessage } from "./tunnel.js";
import { uuid } from "./utils.js";

interface ReplyPromise<T = unknown> {
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

export class RequestHandler {
  private outgoing: Map<string, ReplyPromise<unknown>>;

  constructor(private eventTunnel: BaseTunnel, private replyEventName: string = "reply") {
    this.outgoing = new Map();
    this.registerReplyHandler();
  }

  private registerReplyHandler(): void {
    this.eventTunnel.on(this.replyEventName, (event: TunnelMessage) => {
      const { success, data, uuid: msgUuid } = event;
      if (!msgUuid) return;
      
      const promiseHandlers = this.outgoing.get(msgUuid);
      if (promiseHandlers) {
        if (success) {
          promiseHandlers.resolve(data);
        } else {
          promiseHandlers.reject(data);
        }
        this.outgoing.delete(msgUuid);
      }
    });
  }

  public send<T = unknown>(action: string, data?: unknown): Promise<T> {
    const msgUuid = uuid();
    this.eventTunnel.send({
      action,
      data,
      uuid: msgUuid
    });

    return new Promise((resolve, reject) => {
      this.outgoing.set(msgUuid, { resolve: resolve as (value: unknown) => void, reject });
    });
  }
}