export function getFavicon(): string {
  const ref = globalThis.document?.querySelector<HTMLLinkElement>("link[rel*='icon']");
  return ref?.href ?? "";
}
