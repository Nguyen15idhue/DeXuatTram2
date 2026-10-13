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
  const login = await page.request.post(`${API}/api/auth/login`, { data: { email: 'admin@station.com', password: '123456' } });
  const { data } = await login.json();
  await page.goto(`${BASE}/login`);
  await page.evaluate((t) => localStorage.setItem('token', t), data.token);
  await page.goto(`${BASE}/map`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);

  const unit = await page.evaluate(async () => {
    const m = await import('/src/utils/mapHelpers.js');
    const mi = await import('/src/utils/mapMarkerIcons.js');
    const circle = m.createCustomIcon('#a855f7', 'flag', '1', 'circle').options.html;
    const flat = m.createCustomIcon('#22c55e', 'evStation', '', 'flat').options.html;
    const def = m.createCustomIcon('#22c55e', 'evStation', '').options.html;
    return {
      bgCircle: mi.getMarkerIconBg('PLANNING', 'station'),
      bgActive: mi.getMarkerIconBg('ACTIVE', 'station'),
      circleHasWhite: circle.includes('background-color: #ffffff') && circle.includes('border-radius: 50%'),
      circleHasBadge: circle.includes('>1</span>'),
      flatNoCircle: !flat.includes('border-radius: 50%') && flat.includes('drop-shadow'),
      defIsFlat: !def.includes('border-radius: 50%'),
    };
  });
  console.log(JSON.stringify(unit));
  check('PLANNING bg=circle', unit.bgCircle === 'circle');
  check('ACTIVE bg=flat (mac dinh)', unit.bgActive === 'flat');
  check('circle: nen trang tron + badge 1', unit.circleHasWhite && unit.circleHasBadge);
  check('flat: khong tron + co bong do', unit.flatNoCircle);
  check('thieu bg => flat', unit.defIsFlat);

  await page.click('.map-filter-toggle');
  await page.waitForTimeout(500);
  await page.getByLabel('Quy hoạch').check();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-plan60-p1c-planning.png' });
  check('bat Quy hoach trong filter', true);
  await browser.close();
  const failed = results.filter((r) => !r).length;
  console.log(`\nTOTAL: ${results.length - failed}/${results.length} PASS`);
  process.exit(failed ? 1 : 0);
}
main();
