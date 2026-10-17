const { test } = require('@playwright/test');
const FE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const API = process.env.E2E_API_URL || 'http://localhost:3000';
test('probe admin ev table', async ({ page }) => {
  const login = await page.request.post(`${API}/api/auth/login`, { data: { email: 'admin@station.com', password: '123456' } });
  const token = (await login.json()).data.token;
  await page.goto(`${FE}/login`);
  await page.evaluate((t) => { localStorage.setItem('token', t); localStorage.removeItem('remember_until'); }, token);
  await page.goto(`${FE}/admin/ev-reports`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  console.log('ROWS=' + await page.locator('tbody tr').count());
  console.log('TABLE=' + (await page.locator('table').first().innerText().catch(() => 'NO_TABLE')).slice(0, 400));
  console.log('H1=' + await page.locator('h1').first().innerText().catch(() => 'NO_H1'));
});
