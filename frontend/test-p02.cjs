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
  const rStatic = await page.request.get(`${API}/uploads/general/09-09-2026/1788970099114-31twxebccse.xlsx`);
  check('BE /uploads static removed', rStatic.status() === 404, `status=${rStatic.status()}`);
  const rNoAuth = await page.request.get(`${API}/api/files/1071/download`);
  check('BE download no-auth blocked', [401, 403, 404].includes(rNoAuth.status()) && rNoAuth.status() !== 200, `status=${rNoAuth.status()}`);
  const rImgNoAuth = await page.request.get(`${API}/api/files/1070/image`);
  check('BE image no-auth blocked', rImgNoAuth.status() !== 200, `status=${rImgNoAuth.status()}`);
  const login = await page.request.post(`${API}/api/auth/login`, { data: { email: 'admin@station.com', password: '123456' } });
  const lj = await login.json();
  const token = lj.data?.token;
  check('BE login ok', !!token);
  const rAuth = await page.request.get(`${API}/api/files/1071/download`, { headers: { Authorization: `Bearer ${token}` } });
  check('BE download admin ok', rAuth.status() === 200, `status=${rAuth.status()}`);
  const rImgTokenQ = await page.request.get(`${API}/api/files/1070/image?token=${encodeURIComponent(token)}`);
  check('BE image ?token= query works or blocked-by-ownership', [200, 403].includes(rImgTokenQ.status()), `status=${rImgTokenQ.status()}`);

  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'admin@station.com');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/admin/stations`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  const body = await page.content();
  check('FE /admin/stations loads', body.length > 5000, `len=${body.length}`);
  const noUploadsRef = !body.includes('/uploads/');
  check('FE no /uploads/ direct refs in HTML', noUploadsRef, noUploadsRef ? 'clean' : 'found /uploads/');
  await page.goto(`${BASE}/profile`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  const pbody = await page.content();
  check('FE /profile loads', pbody.length > 3000, `len=${pbody.length}`);

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  require('fs').writeFileSync('test-p02-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
