const { chromium } = require('playwright');

const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
const consoleErrors = [];
const log = (name, ok, extra = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` | ${extra}` : ''}`); };

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  const res = await page.request.post(`${API}/api/auth/login`, { data: { email: 'admin@station.com', password: '123456' } });
  const { data } = await res.json();

  await page.goto(`${BASE}/login`);
  await page.evaluate((t) => localStorage.setItem('token', t), data.token);
  await page.goto(`${BASE}/admin/proposals?tab=requests`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  log('toggle Việc của tôi hiển thị', (await page.locator('text=Việc của tôi').count()) > 0);
  log('filter loại yêu cầu hiển thị', (await page.locator('select:has(option:has-text("Trình Tổng giám đốc"))').count()) > 0);
  log('nút Đánh dấu đã hoàn thành', (await page.locator('button:has-text("Đánh dấu đã hoàn thành")').count()) > 0);

  // Bật lọc "Việc của tôi" -> list vẫn load được (không lỗi API)
  await page.locator('label:has-text("Việc của tôi")').first().click();
  await page.waitForTimeout(1200);
  log('list tải khi bật Việc của tôi', (await page.locator('table').count()) > 0 && !consoleErrors.some((e) => e.includes('proposal-requests')));

  // Mở dialog hoàn thành (nếu có dòng OPEN cho admin hoàn thành được)
  const btn = page.locator('button:has-text("Đánh dấu đã hoàn thành")').first();
  if ((await btn.count()) > 0) {
    await btn.click();
    await page.waitForTimeout(800);
    log('dialog hoàn thành mở', (await page.locator('h3:has-text("Đánh dấu đã hoàn thành")').count()) > 0);
    log('dialog bắt buộc ghi chú (nút khóa khi trống)', await page.locator('.modal-box button:disabled').count() > 0);
    await page.locator('.modal-box textarea').fill('Test ghi chú kết quả');
    await page.waitForTimeout(300);
    log('nút mở sau khi nhập ghi chú', (await page.locator('.modal-box button:disabled').count()) === 0);
  } else {
    console.log('INFO: không còn yêu cầu OPEN để mở dialog (đã hoàn thành hết ở test trước)');
  }

  log('no console error', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  console.log(`\n${results.filter(Boolean).length}/${results.length} PASS`);
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
