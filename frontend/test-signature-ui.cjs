const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const PROPOSAL_ID = 461;
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

const gotoWithToken = async (page, token, url) => {
  await page.goto(`${BASE}/login`);
  await page.evaluate((t) => localStorage.setItem('token', t), token);
  await page.waitForTimeout(600);
  await page.goto(url);
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
  await gotoWithToken(page, admin, `${BASE}/admin/proposals/trinh-ky`);

  // 4 tabs (chairman chỉ cho Back Office/Admin)
  const tabs = await page.locator('button[role="tab"]').allTextContents();
  log('tabs render', tabs.length === 4, tabs.join(' | '));
  log('tab labels', tabs.join(' ').includes('Tất cả đề xuất')
    && tabs.join(' ').includes('Đề xuất cần thực hiện')
    && tabs.join(' ').includes('Đề xuất trình chủ tịch')
    && tabs.join(' ').includes('Đề xuất đã hoàn thành'));

  const headers = await page.locator('thead th').allTextContents();
  const need = ['Mã đề xuất', 'Tên pháp nhân', 'SĐT liên hệ', 'Mô hình đầu tư', 'Địa chỉ chi tiết',
    'Quy mô trụ đề xuất', 'Tổng chi phí dự kiến', 'Người đề xuất', 'Trạng thái', 'Ghi chú', 'Hành động'];
  const missing = need.filter((h) => !headers.some((x) => x.includes(h)));
  log('tab1 columns', missing.length === 0, missing.join(', '));

  const row1 = page.locator('tr:has-text("NQ_HNO_0017")');
  log('tab1 has row', (await row1.count()) > 0);
  log('tab1 sign note pending', (await row1.locator('td:has-text("Cần thực hiện")').count()) > 0);
  log('tab1 view action', (await row1.locator('button:has-text("Xem chi tiết")').count()) > 0);
  log('tab1 sign action', (await row1.locator('button:has-text("Ký duyệt")').count()) > 0);

  // Xem chi tiết
  await row1.locator('button:has-text("Xem chi tiết")').first().click();
  await page.waitForTimeout(2000);
  log('detail modal opens', (await page.locator('h3:has-text("Chi tiết hồ sơ trình ký")').count()) > 0);
  const modalText = await page.locator('.modal-box').first().innerText();
  log('detail has key info', ['Mã đề xuất', 'Người đề xuất', 'Số lượng trụ đề xuất', 'Số lượng trụ chốt', 'Tổng giá trị chốt']
    .every((label) => modalText.includes(label)));
  log('detail has preview', (await page.locator('.modal-box:has-text("Bản xem trước BCĐX")').count()) > 0);
  log('detail has sign btn', (await page.locator('.modal-box button:has-text("Ký duyệt")').count()) > 0);
  log('detail has reject btn', (await page.locator('.modal-box button:has-text("Từ chối duyệt")').count()) > 0);
  await page.locator('.modal-box .btn-circle').first().click();
  await page.waitForTimeout(800);

  // Người được phân công ký: tab 2 -> Ký ngay -> trang ký BCĐX
  const ctv = await login(page.request, 'ctv@gmail.com');
  await gotoWithToken(page, ctv, `${BASE}/admin/proposals/trinh-ky`);
  const ctvTabs = await page.locator('button[role="tab"]').allTextContents();
  log('signer sees 3 tabs (không có tab trình chủ tịch)', ctvTabs.length === 3, ctvTabs.join(' | '));
  await page.locator('button[role="tab"]:has-text("Đề xuất cần thực hiện")').click();
  await page.waitForTimeout(1500);
  const ctvRow = page.locator('tr:has-text("NQ_HNO_0017")');
  log('signer tab2 has row', (await ctvRow.count()) > 0);
  log('signer has sign now btn', (await ctvRow.locator('button:has-text("Ký ngay")').count()) > 0);
  await ctvRow.locator('button:has-text("Ký ngay")').first().click();
  await page.waitForTimeout(2000);
  log('navigate to signing page', page.url().includes(`/admin/proposals/ky-bcdx/${PROPOSAL_ID}`), page.url());
  log('signing page shows sheet', (await page.locator('text=Vị trí ký').count()) > 0);
  log('signing page has sign now', (await page.locator('button:has-text("Ký ngay")').count()) > 0);
  await page.locator('button:has-text("Ký ngay")').first().click();
  await page.waitForTimeout(2500);
  log('signed shows name + time', (await page.locator('text=/Đã ký \\d/').count()) > 0);
  log('sign toast', (await page.locator('text=Đã ký BCĐX').count()) > 0);

  // Trạng thái ghi chú chuyển DOING
  await page.goto(`${BASE}/admin/proposals/trinh-ky`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  const rowDoing = page.locator('tr:has-text("NQ_HNO_0017")');
  log('note updated to doing', (await rowDoing.locator('td:has-text("Đang thực hiện")').count()) > 0);

  // Người ký còn lại ký -> DONE -> tab trình chủ tịch
  const sale = await login(page.request, 'sale@gmail.com');
  await gotoWithToken(page, sale, `${BASE}/admin/proposals/trinh-ky`);
  await page.locator('button[role="tab"]:has-text("Đề xuất cần thực hiện")').click();
  await page.waitForTimeout(1500);
  const saleRow = page.locator('tr:has-text("NQ_HNO_0017")');
  log('second signer has row', (await saleRow.count()) > 0);
  if ((await saleRow.locator('button:has-text("Ký ngay")').count()) > 0) {
    await saleRow.locator('button:has-text("Ký ngay")').first().click();
    await page.waitForTimeout(2000);
    await page.locator('button:has-text("Ký ngay")').first().click();
    await page.waitForTimeout(2500);
    log('second signed', (await page.locator('text=/Đã ký \\d/').count()) > 0);
  }

  // Back Office: tab trình chủ tịch
  await gotoWithToken(page, admin, `${BASE}/admin/proposals/trinh-ky?tab=chairman`);
  await page.waitForTimeout(1500);
  const chairmanRow = page.locator('tr:has-text("NQ_HNO_0017")');
  log('chairman tab has row', (await chairmanRow.count()) > 0);
  log('chairman note done', (await chairmanRow.locator('td:has-text("Đã hoàn thành")').count()) > 0);
  log('chairman export btn', (await chairmanRow.locator('button:has-text("Xuất file PDF")').count()) > 0);
  log('chairman upload btn', (await chairmanRow.locator('button:has-text("Upload file đã ký")').count()) > 0);

  // Upload file đã ký -> COMPLETED
  const tmpFile = path.join(process.env.TEMP || 'C:\\Users\\VIET\\AppData\\Local\\Temp', 'signed-bcđx.pdf');
  fs.writeFileSync(tmpFile, '%PDF-1.4\n% demo\n');
  await chairmanRow.locator('button:has-text("Upload file đã ký")').first().click();
  await page.waitForTimeout(1200);
  log('upload signed modal opens', (await page.locator('h3:has-text("Upload file BCĐX đã ký")').count()) > 0);
  await page.locator('.modal-box input[type="file"]').setInputFiles(tmpFile);
  await page.waitForTimeout(2000);
  await page.locator('.modal-box button:has-text("Xác nhận upload")').click();
  await page.waitForTimeout(2500);
  log('upload signed toast', (await page.locator('text=/file BCĐX đã ký/').count()) > 0);

  await gotoWithToken(page, admin, `${BASE}/admin/proposals/trinh-ky?tab=completed`);
  await page.waitForTimeout(2500);
  const rowDone = page.locator('tr:has-text("NQ_HNO_0017")');
  log('completed tab has row', (await rowDone.count()) > 0);
  log('completed note ceo signed', (await rowDone.locator('td:has-text("Chủ tịch đã phê duyệt")').count()) > 0);

  log('no console error', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' || '));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
  await browser.close();
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
