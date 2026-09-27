// Renders languages-{dark,light}.svg from public repos. Runs in CI (no npm install needed).
// Usage: GITHUB_TOKEN=... node scripts/languages.mjs <outDir>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { themes, fonts, SANS, esc, svg } from './theme.mjs';

const p = JSON.parse(readFileSync(new URL('../profile.json', import.meta.url), 'utf8'));
const { months, exclude, top } = p.languages;
// Rolling window: only repos pushed in the last `months` count, so old work ages out on its own.
const since = new Date(Date.now() - months * 30.44 * 864e5).toISOString();
const outDir = process.argv[2] ?? 'dist';
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': p.github, ...(process.env.GITHUB_TOKEN && { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }) };
const get = async (url) => {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
};

// GitHub's own language colors (linguist), fetched live so any new language gets its official color.
// The short list below is only a fallback if that fetch fails.
const COLORS = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', HTML: '#e34c26', CSS: '#663399', SCSS: '#c6538c', Python: '#3572a5',
  PHP: '#4f5d95', Dart: '#00b4ab', Shell: '#89e051', Dockerfile: '#384d54', Astro: '#ff5a03', Java: '#b07219',
  Kotlin: '#a97bff', Swift: '#f05138', 'C#': '#178600', 'C++': '#f34b7d', Go: '#00add8', Rust: '#dea584', Vue: '#41b883',
  Blade: '#f7523f', MDX: '#fcb32c', PowerShell: '#012456', Batchfile: '#c1f12e', Other: '#8b949e',
};

try {
  const yml = await (await fetch('https://raw.githubusercontent.com/github-linguist/linguist/main/lib/linguist/languages.yml')).text();
  let lang;
  for (const line of yml.split('\n')) {
    const name = line.match(/^(?:"(.+)"|([^\s#][^:]*)):\s*$/);
    if (name) lang = name[1] ?? name[2];
    const color = line.match(/^\s+color:\s*"(#[0-9a-fA-F]{6})"/);
    if (color && lang) COLORS[lang] = color[1];
  }
} catch { /* keep fallback colors */ }

const repos = (await get(`https://api.github.com/users/${p.github}/repos?per_page=100&type=owner`))
  .filter((r) => !r.fork && !r.archived && !r.private && r.pushed_at >= since && !exclude.includes(r.name));
const totals = {};
for (const r of repos) for (const [lang, bytes] of Object.entries(await get(r.languages_url))) totals[lang] = (totals[lang] ?? 0) + bytes;

const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
let langs = Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([name, bytes]) => ({ name, pct: (bytes / sum) * 100 }));
if (langs.length > top) {
  const rest = langs.slice(top - 1).reduce((a, l) => a + l.pct, 0);
  langs = [...langs.slice(0, top - 1), { name: 'Other', pct: rest }];
}

function render(mode) {
  const t = themes[mode];
  const W = 620, barY = 58, cols = 3, colW = (W - 48) / cols, rowH = 30;
  const rows = Math.ceil(langs.length / cols);
  const H = barY + 12 + 30 + rows * rowH + 10;
  let x = 24;
  const segments = langs.map((l, i) => {
    const w = ((W - 48) * l.pct) / 100;
    const seg = `<rect class="seg" style="animation-delay:${i * 90}ms" x="${x.toFixed(2)}" y="${barY}" width="${Math.max(w - 2, 1).toFixed(2)}" height="12" fill="${COLORS[l.name] ?? t.muted}"/>`;
    x += w;
    return seg;
  });
  const legend = langs.map((l, i) => {
    const lx = 24 + (i % cols) * colW, ly = barY + 50 + Math.floor(i / cols) * rowH;
    return `<circle cx="${lx + 6}" cy="${ly - 4.5}" r="5.5" fill="${COLORS[l.name] ?? t.muted}"/>
  <text x="${lx + 20}" y="${ly}" font-family="${SANS}" font-size="14" fill="${t.text}" font-weight="600">${esc(l.name)} <tspan fill="${t.muted}" font-weight="400">${l.pct.toFixed(1)}%</tspan></text>`;
  });
  const body = `<style>${fonts()}
  .seg{animation:grow .9s cubic-bezier(.2,.7,.2,1) both;transform-origin:left;transform-box:fill-box}
  @keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
  @media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="14" fill="${t.surface}" stroke="${t.border}"/>
  <text x="24" y="36" font-family="${SANS}" font-size="12.5" font-weight="700" letter-spacing="1.4" fill="${t.accent}">LANGUAGES</text>
  <text x="${W - 24}" y="36" text-anchor="end" font-family="${SANS}" font-size="12.5" fill="${t.muted}">${repos.length} public repos · last ${months} months</text>
  <clipPath id="bar"><rect x="24" y="${barY}" width="${W - 48}" height="12" rx="6"/></clipPath>
  <g clip-path="url(#bar)"><rect x="24" y="${barY}" width="${W - 48}" height="12" fill="${t.surface2}"/>${segments.join('')}</g>
  ${legend.join('\n  ')}`;
  return svg(W, H, body, `Languages: ${langs.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(', ')}`);
}

mkdirSync(outDir, { recursive: true });
for (const mode of ['dark', 'light']) writeFileSync(join(outDir, `languages-${mode}.svg`), render(mode));
console.log(`Languages from ${repos.length} repos:`, langs.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(', '));
