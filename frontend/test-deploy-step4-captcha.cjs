const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.env.TEST_BASE || 'http://127.0.0.1:18081';
const KET_QUA_FILE = 'test-deploy-step4-results.json';

async function main() {
  const ketQua = [];
  const ghi = (ten, dat, ghiChu) => {
    ketQua.push({ ten, dat, ghiChu });
    console.log(`${dat ? 'PASS' : 'FAIL'} | ${ten}${ghiChu ? ' | ' + ghiChu : ''}`);
  };

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(`${BASE}/de-xuat`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const soScriptTurnstile = await page.locator('#turnstile-script').count();
    ghi('Không nạp script Turnstile', soScriptTurnstile === 0, `#turnstile-script = ${soScriptTurnstile}`);

    const soIframeTurnstile = await page.locator('iframe[src*="challenges.cloudflare.com"]').count();
    ghi('Không hiện iframe Turnstile', soIframeTurnstile === 0, `iframe = ${soIframeTurnstile}`);

    const soWidgetTurnstile = await page.locator('.cf-turnstile').count();
    ghi('Không có widget .cf-turnstile', soWidgetTurnstile === 0, `.cf-turnstile = ${soWidgetTurnstile}`);

    const coTieuDeNhapTin = await page.getByText('Nhập thông tin', { exact: false }).count();
    ghi('Form nhập thông tin hiển thị', coTieuDeNhapTin > 0, `"Nhập thông tin" = ${coTieuDeNhapTin}`);

    const coKhuTraCuu = await page.getByText('Tra cứu đề xuất', { exact: false }).count();
    ghi('Khu tra cứu đề xuất hiển thị', coKhuTraCuu > 0, `"Tra cứu đề xuất" = ${coKhuTraCuu}`);

    const loiConsole = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') loiConsole.push(msg.text());
    });
    await page.waitForTimeout(500);
    const loiTurnstile = loiConsole.filter((t) => /turnstile|cloudflare/i.test(t));
    ghi('Không có lỗi console liên quan Turnstile', loiTurnstile.length === 0, loiTurnstile.join(' ; ') || 'không có');
  } catch (e) {
    ghi('Chạy test trang /de-xuat', false, e.message);
  }

  await browser.close();

  const soDat = ketQua.filter((k) => k.dat).length;
  console.log(`\nTỔNG KẾT: ${soDat}/${ketQua.length} hạng mục đạt`);
  fs.writeFileSync(KET_QUA_FILE, JSON.stringify({ thoiGian: new Date().toISOString(), base: BASE, ketQua }, null, 2));
  process.exit(soDat === ketQua.length ? 0 : 1);
}

main();
