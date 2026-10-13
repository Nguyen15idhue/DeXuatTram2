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
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const loginRes = await ctx.request.post(`${API}/api/auth/login`, { data: { email: 'admin@station.com', password: '123456' } });
  const { data } = await loginRes.json();
  await ctx.addInitScript((t) => localStorage.setItem('token', t), data.token);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${BASE}/admin/api-configs?tab=automation`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const el = [...document.querySelectorAll('button')].find((t) => t.textContent.includes('Đồng bộ báo cáo')); if (el) el.click(); });
  await page.waitForTimeout(1500);
  check('card sync -> url id=3', page.url().includes('id=3'), page.url());
  let txt = await page.evaluate(() => document.body.innerText);
  check('3 mini-tab', txt.includes('Cấu hình chung') && txt.includes('Mapping 2 cột') && txt.includes('Lịch sử đồng bộ'));

  await page.evaluate(() => { const el = [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent.includes('Mapping')); if (el) el.click(); });
  await page.waitForTimeout(1000);
  check('mini-tab url view=mapping', page.url().includes('view=mapping'), page.url());
  await page.evaluate(() => { const s = document.querySelectorAll('select')[0]; if (s) { s.value = '507'; s.dispatchEvent(new Event('change', { bubbles: true })); } });
  try {
    await page.waitForFunction(() => document.querySelectorAll('details').length > 10, null, { timeout: 15000 });
  } catch { /* assert below */ }
  txt = await page.evaluate(() => document.body.innerText);
  check('cay field 507 load', txt.includes('Chấm điểm và đánh giá'));

  const nHidden = await page.evaluate(() => document.querySelectorAll('details').length);
  await page.evaluate(() => { const c = document.querySelector('input.checkbox-xs'); if (c) c.click(); });
  await page.waitForTimeout(800);
  const nShown = await page.evaluate(() => document.querySelectorAll('details').length);
  check('toggle an/hien node he thong', nHidden < nShown, nHidden + ' -> ' + nShown);
  await page.evaluate(() => { const c = document.querySelector('input.checkbox-xs'); if (c && !c.checked) c.click(); });
  await page.waitForTimeout(800);

  await page.fill('input[placeholder*="Tìm trường"]', 'diem_1');
  try {
    await page.waitForFunction(() => document.body.innerText.includes('{diem_1}'), null, { timeout: 8000 });
  } catch { /* assert below */ }
  txt = await page.evaluate(() => document.body.innerText);
  check('search loc field', txt.includes('{diem_1}'));
  await page.fill('input[placeholder*="Tìm trường"]', '');

  let dropped = 'missing';
  let dropKw = '';
  for (let attempt = 0; attempt < 4 && dropped !== 'dropped'; attempt++) {
    dropKw = await page.evaluate(() => {
      const mapped = new Set([...document.querySelectorAll('[data-testid="sheet-col"]')].map((b) => {
        const m = b.textContent.match(/🔗\s*(\S+)/);
        return m ? m[1] : '';
      }));
      const all = [...document.querySelectorAll('.card-body [draggable="true"]')].filter((el) => el.querySelector('span.font-mono'));
      const src = all.find((el) => {
        const kw = el.querySelector('span.font-mono').textContent;
        return ![...mapped].some((mp) => mp === kw || mp.endsWith(kw));
      });
      return src ? src.querySelector('span.font-mono').textContent : '';
    });
    if (!dropKw) { dropped = 'missing:nomapcandidate'; await page.waitForTimeout(1500); continue; }
    await page.evaluate((kw) => {
      const all = [...document.querySelectorAll('.card-body [draggable="true"]')];
      const src = all.find((el) => { const s = el.querySelector('span.font-mono'); return s && s.textContent === kw; });
      const dt = new DataTransfer();
      if (src) src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    }, dropKw);
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const blocks = [...document.querySelectorAll('[data-testid="sheet-col"]')];
      const dst = blocks[blocks.length - 1];
      const dt = new DataTransfer();
      if (dst) {
        dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }));
        dst.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
      }
    });
    await page.waitForTimeout(600);
    const checkTxt = await page.evaluate(() => document.body.innerText);
    dropped = dropKw && checkTxt.includes(dropKw) ? 'dropped' : 'missing:retry';
  }
  check('keo-tha field vao cot', dropped === 'dropped', dropped + ' kw=' + dropKw);

  await page.evaluate(() => { const el = [...document.querySelectorAll('button')].find((t) => t.textContent.includes('Auto-match')); if (el) el.click(); });
  await page.waitForTimeout(2000);
  txt = await page.evaluate(() => document.body.innerText);
  check('auto-match them truong', txt.includes('Auto-match thêm') && !txt.includes('thất bại'));

  const colBefore = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="sheet-col"]');
    return el ? el.textContent.slice(0, 50) : '';
  });
  await page.evaluate(() => {
    const first = document.querySelector('[data-testid="sheet-col"]');
    const btn = first ? first.querySelector('button[title="Xuống"]') : null;
    if (btn) btn.click();
  });
  await page.waitForTimeout(800);
  const colAfter = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="sheet-col"]');
    return el ? el.textContent.slice(0, 50) : '';
  });
  check('mui ten doi vi tri cot', colBefore !== colAfter, colBefore.slice(0, 25) + ' -> ' + colAfter.slice(0, 25));

  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button[title^="Sửa header"]')];
    if (btns[0]) btns[0].click();
  });
  await page.waitForTimeout(800);
  check('sua header inline', await page.evaluate(() => !!document.querySelector('input.input-xs')));
  await page.keyboard.press('Escape');

  const mappedBefore = await page.evaluate(() => document.querySelectorAll('[data-testid="sheet-col"] [title="Gỡ map"]').length);
  await page.evaluate(() => {
    const blocks = [...document.querySelectorAll('[data-testid="sheet-col"]')].filter((b) => b.querySelector('[title="Gỡ map"]'));
    const last = blocks[blocks.length - 1];
    const btn = last ? last.querySelector('button[title^="Xóa cột"]') : null;
    if (btn) btn.click();
  });
  await page.waitForTimeout(800);
  txt = await page.evaluate(() => document.body.innerText);
  check('xoa cot hoi confirm full-overwrite', txt.includes('GHI ĐÈ TOÀN BỘ'));
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find((t) => t.textContent.trim() === 'Xác nhận');
    if (el) el.click();
  });
  await page.waitForTimeout(800);
  const mappedAfter = await page.evaluate(() => document.querySelectorAll('[data-testid="sheet-col"] [title="Gỡ map"]').length);
  check('xoa cot don vi tri', mappedAfter === mappedBefore - 1, mappedBefore + ' -> ' + mappedAfter);

  check('khong runtime error', errors.length === 0, errors.slice(0, 2).join(' | '));
  await browser.close();
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nTOTAL ${results.length}, FAILED ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
