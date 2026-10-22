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
  await page.goto(`${BASE}/admin/proposals/danh-gia-layout`);
  await page.evaluate((t) => localStorage.setItem('token', t), token);
  await page.goto(`${BASE}/admin/proposals/danh-gia-layout`);
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

  // 4 tabs
  const tabs = await page.locator('button[role="tab"]').allTextContents();
  log('4 tabs render', tabs.length === 4, tabs.join(' | '));
  log('tab labels', tabs.join(' ').includes('Tất cả đề xuất')
    && tabs.join(' ').includes('Đề xuất cần thực hiện')
    && tabs.join(' ').includes('Đề xuất đang chờ bổ sung')
    && tabs.join(' ').includes('Đề xuất đã có bản vẽ layout'));

  // Tab 1 columns
  const headers = await page.locator('thead th').allTextContents();
  const need = ['Mã đề xuất', 'Tên pháp nhân', 'SĐT liên hệ', 'Mô hình đầu tư', 'Địa chỉ chi tiết', 'Quy mô trụ đề xuất', 'Người đề xuất', 'Số lần YC cập nhật thông tin', 'Hành động'];
  log('tab1 columns', need.every((h) => headers.some((x) => x.includes(h))), headers.join(' | '));

  const row1 = page.locator('tr:has-text("NQ_HNO_0017")');
  log('tab1 has DESIGNING row', (await row1.count()) > 0);
  log('tab1 code link styled', (await row1.locator('button.link').first().count()) > 0);
  log('tab1 person link', (await row1.locator('button.link, a.link').count()) >= 2);
  const countCell1 = (await row1.locator('td').nth(8).innerText()).trim();
  log('tab1 count column numeric', /^\d+$/.test(countCell1), countCell1);
  log('tab1 view action', (await row1.locator('button:has-text("Xem chi tiết")').count()) > 0);

  // Tab 2
  await page.locator('button[role="tab"]:has-text("Đề xuất cần thực hiện")').click();
  await page.waitForTimeout(1500);
  log('tab2 url param', page.url().includes('tab=pending'), page.url());
  const row2 = page.locator('tr:has-text("NQ_HNO_0017")');
  log('tab2 has row', (await row2.count()) > 0);
  log('tab2 update button', (await row2.locator('button:has-text("Cập nhật")').count()) > 0);
  log('tab2 supplement button', (await row2.locator('button:has-text("Yêu cầu bổ sung")').count()) > 0);
  log('tab2 cancel button', (await row2.locator('button:has-text("Hủy đề xuất")').count()) > 0);

  // Modal cập nhật: file cũ + nút Duyệt
  await row2.locator('button:has-text("Cập nhật")').first().click();
  await page.waitForTimeout(1200);
  log('update modal opens', (await page.locator('h3:has-text("Cập nhật bản vẽ layout")').count()) > 0);
  log('update modal has upload', (await page.locator('.file-upload-dropzone').count()) > 0);
  log('update modal shows old file', (await page.locator('.modal-box button:has-text("Hình ảnh hiện trường")').count()) > 0);
  log('update modal has approve btn', (await page.locator('.modal-box button:has-text("Duyệt")').count()) > 0);
  await page.locator('.modal-box .btn-circle').first().click();
  await page.waitForTimeout(800);

  // Yêu cầu bổ sung
  await row2.locator('button:has-text("Yêu cầu bổ sung")').first().click();
  await page.waitForTimeout(800);
  log('supplement dialog opens', (await page.locator('h3:has-text("Yêu cầu bổ sung thông tin")').count()) > 0);
  await page.locator('textarea').first().fill('Bổ sung bản vẽ layout và thông số trụ');
  await page.locator('button:has-text("Gửi yêu cầu")').click();
  await page.waitForTimeout(2000);
  log('supplement toast', (await page.locator('text=/Đã gửi yêu cầu bổ sung thông tin/').count()) > 0);

  // Tab 3 chờ bổ sung
  await page.locator('button[role="tab"]:has-text("Đề xuất đang chờ bổ sung")').click();
  await page.waitForTimeout(1500);
  const row3 = page.locator('tr:has-text("NQ_HNO_0017")');
  log('tab3 has waiting row', (await row3.count()) > 0);
  const countCell3 = (await row3.locator('td').nth(8).innerText()).trim();
  log('tab3 count >= 1', Number(countCell3) >= 1, countCell3);
  log('tab3 cancel allowed', (await row3.locator('button:has-text("Hủy đề xuất")').count()) > 0);
  log('tab3 no update button', (await row3.locator('button:has-text("Cập nhật")').count()) === 0);

  // Tab 4
  await page.locator('button[role="tab"]:has-text("Đề xuất đã có bản vẽ layout")').click();
  await page.waitForTimeout(1500);
  log('tab4 url param', page.url().includes('tab=layout'));
  log('tab4 table renders', (await page.locator('thead th:has-text("Mã đề xuất")').count()) > 0);

  // User ngoài phòng CN&QH bị chặn
  const sale = await login(page.request, 'sale@gmail.com');
  await gotoWithToken(page, sale);
  log('non-design user blocked', (await page.locator('text=/Chỉ thành viên Phòng Công nghệ và Quy hoạch/').count()) > 0);
  log('non-design no table', (await page.locator('thead th').count()) === 0);

  log('no console error', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' || '));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
  await browser.close();
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
