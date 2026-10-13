const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
async function main() {
  const results = [];
  const check = (name, ok, info = '') => {
    results.push(ok);
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${info ? ' — ' + info : ''}`);
  };
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 140)));
  const login = await page.request.post(`${API}/api/auth/login`, { data: { email: 'admin@station.com', password: '123456' } });
  const { data } = await login.json();
  await page.goto(`${BASE}/login`);
  await page.evaluate((t) => localStorage.setItem('token', t), data.token);
  await page.goto(`${BASE}/admin/proposals/view=689`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  const hasCountdown = await page.$('text=Còn');
  check('popup de xuat co countdown', !!hasCountdown);
  const giahan = await page.$('button:has-text("Gia hạn")');
  check('nut Gia han', !!giahan);
  if (giahan) {
    await giahan.click();
    await page.waitForTimeout(2000);
    const txt = await page.evaluate(() => document.body.innerText);
    check('dialog hien gioi han', txt.includes('Tối đa') && txt.includes('Còn'), txt.match(/Tối đa[^\n]{0,40}/)?.[0] || '');
    const dayInput = await page.$('.confirm-dialog input[type="number"]');
    const maxAttr = dayInput ? await dayInput.getAttribute('max') : null;
    check('input ngay max=30', maxAttr === '30', `max=${maxAttr}`);
    await page.screenshot({ path: 'test-plan60-p5b.png' });
  }
  check('khong loi runtime', errs.length === 0, errs.join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r).length;
  console.log(`\nTOTAL: ${results.length - failed}/${results.length} PASS`);
  process.exit(failed ? 1 : 0);
}
main();
