// Renders README.md and assets/ from profile.json. Run: npm run build
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as si from 'simple-icons';
import sharp from 'sharp';
import { themes, fonts, SANS, MONO, esc, svg, contrast } from './theme.mjs';

const require = createRequire(import.meta.url);
const lucide = require('@iconify-json/lucide/icons.json');
// Brands removed from simple-icons (e.g. Playwright) fall back to Iconify's archived copy + their brand color.
const siArchive = require('@iconify-json/simple-icons/icons.json');
const ARCHIVED_HEX = { playwright: '2EAD33' };
// Brands whose current logo is a gradient (simple-icons only ships a flat color).
const BRAND_GRADIENTS = {
  angular: [[0, '#E40035'], [0.24, '#F60A48'], [0.35, '#F20755'], [0.49, '#DC087D'], [0.75, '#9717E7'], [1, '#6C00F5']],
};
const root = new URL('../', import.meta.url);
const p = JSON.parse(readFileSync(new URL('profile.json', root), 'utf8'));
const out = (rel, data) => {
  const url = new URL(rel, root);
  mkdirSync(new URL('./', url), { recursive: true });
  writeFileSync(url, data);
};

// ---------- helpers ----------
/** Approximate Inter advance widths (em) — good enough for centering and wrapping. */
function textWidth(s, size, weight = 400) {
  let em = 0;
  for (const c of s) {
    if (' ilj.,:;\'!|·'.includes(c)) em += 0.27;
    else if ('mwMW@'.includes(c)) em += 0.86;
    else if (/[A-Z]/.test(c)) em += 0.68;
    else if (/[0-9]/.test(c)) em += 0.6;
    else if ('ft r'.includes(c)) em += 0.36;
    else em += 0.56;
  }
  return em * size * (weight >= 600 ? 1.05 : 1);
}
function wrap(text, size, max) {
  const lines = [''];
  for (const word of text.split(' ')) {
    const next = lines.at(-1) ? `${lines.at(-1)} ${word}` : word;
    if (textWidth(next, size) > max && lines.at(-1)) lines.push(word);
    else lines[lines.length - 1] = next;
  }
  return lines;
}
function lucideIcon(name, x, y, size, color, strokeWidth = 2) {
  const icon = lucide.icons[name] ?? lucide.icons[lucide.aliases?.[name]?.parent];
  if (!icon) throw new Error(`Unknown lucide icon: ${name}`);
  const body = icon.body.replace(/currentColor/g, color).replace(/stroke-width="2"/g, `stroke-width="${strokeWidth}"`);
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24">${body}</svg>`;
}
function brandIcon(ref, x, y, size, bg, fallback) {
  const [set, name] = ref.split(':');
  if (set === 'lucide') return lucideIcon(name, x, y, size, fallback);
  const key = 'si' + name[0].toUpperCase() + name.slice(1);
  const icon = si[key];
  const archived = !icon && siArchive.icons[name];
  if (!icon && !archived) throw new Error(`Unknown simple-icon: ${name}`);
  const gradient = BRAND_GRADIENTS[name];
  const fill = gradient ? `url(#grad-${name})` : `#${icon ? icon.hex : ARCHIVED_HEX[name]}`;
  const defs = gradient
    ? `<defs><linearGradient id="grad-${name}" x1="0" y1="1" x2="1" y2="0">${gradient.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient></defs>`
    : '';
  const body = icon ? `<path fill="${fill}" d="${icon.path}"/>` : archived.body.replace(/currentColor/g, fill);
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24">${defs}${body}</svg>`;
}
/** Tile behind a logo: neutral by default, inverted when the official color would be too faint on it. */
function iconTile(ref, t, mode) {
  const [set, name] = ref.split(':');
  if (set !== 'si' || BRAND_GRADIENTS[name]) return t.surface2;
  const icon = si['si' + name[0].toUpperCase() + name.slice(1)];
  const hex = `#${icon ? icon.hex : ARCHIVED_HEX[name]}`;
  if (contrast(hex, t.surface2) >= 3) return t.surface2;
  return mode === 'dark' ? '#e8ecf5' : '#1b2338';
}
const motion = `@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;

// ---------- banner ----------
function typingBlock(t, x, y, size) {
  const cw = size * 0.6; // monospace advance
  const typeStep = 0.075, eraseStep = 0.022, hold = 1.9, gap = 0.35;
  const events = []; // [time, phraseIndex, chars]
  let time = 0;
  p.typing.forEach((phrase, i) => {
    for (let k = 0; k <= phrase.length; k++) events.push([time + k * typeStep, i, k]);
    time += phrase.length * typeStep + hold;
    for (let k = phrase.length - 1; k >= 0; k--) events.push([(time += eraseStep), i, k]);
    time += gap;
  });
  const dur = time;
  const keyTimes = events.map(([t0]) => (t0 / dur).toFixed(5)).join(';');
  const px = x + cw * 2; // after the prompt glyph
  const clips = p.typing.map((_, i) => {
    const values = events.map(([, pi, k]) => (pi === i ? k * cw : 0).toFixed(1)).join(';');
    return `<clipPath id="tp${i}"><rect x="${px}" y="${y - size}" width="0" height="${size * 1.5}"><animate attributeName="width" values="${values}" keyTimes="${keyTimes}" dur="${dur.toFixed(2)}s" calcMode="discrete" repeatCount="indefinite"/></rect></clipPath>`;
  });
  const cursorX = events.map(([, , k]) => (px + k * cw + 1).toFixed(1)).join(';');
  return `<defs>${clips.join('')}</defs>
  <text x="${x}" y="${y}" font-family="${MONO}" font-size="${size}" fill="${t.accent2}" font-weight="700">❯</text>
  ${p.typing.map((s, i) => `<text x="${px}" y="${y}" font-family="${MONO}" font-size="${size}" fill="${t.text}" clip-path="url(#tp${i})">${esc(s)}</text>`).join('')}
  <rect y="${y - size * 0.82}" width="${(cw * 0.55).toFixed(1)}" height="${size * 1.02}" fill="${t.accent}" x="${px}"><animate attributeName="x" values="${cursorX}" keyTimes="${keyTimes}" dur="${dur.toFixed(2)}s" calcMode="discrete" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="1s" calcMode="discrete" repeatCount="indefinite"/></rect>`;
}

function codeCard(t, x, y, w, h) {
  const size = 14, lh = 26;
  const color = (seg, i) => {
    if (/^\s*'/.test(seg)) return t.code.str;
    if (seg === 'const') return t.code.kw;
    if (i === 0 && /^\s+\w/.test(seg)) return t.code.key;
    if (seg.trim() === 'hadi') return t.text;
    return t.code.punct;
  };
  const lines = p.code.map((segs, li) =>
    `<text x="${x + 24}" y="${y + 74 + li * lh}" font-family="${MONO}" font-size="${size}" xml:space="preserve">${segs.map((s, i) => `<tspan fill="${color(s, i)}">${esc(s)}</tspan>`).join('')}</text>`);
  return `<g class="float">
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${t.surface}" stroke="${t.border}"/>
  <path d="M${x} ${y + 40}h${w}" stroke="${t.border}"/>
  ${['#ff5f57', '#febc2e', '#28c840'].map((c, i) => `<circle cx="${x + 22 + i * 18}" cy="${y + 20}" r="5.5" fill="${c}"/>`).join('')}
  <text x="${x + w / 2}" y="${y + 25}" text-anchor="middle" font-family="${MONO}" font-size="12" fill="${t.muted}">hadi.ts</text>
  ${lines.join('\n  ')}
</g>`;
}

function banner(mode, compact) {
  const t = themes[mode];
  const W = compact ? 720 : 1200, H = compact ? 390 : 360, x = compact ? 48 : 64;
  const pill = p.availability;
  const pillW = textWidth(pill, 13, 500) + 44;
  const taglineLines = wrap(p.tagline, compact ? 19 : 17, compact ? 610 : 560);
  const tagY = compact ? 232 : 234;
  const tagLH = compact ? 29 : 26;
  const typeY = tagY + taglineLines.length * tagLH + (compact ? 40 : 34);
  const body = `<style>${fonts({ mono: true })}
  .glow{animation:drift 14s ease-in-out infinite alternate}
  .glow2{animation:drift 18s ease-in-out infinite alternate-reverse}
  .float{animation:float 6s ease-in-out infinite alternate}
  .rise{animation:rise .8s cubic-bezier(.2,.7,.2,1) both}
  @keyframes drift{from{transform:translate(0,0)}to{transform:translate(60px,30px)}}
  @keyframes float{from{transform:translateY(0)}to{transform:translateY(-8px)}}
  @keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
  ${motion}</style>
  <defs>
    <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill="${t.border}"/></pattern>
    <radialGradient id="g1"><stop offset="0" stop-color="${t.accent}" stop-opacity="${mode === 'dark' ? 0.34 : 0.2}"/><stop offset="1" stop-color="${t.accent}" stop-opacity="0"/></radialGradient>
    <radialGradient id="g2"><stop offset="0" stop-color="${t.accent2}" stop-opacity="${mode === 'dark' ? 0.26 : 0.14}"/><stop offset="1" stop-color="${t.accent2}" stop-opacity="0"/></radialGradient>
    <linearGradient id="name" x1="0" x2="1"><stop offset="0" stop-color="${t.text}"/><stop offset=".55" stop-color="${t.text}"/><stop offset="1" stop-color="${t.accent}"/></linearGradient>
    <clipPath id="frame"><rect width="${W}" height="${H}" rx="18"/></clipPath>
  </defs>
  <g clip-path="url(#frame)">
    <rect width="${W}" height="${H}" fill="${t.bg}"/>
    <rect width="${W}" height="${H}" fill="url(#dots)" opacity=".55"/>
    <circle class="glow" cx="${W * 0.78}" cy="${H * 0.1}" r="${compact ? 260 : 340}" fill="url(#g1)"/>
    <circle class="glow2" cx="${W * 0.12}" cy="${H * 1.05}" r="${compact ? 240 : 300}" fill="url(#g2)"/>
  </g>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="18" fill="none" stroke="${t.border}"/>
  <g class="rise">
    <rect x="${x}" y="${compact ? 44 : 50}" width="${pillW}" height="30" rx="15" fill="${t.surface}" stroke="${t.border}"/>
    <circle cx="${x + 18}" cy="${compact ? 59 : 65}" r="4.5" fill="${t.success}"/>
    <circle cx="${x + 18}" cy="${compact ? 59 : 65}" r="4.5" fill="none" stroke="${t.success}" stroke-width="2"><animate attributeName="r" values="4.5;11" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" values=".8;0" dur="1.8s" repeatCount="indefinite"/></circle>
    <text x="${x + 32}" y="${compact ? 64 : 70}" font-family="${SANS}" font-size="13" font-weight="500" fill="${t.text}">${esc(pill)}</text>
    <text x="${x - 3}" y="${compact ? 142 : 146}" font-family="${SANS}" font-size="${compact ? 56 : 54}" font-weight="800" letter-spacing="-1.5" fill="url(#name)">${esc(p.name)}</text>
    <text x="${x}" y="${compact ? 184 : 188}" font-family="${SANS}" font-size="${compact ? 23 : 22}" font-weight="600" fill="${t.accent}">${esc(p.role)}</text>
    ${taglineLines.map((l, i) => `<text x="${x}" y="${tagY + i * tagLH}" font-family="${SANS}" font-size="${compact ? 19 : 17}" fill="${t.muted}">${esc(l)}</text>`).join('\n    ')}
    ${typingBlock(t, x, typeY, compact ? 18 : 17)}
  </g>
  ${compact ? '' : codeCard(t, 700, 52, 436, 258)}`;
  return svg(W, H, body, `${p.name}: ${p.role}. ${p.tagline}`);
}

// ---------- link buttons ----------
function button(link, mode, h = 40) {
  const t = themes[mode];
  const size = h >= 40 ? 15 : 14;
  const w = Math.round(textWidth(link.label, size, 600) + 64);
  const fill = link.primary ? t.accent : t.surface;
  const ink = link.primary ? (mode === 'dark' ? t.bg : '#ffffff') : t.text;
  const body = `<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="${h / 2}" fill="${fill}" stroke="${link.primary ? fill : t.border}"/>
  ${lucideIcon(link.icon, 18, (h - 18) / 2, 18, link.primary ? ink : t.accent)}
  <text x="${(44 + w - 20) / 2}" y="${h / 2 + size * 0.36}" text-anchor="middle" font-family="${SANS}" font-size="${size}" font-weight="600" fill="${ink}">${esc(link.label)}</text>`;
  return svg(w, h, body, link.label);
}

// ---------- tech stack ----------
function stackSvg(mode, compact) {
  const t = themes[mode];
  const chipW = compact ? 158 : 152, chipH = 40, gap = 8;
  const cols = compact ? 3 : 5;
  const labelW = compact ? 0 : 196;
  const W = labelW + cols * chipW + (cols - 1) * gap;
  let y = 0, n = 0;
  const parts = [];
  p.stack.forEach((group, gi) => {
    if (gi) { parts.push(`<path d="M0 ${y + 12}H${W}" stroke="${t.border}" stroke-dasharray="3 5"/>`); y += 26; }
    const rows = Math.ceil(group.items.length / cols);
    const titleY = compact ? y + 14 : y + chipH / 2 + 5;
    parts.push(`<text x="0" y="${titleY}" font-family="${SANS}" font-size="12.5" font-weight="700" letter-spacing="1.4" fill="${t.accent}">${esc(group.title.toUpperCase())}</text>`);
    if (!compact) parts.push(`<text x="0" y="${titleY + 20}" font-family="${SANS}" font-size="12" fill="${t.muted}">${group.items.length} tools</text>`);
    if (compact) y += 28;
    group.items.forEach(([icon, label], i) => {
      const cx = labelW + (i % cols) * (chipW + gap), cy = y + Math.floor(i / cols) * (chipH + gap);
      parts.push(`<g class="chip" style="animation-delay:${(n++ * 35)}ms">
    <rect x="${cx + 0.5}" y="${cy + 0.5}" width="${chipW - 1}" height="${chipH - 1}" rx="10" fill="${t.surface}" stroke="${t.border}"/>
    <rect x="${cx + 7}" y="${cy + 7}" width="26" height="26" rx="7" fill="${iconTile(icon, t, mode)}"/>
    ${brandIcon(icon, cx + 11, cy + 11, 18, t.surface2, t.accent)}
    <text x="${cx + 42}" y="${cy + 25}" font-family="${SANS}" font-size="14" font-weight="500" fill="${t.text}">${esc(label)}</text>
  </g>`);
    });
    y += rows * (chipH + gap) - gap;
  });
  // Compact (phone) version is a self-contained card, so it reads on either GitHub theme.
  const pad = compact ? 24 : 0;
  const H = y + 2 + pad * 2;
  const body = `<style>${fonts()}
  .chip{animation:pop .5s cubic-bezier(.2,.7,.2,1) both}
  @keyframes pop{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  ${motion}</style>
  ${compact ? `<rect x=".5" y=".5" width="${W + pad * 2 - 1}" height="${H - 1}" rx="18" fill="${t.bg}" stroke="${t.border}"/>` : ''}
  <g transform="translate(${pad} ${pad})">
  ${parts.join('\n  ')}
  </g>`;
  return svg(W + pad * 2, H, body, `Tech stack: ${p.stack.map((g) => `${g.title}: ${g.items.map((i) => i[1]).join(', ')}`).join('. ')}`);
}

// ---------- section icons (one mid-blue that reads on both GitHub themes) ----------
const ICON_COLOR = '#4f8cff';
const iconSvg = (name) => svg(24, 24, lucideIcon(name, 0, 0, 24, ICON_COLOR, 1.9), name);

// ---------- project cards ----------
// Every cover sits in the same browser-window frame, so light and dark screenshots read as one set.
const slug = (pr) => pr.cover.replace(/\.\w+$/, '');
async function projectCard(pr) {
  const file = pr.cover;
  const input = readFileSync(new URL(`../portfolio/src/assets/covers/${file}`, root));
  const img = await sharp(input, file.endsWith('.svg') ? { density: 144 } : {}).resize(1440, 900, { fit: 'cover' }).webp({ quality: 78 }).toBuffer();
  const href = `data:image/webp;base64,${img.toString('base64')}`;
  const host = (pr.links.live ?? pr.links.case ?? pr.links.repo).replace(/^https:\/\//, '').replace(/\/$/, '');
  for (const mode of ['dark', 'light']) {
    const t = themes[mode];
    const W = 800, pad = 28, bar = 34, iw = W - pad * 2, ih = Math.round(iw * 0.625), H = pad * 2 + bar + ih;
    const body = `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.surface2}"/><stop offset="1" stop-color="${t.bg}"/></linearGradient>
    <radialGradient id="glow" cx=".85" cy="0" r=".9"><stop offset="0" stop-color="${t.accent}" stop-opacity="${mode === 'dark' ? 0.28 : 0.16}"/><stop offset="1" stop-color="${t.accent}" stop-opacity="0"/></radialGradient>
    <clipPath id="win"><rect x="${pad}" y="${pad}" width="${iw}" height="${bar + ih}" rx="12"/></clipPath>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity="${mode === 'dark' ? 0.45 : 0.14}"/></filter>
  </defs>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="18" fill="url(#bg)" stroke="${t.border}"/>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="18" fill="url(#glow)"/>
  <rect x="${pad}" y="${pad}" width="${iw}" height="${bar + ih}" rx="12" fill="${t.surface}" filter="url(#shadow)"/>
  <g clip-path="url(#win)">
    <rect x="${pad}" y="${pad}" width="${iw}" height="${bar}" fill="${t.surface}"/>
    ${['#ff5f57', '#febc2e', '#28c840'].map((c, i) => `<circle cx="${pad + 20 + i * 16}" cy="${pad + bar / 2}" r="5" fill="${c}"/>`).join('')}
    <rect x="${pad + 90}" y="${pad + 8}" width="${iw - 180}" height="${bar - 16}" rx="9" fill="${t.surface2}"/>
    <text x="${W / 2}" y="${pad + bar / 2 + 4}" text-anchor="middle" font-family="${SANS}" font-size="11" fill="${t.muted}">${esc(host)}</text>
    <image href="${href}" x="${pad}" y="${pad + bar}" width="${iw}" height="${ih}" preserveAspectRatio="xMidYMid slice"/>
    <path d="M${pad} ${pad + bar}.5h${iw}" stroke="${t.border}"/>
  </g>
  <rect x="${pad + 0.5}" y="${pad + 0.5}" width="${iw - 1}" height="${bar + ih - 1}" rx="12" fill="none" stroke="${t.border}"/>`;
    out(`assets/projects/${slug(pr)}-${mode}.svg`, svg(W, H, body, `${pr.title} screenshot`));
  }
}

// Project buttons share the header buttons' design. First one in a card is primary.
const PROJECT_BUTTONS = {
  live: { label: 'Live demo', icon: 'external-link' },
  video: { label: 'Demo video', icon: 'circle-play' },
  case: { label: 'Case study', icon: 'book-open' },
  repo: { label: 'Code', icon: 'github' },
};
/** Every card gets the same two buttons: its best demo (live > video > case study) and its code. */
const cardButtons = (pr) => [['live', 'video', 'case'].find((k) => pr.links[k]), pr.links.repo && 'repo'].filter(Boolean);

// ---------- README ----------
const raw = `https://raw.githubusercontent.com/${p.github}/${p.github}/output`;
const pic = (base, alt, attrs = '') =>
  `<picture><source media="(prefers-color-scheme: light)" srcset="${base}-light.svg"><img src="${base}-dark.svg" alt="${esc(alt)}" ${attrs}></picture>`;
const icon = (name, size = 22) => `<img src="assets/icons/${name}.svg" width="${size}" height="${size}" alt="">`;
const h2 = (name, title) => `## ${icon(name)} ${title}`;

function readme() {
  const btns = p.links.map((l) => `<a href="${l.href}">${pic(`assets/buttons/${l.label.toLowerCase()}`, l.label, 'height="40"')}</a>`).join('&nbsp;\n  ');

  const about = `<table>
<tr>
${p.whatIDo.map((w) => `<td width="33%" valign="top">
${icon(w.icon, 28)}<br>
<b>${esc(w.title)}</b><br>
${esc(w.text)}
</td>`).join('\n')}
</tr>
</table>`;

  const card = (pr) => {
    const main = pr.links.live ?? pr.links.case ?? pr.links.repo;
    const links = cardButtons(pr)
      .map((k, i) => `<a href="${pr.links[k]}">${pic(`assets/buttons/${k}${i ? '' : '-primary'}`, PROJECT_BUTTONS[k].label, 'height="36"')}</a>`)
      .join('&nbsp;\n');
    return `<td width="50%" valign="top">
<a href="${main}">${pic(`assets/projects/${slug(pr)}`, `${pr.title} screenshot`, 'width="100%"')}</a>
<h3>${esc(pr.title)}</h3>
${esc(pr.blurb)}
<br><br>
<b>${esc(pr.metric.value)}</b> ${esc(pr.metric.label)}<br>
${pr.tags.map((x) => `<code>${esc(x)}</code>`).join(' ')}
<br><br>
${links}
</td>`;
  };
  const rows = [];
  for (let i = 0; i < p.projects.length; i += 2) rows.push(`<tr>\n${p.projects.slice(i, i + 2).map(card).join('\n')}\n</tr>`);

  const e = p.experience;
  return `<!-- Generated by scripts/build.mjs from profile.json. Edit those and run \`npm run build\`, not this file. -->

<a href="${p.links[0].href}">
<picture>
  <source media="(max-width: 700px)" srcset="assets/banner-compact-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/banner-light.svg">
  <img src="assets/banner-dark.svg" alt="${esc(`${p.name}: ${p.role}. ${p.tagline}`)}" width="100%">
</picture>
</a>

<br>

<p align="center">
  ${btns}
</p>

${h2('sparkles', 'About')}

${esc(p.intro)}

${about}

<p align="center">
${p.facts.map((f) => `<b>${esc(f.value)}</b> ${esc(f.label)}`).join(' &nbsp;&nbsp;•&nbsp;&nbsp; ')}
</p>

${h2('rocket', 'Featured work')}

<table>
${rows.join('\n')}
</table>

> ${icon('lock', 16)} **${esc(p.confidential.title)}**: ${esc(p.confidential.text)} [Read the case study ↗︎](${p.confidential.href})

<p align="right"><a href="${p.portfolioWork}">All work on the portfolio ↗︎</a></p>

${h2('layers', 'Tech stack')}

<picture>
  <source media="(max-width: 700px)" srcset="assets/stack-compact-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/stack-light.svg">
  <img src="assets/stack-dark.svg" alt="Tech stack: ${esc(p.stack.flatMap((g) => g.items.map((i) => i[1])).join(', '))}" width="100%">
</picture>

<br>

<p align="center">
  ${pic(`${raw}/languages`, 'Most used languages in recent public repositories', 'width="620"')}
</p>

${h2('briefcase-business', 'Experience')}

**${esc(e.company)}** &nbsp;·&nbsp; ${esc(e.location)} &nbsp;·&nbsp; ${esc(e.total)}

| Role | Period |
| :-- | :-- |
${e.roles.map((r) => `| ${esc(r.title)} | ${esc(r.period)} |`).join('\n')}

<details>
<summary><b>Highlights</b></summary>
<br>

${e.highlights.map((h) => `- ${h}`).join('\n')}

</details>

${p.education.map((ed) => `${icon(ed.icon, 18)} &nbsp;**${esc(ed.title)}** · ${esc(ed.org)} · ${esc(ed.period)}`).join('<br>\n')}

---

<p align="center">
  <b>${esc(p.cta)}</b><br>
  <a href="${p.links[0].href}">hadi-alkammouni.web.app</a> &nbsp;·&nbsp; <a href="${p.links[2].href}">${p.links[2].href.replace('mailto:', '')}</a>
</p>
`;
}

// ---------- run ----------
for (const dir of ['assets/buttons', 'assets/icons']) if (existsSync(new URL(dir, root))) rmSync(new URL(dir, root), { recursive: true });
for (const mode of ['dark', 'light']) {
  out(`assets/banner-${mode}.svg`, banner(mode, false));
  out(`assets/stack-${mode}.svg`, stackSvg(mode, false));
  for (const l of p.links) out(`assets/buttons/${l.label.toLowerCase()}-${mode}.svg`, button(l, mode));
}
const icons = new Set(['sparkles', 'rocket', 'layers', 'briefcase-business', 'lock', ...p.whatIDo.map((w) => w.icon), ...p.education.map((e) => e.icon)]);
for (const name of icons) out(`assets/icons/${name}.svg`, iconSvg(name));
// Phone versions: one dark card each (GitHub's <themed-picture> rewrites color-scheme queries, so they are not combined with max-width).
out('assets/banner-compact-dark.svg', banner('dark', true));
out('assets/stack-compact-dark.svg', stackSvg('dark', true));
if (existsSync(new URL('assets/projects', root))) rmSync(new URL('assets/projects', root), { recursive: true });
for (const pr of p.projects) await projectCard(pr);
// Only the button variants the cards actually use (first link in a card is primary).
const used = new Set(p.projects.flatMap((pr) => cardButtons(pr).map((k, i) => (i ? k : `${k}-primary`))));
for (const mode of ['dark', 'light']) for (const name of used) {
  const [k, primary] = name.split('-');
  out(`assets/buttons/${name}-${mode}.svg`, button({ ...PROJECT_BUTTONS[k], primary: !!primary }, mode, 36));
}
out('README.md', readme());
console.log('Built README.md and assets/');
