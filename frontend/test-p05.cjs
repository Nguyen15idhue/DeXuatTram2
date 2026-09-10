const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' - ' + detail : ''}`);
}
async function main() {
  const sToken = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@station.com', password: '123456' }) }).then(r => r.json()).then(j => j.data?.token);
  check('BE login', !!sToken);
  const H = { Authorization: `Bearer ${sToken}` };
  let r = await fetch(`${API}/api/admin/users/3`, { headers: H });
  check('BE GET /admin/users/:id', r.status === 200, `status=${r.status}`);
  r = await fetch(`${API}/api/admin/users/99999`, { headers: H });
  check('BE GET /admin/users/99999 404', r.status === 404, `status=${r.status}`);
  const st2 = await fetch(`${API}/api/stations?page=2&limit=10`).then(x => x.json());
  const stId = st2.data?.[0]?.id;
  const pr2 = await fetch(`${API}/api/admin/proposals?page=2&limit=10`, { headers: H }).then(x => x.json());
  const prId = pr2.data?.[0]?.id;
  check('BE fixtures page2', !!(stId && prId), `station=${stId} proposal=${prId}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'admin@station.com');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);

  await page.goto(`${BASE}/admin/users/view=3`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  let txt = await page.locator('body').innerText();
  check('FE /admin/users/view=3 opens record', !txt.includes('Không tìm thấy') && (txt.includes('user2@example.com') || txt.includes('Chi tiết') || txt.includes('User')), txt.slice(0, 150).replace(/\n/g, ' '));

  if (stId) {
    await page.goto(`${BASE}/admin/stations/view=${stId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    txt = await page.locator('body').innerText();
    check(`FE /admin/stations/view=${stId} (page2) opens`, !txt.includes('Không tìm thấy bản ghi'), txt.slice(0, 150).replace(/\n/g, ' '));
  }
  if (prId) {
    await page.goto(`${BASE}/admin/proposals/view=${prId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    txt = await page.locator('body').innerText();
    check(`FE /admin/proposals/view=${prId} (page2) opens`, !txt.includes('Không tìm thấy'), txt.slice(0, 150).replace(/\n/g, ' '));
  }
  await browser.close();
  const failed = results.filter(x => !x.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  require('fs').writeFileSync('test-p05-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
