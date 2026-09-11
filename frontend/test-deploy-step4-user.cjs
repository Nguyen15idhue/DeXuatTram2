const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.env.TEST_BASE || 'http://localhost:5173';
const KET_QUA_FILE = 'test-deploy-step4-results.json';

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

    await page.goto(`${BASE}/admin/api-configs`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const tieuDe = await page.getByText('API', { exact: false }).count();
    ghi('Trang API configs tai duoc', tieuDe > 0, `"API" = ${tieuDe}`);

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
