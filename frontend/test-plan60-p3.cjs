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
  await page.goto(`${BASE}/admin/stations`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  const rows = await page.$$('tbody tr');
  check('bang tram co dong', rows.length > 0, `rows=${rows.length}`);
  if (rows.length === 0) { await browser.close(); process.exit(1); }
  await page.click('tbody tr:first-child button:has-text("Xem")');
  await page.waitForTimeout(2500);
  const viewBtn = await page.$('button:has-text("Xem bản đồ")');
  check('nut Xem ban do', !!viewBtn);
  if (!viewBtn) { await browser.close(); process.exit(1); }
  await viewBtn.click();
  await page.waitForTimeout(6000);
  await page.click('.location-map-fullscreen .map-filter-toggle');
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => {
    const modal = document.querySelector('.location-map-fullscreen');
    const r = modal ? modal.getBoundingClientRect() : null;
    return {
      has: !!modal,
      w: r ? Math.round(r.width) : 0,
      h: r ? Math.round(r.height) : 0,
      vw: window.innerWidth,
      vh: window.innerHeight,
      filter: !!document.querySelector('.location-map-modal .map-filter-toggle, .location-map-fullscreen .map-filter-toggle'),
      layer: !!document.querySelector('.location-map-fullscreen .map-layer-switcher'),
      legend: !!document.querySelector('.location-map-fullscreen .map-legend'),
      prioChips: document.querySelectorAll('.location-map-fullscreen .map-filter-chip').length,
    };
  });
  console.log(JSON.stringify(info));
  check('modal fullscreen', info.has && info.w >= info.vw - 2 && info.h >= info.vh - 2, `${info.w}x${info.h} vs ${info.vw}x${info.vh}`);
  check('co nut bo loc full', info.filter);
  check('co chuyen layer', info.layer);
  check('co chu thich', info.legend);
  check('chip filter day du', info.prioChips >= 10, `chips=${info.prioChips}`);
  await page.screenshot({ path: 'test-plan60-p3.png' });
  check('khong loi runtime', errs.length === 0, errs.join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r).length;
  console.log(`\nTOTAL: ${results.length - failed}/${results.length} PASS`);
  process.exit(failed ? 1 : 0);
}
main();
