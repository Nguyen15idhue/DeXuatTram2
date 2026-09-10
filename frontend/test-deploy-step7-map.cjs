const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.env.TEST_BASE || 'http://localhost:5173';
const KET_QUA_FILE = 'test-deploy-step7-results.json';

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

  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', 'admin@station.com');
    await page.fill('input[type="password"]', '123456');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);

    await page.goto(`${BASE}/map`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);

    const soLeaflet = await page.locator('.leaflet-container').count();
    ghi('Bản đồ Leaflet hiển thị', soLeaflet > 0, `.leaflet-container = ${soLeaflet}`);

    const loiMixed = loiConsole.filter((t) => /mixed content/i.test(t));
    ghi('Không có lỗi Mixed Content', loiMixed.length === 0, loiMixed.join(' ; ') || 'không có');

    const loiHttpDomain = loiConsole.filter((t) => /http:\/\/\{domain\}/i.test(t));
    ghi('Không còn tham chiếu http://{domain}', loiHttpDomain.length === 0, loiHttpDomain.join(' ; ') || 'không có');
  } catch (e) {
    ghi('Chạy test trang /map', false, e.message);
  }

  await browser.close();

  const soDat = ketQua.filter((k) => k.dat).length;
  console.log(`\nTỔNG KẾT: ${soDat}/${ketQua.length} hạng mục đạt`);
  fs.writeFileSync(KET_QUA_FILE, JSON.stringify({ thoiGian: new Date().toISOString(), base: BASE, ketQua }, null, 2));
  process.exit(soDat === ketQua.length ? 0 : 1);
}

main();
