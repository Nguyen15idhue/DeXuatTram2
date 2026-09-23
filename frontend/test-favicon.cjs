const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const results = [];
const check = (name, ok, extra) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
};

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const hits = {};
  page.on('response', (res) => {
    const u = res.url();
    if (/favicon|apple-touch-icon/.test(u)) hits[u.split('/').pop()] = res.status();
  });
  await page.goto(`${BASE}/login`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);

  const links = await page.evaluate(() => [...document.querySelectorAll('link[rel*="icon"], link[rel="apple-touch-icon"]')].map((l) => ({ rel: l.rel, href: l.getAttribute('href'), type: l.type || '' })));
  check('index.html declares favicon links', links.length >= 3, JSON.stringify(links.map((l) => l.href)));

  for (const f of ['favicon.ico', 'favicon.svg', 'favicon-32.png', 'apple-touch-icon.png']) {
    const res = await ctx.request.get(`${BASE}/${f}`);
    check(`${f} served 200`, res.status() === 200, `status=${res.status()} bytes=${(await res.body()).length}`);
  }
  check('no vite.svg reference', links.every((l) => !String(l.href).includes('vite.svg')));

  await browser.close();
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nTOTAL ${results.length}, FAILED ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
