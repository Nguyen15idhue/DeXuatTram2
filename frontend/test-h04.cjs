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
  const st = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'sales_test@example.com', password: '123456' }) }).then(r => r.json()).then(j => j.data?.token);
  const r = await fetch(`${API}/api/admin/queue-logs/1/retry`, { method: 'POST', headers: { Authorization: `Bearer ${st}`, 'Content-Type': 'application/json' }, body: '{}' });
  check('BE sales retry blocked', r.status === 403, `status=${r.status}`);

  const browser = await chromium.launch({ headless: true });
  const ctx1 = await browser.newContext();
  const sales = await ctx1.newPage();
  await loginAs(sales, 'sales_test@example.com');
  await sales.goto(`${BASE}/admin/audit-log`);
  await sales.waitForLoadState('networkidle');
  await sales.waitForTimeout(2500);
  const retryS = await sales.locator('button[title="Retry"]').count();
  const cancelS = await sales.locator('button[title="Cancel"]').count();
  check('FE sales no Retry/Cancel', retryS === 0 && cancelS === 0, `retry=${retryS} cancel=${cancelS}`);
  const ctx2 = await browser.newContext();
  const sup = await ctx2.newPage();
  await loginAs(sup, 'admin@station.com');
  await sup.goto(`${BASE}/admin/audit-log`);
  await sup.waitForLoadState('networkidle');
  await sup.waitForTimeout(2500);
  const txt = await sup.locator('body').innerText();
  check('FE super audit-log loads', txt.includes('Audit') || txt.includes('Nhật ký') || txt.length > 3000, txt.slice(0, 100).replace(/\n/g, ' '));
  await browser.close();
  const failed = results.filter(x => !x.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  require('fs').writeFileSync('test-h04-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
