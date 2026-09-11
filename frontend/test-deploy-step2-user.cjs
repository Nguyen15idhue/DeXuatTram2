const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.env.TEST_BASE || 'http://localhost:5173';
const KET_QUA_FILE = 'test-deploy-step2-results.json';

async function main() {
  const ketQua = [];
  const ghi = (ten, dat, ghiChu) => {
    ketQua.push({ ten, dat, ghiChu });
    console.log(`${dat ? 'PASS' : 'FAIL'} | ${ten}${ghiChu ? ' | ' + ghiChu : ''}`);
  };

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const loiConsole = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') loiConsole.push(msg.text());
  });
  page.on('pageerror', (err) => loiConsole.push(String(err && err.message || err)));

  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', 'admin@station.com');
    await page.fill('input[type="password"]', '123456');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);

    await page.goto(`${BASE}/admin/fields`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.fill('input[placeholder*="Tìm theo Label"]', 'utest');
    await page.press('input[placeholder*="Tìm theo Label"]', 'Enter');
    await page.waitForTimeout(2000);
    const coUserTest = await page.getByText('User Test', { exact: false }).count();
    ghi('Trang quan ly field hien thi (co field User Test)', coUserTest > 0, `"User Test" = ${coUserTest}`);

    await page.goto(`${BASE}/map`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const soLeaflet = await page.locator('.leaflet-container').count();
    ghi('Ban do van hien thi (type cu khong hong)', soLeaflet > 0, `.leaflet-container = ${soLeaflet}`);

    const loiNghiemTrong = loiConsole.filter((t) => !/favicon|404|net::/i.test(t));
    ghi('Khong co loi console nghiem trong', loiNghiemTrong.length === 0, loiNghiemTrong.slice(0, 3).join(' ; ') || 'không có');
  } catch (e) {
    ghi('Chay test frontend', false, e.message);
  }

  await browser.close();

  const soDat = ketQua.filter((k) => k.dat).length;
  console.log(`\nTỔNG KẾT: ${soDat}/${ketQua.length} hạng mục đạt`);
  fs.writeFileSync(KET_QUA_FILE, JSON.stringify({ thoiGian: new Date().toISOString(), base: BASE, ketQua }, null, 2));
  process.exit(soDat === ketQua.length ? 0 : 1);
}

main();
