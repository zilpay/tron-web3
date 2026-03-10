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
  description: string | null;
  title: string | null;
  colors: {
    primary?: string;
    secondary?: string;
    background?: string;
    text?: string;
  } | null;
}

function rgbToHex(rgb: string): string {
  const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!match) return rgb;
  const r = parseInt(match[1]).toString(16).padStart(2, "0");
  const g = parseInt(match[2]).toString(16).padStart(2, "0");
  const b = parseInt(match[3]).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

export function getSiteMetadata(): SiteMetadata {
  const getIcon = (): string => {
    const links = document.querySelectorAll("link[rel*='icon']");
    for (let i = 0; i < links.length; i++) {
      const link = links[i] as HTMLLinkElement;
      if (link.href) {
        return link.href;
      }
    }
    return window.location.origin + "/favicon.ico";
  };

  const getMetaContent = (name: string): string | null => {
    const meta = document.querySelector(`meta[name="${name}"]`);
    return meta?.getAttribute("content") || null;
  };

  const getColors = (): SiteMetadata["colors"] => {
    const bodyStyles = window.getComputedStyle(document.body);
    const button = document.querySelector("button");
    const buttonStyles = button ? window.getComputedStyle(button) : null;const buttonHoverStyles = button ? window.getComputedStyle(button, ":hover") : null;

    return {
      background: rgbToHex(bodyStyles.backgroundColor),
      text: rgbToHex(bodyStyles.color),
      primary: buttonStyles ? rgbToHex(buttonStyles.backgroundColor) : undefined,
      secondary:
        buttonHoverStyles && buttonHoverStyles.backgroundColor !== buttonStyles?.backgroundColor
          ? rgbToHex(buttonHoverStyles.backgroundColor)
          : buttonStyles
          ? rgbToHex(buttonStyles.backgroundColor)
          : undefined,
    };
  };

  return {
    websiteName: document.title || window.location.hostname,
    websiteIcon: getIcon(),
    description: getMetaContent("description"),
    title: getMetaContent("title") || document.title || null,
    colors: getColors(),
  };
}
