const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' - ' + detail : ''}`);
}
async function main() {
  const at = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@admin.com', password: '123456' }) }).then(r => r.json()).then(j => j.data?.token);
  let r = await fetch(`${API}/api/admin/users/6`, { method: 'PUT', headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ full_name: 'Admin', email: 'admin@admin.com', phone: '0987456456', role: 'ADMIN', status: 'LOCKED' }) });
  check('BE admin self-lock via PUT blocked', r.status === 403, `status=${r.status}`);

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
  let txt = await page.locator('body').innerText();
  check('FE users page loads', txt.includes('Quản lý Users'), txt.slice(0, 80).replace(/\n/g, ' '));
  const pwBtn = await page.locator('button:has-text("Đổi MK")').first();
  if (await pwBtn.count() > 0) {
    await pwBtn.click();
    await page.waitForTimeout(1000);
    txt = await page.locator('body').innerText();
    check('FE password modal opens', txt.includes('Đổi mật khẩu'), 'modal');
  } else check('FE password modal opens', false, 'no Đổi MK button');
  await browser.close();
  const failed = results.filter(x => !x.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  require('fs').writeFileSync('test-h06-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
