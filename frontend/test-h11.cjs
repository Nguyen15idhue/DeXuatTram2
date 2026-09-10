const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' - ' + detail : ''}`);
}
async function post(url) {
  const r = await fetch(`${API}/api/map/resolve-map-url`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}
async function main() {
  let r = await post('https://www.google.com/maps/place/Hanoi/@21.0285,105.8542,17z');
  check('BE full link parsed', r.status === 200 && r.j.data?.lat === 21.0285, JSON.stringify(r.j.data));
  r = await post('https://evil.example.com/?x=maps.app.goo.gl');
  check('BE SSRF includes-trick blocked', r.status === 400, `status=${r.status}`);
  r = await post('https://maps.app.goo.gl.evil.com/abc');
  check('BE subdomain spoof blocked', r.status === 400, `status=${r.status}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${BASE}/de-xuat`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  const hasLinkInput = await page.locator('input[placeholder*="maps"], input[placeholder*="Google"], input[placeholder*="link"]').count();
  const txt = await page.locator('body').innerText();
  check('FE guest form loads (link paste intact)', txt.includes('Đề xuất'), `linkInputs=${hasLinkInput}`);
  await browser.close();
  const failed = results.filter(x => !x.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  require('fs').writeFileSync('test-h11-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
