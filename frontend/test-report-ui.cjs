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
  await page.goto(`${BASE}/admin/proposals/lap-to-trinh`);
  await page.evaluate((t) => localStorage.setItem('token', t), token);
  await page.goto(`${BASE}/admin/proposals/lap-to-trinh`);
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

  // 3 tabs
  const tabs = await page.locator('button[role="tab"]').allTextContents();
  log('3 tabs render', tabs.length === 3, tabs.join(' | '));
  log('tab labels', tabs.join(' ').includes('Tất cả đề xuất')
    && tabs.join(' ').includes('Các đề xuất cần thực hiện')
    && tabs.join(' ').includes('Đề xuất đã hoàn thành'));

  // Tab 1 columns
  const headers = await page.locator('thead th').allTextContents();
  const need = ['Mã đề xuất', 'Tên pháp nhân', 'SĐT liên hệ', 'Mô hình đầu tư', 'Địa chỉ chi tiết',
    'Quy mô trụ đề xuất', 'Số lượng trụ chốt', 'Tổng giá trị chốt', 'Tổng chi phí dự kiến',
    'Người đề xuất', 'Trạng thái', 'Mô tả việc cần làm', 'Hành động'];
  const missing = need.filter((h) => !headers.some((x) => x.includes(h)));
  log('tab1 columns', missing.length === 0, missing.join(', '));

  const row1 = page.locator('tr:has-text("NQ_HNO_0017")');
  log('tab1 has row', (await row1.count()) > 0);
  log('tab1 code link', (await row1.locator('button.link').first().count()) > 0);
  log('tab1 person link', (await row1.locator('button.link, a.link').count()) >= 2);
  log('tab1 view action', (await row1.locator('button:has-text("Xem chi tiết")').count()) > 0);

  // Xem chi tiết -> popup có điểm QH/PL + file layout
  await row1.locator('button:has-text("Xem chi tiết")').first().click();
  await page.waitForTimeout(2500);
  log('detail popup opens', (await page.locator('.modal-overlay').count()) > 0);
  log('detail popup has summary', (await page.locator('text=Kết quả đánh giá & bản vẽ layout').count()) > 0);
  log('detail popup has QH + PL', (await page.locator('text=Quy hoạch').count()) > 0
    && (await page.locator('text=Pháp lý').count()) > 0);
  log('detail popup has layout files', (await page.locator('text=File layout đã vẽ').count()) > 0);
  await page.locator('.modal-overlay .btn-close').first().click();
  await page.waitForTimeout(1200);

  // Tab 2 - PROPOSAL_REPORT_CREATING -> nút "Cập nhật"
  await setStatus(page.request, admin, 'PROPOSAL_REPORT_CREATING');
  await page.locator('button[role="tab"]:has-text("Các đề xuất cần thực hiện")').click();
  await page.waitForTimeout(1500);
  log('tab2 url param', page.url().includes('tab=pending'), page.url());
  const row2 = page.locator('tr:has-text("NQ_HNO_0017")');
  log('tab2 has row', (await row2.count()) > 0);
  log('tab2 update button label', (await row2.locator('button:has-text("Cập nhật")').count()) > 0
    && (await row2.locator('button:has-text("Cập nhật lại")').count()) === 0);

  // Modal upload tờ trình
  await row2.locator('button:has-text("Cập nhật")').first().click();
  await page.waitForTimeout(1200);
  log('report modal opens', (await page.locator('h3:has-text("Cập nhật tờ trình BCĐX")').count()) > 0);
  log('report modal has upload', (await page.locator('.file-upload-dropzone').count()) > 0);
  log('report modal has committed pole table', (await page.locator('.modal-box th:has-text("Mô hình liên kết")').count()) > 0
    && (await page.locator('.modal-box th:has-text("Giá chốt hiện tại")').count()) > 0);
  const reportSelects = page.locator('.modal-box select');
  await reportSelects.nth(0).selectOption('LK');
  await reportSelects.nth(1).selectOption({ label: 'CCS2 60kW' });
  await page.waitForTimeout(400);
  log('price autofills from list', (await page.locator('.modal-box td:has-text("180.000.000")').count()) > 0);
  log('report modal has total', (await page.locator('.modal-box tfoot:has-text("Tổng giá trị chốt")').count()) > 0);
  const poleRowsBefore = await page.locator('.modal-box tbody tr').count();
  await page.locator('.modal-box button:has-text("Thêm dòng")').click();
  log('can add multiple pole rows', (await page.locator('.modal-box tbody tr').count()) === poleRowsBefore + 1);
  log('report modal has submit btn', (await page.locator('.modal-box button:has-text("Tải lên và gửi duyệt")').count()) > 0);
  await page.locator('.modal-box .btn-circle').first().click();
  await page.waitForTimeout(800);

  // PROPOSAL_REPORT_RE_CREATING -> nút "Cập nhật lại"
  await setStatus(page.request, admin, 'PROPOSAL_REPORT_RE_CREATING');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
  await page.locator('button[role="tab"]:has-text("Các đề xuất cần thực hiện")').click();
  await page.waitForTimeout(1500);
  const row2b = page.locator('tr:has-text("NQ_HNO_0017")');
  log('tab2 re-creating row', (await row2b.count()) > 0);
  log('tab2 re-creating label', (await row2b.locator('button:has-text("Cập nhật lại")').count()) > 0);

  // Tab 3
  await setStatus(page.request, admin, 'PROPOSAL_REPORT_REVIEWING');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
  await page.locator('button[role="tab"]:has-text("Đề xuất đã hoàn thành")').click();
  await page.waitForTimeout(1500);
  log('tab3 url param', page.url().includes('tab=completed'));
  const row3 = page.locator('tr:has-text("NQ_HNO_0017")');
  log('tab3 has row', (await row3.count()) > 0);
  log('tab3 no update button', (await row3.locator('button:has-text("Cập nhật")').count()) === 0);
  log('tab3 task column', (await page.locator('thead th:has-text("Mô tả việc cần làm")').count()) > 0);

  // Người đề xuất cũng được nhập bảng trụ chốt trong luồng upload.
  await setStatus(page.request, admin, 'PROPOSAL_REPORT_CREATING');
  const owner = await login(page.request, 'ctv@gmail.com');
  await page.goto(`${BASE}/my-proposals`);
  await page.evaluate((t) => localStorage.setItem('token', t), owner);
  await page.goto(`${BASE}/my-proposals`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  const ownerReportButton = page.locator('button:has-text("Tờ trình BCĐX")');
  log('owner sees report upload action', (await ownerReportButton.count()) > 0);
  if ((await ownerReportButton.count()) > 0) {
    await ownerReportButton.first().click();
    await page.waitForTimeout(1200);
    log('owner gets committed pole form', (await page.locator('.modal-box th:has-text("Mô hình liên kết")').count()) > 0);
    const ownerSelects = page.locator('.modal-box select');
    await ownerSelects.nth(0).selectOption('LK');
    await ownerSelects.nth(1).selectOption({ label: 'CCS2 60kW' });
    await page.waitForTimeout(300);
    log('owner price lookup works', (await page.locator('.modal-box td:has-text("180.000.000")').count()) > 0);
    await page.locator('.modal-box .btn-circle').first().click();
  }

  log('no console error', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' || '));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
  await browser.close();
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
