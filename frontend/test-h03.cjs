const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
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
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await loginAs(page, 'sales_test@example.com');
  await page.goto(`${BASE}/admin/users/3/files`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);
  let txt = await page.locator('body').innerText();
  check('FE sales users/files denied', txt.includes('Không có quyền'), txt.slice(0, 120).replace(/\n/g, ' '));
  await page.goto(`${BASE}/admin/stations/1/files`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);
  txt = await page.locator('body').innerText();
  check('FE sales stations/files allowed', !txt.includes('Không có quyền'), txt.slice(0, 120).replace(/\n/g, ' '));

  const ctx2 = await browser.newContext();
  const admin = await ctx2.newPage();
  await loginAs(admin, 'admin@station.com');
  await admin.goto(`${BASE}/admin/users/3/files`);
  await admin.waitForLoadState('networkidle');
  await admin.waitForTimeout(2500);
  txt = await admin.locator('body').innerText();
  check('FE admin users/files allowed', !txt.includes('Không có quyền'), txt.slice(0, 120).replace(/\n/g, ' '));
  await browser.close();
  const failed = results.filter(x => !x.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  require('fs').writeFileSync('test-h03-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
