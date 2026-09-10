const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' - ' + detail : ''}`);
}
async function main() {
  const st = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'sales_test@example.com', password: '123456' }) }).then(r => r.json()).then(j => j.data?.token);
  let r = await fetch(`${API}/api/admin/proposals/404`, { method: 'PUT', headers: { Authorization: `Bearer ${st}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ description: 'HACK' }) });
  check('BE sales full PUT blocked', r.status === 403, `status=${r.status}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'sales_test@example.com');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/admin/proposals`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);
  const editBtns = await page.locator('button:has-text("Sửa")').count();
  check('FE sales no edit buttons in table', editBtns === 0, `count=${editBtns}`);
  await page.goto(`${BASE}/admin/proposals/edit=365`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  const txt = await page.locator('body').innerText();
  check('FE sales direct /edit= forced to view', !txt.includes('(chỉnh sửa)') && !txt.includes('chỉnh sửa'), txt.slice(0, 150).replace(/\n/g, ' '));
  await browser.close();
  const failed = results.filter(x => !x.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  require('fs').writeFileSync('test-h02-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
