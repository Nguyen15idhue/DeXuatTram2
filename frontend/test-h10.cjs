const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' - ' + detail : ''}`);
}
async function main() {
  let r = await fetch(`${API}/tiles/abc/1/1`);
  check('BE invalid tile returns image not JSON', r.status === 200 && (r.headers.get('content-type') || '').includes('image/png'), `status=${r.status}`);
  r = await fetch(`${API}/tiles/2/99/1`);
  check('BE out-of-range tile fallback image', r.status === 200 && (r.headers.get('content-type') || '').includes('image/png'), `status=${r.status}`);
  r = await fetch(`${API}/tiles/10/10/10?url=https://evil.example.com/x.png`);
  const buf = Buffer.from(await r.arrayBuffer());
  check('BE ?url= ignored (open-proxy closed)', r.status === 200 && !buf.includes('evil'), `bytes=${buf.length}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'admin@station.com');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/map`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(4000);
  const tiles = await page.locator('.leaflet-tile').count();
  const broken = await page.locator('.leaflet-tile[src=""]').count().catch(() => 0);
  check('FE map tiles render (fallback ok)', tiles > 0, `tiles=${tiles}`);
  const markers = await page.locator('.leaflet-marker-icon').count();
  check('FE map markers still show', markers > 0, `markers=${markers}`);
  await browser.close();
  const failed = results.filter(x => !x.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  require('fs').writeFileSync('test-h10-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
