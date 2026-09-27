// Shared palette, fonts and SVG helpers. Dependency-free so CI can import it without `npm install`.
// Colors mirror portfolio/src/styles/tokens.css.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const themes = {
  dark: {
    bg: '#0b1020', surface: '#121a2f', surface2: '#182241', border: '#243051',
    text: '#e8ecf5', muted: '#9aa6c0', accent: '#6ea8ff', accent2: '#a78bfa', success: '#4ade80',
    code: { key: '#8dbbff', str: '#a5e3b0', kw: '#c4a7ff', punct: '#9aa6c0' },
  },
  light: {
    bg: '#f7f8fb', surface: '#ffffff', surface2: '#eef1f8', border: '#d6dcec',
    text: '#0b1020', muted: '#4a5670', accent: '#2456d6', accent2: '#7c3aed', success: '#15803d',
    code: { key: '#1a44b3', str: '#15803d', kw: '#7c3aed', punct: '#4a5670' },
  },
};

const font = (file) => readFileSync(fileURLToPath(new URL(`./fonts/${file}`, import.meta.url))).toString('base64');
let fontCss;
/** @font-face rules with embedded fonts: SVGs shown via <img> cannot load external fonts. */
export function fonts({ mono = false } = {}) {
  fontCss ??= {
    sans: `@font-face{font-family:'Inter';font-weight:100 900;src:url(data:font/woff2;base64,${font('inter.woff2')}) format('woff2')}`,
    mono: `@font-face{font-family:'JetBrains Mono';font-weight:100 800;src:url(data:font/woff2;base64,${font('jetbrains-mono.woff2')}) format('woff2')}`,
  };
  return fontCss.sans + (mono ? fontCss.mono : '');
}

export const SANS = `'Inter','Segoe UI',system-ui,-apple-system,sans-serif`;
export const MONO = `'JetBrains Mono',ui-monospace,Consolas,Menlo,monospace`;

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const svg = (w, h, body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${body}</svg>\n`;

/** Relative luminance contrast ratio between two #rrggbb colors. */
export function contrast(a, b) {
  const lum = (hex) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
