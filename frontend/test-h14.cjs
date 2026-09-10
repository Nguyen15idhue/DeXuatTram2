const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' - ' + detail : ''}`);
}
async function main() {
  let r = await fetch(`${API}/api/data-lists/4/children?column=xa&parent_column=tinh&parent_value=${encodeURIComponent('Thành phố Hà Nội')}`);
  let j = await r.json();
  check('BE children cascading ok', r.status === 200 && (j.data?.options?.length || 0) > 0, `n=${j.data?.options?.length}`);
  r = await fetch(`${API}/api/data-lists/4/children?column=nope&parent_column=tinh&parent_value=x`);
  check('BE children bad column 400', r.status === 400, `status=${r.status}`);

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
  await page.goto(`${BASE}/admin/proposals`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);
  let txt = await page.locator('body').innerText();
  check('FE proposals page loads (hook regression)', txt.includes('Quản lý Đề xuất'), txt.slice(0, 80).replace(/\n/g, ' '));
  await page.goto(`${BASE}/de-xuat`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);
  txt = await page.locator('body').innerText();
  check('FE guest form loads (cascading intact)', txt.includes('Đề xuất'), txt.slice(0, 80).replace(/\n/g, ' '));
  check('FE no page errors', errs.length === 0, errs.join('|').slice(0, 150));
  await browser.close();
  const failed = results.filter(x => !x.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  require('fs').writeFileSync('test-h14-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
