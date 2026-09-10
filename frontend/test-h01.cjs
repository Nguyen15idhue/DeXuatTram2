const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' - ' + detail : ''}`);
}
async function main() {
  const at = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@station.com', password: '123456' }) }).then(r => r.json()).then(j => j.data?.token);
  const st = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'sales_test@example.com', password: '123456' }) }).then(r => r.json()).then(j => j.data?.token);
  const a = await fetch(`${API}/api/admin/dashboard`, { headers: { Authorization: `Bearer ${at}` } }).then(r => r.json());
  check('BE admin dashboard has stations', a.data?.stations?.total > 0, `total=${a.data?.stations?.total}`);
  const s = await fetch(`${API}/api/admin/dashboard`, { headers: { Authorization: `Bearer ${st}` } }).then(r => r.json());
  check('BE sales dashboard hides stations', s.data?.stations === null && s.data?.scope === 'branch', `stations=${JSON.stringify(s.data?.stations)}`);
  check('BE sales keeps branch proposals', s.data?.proposals?.total !== undefined, `total=${s.data?.proposals?.total}`);
  const sl = await fetch(`${API}/api/stations?page=1&limit=5`).then(r => r.json());
  check('BE station list still viewable', sl.success === true);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'sales_test@example.com');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/admin`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);
  let txt = await page.locator('body').innerText();
  check('FE sales dashboard no Stations card', !txt.includes('Stations'), txt.slice(0, 150).replace(/\n/g, ' '));
  check('FE sales branch badge', txt.includes('Nhánh của bạn'), 'badge');
  await page.goto(`${BASE}/admin/stations`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);
  txt = await page.locator('body').innerText();
  check('FE sales still views stations', txt.includes('Trạm') || txt.length > 3000, txt.slice(0, 120).replace(/\n/g, ' '));
  await browser.close();
  const failed = results.filter(x => !x.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  require('fs').writeFileSync('test-h01-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
