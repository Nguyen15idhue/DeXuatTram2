const { chromium } = require('playwright');

const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
const consoleErrors = [];

const log = (name, ok, extra = '') => {
  results.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` | ${extra}` : ''}`);
};

const login = async (request, email) => {
  const res = await request.post(`${API}/api/auth/login`, {
    data: { email, password: '123456' }
  });
  const body = await res.json();
  if (!body?.data?.token) throw new Error(`Login failed for ${email}`);
  return body.data.token;
};

const gotoWithToken = async (page, token) => {
  await page.goto(`${BASE}/admin/proposals/danh-gia-quy-hoach`);
  await page.evaluate((t) => localStorage.setItem('token', t), token);
  await page.goto(`${BASE}/admin/proposals/danh-gia-quy-hoach`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
};

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  const admin = await login(page.request, 'admin@station.com');
  await gotoWithToken(page, admin);

  // Tab 1 - cards + tabs
  log('tabs render', (await page.locator('button[role="tab"]:has-text("Tất cả đề xuất")').count()) > 0
    && (await page.locator('button[role="tab"]:has-text("Các đề xuất cần thực hiện")').count()) > 0
    && (await page.locator('button[role="tab"]:has-text("Đề xuất đã hoàn thành")').count()) > 0);
  await page.waitForTimeout(800);
  log('tab1 rows', (await page.locator('tr:has-text("TESTQH_0001")').count()) > 0
    && (await page.locator('tr:has-text("TESTPL_0001")').count()) > 0);
  log('tab1 PL wait badge', (await page.locator('.badge-warning:has-text("Pháp lý chờ bổ sung thông tin")').count()) > 0);
  const qhLink = page.locator('button.link:has-text("Quy hoạch đã chấm xong")');
  log('tab1 graded status link', (await qhLink.count()) > 0);
  log('tab1 actions admin', (await page.locator('tr:has-text("TESTQH_0001") button:has-text("Xem chi tiết")').count()) > 0
    && (await page.locator('tr:has-text("TESTQH_0001") button:has-text("Cập nhật")').count()) > 0);

  // Code link opens detail popup with grading summary
  await page.locator('tr:has-text("TESTQH_0001")').first().locator('button.link:has-text("TESTQH_0001")').click();
  await page.waitForTimeout(2500);
  log('detail popup opens', (await page.locator('.modal-overlay').count()) > 0);
  const popupHasSummary = (await page.locator('text=Đánh giá Quy hoạch và Pháp lý').count()) > 0;
  log('detail popup grading summary', popupHasSummary);
  const summaryCap = (await page.locator('th:has-text("Quy hoạch")').count()) > 0 && (await page.locator('th:has-text("Pháp lý")').count()) > 0;
  log('detail popup 2 columns', summaryCap);
  await page.locator('.modal-overlay .btn-close').first().click();
  await page.waitForTimeout(1500);
  await page.locator('button[role="tab"]:has-text("Các đề xuất cần thực hiện")').click();
  await page.waitForTimeout(1500);
  log('tab2 dept filter for admin', (await page.locator('select').filter({ has: page.locator('option:has-text("Cả 2 phòng")') }).count()) > 0);
  log('tab2 grading rows', (await page.locator('tr:has-text("TESTPL_0001")').count()) > 0);
  log('tab2 no completed rows', (await page.locator('tr:has-text("TESTQH_0001")').count()) === 0);
  log('tab2 chấm điểm button', (await page.locator('button:has-text("Chấm điểm")').count()) > 0);

  // Tab 3 - completed shows graded proposals only
  await page.locator('button[role="tab"]:has-text("Đề xuất đã hoàn thành")').click();
  await page.waitForTimeout(1500);
  log('tab3 graded rows only', (await page.locator('tr:has-text("TESTQH_0001")').count()) > 0
    && (await page.locator('tr:has-text("TESTPL_0001")').count()) === 0);
  log('tab3 graded status link', (await page.locator('button.link:has-text("Quy hoạch đã chấm xong")').count()) > 0);

  // Score detail dialog
  await page.locator('button.link:has-text("Quy hoạch đã chấm xong")').first().click();
  await page.waitForTimeout(800);
  log('score detail dialog', (await page.locator('.modal-box:has-text("Điểm Quy hoạch")').count()) > 0);
  await page.locator('.modal-box button:has-text("Đóng")').first().click();
  await page.waitForTimeout(600);

  // Table 3 completed rows have only Cập nhật action (no Xem chi tiết)
  log('tab3 no xem chi tiết button', (await page.locator('button:has-text("Xem chi tiết")').count()) === 0);

  // QH user flow
  const qh = await login(page.request, 'ctv@gmail.com');
  await gotoWithToken(page, qh);
  await page.locator('button[role="tab"]:has-text("Các đề xuất cần thực hiện")').click();
  await page.waitForTimeout(1400);
  log('qh tab2 no dept filter', (await page.locator('select').filter({ has: page.locator('option:has-text("Cả 2 phòng")') }).count()) === 0);
  log('qh sees only qh-null row', (await page.locator('tr:has-text("TESTPL_0001")').count()) > 0
    && (await page.locator('tr:has-text("TESTQH_0001")').count()) === 0);
  await page.locator('tr:has-text("TESTPL_0001")').first().locator('button:has-text("Chấm điểm")').click();
  await page.waitForTimeout(1000);
  log('qh modal opens', (await page.locator('.modal-box:has-text("Đánh giá Quy hoạch và Pháp lý")').count()) > 0);
  // QH section editable (select present), PL section readonly (no second select)
  log('qh modal single select', (await page.locator('.modal-box select').count()) === 1);
  log('qh modal PL readonly chip', (await page.locator('.modal-box .badge:has-text("Chỉ xem")').count()) > 0);
  const scoreSelect = page.locator('.modal-box select').first();
  await scoreSelect.selectOption('3');
  await page.locator('.modal-box textarea').first().fill('Quy hoạch OK');
  await page.locator('.modal-box button:has-text("Lưu đánh giá")').click();
  await page.waitForTimeout(1800);
  log('qh save toast', (await page.locator('text=Đã cập nhật đánh giá').count()) > 0
    || (await page.locator('.modal-box:has-text("Đánh giá Quy hoạch và Pháp lý")').count()) === 0);
  await page.waitForTimeout(800);
  log('qh row leaves list', (await page.locator('tr:has-text("TESTPL_0001")').count()) === 0);

  console.log('---');
  console.log(`Console errors: ${consoleErrors.length}`);
  consoleErrors.slice(0, 10).forEach((e) => console.log('  ' + e));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`Total: ${results.length}, failed: ${failed}`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
