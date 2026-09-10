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
  const HJ = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const evil = { rowNumber: 2, fixedData: { owner_name: 'H16', owner_phone: '123', address: 'H16', latitude: 21.0286, longitude: 105.8542, status: 'PENDING' }, dynamicData: { province: 'Thành phố Hà Nội' } };
  const before = await fetch(`${API}/api/admin/proposals?page=1&limit=1`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).then(j => j.pagination?.total);
  const cf = await fetch(`${API}/api/admin/excel/import/confirm`, { method: 'POST', headers: HJ, body: JSON.stringify({ entity: 'station_proposals', rows: [evil] }) }).then(r => r.json().then(j => ({ status: r.status, j })));
  check('BE tampered confirm rejected', cf.status === 400 && cf.j.data?.imported === 0, `status=${cf.status}`);
  const after = await fetch(`${API}/api/admin/proposals?page=1&limit=1`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).then(j => j.pagination?.total);
  check('BE rollback intact', before === after, `${before}->${after}`);

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
  const exportBtn = await page.locator('button:has-text("Export")').count();
  const txt = await page.locator('body').innerText();
  check('FE proposals page intact', exportBtn > 0 && txt.includes('Quản lý Đề xuất'), `export=${exportBtn}`);
  check('FE no page errors', errs.length === 0, errs.join('|').slice(0, 150));
  await browser.close();
  const failed = results.filter(x => !x.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  require('fs').writeFileSync('test-h16-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
