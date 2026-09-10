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
  const before = await fetch(`${API}/api/admin/proposals/2`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).then(j => j.data?.status);
  check('BE fixture proposal 2 readable', !!before, `status=${before}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'admin@station.com');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/admin/proposals`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);
  const vals = await page.locator('table select').first().evaluate(el => ({
    sel: el.value,
    opts: Array.from(el.options).map(o => o.value)
  })).catch(() => null);
  check('FE row select value is an option value', !!vals && vals.opts.includes(vals.sel), JSON.stringify(vals));
  const labels = await page.locator('table select').first().evaluate(el => Array.from(el.options).map(o => o.text)).catch(() => []);
  check('FE row select sends value not label', !!vals && vals.opts.every(v => ['PENDING', 'REVIEWING', 'APPROVED', 'REJECTED'].includes(v)), labels.join(','));
  await browser.close();

  const r = await fetch(`${API}/api/admin/proposals/2/status`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'REVIEWING' }) });
  check('BE status PUT with value ok', r.status === 200, `status=${r.status}`);
  await fetch(`${API}/api/admin/proposals/2/status`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: before }) });
  const failed = results.filter(x => !x.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  require('fs').writeFileSync('test-h08-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
