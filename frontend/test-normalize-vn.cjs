const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' - ' + detail : ''}`);
}
const hasBad = (s) => /[\uFFFD]/.test(s) || /[ÃÂ][\x80-\xBF\u00A0-\u00FF]/.test(s);

async function main() {
  const token = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@station.com', password: '123456' }) }).then(r => r.json()).then(j => j.data?.token);
  const H = { Authorization: `Bearer ${token}` };

  const p = await fetch(`${API}/api/admin/proposals?search=TDT_HCM_0005`, { headers: H }).then(r => r.json());
  const desc = p.data?.[0]?.description || '';
  check('BE proposal desc no mojibake', !hasBad(desc), `hasTitle=${desc.includes('Thông tin cơ bản')} len=${desc.length}`);
  check('BE proposal desc normalized title', desc.includes('Thông tin cơ bản') && !desc.includes('Th�ng'), desc.slice(0, 60).replace(/\n/g, '\\n'));

  const files = await fetch(`${API}/api/files/11`, { headers: H }).then(r => r.json());
  check('BE file name recovered', files.data?.original_name?.startsWith('TÀI LIỆU') && !hasBad(files.data.original_name), files.data?.original_name);

  const dl = await fetch(`${API}/api/data-lists/4/children?column=xa&parent_column=tinh&parent_value=${encodeURIComponent('Tỉnh Lào Cai')}`).then(r => r.json());
  const opts = (dl.data?.options || []).map(o => o.value);
  check('BE datalist xa NFC (Mỏ Vàng)', opts.includes('Xã Mỏ Vàng') && !opts.some(hasBad), `n=${opts.length} sample=${opts.slice(0, 3)}`);

  const views = await fetch(`${API}/api/views/7`).then(r => r.json());
  check('BE view desc normalized', !hasBad(JSON.stringify(views)), JSON.stringify(views?.data?.description || views).slice(0, 60));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 100)));
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'admin@station.com');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);

  await page.goto(`${BASE}/admin/proposals/view=403`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  const t1 = await page.locator('body').innerText();
  check('FE proposal detail renders normalized', t1.includes('Thông tin cơ bản') || t1.includes('Thông tin'), t1.slice(0, 100).replace(/\n/g, ' '));
  check('FE proposal detail no mojibake char', !/[\uFFFD]/.test(t1), '');

  await page.goto(`${BASE}/admin/forms`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);
  const t2 = await page.locator('body').innerText();
  check('FE forms page loads', t2.includes('Form') || t2.length > 2000, t2.slice(0, 80).replace(/\n/g, ' '));
  check('FE no page errors', errs.length === 0, errs.join('|').slice(0, 150));

  await browser.close();
  const failed = results.filter(x => !x.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  require('fs').writeFileSync('test-normalize-vn-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
