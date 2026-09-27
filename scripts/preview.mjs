// Local preview: renders README.md through GitHub's own Markdown API and wraps it in a
// GitHub-profile-like page with every image inlined. Output: preview/index.html (gitignored).
// Needs `gh` logged in. Activity images come from preview/assets (run languages.mjs + snk first).
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const read = (rel, enc) => readFileSync(new URL(rel, root), enc);
const p = JSON.parse(read('profile.json', 'utf8'));
const token = execSync('gh auth token').toString().trim();
const gh = async (path, init = {}) => {
  const res = await fetch(`https://api.github.com/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...init.headers } });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res;
};

// 1. GitHub's own rendering (same sanitizer, <themed-picture>, heading anchors as the profile page).
const html = await (await gh('markdown', { method: 'POST', body: JSON.stringify({ text: read('README.md', 'utf8'), mode: 'gfm', context: `${p.github}/${p.github}` }) })).text();

// 2. Inline every image so the preview is one portable file.
const mime = { svg: 'image/svg+xml', webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg' };
const dataUri = (rel) => {
  const file = rel.startsWith('https://raw.githubusercontent.com/') ? `preview/assets/${rel.split('/').pop()}` : rel;
  if (!existsSync(new URL(file, root))) throw new Error(`Missing image for preview: ${file}`);
  return `data:${mime[file.split('.').pop()]};base64,${read(file).toString('base64')}`;
};
const body = html.replace(/(src|srcset)="([^"]+)"/g, (m, attr, url) =>
  /^(assets\/|https:\/\/raw\.githubusercontent\.com\/)/.test(url) ? `${attr}="${dataUri(url)}"` : m);

// 3. github-markdown-css, re-scoped so a forced theme works as well as the OS setting.
const css = await (await fetch('https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.9.0/github-markdown.min.css')).text();
const block = (scheme) => {
  const start = css.indexOf(`@media (prefers-color-scheme: ${scheme}){`);
  const open = css.indexOf('{', css.indexOf('{', start) + 1);
  return css.slice(open + 1, css.indexOf('}', open));
};
const [dark, light] = [block('dark'), block('light')];
const base = css.replace(/@media \(prefers-color-scheme: (dark|light)\)\{[^{]+\{[^}]*\}\}/g, '');
const mdCss = `${base}
.markdown-body{${light}}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .markdown-body{${dark}}}
:root[data-theme="dark"] .markdown-body{${dark}}`;

// 4. Sidebar data: avatar + the proposed profile settings and pins.
const avatar = `data:image/jpeg;base64,${(await sharp(fileURLToPath(new URL('../portfolio/src/assets/hadi.jpg', root))).resize(296, 296).jpeg({ quality: 85 }).toBuffer()).toString('base64')}`;
const settings = JSON.parse(read('profile-settings.json', 'utf8'));
const pins = await Promise.all(settings.pins.map(async (name) => (await gh(`repos/${p.github}/${name}`)).json()));
const langColor = { TypeScript: '#3178c6', JavaScript: '#f1e05a', HTML: '#e34c26' };
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const pinCards = pins.map((r) => `<div class="pin"><div class="pin-top"><svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/></svg><a>${esc(r.name)}</a><span class="label">Public</span></div>
<p class="${r.description ? '' : 'none'}">${esc(r.description) || 'No description, website, or topics provided.'}</p>
<div class="meta">${r.language ? `<span><i style="background:${langColor[r.language] ?? '#8b949e'}"></i>${esc(r.language)}</span>` : ''}${r.stargazers_count ? `<span>★ ${r.stargazers_count}</span>` : ''}</div></div>`).join('');

const page = `<title>GitHub Profile v2</title>
<style>
${mdCss}
:root{--bg:#ffffff;--fg:#1f2328;--muted:#59636e;--border:#d1d9e0;--link:#0969da;--head:#f6f8fa;--bar:#fff8c5;--barfg:#3b2300;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0d1117;--fg:#f0f6fc;--muted:#9198a1;--border:#3d444d;--link:#4493f8;--head:#010409;--bar:#1f2a3a;--barfg:#c9d7ea;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0d1117;--fg:#f0f6fc;--muted:#9198a1;--border:#3d444d;--link:#4493f8;--head:#010409;--bar:#1f2a3a;--barfg:#c9d7ea;color-scheme:dark}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif;margin:0}
.bar{position:sticky;top:env(safe-area-inset-top,0px);z-index:9;display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between;padding:8px 16px;background:var(--bar);color:var(--barfg);font-size:13px;border-bottom:1px solid var(--border)}
.seg{display:inline-flex;border:1px solid var(--border);border-radius:8px;overflow:hidden}
.seg button{all:unset;cursor:pointer;padding:4px 12px;font-weight:600}
.seg button[aria-pressed="true"]{background:var(--link);color:#fff}
header.gh{background:var(--head);border-bottom:1px solid var(--border);padding:16px 16px 0}
header.gh .top{display:flex;align-items:center;gap:12px;font-weight:600;max-width:1280px;margin:0 auto}
header.gh nav{display:flex;gap:4px;max-width:1280px;margin:12px auto 0;overflow-x:auto}
header.gh nav span{padding:8px 12px;color:var(--fg);white-space:nowrap;border-bottom:2px solid transparent}
header.gh nav span.on{border-color:#fd8c73;font-weight:600}
main{display:grid;grid-template-columns:296px minmax(0,1fr);gap:24px;max-width:1280px;margin:0 auto;padding:24px 32px}
.side img{width:100%;border-radius:50%;border:1px solid var(--border)}
.side h1{margin:16px 0 0;font-size:24px;line-height:1.25;font-weight:600}
.side .login{font-size:20px;font-weight:300;color:var(--muted)}
.side .bio{font-size:16px;margin:16px 0}
.side .edit{display:block;text-align:center;padding:5px;border:1px solid var(--border);border-radius:6px;font-weight:600;background:var(--head);margin-bottom:16px}
.side ul{list-style:none;padding:0;margin:0}.side li{margin:4px 0}.side a{color:var(--link);text-decoration:none}
.side .muted{color:var(--muted)}
.box{border:1px solid var(--border);border-radius:6px;padding:24px}
.box .file{font:12px ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--muted);margin-bottom:16px}
.markdown-body{background:transparent!important}
h2.pins{font-size:16px;font-weight:400;margin:24px 0 8px}
.pingrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.pin{border:1px solid var(--border);border-radius:6px;padding:16px;display:flex;flex-direction:column;gap:8px}
.pin-top{display:flex;align-items:center;gap:8px;color:var(--muted)}.pin-top a{color:var(--link);font-weight:600}
.label{margin-left:auto;border:1px solid var(--border);border-radius:2em;padding:0 7px;font-size:12px;font-weight:500}
.pin p{margin:0;color:var(--muted);font-size:12px;flex:1}.pin p.none{font-style:italic;opacity:.7}
.meta{display:flex;gap:16px;color:var(--muted);font-size:12px}.meta i{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:4px;vertical-align:-1px}
@media (max-width:767px){main{grid-template-columns:minmax(0,1fr);padding:16px}.side img{width:25%;float:left;margin-right:16px}.side h1{margin-top:6px}.side .bio{clear:both;padding-top:12px}.pingrid{grid-template-columns:minmax(0,1fr)}.box{padding:16px}}
</style>
<div class="bar"><span><b>Preview</b> · not published · rendered by GitHub's Markdown API</span>
<span class="seg" role="group" aria-label="Theme"><button data-t="auto" aria-pressed="true">Auto</button><button data-t="dark" aria-pressed="false">Dark</button><button data-t="light" aria-pressed="false">Light</button></span></div>
<header class="gh"><div class="top"><svg viewBox="0 0 16 16" width="32" height="32"><path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>${esc(p.github)}</div>
<nav><span class="on">Overview</span><span>Repositories</span><span>Projects</span><span>Packages</span><span>Stars</span></nav></header>
<main>
<aside class="side"><img src="${avatar}" alt="">
<h1>${esc(settings.name)}</h1><div class="login">${esc(p.github)}</div>
<div class="bio">${esc(settings.bio)}</div>
<div class="edit">Edit profile</div>
<ul><li class="muted">👥 1 follower · 0 following</li><li>📍 ${esc(settings.location)}</li><li>🔗 <a>${esc(settings.blog.replace('https://', ''))}</a></li><li>💼 ${settings.hireable ? 'Available for hire' : ''}</li></ul>
</aside>
<section>
<div class="box"><div class="file">${esc(p.github)} / README.md</div>
<article class="markdown-body">${body}</article></div>
<h2 class="pins">Pinned</h2>
<div class="pingrid">${pinCards}</div>
</section>
</main>
<script>
// Mimics GitHub's <themed-picture>: a forced theme turns color-scheme <source> queries on/off.
const root = document.documentElement;
const sources = [...document.querySelectorAll('picture source')].map((s) => [s, s.media]);
function apply(t) {
  if (t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
  for (const [s, media] of sources) {
    if (!media.includes('prefers-color-scheme')) continue;
    s.media = t === 'auto' ? media : media.replace(/\\(prefers-color-scheme: (dark|light)\\)/, (m, v) => (v === t ? 'all' : 'not all'));
  }
  document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === t)));
}
document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => apply(b.dataset.t)));
const initial = root.getAttribute('data-theme');
if (initial === 'dark' || initial === 'light') apply(initial);
new URLSearchParams(location.search).get('theme') && apply(new URLSearchParams(location.search).get('theme'));
</script>
`;
mkdirSync(new URL('preview/', root), { recursive: true });
writeFileSync(new URL('preview/index.html', root), page);
console.log(`preview/index.html written (${(page.length / 1024).toFixed(0)} KB)`);
