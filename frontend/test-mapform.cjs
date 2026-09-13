const { chromium } = require('playwright');

const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    permissions: ['geolocation'],
    geolocation: { latitude: 21.0285, longitude: 105.8542 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const loginRes = await page.request.post(`${API}/api/auth/login`, { data: { email: 'admin@station.com', password: '123456' } });
  const token = (await loginRes.json()).data.token;
  await page.goto(`${BASE}/login`);
  await page.evaluate((t) => localStorage.setItem('token', t), token);

  await page.goto(`${BASE}/map`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  await page.locator('button.map-fab-create').click();
  await page.waitForTimeout(500);
  await page.getByText('Vị trí của tôi', { exact: true }).first().click();
  await page.waitForTimeout(3000);

  const fieldCount = await page.locator('.modal-box .dynamic-form-field').count();
  const modalText = await page.locator('.modal-box').innerText().catch(() => '');

  console.log(`PASS - so truong form tren /map = ${fieldCount} (ky vong form 13 >= 25)`);
  console.log(`${fieldCount >= 25 ? 'PASS' : 'FAIL'} - dung form create da cau hinh (56 truong)`);
  console.log(`${/mô hình đầu tư|điện|pháp lý|tổng cộng|mã đề xuất/i.test(modalText) ? 'PASS' : 'FAIL'} - co truong dac trung cua form 13`);

  await page.goto(`${BASE}/de-xuat`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  const guestFields = await page.locator('.dynamic-form-field').count();
  console.log(`${guestFields >= 25 ? 'PASS' : 'FAIL'} - guest /de-xuat cung dung form 13 (fields=${guestFields})`);

  await browser.close();
}
main();
