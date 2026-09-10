const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' - ' + detail : ''}`);
}
async function main() {
  const token = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@station.com', password: '123456' }) }).then(r => r.json()).then(j => j.data?.token);
  const pv = await fetch(`${API}/api/formulas/preview`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ expression: '1+1', scope: {} }) });
  check('BE formulas API alive after refactor', pv.status === 200, `status=${pv.status}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 100)));
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'admin@station.com');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/admin/stations`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);
  const txt = await page.locator('body').innerText();
  check('FE stations page intact', txt.includes('Trạm') || txt.includes('Station'), txt.slice(0, 80).replace(/\n/g, ' '));
  check('FE no page errors', errs.length === 0, errs.join('|').slice(0, 150));
  await browser.close();
  const failed = results.filter(x => !x.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  require('fs').writeFileSync('test-h17-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
