const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' - ' + detail : ''}`);
}
async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'admin@station.com');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/admin/proposals/edit=404`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  const txt = await page.locator('body').innerText();
  check('FE /admin/proposals/edit=404 opens edit popup', txt.includes('404') && (txt.includes('Lưu') || txt.includes('Cập nhật') || txt.includes('Sửa')), txt.slice(0, 150).replace(/\n/g, ' '));
  await browser.close();
  const failed = results.filter(x => !x.ok);
  console.log(`TOTAL ${results.length} FAILED ${failed.length}`);
  require('fs').writeFileSync('test-p09-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
