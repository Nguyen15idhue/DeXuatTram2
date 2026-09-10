const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' - ' + detail : ''}`);
}
async function main() {
  const bad = await fetch(`${API}/api/proposals/guest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ latitude: 21.0285, longitude: 105.8542, owner_name: 'T', owner_phone: '0912345678', address: 'HN', captcha_token: '' }) }).then(async x => ({ status: x.status, j: await x.json() }));
  check('BE guest explicit-false bypasses captcha (not captcha err)', !(bad.j.message || '').includes('captcha'), `status=${bad.status} msg=${(bad.j.message || '').slice(0, 60)}`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${BASE}/de-xuat`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  const txt = await page.locator('body').innerText();
  check('FE /de-xuat loads guest form', txt.length > 500 && (txt.includes('Đề xuất') || txt.includes('Gửi')), txt.slice(0, 120).replace(/\n/g, ' '));
  await browser.close();
  const failed = results.filter(x => !x.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  require('fs').writeFileSync('test-p06-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
