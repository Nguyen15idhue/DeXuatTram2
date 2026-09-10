const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' - ' + detail : ''}`);
}
async function main() {
  const st = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'sales_test@example.com', password: '123456' }) }).then(r => r.json()).then(j => j.data?.token);
  let r = await fetch(`${API}/api/files/1060/image`, { headers: { Authorization: `Bearer ${st}` } });
  check('BE image with auth ok', r.status === 200 && (r.headers.get('content-type') || '').startsWith('image/'), `status=${r.status}`);
  r = await fetch(`${API}/api/files/1060/image`);
  check('BE image without auth blocked', r.status === 403, `status=${r.status}`);
  r = await fetch(`${API}/api/files/1060/image?token=${encodeURIComponent(st)}`);
  check('BE image ?token= ok', r.status === 200, `status=${r.status}`);
  r = await fetch(`${API}/api/files/1060/download`, { headers: { Authorization: `Bearer ${st}` } });
  check('BE download with auth ok', r.status === 200, `status=${r.status}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  const w1 = await page.evaluate(async ({ api, token }) => {
    const img = new Image();
    img.src = `${api}/api/files/1060/image?token=${encodeURIComponent(token)}`;
    await new Promise(res => { img.onload = res; img.onerror = res; });
    document.body.appendChild(img);
    await new Promise(r => setTimeout(r, 500));
    return img.naturalWidth;
  }, { api: API, token: st });
  check('FE <img> with token renders', w1 > 0, `width=${w1}`);
  const w2 = await page.evaluate(async ({ api }) => {
    const img = new Image();
    img.src = `${api}/api/files/1060/image`;
    await new Promise(res => { img.onload = res; img.onerror = res; });
    await new Promise(r => setTimeout(r, 500));
    return img.naturalWidth;
  }, { api: API });
  check('FE <img> without token blocked', w2 === 0, `width=${w2}`);
  await browser.close();
  const failed = results.filter(x => !x.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  require('fs').writeFileSync('test-h12-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
