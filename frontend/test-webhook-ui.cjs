const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 150)); });
  const res = await page.request.post(API + '/api/auth/login', { data: { email: 'admin@station.com', password: '123456' } });
  const { data } = await res.json();
  await page.goto(BASE + '/login');
  await page.evaluate((t) => localStorage.setItem('token', t), data.token);
  await page.goto(BASE + '/admin/api-configs');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  const tabs = await page.locator('[role=tab]').allTextContents();
  console.log('tabs:', JSON.stringify(tabs));

  // Tab Webhooks: 2 cards rieng
  await page.click('button:has-text("Webhooks")');
  await page.waitForTimeout(1500);
  let body = await page.locator('body').innerText();
  const checks = {
    'tabs-3': tabs.length === 3,
    'card-cu': body.includes('trạng thái đề xuất') && body.includes('/api/webhooks/oneoffice/proposal-status'),
    'card-moi': body.includes('vào dự án') && body.includes('/api/webhooks/oneoffice/work-process/move-to-project'),
    'secrets-card': body.includes('Secrets webhook'),
    'test-buttons': (await page.locator('button:has-text("Test")').count()) >= 2,
    'viewlog-buttons': (await page.locator('button:has-text("Xem log")').count()) >= 2
  };
  // Mo form test cua card moi
  const cards = page.locator('.card');
  console.log('card-count:', await cards.count());

  // Xem log tu card moi -> nhay sang tab Log webhook
  await page.locator('button:has-text("Xem log")').first().click();
  await page.waitForTimeout(2000);
  body = await page.locator('body').innerText();
  checks['log-tab'] = body.includes('Log webhook');
  checks['log-table'] = body.includes('quy trình') || body.includes('Sự kiện') || body.includes('Đang lắng nghe') || body.includes('Tạm dừng');
  console.log('checks:', JSON.stringify(checks, null, 1));
  await page.screenshot({ path: 'webhook-ui-check.png' });
  console.log('js-errors:', errors.length ? errors.slice(0, 5) : 'none');
  await browser.close();
  const failed = Object.entries(checks).filter(([, v]) => !v);
  if (failed.length > 0 || errors.length > 0) process.exitCode = 2;
}
main().catch((e) => { console.log('FATAL:', e.message); process.exit(1); });
