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
  const H = { Authorization: `Bearer ${token}` };
  let r = await fetch(`${API}/api/admin/proposals?search=${encodeURIComponent('TDT_HCM_0005')}`, { headers: H }).then(x => x.json());
  check('BE proposals code search', r.pagination?.total === 1 && r.data?.[0]?.id === 403, `total=${r.pagination?.total}`);
  r = await fetch(`${API}/api/admin/proposals?search=${encodeURIComponent('0901.111.222')}`, { headers: H }).then(x => x.json());
  check('BE proposals dotted phone search', (r.pagination?.total || 0) >= 1, `total=${r.pagination?.total}`);
  r = await fetch(`${API}/api/stations?search=${encodeURIComponent('E.HCM0006')}`).then(x => x.json());
  check('BE stations code search', (r.data || []).length >= 1 && JSON.stringify(r.data).includes('E.HCM0006'), `n=${(r.data || []).length}`);
  r = await fetch(`${API}/api/admin/users?search=${encodeURIComponent('admin@admin.com')}`, { headers: H }).then(x => x.json());
  check('BE users fixed search intact', (r.data || []).length >= 1, `n=${(r.data || []).length}`);

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
  await page.waitForTimeout(2000);
  await page.fill('input[placeholder*="mã đề xuất"]', 'TDT_HCM_0005');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  let txt = await page.locator('body').innerText();
  check('FE proposals code search finds record', txt.includes('TDT_HCM_0005') || txt.includes('403'), txt.slice(0, 120).replace(/\n/g, ' '));
  await page.goto(`${BASE}/admin/stations`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await page.fill('input[placeholder*="mã trạm"]', 'E.HCM0006');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  txt = await page.locator('body').innerText();
  check('FE stations code search finds record', txt.includes('E.HCM0006'), txt.slice(0, 120).replace(/\n/g, ' '));
  check('FE no page errors', errs.length === 0, errs.join('|').slice(0, 150));
  await browser.close();
  const failed = results.filter(x => !x.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  require('fs').writeFileSync('test-search-codes-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
