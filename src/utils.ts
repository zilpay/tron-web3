export function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function isFunction(obj: unknown): obj is Function {
  return typeof obj === "function";
}

const TRON_ADDRESS_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

export function isTronAddress(address: unknown): address is string {
  return typeof address === "string" && TRON_ADDRESS_RE.test(address);
}

export interface SiteMetadata {
  websiteName: string;
  websiteIcon: string;
}

export function getSiteMetadata(): SiteMetadata {
  const getIcon = () => {
    const links = document.querySelectorAll("link[rel*='icon']");
    for (let i = 0; i < links.length; i++) {
      const link = links[i] as HTMLLinkElement;
      if (link.href) {
        return link.href;
      }
    }
    return window.location.origin + "/favicon.ico";
  };

  return {
    websiteName: document.title || window.location.hostname,
    websiteIcon: getIcon(),
  };
}
