// Captures real screenshots of the live sites in src/content/work and products.
// Usage: node scripts/capture-work.mjs   (re-run whenever a site changes)
// Output: src/assets/work/<id>.png (desktop, tall: used for scroll-on-hover frames)
//         src/assets/work/<id>-mobile.png (390px wide, for phone frames)
import { chromium } from 'playwright';

const sites = [
  { id: 'supervise', url: 'https://www.supervise.work/' },
  { id: 'whatever-ai', url: 'https://www.whatever-ai.com/' },
  { id: 'vectum', url: 'https://vectum.it/', height: 970 },
  { id: 'artbeak', url: 'https://www.artbeak.com/' },
  { id: 'hamstalk', url: 'https://www.hamstalk.com/', mobile: true },
];

// Hide consent banners and chat widgets rather than clicking "accept" on anyone's terms.
const hideOverlays = `
  [id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i],
  [id*="onetrust" i], [class*="cc-window" i], #CybotCookiebotDialog,
  iframe[title*="chat" i], [id*="intercom" i], [class*="crisp" i], [id*="hubspot" i]
  { display: none !important; }`;

const browser = await chromium.launch();
for (const site of sites) {
  for (const mode of site.mobile ? ['desktop', 'mobile'] : ['desktop']) {
    const mobile = mode === 'mobile';
    const page = await browser.newPage({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      deviceScaleFactor: mobile ? 2 : 1,
      reducedMotion: 'reduce',
    });
    await page.goto(site.url, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {});
    await page.addStyleTag({ content: hideOverlays });
    // Scroll through once so lazy images and reveal animations load, then return to the top.
    await page.evaluate(async () => {
      for (let y = 0; y < 4000; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    // Hide any fixed/sticky overlay that mentions cookies (custom consent banners).
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('body *')) {
        const pos = getComputedStyle(el).position;
        if ((pos === 'fixed' || pos === 'sticky') && /cookie/i.test(el.textContent ?? '') && el.textContent.length < 600) {
          el.style.setProperty('display', 'none', 'important');
        }
      }
    });
    await page.waitForTimeout(1200);
    const file = `src/assets/work/${site.id}${mobile ? '-mobile' : ''}.png`;
    const height = mobile ? 844 : (site.height ?? 2700);
    await page.screenshot({ path: file, fullPage: !mobile, clip: { x: 0, y: 0, width: mobile ? 390 : 1440, height } });
    console.log('saved', file);
    await page.close();
  }
}
await browser.close();
