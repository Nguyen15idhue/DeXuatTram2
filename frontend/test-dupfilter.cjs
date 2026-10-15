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
}

async function pairCount(page) {
  const body = await page.textContent('body').catch(() => '');
  const m = body.match(/Tìm thấy (\d+) cặp trùng/);
  return m ? Number(m[1]) : null;
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
    if (cls && cls.includes('sticky')) continue;
    const t = (await el.textContent().catch(() => '')) || '';
    if (!t.trim()) continue;
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

  // === STATIONS ===
  await page.goto(BASE + '/admin/stations');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1800);
  check('stations has Check trùng', !!(await page.locator('button:has-text("Check trùng")').count()));
  await page.locator('button:has-text("Check trùng")').first().click();
  await page.waitForTimeout(3500);
  const allCount = await pairCount(page);
  check('stations check (no filter) returns pairs', allCount !== null, `pairs=${allCount}`);
  check('stations View map button after result', !!(await page.locator('button:has-text("View map")').count()));
  check('stations Export trùng button after result', !!(await page.locator('button:has-text("Export trùng")').count()));

  // apply filter -> result must reset
  await page.locator('button:has-text("Bộ lọc")').first().click();
  await page.waitForTimeout(500);
  await pickFirst(page, 'Tất cả trạng thái', 2);
  await page.locator('button:has-text("Áp dụng")').first().click();
  await page.waitForTimeout(1200);
  check('stations result reset after filter change', (await pairCount(page)) === null);

  await page.locator('button:has-text("Check trùng")').first().click();
  await page.waitForTimeout(3500);
  const filteredCount = await pairCount(page);
  check('stations check (filtered) returns pairs', filteredCount !== null, `pairs=${filteredCount}`);
  check('stations filtered <= unfiltered', filteredCount !== null && allCount !== null && filteredCount <= allCount, `${filteredCount} <= ${allCount}`);

  // === PROPOSALS ===
  await page.goto(BASE + '/admin/proposals');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1800);
  await page.locator('button:has-text("Check trùng")').first().click();
  await page.waitForTimeout(3500);
  const pAll = await pairCount(page);
  check('proposals check returns pairs', pAll !== null, `pairs=${pAll}`);

  await page.locator('button:has-text("Bộ lọc")').first().click();
  await page.waitForTimeout(500);
  await pickFirst(page, 'Tất cả tỉnh/thành', 1);
  await page.locator('button:has-text("Áp dụng")').first().click();
  await page.waitForTimeout(1200);
  check('proposals result reset after filter change', (await pairCount(page)) === null);
  await page.locator('button:has-text("Check trùng")').first().click();
  await page.waitForTimeout(3500);
  const pFiltered = await pairCount(page);
  check('proposals filtered check returns pairs', pFiltered !== null, `pairs=${pFiltered}`);
  check('proposals filtered <= unfiltered', pFiltered !== null && pAll !== null && pFiltered <= pAll, `${pFiltered} <= ${pAll}`);

  check('zero pageerror', errors.length === 0, errors.slice(0, 3).join(' | '));

  require('fs').writeFileSync('test-dupfilter-results.json', JSON.stringify({ results, errors }, null, 2));
  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) process.exitCode = 1;
}
main();
