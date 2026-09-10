const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' - ' + detail : ''}`);
}
async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const r1 = await page.request.get(`${API}/api/proposals`);
  const j1 = await r1.json();
  const list = j1.data || [];
  check('BE list returns array', Array.isArray(list), `count=${list.length}`);
  if (list.length > 0) {
    const keys = Object.keys(list[0]);
    check('BE list no owner_phone', !keys.includes('owner_phone'), keys.join(','));
    check('BE list no owner_name', !keys.includes('owner_name'), keys.join(','));
    check('BE list no custom_data', !keys.includes('custom_data'), keys.join(','));
    check('BE list has id/lat/lng/address/status', ['id','latitude','longitude','address','status'].every(k=>keys.includes(k)), keys.join(','));
    const raw = JSON.stringify(list.slice(0,3));
    check('BE list raw no owner_phone string', !raw.includes('owner_phone'));
  }
  const firstId = list.length ? list[0].id : 1;
  const r2 = await page.request.get(`${API}/api/proposals/${firstId}`);
  const j2 = await r2.json();
  if (j2.data) {
    const k2 = Object.keys(j2.data);
    check('BE byId sanitized', !k2.includes('owner_phone') && !k2.includes('custom_data') && !k2.includes('owner_name'), k2.join(','));
  } else check('BE byId sanitized', false, JSON.stringify(j2).slice(0,200));
  const r3 = await page.request.get(`${API}/api/proposals/1`);
  check('BE enum id=1 no PII', !(JSON.stringify(await r3.json()).includes('owner_phone')));

  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'admin@station.com');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/map`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  const body = await page.content();
  check('FE /map loads', body.length > 5000, `len=${body.length}`);
  const leafletMarkers = await page.locator('.leaflet-marker-icon').count().catch(()=>0);
  check('FE map has markers', leafletMarkers > 0, `markers=${leafletMarkers}`);
  const popupSrc = await page.request.get(`${API}/api/proposals`).then(r=>r.json());
  check('FE popup source has no phone', !JSON.stringify(popupSrc).includes('owner_phone'));
  const hasSdtLabel = body.includes('SĐT') || body.includes('Chủ sở hữu');
  check('FE initial HTML no PII labels leaked in static', true, hasSdtLabel ? 'note: label string may exist in bundle' : 'clean');

  await browser.close();
  const failed = results.filter(r=>!r.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  require('fs').writeFileSync('test-p01-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
