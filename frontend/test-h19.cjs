const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' - ' + detail : ''}`);
}
async function main() {
  const l = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'user2@example.com', password: '123456' }) }).then(r => r.json());
  const pay = JSON.parse(Buffer.from(l.data.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  check('BE token 12h + version', (pay.exp - pay.iat) === 43200 && pay.tokenVersion !== undefined, `exp-iat=${pay.exp - pay.iat} v=${pay.tokenVersion}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => localStorage.setItem('token', 'invalid.token.here'));
  await page.goto(`${BASE}/admin`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  check('FE invalid token redirected to login', page.url().includes('/login'), page.url());
  check('FE stale token cleared', await page.evaluate(() => !localStorage.getItem('token')), 'localStorage');

  const ctx2 = await browser.newContext();
  const ok = await ctx2.newPage();
  await ok.goto(`${BASE}/login`);
  await ok.waitForLoadState('networkidle');
  await ok.fill('input[type="email"]', 'admin@station.com');
  await ok.fill('input[type="password"]', '123456');
  await ok.click('button[type="submit"]');
  await ok.waitForTimeout(2500);
  await ok.goto(`${BASE}/admin`);
  await ok.waitForLoadState('networkidle');
  await ok.waitForTimeout(2500);
  check('FE valid session unaffected', ok.url().includes('/admin') && !(await ok.locator('body').innerText()).includes('Đăng nhập'), ok.url());
  await browser.close();
  const failed = results.filter(x => !x.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  require('fs').writeFileSync('test-h19-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
