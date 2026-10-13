const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 140)));
  const login = await page.request.post(`${API}/api/auth/login`, { data: { email: 'admin@station.com', password: '123456' } });
  const { data } = await login.json();
  await page.goto(`${BASE}/login`);
  await page.evaluate((t) => localStorage.setItem('token', t), data.token);
  await page.goto(`${BASE}/map`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);
  await page.click('.map-filter-toggle');
  await page.waitForTimeout(500);
  await page.getByLabel('Quy hoạch').check();
  await page.getByRole('button', { name: 'Hoạt động', exact: true }).click();
  await page.getByRole('button', { name: 'Cấp 1', exact: true }).click();
  await page.waitForTimeout(3000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-plan60-filter.png' });
  console.log(errs.length === 0 ? 'PASS: khong loi runtime' : `FAIL: ${errs.join(' | ')}`);
  await browser.close();
}
main();
