const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
  const login = await page.request.post(`${API}/api/auth/login`, { data: { email: 'admin@station.com', password: '123456' } });
  const { data } = await login.json();
  await page.goto(`${BASE}/login`);
  await page.evaluate((t) => localStorage.setItem('token', t), data.token);
  await page.goto(`${BASE}/map`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);
  const unit = await page.evaluate(async () => {
    const mi = await import('/src/utils/mapMarkerIcons.js');
    await mi.loadMarkerIconConfig(true);
    const ids = ['target', 'plus', 'check', 'clipboardList', 'draftingCompass', 'construction', 'crosshair', 'foldMap', 'sparkles', 'flag'];
    const bad = ids.filter((id) => !mi.isValidMarkerIcon(id) || !mi.iconSvgMarkup(id, { size: 16 }).includes('<svg'));
    const groups = mi.MARKER_ICON_GROUPS.find((g) => g.title === 'Ghim quy hoạch');
    return { bad, groupN: groups ? groups.icons.length : -1, planning: mi.getMarkerIcon('PLANNING', 'station'), planningBg: mi.getMarkerIconBg('PLANNING', 'station') };
  });
  console.log(JSON.stringify(unit));
  console.log(unit.bad.length === 0 && unit.groupN === 10 ? 'PASS: 10 icon hop le + nhom du 10' : 'FAIL: icon/group');
  console.log(unit.planning === 'target' && unit.planningBg === 'circle' ? 'PASS: quy hoach = target + tron trang' : 'FAIL: default quy hoach');
  await page.click('.map-filter-toggle');
  await page.waitForTimeout(400);
  await page.getByLabel('Quy hoạch').check();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-plan60-icons.png' });
  console.log(errs.length === 0 ? 'PASS: khong loi runtime' : `FAIL: ${errs.join(' | ')}`);
  await browser.close();
}
main();
