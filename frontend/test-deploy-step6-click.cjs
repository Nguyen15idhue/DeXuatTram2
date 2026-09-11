const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.env.TEST_BASE || 'http://localhost:5173';
const KET_QUA_FILE = 'test-deploy-step6-click-results.json';

async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
}

async function main() {
  const ketQua = [];
  const ghi = (ten, dat, ghiChu) => {
    ketQua.push({ ten, dat, ghiChu });
    console.log(`${dat ? 'PASS' : 'FAIL'} | ${ten}${ghiChu ? ' | ' + ghiChu : ''}`);
  };

  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    const loiConsole = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') loiConsole.push(msg.text());
    });
    page.on('pageerror', (err) => loiConsole.push(String(err && err.message || err)));

    await login(page, 'admin@station.com', '123456');
    await page.goto(`${BASE}/admin/proposals`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const chipBtn = page.locator('button.link', { hasText: 'Admin' });
    const demBtn = await chipBtn.count();
    ghi('ADMIN thay chip nguoi dang button', demBtn > 0, `button = ${demBtn}`);

    if (demBtn > 0) {
      await chipBtn.first().click();
      await page.waitForTimeout(2500);
      const popupUser = await page.getByText('admin@station.com', { exact: false }).count();
      ghi('ADMIN click mo chi tiet user', popupUser > 0, `"admin@station.com" = ${popupUser}`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else {
      ghi('ADMIN click mo chi tiet user', false, 'không thấy chip');
    }

    const loiNghiemTrong = loiConsole.filter((t) => !/favicon|404|net::/i.test(t));
    ghi('ADMIN khong loi console', loiNghiemTrong.length === 0, loiNghiemTrong.slice(0, 2).join(' ; ') || 'không có');
    await page.close();

    const page2 = await browser.newPage();
    const loi2 = [];
    page2.on('console', (msg) => {
      if (msg.type() === 'error') loi2.push(msg.text());
    });
    page2.on('pageerror', (err) => loi2.push(String(err && err.message || err)));

    await login(page2, 'ctv@gmail.com', '123456');
    await page2.goto(`${BASE}/my-proposals`, { waitUntil: 'networkidle' });
    await page2.waitForTimeout(3000);

    const chipBtnCtv = page2.locator('button.link', { hasText: 'Admin' });
    const demBtnCtv = await chipBtnCtv.count();
    ghi('CTV khong thay chip dang button', demBtnCtv === 0, `button = ${demBtnCtv}`);
    const chipText = await page2.getByText('Admin', { exact: false }).count();
    ghi('CTV van thay ten (plain text)', chipText > 0, `"Admin" = ${chipText}`);

    const loi2Trong = loi2.filter((t) => !/favicon|404|net::/i.test(t));
    ghi('CTV khong loi console', loi2Trong.length === 0, loi2Trong.slice(0, 2).join(' ; ') || 'không có');
    await page2.close();
  } catch (e) {
    ghi('Chay test click', false, e.message);
  }

  await browser.close();

  const soDat = ketQua.filter((k) => k.dat).length;
  console.log(`\nTỔNG KẾT: ${soDat}/${ketQua.length} hạng mục đạt`);
  fs.writeFileSync(KET_QUA_FILE, JSON.stringify({ thoiGian: new Date().toISOString(), base: BASE, ketQua }, null, 2));
  process.exit(soDat === ketQua.length ? 0 : 1);
}

main();
