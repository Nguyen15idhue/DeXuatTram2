const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' - ' + detail : ''}`);
}
async function main() {
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const fd = new FormData();
  fd.append('file', new Blob([PNG], { type: 'image/png' }), 'h18.png');
  const up = await fetch(`${API}/api/files/guest-upload`, { method: 'POST', body: fd }).then(r => r.json());
  check('BE guest upload stores submitter_ip', up.success && !!up.data?.submitter_ip, `ip=${up.data?.submitter_ip}`);
  const token = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@station.com', password: '123456' }) }).then(r => r.json()).then(j => j.data?.token);
  if (up.data?.id) await fetch(`${API}/api/files/${up.data.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 100)));
  await page.goto(`${BASE}/de-xuat`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  const txt = await page.locator('body').innerText();
  check('FE guest form loads', txt.includes('Đề xuất'), txt.slice(0, 80).replace(/\n/g, ' '));
  check('FE no page errors', errs.length === 0, errs.join('|').slice(0, 150));
  await browser.close();
  const failed = results.filter(x => !x.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  require('fs').writeFileSync('test-h18-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
