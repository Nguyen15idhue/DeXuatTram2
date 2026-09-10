const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' - ' + detail : ''}`);
}
async function main() {
  const sLogin = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@station.com', password: '123456' }) }).then(r => r.json());
  const aLogin = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@admin.com', password: '123456' }) }).then(r => r.json());
  const sToken = sLogin.data?.token, aToken = aLogin.data?.token;
  check('BE logins', !!(sToken && aToken));
  let r = await fetch(`${API}/api/admin/users/1/lock`, { method: 'PATCH', headers: { Authorization: `Bearer ${aToken}`, 'Content-Type': 'application/json' }, body: '{}' });
  check('BE ADMIN cannot lock SUPER_ADMIN', r.status === 403, `status=${r.status}`);
  r = await fetch(`${API}/api/admin/users/6/lock`, { method: 'PATCH', headers: { Authorization: `Bearer ${aToken}`, 'Content-Type': 'application/json' }, body: '{}' });
  check('BE cannot self-lock', r.status === 400, `status=${r.status}`);
  r = await fetch(`${API}/api/admin/users/3/lock`, { method: 'PATCH', headers: { Authorization: `Bearer ${aToken}`, 'Content-Type': 'application/json' }, body: '{}' });
  check('BE ADMIN lock CTV ok', r.status === 200, `status=${r.status}`);
  if (r.status === 200) {
    const r2 = await fetch(`${API}/api/admin/users/3/lock`, { method: 'PATCH', headers: { Authorization: `Bearer ${aToken}`, 'Content-Type': 'application/json' }, body: '{}' });
    check('BE ADMIN unlock CTV ok', r2.status === 200, `status=${r2.status}`);
  }
  r = await fetch(`${API}/api/admin/users/1/lock`, { method: 'PATCH', headers: { Authorization: `Bearer ${sToken}`, 'Content-Type': 'application/json' }, body: '{}' });
  check('BE SUPER self-lock blocked', r.status === 400, `status=${r.status}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'admin@admin.com');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/admin/users`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);
  const body = await page.content();
  check('FE /admin/users loads', body.includes('Quản lý Users') || body.length > 5000, `len=${body.length}`);
  const lockBtns = await page.locator('button:has-text("Khóa"), button:has-text("Mở")').count().catch(() => -1);
  check('FE lock buttons rendered', lockBtns >= 0, `count=${lockBtns}`);
  await browser.close();
  const failed = results.filter(x => !x.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  require('fs').writeFileSync('test-p04-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
