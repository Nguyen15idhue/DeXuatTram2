const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' - ' + detail : ''}`);
}
async function main() {
  const ct = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'user2@example.com', password: '123456' }) }).then(r => r.json()).then(j => j.data?.token);
  const H = { Authorization: `Bearer ${ct}`, 'Content-Type': 'application/json' };
  const mk = (o) => ({ latitude: 8.5, longitude: 104.5, owner_name: 'H13T', owner_phone: '0900000013', address: 'H13', province: 'Thành phố Hà Nội', ...o });
  const c = await fetch(`${API}/api/proposals`, { method: 'POST', headers: H, body: JSON.stringify(mk()) }).then(r => r.json());
  const id = c.data?.id;
  check('BE fixture created', !!id, `id=${id}`);
  let r = await fetch(`${API}/api/my-proposals/${id}`, { method: 'PUT', headers: H, body: JSON.stringify({ owner_name: 'H13T', owner_phone: '123', address: 'H13' }) });
  check('BE bad phone rejected', r.status === 400, `status=${r.status}`);
  r = await fetch(`${API}/api/my-proposals/${id}`, { method: 'PUT', headers: H, body: JSON.stringify({ owner_name: 'H13T', owner_phone: '0900000013', address: 'H13', latitude: 999 }) });
  check('BE bad coords rejected', r.status === 400, `status=${r.status}`);
  r = await fetch(`${API}/api/my-proposals/${id}`, { method: 'PUT', headers: H, body: JSON.stringify({ owner_name: 'H13T', owner_phone: '0900000013', address: 'H13 ok' }) });
  check('BE valid PUT ok', r.status === 200, `status=${r.status}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 100)));
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'user2@example.com');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/my-proposals`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  const txt = await page.locator('body').innerText();
  check('FE my-proposals lists fixture', txt.includes('H13'), txt.slice(0, 100).replace(/\n/g, ' '));
  check('FE no page errors', errs.length === 0, errs.join('|').slice(0, 150));
  await browser.close();

  await fetch(`${API}/api/my-proposals/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${ct}` } });
  const failed = results.filter(x => !x.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  require('fs').writeFileSync('test-h13-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
