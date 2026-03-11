import type { MetaData } from "./types";

function rgbToHex(rgb: string): string {
  const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!match) return rgb;
  const r = parseInt(match[1]).toString(16).padStart(2, '0');
  const g = parseInt(match[2]).toString(16).padStart(2, '0');
  const b = parseInt(match[3]).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

export function getMetaDataFromTags(): MetaData {
  if (typeof document === 'undefined') {
    return {
      description: null,
      title: null,
      colors: null,
    };
  }

  const metaTags = document.getElementsByTagName('meta');
  let description: string | null = null;
  let title: string | null = null;

  for (let i = 0; i < metaTags.length; i++) {
    const meta = metaTags[i];
    const name = meta.getAttribute('name');
    const content = meta.getAttribute('content');

    if (!name || !content) continue;

    switch (name.toLowerCase()) {
      case 'description':
        description = content;
        break;
      case 'title':
        title = content;
        break;
    }
  }

  const bodyStyles = window.getComputedStyle(document.body);
  const button = document.querySelector('button');
  const buttonStyles = button ? window.getComputedStyle(button) : null;
  const buttonHoverStyles = button ? window.getComputedStyle(button, ':hover') : null;

  const colors = {
    background: rgbToHex(bodyStyles.backgroundColor),
    text: rgbToHex(bodyStyles.color),
    primary: buttonStyles ? rgbToHex(buttonStyles.backgroundColor) : undefined,
    secondary: buttonHoverStyles && buttonHoverStyles.backgroundColor !== buttonStyles?.backgroundColor 
      ? rgbToHex(buttonHoverStyles.backgroundColor) 
      : buttonStyles ? rgbToHex(buttonStyles.backgroundColor) : undefined,
  };

  return {
    description,
    title,
    colors,
  };
}
