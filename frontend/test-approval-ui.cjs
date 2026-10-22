const { chromium } = require('playwright');

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

const setStatus = async (request, token, status) => {
  const res = await request.put(`${API}/api/admin/proposals/${PROPOSAL_ID}/status`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { status, force: true, reason: 'test UI' }
  });
  const body = await res.json();
  if (!body?.success) throw new Error(`Set status ${status} failed: ${JSON.stringify(body)}`);
};

const gotoWithToken = async (page, token) => {
  await page.goto(`${BASE}/admin/proposals/duyet-bcdx`);
  await page.evaluate((t) => localStorage.setItem('token', t), token);
  await page.goto(`${BASE}/admin/proposals/duyet-bcdx`);
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
  await setStatus(page.request, admin, 'PROPOSAL_REPORT_REVIEWING');
  await gotoWithToken(page, admin);

  // 4 tabs
  const tabs = await page.locator('button[role="tab"]').allTextContents();
  log('4 tabs render', tabs.length === 4, tabs.join(' | '));
  log('tab labels', tabs.join(' ').includes('Tất cả đề xuất')
    && tabs.join(' ').includes('Các đề xuất cần thực hiện')
    && tabs.join(' ').includes('Đề xuất đang chờ bổ sung thông tin')
    && tabs.join(' ').includes('Đề xuất đã hoàn thành'));

  // Tab 1 columns
  const headers = await page.locator('thead th').allTextContents();
  const need = ['Mã đề xuất', 'Tên pháp nhân', 'SĐT liên hệ', 'Mô hình đầu tư', 'Địa chỉ chi tiết',
    'Quy mô trụ đề xuất', 'Tổng chi phí dự kiến', 'Người đề xuất', 'Trạng thái', 'Mô tả việc cần làm', 'Hành động'];
  const missing = need.filter((h) => !headers.some((x) => x.includes(h)));
  log('tab1 columns', missing.length === 0, missing.join(', '));

  const row1 = page.locator('tr:has-text("NQ_HNO_0017")');
  log('tab1 has row', (await row1.count()) > 0);
  log('tab1 code link', (await row1.locator('button.link').first().count()) > 0);
  log('tab1 person link', (await row1.locator('button.link, a.link').count()) >= 2);
  log('tab1 view action', (await row1.locator('button:has-text("Xem chi tiết")').count()) > 0);
  log('tab1 request update action', (await row1.locator('button:has-text("Yêu cầu cập nhật thông tin")').count()) > 0);
  log('tab1 configure signature action', (await row1.locator('button:has-text("Cấu hình ký")').count()) > 0);

  // Xem chi tiết
  await row1.locator('button:has-text("Xem chi tiết")').first().click();
  await page.waitForTimeout(2500);
  log('detail popup opens', (await page.locator('.modal-overlay').count()) > 0);
  log('detail popup has grading summary', (await page.locator('text=Kết quả đánh giá & bản vẽ layout').count()) > 0);
  log('detail popup has bcdx files', (await page.locator('text=File tờ trình BCĐX').count()) > 0);
  await page.locator('.modal-overlay .btn-close').first().click();
  await page.waitForTimeout(1200);

  // Yêu cầu cập nhật thông tin
  await row1.locator('button:has-text("Yêu cầu cập nhật thông tin")').first().click();
  await page.waitForTimeout(900);
  log('request update dialog opens', (await page.locator('h3:has-text("Yêu cầu cập nhật thông tin")').count()) > 0);
  await page.locator('textarea').first().fill('Bổ sung phụ lục sơ đồ và số lượng trụ chốt');
  await page.locator('button:has-text("Gửi yêu cầu")').click();
  await page.waitForTimeout(2000);
  log('request update toast', (await page.locator('text=/Đã yêu cầu cập nhật thông tin/').count()) > 0);

  // Tab 3 - đang chờ bổ sung
  await page.locator('button[role="tab"]:has-text("Đề xuất đang chờ bổ sung thông tin")').click();
  await page.waitForTimeout(1500);
  log('tab3 url param', page.url().includes('tab=updating'), page.url());
  const row3 = page.locator('tr:has-text("NQ_HNO_0017")');
  log('tab3 has row', (await row3.count()) > 0);
  log('tab3 shows description', (await row3.locator('td:has-text("Bổ sung phụ lục")').count()) > 0);
  log('tab3 no configure signature', (await row3.locator('button:has-text("Cấu hình ký")').count()) === 0);
  log('tab3 no request update', (await row3.locator('button:has-text("Yêu cầu cập nhật thông tin")').count()) === 0);

  // Tab 2 - cần thực hiện
  await setStatus(page.request, admin, 'PROPOSAL_REPORT_REVIEWING');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await page.locator('button[role="tab"]:has-text("Các đề xuất cần thực hiện")').click();
  await page.waitForTimeout(1500);
  const row2 = page.locator('tr:has-text("NQ_HNO_0017")');
  log('tab2 has row', (await row2.count()) > 0);
  log('tab2 configure signature', (await row2.locator('button:has-text("Cấu hình ký")').count()) > 0);

  // Modal cấu hình ký
  await row2.locator('button:has-text("Cấu hình ký")').first().click();
  await page.waitForTimeout(2000);
  log('signature modal opens', (await page.locator('h3:has-text("Cấu hình ký BCĐX")').count()) > 0);
  log('signature modal shows file', (await page.locator('.modal-box:has-text("File tờ trình BCĐX")').count()) > 0);
  log('signature modal has signer select', (await page.locator('.modal-box select').count()) > 0);
  const select = page.locator('.modal-box select').first();
  const options = await select.locator('option').allTextContents();
  log('signer candidates loaded', options.length > 1, options.join(' | '));
  const value = await select.locator('option').nth(1).getAttribute('value');
  await select.selectOption(value);
  await page.locator('.modal-box button:has-text("Thêm")').first().click();
  await page.waitForTimeout(800);
  log('signer added to list', (await page.locator('.modal-box ul li').count()) > 0);
  log('signature box rendered', (await page.locator('.modal-box .absolute.border-primary').count()) > 0);
  log('signature modal has confirm btn', (await page.locator('.modal-box button:has-text("Xác nhận trình ký")').count()) > 0);
  await page.locator('.modal-box .btn-circle').first().click();
  await page.waitForTimeout(800);

  // Tab 4 - hoàn thành
  await setStatus(page.request, admin, 'SIGNATURE_PENDING');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await page.locator('button[role="tab"]:has-text("Đề xuất đã hoàn thành")').click();
  await page.waitForTimeout(1500);
  const row4 = page.locator('tr:has-text("NQ_HNO_0017")');
  log('tab4 has row', (await row4.count()) > 0);
  log('tab4 no configure signature', (await row4.locator('button:has-text("Cấu hình ký")').count()) === 0);

  log('no console error', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' || '));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
  await browser.close();
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
