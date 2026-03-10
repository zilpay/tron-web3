import type { MetaData } from './types.ts';

function rgbToHex(rgb: string): string {
  const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!match) return rgb;
  return '#' + [match[1], match[2], match[3]]
    .map(n => parseInt(n).toString(16).padStart(2, '0'))
    .join('');
}

export function getMetaData(): MetaData {
  if (typeof document === 'undefined') {
    return { description: null, title: null, colors: null };
  }

  let description: string | null = null;
  let title: string | null = null;

  const metaTags = document.getElementsByTagName('meta');
  for (let i = 0; i < metaTags.length; i++) {
    const name = metaTags[i].getAttribute('name')?.toLowerCase();
    const content = metaTags[i].getAttribute('content');
    if (!name || !content) continue;
    if (name === 'description') description = content;
    if (name === 'title') title = content;
  }

  const bodyStyles = window.getComputedStyle(document.body);
  const button = document.querySelector('button');
  const buttonStyles = button ? window.getComputedStyle(button) : null;

  return {
    description,
    title,
    colors: {
      background: rgbToHex(bodyStyles.backgroundColor),
      text: rgbToHex(bodyStyles.color),
      primary: buttonStyles ? rgbToHex(buttonStyles.backgroundColor) : undefined,
      secondary: buttonStyles ? rgbToHex(buttonStyles.backgroundColor) : undefined,
    },
  };
}
