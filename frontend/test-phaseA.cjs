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
  const context = await browser.newContext({
    permissions: ['geolocation'],
    geolocation: { latitude: 21.0285, longitude: 105.8542 },
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  try {
    const loginRes = await page.request.post(`${API}/api/auth/login`, { data: { email: 'admin@station.com', password: '123456' } });
    const body = await loginRes.json();
    await page.goto(`${BASE}/login`);
    await page.evaluate((t) => localStorage.setItem('token', t), body.data.token);

    // --- Map config: click OSM must not crash ---
    await page.goto(`${BASE}/admin/map-config`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await page.getByText('Leaflet + OpenStreetMap').first().click();
    await page.waitForTimeout(2000);
    const heading = await page.getByText('Cấu hình Bản đồ').count();
    record('Map config: bam OSM khong crash', heading > 0);

    // --- Geolocation "Vị trí của tôi" ---
    await page.goto(`${BASE}/map`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3500);

    await page.locator('button.map-fab-create').click();
    await page.waitForTimeout(500);
    await page.getByText('Vị trí của tôi', { exact: true }).first().click();
    await page.waitForTimeout(1500);

    const modalOpen = await page.getByText('Đề xuất trạm mới').count();
    record('Vi tri cua toi: mo form de xuat', modalOpen > 0);

    const coordText = await page.locator('.modal-box').innerText().catch(() => '');
    record('Vi tri cua toi: dien toa do mock (21.0285, 105.8542)', coordText.includes('21.028500') && coordText.includes('105.854200'), coordText.split('\n').find(l => l.includes('Tọa độ')) || '');

    await page.waitForTimeout(4500);
    const addrVal = await page.evaluate(() => {
      const fields = [...document.querySelectorAll('.dynamic-form-field')];
      const f = fields.find(el => el.textContent.includes('Địa chỉ'));
      const input = f && f.querySelector('input');
      return input ? input.value : '';
    });
    record('Vi tri cua toi: tu dong dien dia chi', addrVal.includes('Hà Nội') && addrVal.includes('Việt Nam'), addrVal);

    const realErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('tile') && !e.includes('ERR_CONNECTION_REFUSED') && !e.includes('ERR_NAME_NOT_RESOLVED'));
    record('Khong co console error nghiem trong', realErrors.length === 0, realErrors.slice(0, 2).join(' | '));

  } catch (err) {
    record('Test runner', false, err.message);
  }

  fs.writeFileSync('test-phaseA-results.json', JSON.stringify(results, null, 2));
  const passed = results.filter(r => r.pass).length;
  console.log(`\n== ${passed}/${results.length} PASS ==`);
  await browser.close();
}

main();
