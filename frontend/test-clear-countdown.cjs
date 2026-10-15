const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? ' — ' + extra : ''}`);
};

async function loginAs(page, email) {
  const res = await page.request.post(`${API}/api/auth/login`, { data: { email, password: '123456' } });
  const j = await res.json();
  await page.goto(BASE + '/login');
  await page.evaluate((t) => localStorage.setItem('token', t), j.data.token);
  return j.data.token;
}

async function selectRows(page, n) {
  const boxes = page.locator('table tbody input[type="checkbox"]');
  const total = await boxes.count();
  let picked = 0;
  for (let i = 0; i < total && picked < n; i++) {
    await boxes.nth(i).click();
    picked++;
    await page.waitForTimeout(150);
  }
  return picked;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message).slice(0, 160)));

  // ADMIN
  await loginAs(page, 'admin@station.com');
  await page.goto(BASE + '/admin/proposals');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  check('no old "Cập nhật" toolbar button', (await page.locator('button:has-text("Cập nhật")').count()) === 0 || !(await page.locator('button span:has-text("Cập nhật")').count()));
  check('bulk button hidden before selection', (await page.locator('button:has-text("Cập nhật Countdown")').count()) === 0);

  const picked = await selectRows(page, 2);
  check('selected 2 rows', picked === 2, `picked=${picked}`);
  await page.waitForTimeout(400);
  const bulkBtn = page.locator('button:has-text("Cập nhật Countdown")').first();
  check('bulk button visible after selection', (await bulkBtn.count()) > 0);
  check('bulk button shows count (2)', (await bulkBtn.textContent()).includes('(2)'));
  check('bulk button has confirm icon (lucide)', (await bulkBtn.locator('svg').count()) > 0);

  await bulkBtn.click();
  await page.waitForTimeout(500);
  const dialog = page.locator('.confirm-dialog');
  check('confirm popup opens', (await dialog.count()) > 0);
  const dtext = (await dialog.textContent().catch(() => '')) || '';
  check('popup has info (2 đề xuất)', /2 đề xuất/.test(dtext), dtext.replace(/\s+/g, ' ').slice(0, 120));
  check('popup warns bổ sung + chuyển trạng thái', /Bổ sung thông tin/.test(dtext) && /Chuyển trạng thái/.test(dtext));
  await page.locator('.confirm-dialog button:has-text("Hủy")').first().click();
  await page.waitForTimeout(400);
  check('cancel closes popup', (await page.locator('.confirm-dialog').count()) === 0);

  // SALES
  await loginAs(page, 'duonglv.egreen@tmt-vietnam.com');
  await page.goto(BASE + '/admin/proposals');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1800);
  await selectRows(page, 1);
  await page.waitForTimeout(400);
  check('SALES does NOT see bulk button', (await page.locator('button:has-text("Cập nhật Countdown")').count()) === 0);

  check('zero pageerror', errors.length === 0, errors.slice(0, 3).join(' | '));

  require('fs').writeFileSync('test-clear-countdown-results.json', JSON.stringify({ results, errors }, null, 2));
  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) process.exitCode = 1;
}
main();
