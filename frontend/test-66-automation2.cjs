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
  let lastPut = null;
  page.on('response', async (r) => {
    try {
      const u = r.url();
      if (u.endsWith('/api/admin/automations/auto_assign_process') && r.request().method() === 'GET') lastGet = await r.text();
      if (u.endsWith('/api/admin/automations/auto_assign_process') && r.request().method() === 'PUT') lastPut = await r.text();
    } catch { /* ignore */ }
  });
  await page.goto(`${BASE}/admin/api-configs`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const el = [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent.includes('Automation')); if (el) el.click(); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const el = [...document.querySelectorAll('button')].find((t) => t.textContent.includes('Tự động gán công việc quy trình')); if (el) el.click(); });
  await page.waitForTimeout(1500);

  const txt = await page.evaluate(() => document.body.innerText);
  check('hien da luu password/token', txt.includes('đã lưu ••••••'));
  check('GET van khong lo secret', !!lastGet && !lastGet.includes('password_enc') && !lastGet.includes('api_token_enc') && lastGet.includes('password_set'), (lastGet || '').slice(0, 100));

  await page.evaluate(() => { const el = [...document.querySelectorAll('button')].find((t) => t.textContent.includes('Lưu cấu hình')); if (el) el.click(); });
  await page.waitForTimeout(1500);
  check('luu trong pass van giu cu', !!lastPut && lastPut.includes('"password_set":true') && !lastPut.includes('password_enc'), (lastPut || '').slice(0, 120));

  const txtRuns = await page.evaluate(() => document.body.innerText);
  check('lich su co dong chay', txtRuns.includes('LK_NAN_0011'));
  const eyeCount = await page.evaluate(() => document.querySelectorAll('button[title="Xem chi tiết"]').length);
  console.log('INFO | eye buttons: ' + eyeCount);
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('tbody tr')];
    const hit = rows.find((tr) => tr.textContent.includes('Thành công'));
    const el = hit ? hit.querySelector('button[title="Xem chi tiết"]') : null;
    if (el) el.click();
  });
  await page.waitForTimeout(2000);
  const modalTxt = await page.evaluate(() => {
    const m = document.querySelector('.modal.modal-open');
    return m ? m.innerText : '';
  });
  check('modal mat xem hien JSON', modalTxt.includes('Chi tiết lượt chạy') && modalTxt.includes('moved'), modalTxt.slice(0, 200));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  await page.evaluate(() => { const s = document.querySelector('select'); if (s) { s.value = 'success'; s.dispatchEvent(new Event('change', { bubbles: true })); } });
  await page.waitForTimeout(1500);
  const fTxt = await page.evaluate(() => document.body.innerText);
  check('filter success loc dung', fTxt.includes('LK_NAN_0011'));

  await page.evaluate(() => {
    const pw = document.querySelectorAll('input[type="password"]')[0];
    if (pw) { pw.focus(); pw.value = ''; pw.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await page.fill('input[type="password"]', 'sai-mat-khau-123');
  await page.evaluate(() => { const el = [...document.querySelectorAll('button')].find((t) => t.textContent.includes('Test đăng nhập')); if (el) el.click(); });
  await page.waitForTimeout(2500);
  const wTxt = await page.evaluate(() => ({ url: location.href, body: document.body.innerText }));
  check('sai pass bao loi, khong vang login', wTxt.url.includes('/admin/api-configs') && (wTxt.body.includes('Sai tai khoan') || wTxt.body.includes('thất bại')), wTxt.url);

  check('khong runtime error', errors.length === 0, errors.slice(0, 2).join(' | '));

  await browser.close();
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nTOTAL ${results.length}, FAILED ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
