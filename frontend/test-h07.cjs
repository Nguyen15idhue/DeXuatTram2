const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' - ' + detail : ''}`);
}
async function login(e) {
  return fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: '123456' }) }).then(r => r.json()).then(j => j.data?.token);
}
async function main() {
  const st = await login('sales_test@example.com');
  const ct = await login('user2@example.com');
  let r = await fetch(`${API}/api/files/1060/download`, { headers: { Authorization: `Bearer ${st}` } });
  check('BE sales branch file ok', r.status === 200, `status=${r.status}`);
  r = await fetch(`${API}/api/files/1060/download`, { headers: { Authorization: `Bearer ${ct}` } });
  check('BE unrelated CTV blocked', r.status === 403, `status=${r.status}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'sales_test@example.com');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/admin/proposals/view=365`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  const txt = await page.locator('body').innerText();
  check('FE sales branch proposal view loads', txt.includes('365'), txt.slice(0, 100).replace(/\n/g, ' '));
  await browser.close();
  const failed = results.filter(x => !x.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  require('fs').writeFileSync('test-h07-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
