const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' - ' + detail : ''}`);
}
async function loginAs(page, email) {
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
}
async function main() {
  const ct = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'user2@example.com', password: '123456' }) }).then(r => r.json()).then(j => j.data?.token);
  const r = await fetch(`${API}/api/admin/data-lists/17`, { headers: { Authorization: `Bearer ${ct}` } });
  check('BE CTV admin data-list blocked', r.status === 403, `status=${r.status}`);
  const rp = await fetch(`${API}/api/data-lists/17`);
  check('BE public data-list for forms', rp.status === 200, `status=${rp.status}`);

  const browser = await chromium.launch({ headless: true });
  const ctx1 = await browser.newContext();
  const ctv = await ctx1.newPage();
  await loginAs(ctv, 'user2@example.com');
  await ctv.goto(`${BASE}/my-proposals`);
  await ctv.waitForLoadState('networkidle');
  await ctv.waitForTimeout(3000);
  let txt = await ctv.locator('body').innerText();
  check('FE CTV my-proposals loads (form data-lists via public)', txt.includes('Đề xuất của tôi'), txt.slice(0, 100).replace(/\n/g, ' '));
  const ctx2 = await browser.newContext();
  const sup = await ctx2.newPage();
  await loginAs(sup, 'admin@station.com');
  await sup.goto(`${BASE}/admin/data-lists`);
  await sup.waitForLoadState('networkidle');
  await sup.waitForTimeout(3000);
  txt = await sup.locator('body').innerText();
  check('FE super data-lists admin loads', txt.includes('Data') || txt.length > 3000, txt.slice(0, 100).replace(/\n/g, ' '));
  await browser.close();
  const failed = results.filter(x => !x.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  require('fs').writeFileSync('test-h05-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
