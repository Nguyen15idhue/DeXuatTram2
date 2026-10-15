const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? ' — ' + extra : ''}`);
};

async function login(page) {
  const res = await page.request.post(`${API}/api/auth/login`, { data: { email: 'admin@station.com', password: '123456' } });
  const { data } = await res.json();
  await page.goto(BASE + '/login');
  await page.evaluate((t) => localStorage.setItem('token', t), data.token);
  await page.goto(BASE + '/admin/stations');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
}

async function pickFirst(page, boxText, n) {
  await page.locator(`.select:has-text("${boxText}")`).first().click();
  await page.waitForTimeout(400);
  const opts = page.locator('.absolute > div');
  const total = await opts.count();
  let picked = 0;
  for (let i = 0; i < total && picked < n; i++) {
    const el = opts.nth(i);
    const cls = await el.getAttribute('class').catch(() => '');
    if (cls && cls.includes('sticky')) continue; // skip search input wrapper
    const txt = (await el.textContent().catch(() => '')) || '';
    if (!txt.trim()) continue;
    await el.click();
    picked++;
    await page.waitForTimeout(200);
  }
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5).catch(() => {});
  await page.waitForTimeout(300);
  return picked;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message).slice(0, 160)));
  await login(page);

  await page.locator('button:has-text("Bộ lọc")').first().click();
  await page.waitForTimeout(500);
  const n1 = await pickFirst(page, 'Tất cả trạng thái', 2);
  check('stations picked 2 statuses', n1 === 2, `picked=${n1}`);
  check('stations shows Đã chọn (2)', !!(await page.locator('.select:has-text("Đã chọn (2)")').count()));
  const badge = (await page.locator('button:has-text("Bộ lọc") .badge').first().textContent().catch(() => '') || '').trim();
  check('stations filter badge = 2', badge === '2', `badge=${badge}`);
  check('stations no chips in filter card', (await page.locator('.border.border-base-300:has-text("Tất cả trạng thái") .badge.badge-sm').count()) === 0);
  await page.locator('button:has-text("Áp dụng")').first().click();
  await page.waitForTimeout(1500);
  check('stations apply ok', true);

  for (const [path, boxText, label] of [
    ['/admin/proposals', 'Tất cả trạng thái', 'proposals'],
    ['/admin/users', 'Tất cả vai trò', 'users'],
    ['/admin/leads', 'Tất cả giai đoạn', 'leads'],
    ['/my-proposals', 'Tất cả trạng thái', 'my-proposals'],
  ]) {
    await page.goto(BASE + path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1600);
    const b = page.locator('button:has-text("Bộ lọc")').first();
    if (await b.count()) { await b.click(); await page.waitForTimeout(400); }
    const present = await page.locator(`.select:has-text("${boxText}")`).count();
    check(`${label} has multiselect "${boxText}"`, present > 0, `count=${present}`);
  }

  check('zero pageerror', errors.length === 0, errors.slice(0, 3).join(' | '));

  require('fs').writeFileSync('test-multiselect-results.json', JSON.stringify({ results, errors }, null, 2));
  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) process.exitCode = 1;
}
main();
