import { EventEmitter } from "./event-emitter.js";

export interface TunnelMessage {
  action: string;
  data?: unknown;
  uuid?: string;
  success?: boolean;
}

export abstract class BaseTunnel extends EventEmitter {
  abstract send(msg: TunnelMessage): void;
}
