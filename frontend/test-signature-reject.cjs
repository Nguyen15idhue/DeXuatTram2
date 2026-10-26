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
  const row = page.locator('tr:has-text("NQ_HNO_0017")');
  log('row render', (await row.count()) > 0);

  await row.locator('button:has-text("Xem chi tiết")').first().click();
  await page.waitForTimeout(2000);
  await page.locator('.modal-box button:has-text("Từ chối duyệt")').first().click();
  await page.waitForTimeout(800);
  log('reject form shows', (await page.locator('.modal-box textarea').count()) > 0);
  await page.locator('.modal-box textarea').first().fill('Số lượng trụ chốt chưa khớp với đề xuất');
  await page.locator('.modal-box button:has-text("Gửi yêu cầu cập nhật lại")').click();
  await page.waitForTimeout(2500);
  log('reject toast', (await page.locator('text=/từ chối duyệt/').count()) > 0);

  const status = await page.request.get(`${API}/api/admin/proposals/${PROPOSAL_ID}`, {
    headers: { Authorization: `Bearer ${admin}` }
  });
  const body = await status.json();
  log('status -> PROPOSAL_REPORT_UPDATING', body?.data?.status === 'PROPOSAL_REPORT_UPDATING', body?.data?.status);

  log('no console error', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' || '));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
  await browser.close();
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
