const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
const check = (name, ok, extra) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
};

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 } });
  const loginRes = await ctx.request.post(`${API}/api/auth/login`, { data: { email: 'admin@station.com', password: '123456' } });
  const { data } = await loginRes.json();
  await ctx.addInitScript((t) => localStorage.setItem('token', t), data.token);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let lastGet = null;
  page.on('response', async (r) => {
    try {
      const u = r.url();
      if (u.endsWith('/api/admin/automations/auto_assign_process') && r.request().method() === 'GET') lastGet = await r.text();
    } catch { /* ignore */ }
  });

  await page.goto(`${BASE}/admin/api-configs`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const el = [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent.includes('Automation')); if (el) el.click(); });
  await page.waitForTimeout(1500);
  check('url co ?tab=automation', page.url().includes('tab=automation'), page.url());

  let txt = await page.evaluate(() => document.body.innerText);
  check('tab hien danh sach khoi', txt.includes('Tự động gán công việc quy trình') && txt.includes('ID 1'));
  check('khong show full form o list', !txt.includes('Work API token'));

  await page.evaluate(() => { const el = [...document.querySelectorAll('button')].find((t) => t.textContent.includes('Tự động gán công việc quy trình')); if (el) el.click(); });
  await page.waitForTimeout(1500);
  check('click khoi -> url co id=', page.url().includes('tab=automation') && page.url().includes('id=1'), page.url());
  txt = await page.evaluate(() => document.body.innerText);
  check('detail hien 3 khoi', txt.includes('Tài khoản 1Office') && txt.includes('Lịch sử thực hiện') && txt.includes('Chạy thủ công'));

  const overlap = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('.card-body .form-control').forEach((fc, i) => {
      const label = fc.querySelector(':scope > .label');
      const input = fc.querySelector(':scope > .input, :scope > input, :scope > select');
      if (!label || !input) return;
      const lr = label.getBoundingClientRect();
      const ir = input.getBoundingClientRect();
      if (lr.width === 0 || ir.width === 0) return;
      const vOverlap = lr.bottom > ir.top + 1 && lr.top < ir.bottom - 1;
      const hOverlap = lr.left < ir.right - 1 && lr.right > ir.left + 1;
      if (vOverlap && hOverlap) bad.push(i);
    });
    return bad;
  });
  check('form khong chong cheo', overlap.length === 0, 'overlap idx: ' + JSON.stringify(overlap));

  check('GET khong lo password', !!lastGet && !lastGet.includes('password_enc') && lastGet.includes('password_set'));
  check('khong runtime error', errors.length === 0, errors.slice(0, 2).join(' | '));

  await page.goto(`${BASE}/admin/api-configs?tab=automation&id=999`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  const bad = await page.evaluate(() => document.body.innerText);
  check('id sai hien loi + nut ve', bad.includes('Không tìm thấy automation ID 999'));

  await browser.close();
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nTOTAL ${results.length}, FAILED ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
