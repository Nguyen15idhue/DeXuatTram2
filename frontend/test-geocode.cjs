const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];

function record(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} - ${name}${detail ? ' :: ' + detail : ''}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  const geocodeCalls = [];
  page.on('response', (resp) => {
    if (resp.url().includes('/api/geocode/reverse')) geocodeCalls.push(resp.status());
  });

  try {
    // login admin (for admin geocode panel)
    const loginRes = await page.request.post(`${API}/api/auth/login`, { data: { email: 'admin@station.com', password: '123456' } });
    const body = await loginRes.json();
    const token = body.data.token;
    await page.goto(`${BASE}/login`);
    await page.evaluate((t) => localStorage.setItem('token', t), token);

    // --- Admin geocode panel ---
    await page.goto(`${BASE}/admin/map-config`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    const panel = await page.getByText('Địa chỉ (Reverse Geocoding)').count();
    record('Admin: co panel cau hinh dia chi', panel > 0);

    await page.waitForFunction(() => {
      const el = document.querySelector('input[placeholder="YOUR_GEOAPIFY_KEY"]');
      return el && el.value && el.value.length > 20;
    }, { timeout: 10000 }).catch(() => {});

    const keyVal = await page.evaluate(() => {
      const el = document.querySelector('input[placeholder="YOUR_GEOAPIFY_KEY"]');
      return el ? el.value : '';
    });
    record('Admin: API key geocode da load tu DB', keyVal.length > 20, `len=${keyVal.length}`);

    const toggle = await page.locator('input.toggle').count();
    record('Admin: co toggle bat/tat tu dong dien', toggle > 0);

    // --- Guest form auto-fill ---
    await page.goto(`${BASE}/de-xuat`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2500);

    const latInput = page.locator('.dynamic-form-field:has-text("Vĩ độ") input').first();
    const lngInput = page.locator('.dynamic-form-field:has-text("Kinh độ") input').first();
    const addrInput = page.locator('.dynamic-form-field:has-text("Địa chỉ") input').first();

    await latInput.fill('21.0285');
    await lngInput.fill('105.8542');
    await page.waitForTimeout(4000);

    const addrVal = await addrInput.inputValue().catch(() => '');
    record('FE: tu dong dien dia chi tu toa do', addrVal.includes('Hà Nội') || addrVal.length > 10, addrVal.slice(0, 60));

    const provinceCellText = await page.locator('.dynamic-form-field:has-text("Tỉnh thành")').first().innerText().catch(() => '');
    record('FE: tu dong dien tinh thanh', provinceCellText.includes('Hà Nội'), provinceCellText.replace(/\s+/g, ' ').slice(0, 60));

    const wardCellText = await page.locator('.dynamic-form-field:has-text("Xã phường")').first().innerText().catch(() => '');
    record('FE: tu dong dien xa phuong', wardCellText.includes('Hoàn Kiếm'), wardCellText.replace(/\s+/g, ' ').slice(0, 60));

    record('FE: co goi API /geocode/reverse', geocodeCalls.length > 0, `calls=${geocodeCalls.join(',')}`);

    // --- Không ghi đè địa chỉ đã nhập ---
    await page.goto(`${BASE}/de-xuat`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2500);
    const addrInput2 = page.locator('.dynamic-form-field:has-text("Địa chỉ") input').first();
    await addrInput2.fill('Địa chỉ người dùng nhập');
    await page.locator('.dynamic-form-field:has-text("Vĩ độ") input').first().fill('10.7769');
    await page.locator('.dynamic-form-field:has-text("Kinh độ") input').first().fill('106.7009');
    await page.waitForTimeout(4000);
    const addrVal2 = await addrInput2.inputValue().catch(() => '');
    record('FE: khong ghi de dia chi da nhap', addrVal2 === 'Địa chỉ người dùng nhập', addrVal2);

    const realErrors = consoleErrors.filter(e => !e.includes('favicon'));
    record('Khong co console error', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

  } catch (err) {
    record('Test runner', false, err.message);
  }

  fs.writeFileSync('test-geocode-results.json', JSON.stringify(results, null, 2));
  const passed = results.filter(r => r.pass).length;
  console.log(`\n== ${passed}/${results.length} PASS ==`);
  await browser.close();
}

main();
