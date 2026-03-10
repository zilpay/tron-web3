import { FlutterTunnel } from "./src/flutter-tunnel.js";
import { RequestHandler } from "./src/request-handler.js";
import { TronProvider } from "./src/tron-provider.js";

const tunnel = new FlutterTunnel();
const handler = new RequestHandler(tunnel);
const provider = new TronProvider(tunnel, handler);
provider.init();
