// Generates social preview images (public/og/<key>.png, 1200×630) for every built
// page, plus PNG app icons, using Playwright with the site's own fonts.
// Usage: pnpm build:preview && pnpm og   (re-run when page titles change, then rebuild)
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { chromium } from 'playwright';

const DIST = 'dist/client';
const SKIP = /^(brand|404|contact\/thanks)$/;
// Fonts are embedded as data URLs: pages set with setContent() cannot load file:// URLs.
const font = async (p) => `data:font/woff2;base64,${(await readFile(join('node_modules', p))).toString('base64')}`;
const fonts = {
  sans: await font('@fontsource-variable/schibsted-grotesk/files/schibsted-grotesk-latin-wght-normal.woff2'),
  mono: await font('@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2'),
};

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (p.endsWith('.html')) yield p;
  }
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const card = ({ title, path }) => `<!doctype html><html><head><style>
@font-face{font-family:S;src:url(${fonts.sans}) format('woff2');font-weight:400 900}
@font-face{font-family:M;src:url(${fonts.mono}) format('woff2')}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#F2F3EF;color:#121412;font-family:S;position:relative;overflow:hidden}
.grid{position:absolute;inset:0;background-image:linear-gradient(90deg,#D3D6D0 1px,transparent 1px);background-size:100px 100%;opacity:.55}
.wrap{position:absolute;inset:60px 66px;display:flex;flex-direction:column;justify-content:space-between}
.top,.bottom{display:flex;justify-content:space-between;align-items:center}
.logo{font-size:40px;font-weight:680;letter-spacing:-.035em;position:relative}
.i{position:relative;display:inline-block}.i:before{content:'';position:absolute;left:50%;top:1px;width:8px;height:8px;transform:translateX(-50%);background:#129A4C}
.path{font-family:M;font-size:20px;color:#555A54}
h1{font-size:${title.length > 48 ? 64 : 76}px;line-height:1.04;letter-spacing:-.04em;font-weight:600;max-width:960px}
.tag{font-family:M;font-size:20px;padding:10px 16px;border:1.5px solid #121412;border-radius:6px;background:#FAFAF8;display:flex;gap:10px;align-items:center}
.tag .from{color:#555A54;text-decoration:line-through}.dot{width:10px;height:10px;border-radius:50%;background:#129A4C}
.kick{font-family:M;font-size:20px;color:#555A54}
</style></head><body><div class="grid"></div><div class="wrap">
<div class="top"><div class="logo">Isma<span class="i">ı</span>lApps</div><div class="path">ismailapps.com${esc(path === '/' ? '' : path)}</div></div>
<h1>${esc(title)}</h1>
<div class="bottom"><div class="tag"><span class="from">v0.1 prototype</span> → <span class="dot"></span> v1.0 production</div><div class="kick">Software product studio</div></div>
</div></body></html>`;

const pages = [{ key: 'default', path: '/', title: 'Past the prototype. SaaS and AI products that hold up with real users.' }];
for await (const file of walk(DIST)) {
  const rel = relative(DIST, file).replace(/\.html$/, '').replace(/(^|\/)index$/, '');
  if (SKIP.test(rel)) continue;
  const html = await readFile(file, 'utf8');
  const raw = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? 'IsmailApps';
  const title = raw.replace(/ · IsmailApps$/, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
  const path = rel === '' ? '/' : `/${rel}`;
  const key = rel === '' ? 'home' : rel.replace(/\//g, '-');
  pages.push({ key, path, title: key === 'home' ? pages[0].title : title });
}

await mkdir('public/og', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const p of pages) {
  await page.setContent(card(p), { waitUntil: 'load' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (![...document.fonts].some((f) => f.status === 'loaded')) throw new Error('fonts did not load');
  });
  await page.screenshot({ path: `public/og/${p.key}.png` });
  console.log('og', p.key);
}

// App icons from the favicon mark.
const svg = await readFile('public/favicon.svg', 'utf8');
for (const [file, size] of [['public/icon-512.png', 512], ['public/apple-touch-icon.png', 180]]) {
  const icon = await browser.newPage({ viewport: { width: size, height: size } });
  await icon.setContent(`<body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  await icon.screenshot({ path: file, omitBackground: true });
  await icon.close();
  console.log('icon', file);
}
await browser.close();
