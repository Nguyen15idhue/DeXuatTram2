const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.env.TEST_BASE || 'http://localhost:5173';
const KET_QUA_FILE = 'test-deploy-step5-results.json';

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
    await page.goto(`${BASE}/de-xuat`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    const coPhuTrach = await page.getByText('Người phụ trách', { exact: false }).count();
    ghi('Form hien thi truong Nguoi phu trach', coPhuTrach > 0, `"Người phụ trách" = ${coPhuTrach}`);
    const coGiao = await page.getByText('Người giao phụ trách', { exact: false }).count();
    ghi('Form hien thi truong Nguoi giao phu trach', coGiao > 0, `"Người giao phụ trách" = ${coGiao}`);

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
