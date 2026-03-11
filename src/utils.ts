export function isFunction(obj: unknown): obj is Function {
  return typeof obj === "function";
}

const TRON_ADDRESS_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

export function isTronAddress(address: unknown): address is string {
  return typeof address === "string" && TRON_ADDRESS_RE.test(address);
}
