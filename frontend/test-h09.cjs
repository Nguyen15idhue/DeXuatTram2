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
  const pv = await fetch(`${API}/api/formulas/preview`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ expression: '1000+234', scope: {} }) }).then(r => r.json());
  check('BE formula preview returns raw number', pv.success && Number(pv.data?.result ?? pv.result) === 1234, JSON.stringify(pv).slice(0, 120));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'admin@station.com');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/my-proposals`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  const btn = await page.locator('button:has-text("Tạo đề xuất")').first();
  if (await btn.count() > 0) {
    await btn.click();
    await page.waitForTimeout(2500);
  }
  const txt = await page.locator('body').innerText();
  check('FE DynamicForm create renders', txt.length > 1000, `len=${txt.length}`);
  check('FE no page errors', errs.length === 0, errs.join(' | ').slice(0, 200));
  await browser.close();
  const failed = results.filter(x => !x.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  require('fs').writeFileSync('test-h09-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
