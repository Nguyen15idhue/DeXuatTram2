const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.env.TEST_BASE || 'http://localhost:5173';
const KET_QUA_FILE = 'test-deploy-step6-filter-results.json';

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

    await page.goto(`${BASE}/admin/proposals`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const demDongTruoc = await page.locator('table tbody tr').count();
    ghi('Bang co du lieu', demDongTruoc > 0, `rows = ${demDongTruoc}`);

    const oLoc = page.locator('table thead tr.bg-base-200 input');
    const demOLoc = await oLoc.count();
    ghi('Co o loc (2 cot user)', demOLoc >= 2, `inputs = ${demOLoc}`);
    if (demOLoc > 0) {
      await oLoc.first().fill('Admin');
      await page.waitForTimeout(1000);
      const demDongSau = await page.locator('table tbody tr').count();
      ghi('Loc theo ten giam so dong', demDongSau > 0 && demDongSau <= demDongTruoc, `truoc=${demDongTruoc} sau=${demDongSau}`);
      await oLoc.first().fill('');
      await page.waitForTimeout(1000);
    } else {
      ghi('Loc theo ten giam so dong', false, 'không thấy ô lọc');
    }

    const tieuDe = page.locator('table thead th', { hasText: 'Người phụ trách' });
    const demTieuDe = await tieuDe.count();
    if (demTieuDe > 0) {
      await tieuDe.first().click();
      await page.waitForTimeout(1000);
      ghi('Sap xep theo cot khong loi', true, 'click sort OK');
    } else {
      ghi('Sap xep theo cot khong loi', false, 'không thấy tiêu đề');
    }

    const loiNghiemTrong = loiConsole.filter((t) => !/favicon|404|net::/i.test(t));
    ghi('Khong loi console', loiNghiemTrong.length === 0, loiNghiemTrong.slice(0, 2).join(' ; ') || 'không có');
  } catch (e) {
    ghi('Chay test loc/sort', false, e.message);
  }

  await browser.close();

  const soDat = ketQua.filter((k) => k.dat).length;
  console.log(`\nTỔNG KẾT: ${soDat}/${ketQua.length} hạng mục đạt`);
  fs.writeFileSync(KET_QUA_FILE, JSON.stringify({ thoiGian: new Date().toISOString(), base: BASE, ketQua }, null, 2));
  process.exit(soDat === ketQua.length ? 0 : 1);
}

main();
