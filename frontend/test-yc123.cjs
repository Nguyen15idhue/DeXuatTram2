const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];

const record = (name, pass, note = '') => {
  results.push({ name, pass: !!pass, note });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name}${note ? ' | ' + note : ''}`);
};

async function login(page, email) {
  const res = await page.request.post(`${API}/api/auth/login`, { data: { email, password: '123456' } });
  const json = await res.json();
  if (!json.success) throw new Error('login fail ' + email);
  await page.goto(`${BASE}/login`);
  await page.evaluate((t) => localStorage.setItem('token', t), json.data.token);
  return json.data;
}

async function hOverflow(page) {
  return await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
  page.on('console', (m) => { if (m.type() === 'error') console.log('   [console.error]', m.text()); });

  // ============== YC1: form responsive ==============
  await page.goto(`${BASE}/login`);
  await page.evaluate(() => localStorage.removeItem('token'));
  await page.goto(`${BASE}/de-xuat`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  let ov = await hOverflow(page);
  record('YC1 mobile /de-xuat: khong tran ngang', ov <= 2, `overflowPx=${ov}`);

  const stacked = await page.evaluate(() => {
    const row = document.querySelector('.form-row');
    const grid = document.querySelector('.dynamic-form-row');
    const rowDir = row ? getComputedStyle(row).flexDirection : '';
    const gridCols = grid ? getComputedStyle(grid).gridTemplateColumns : '';
    return { rowDir, gridCols };
  });
  record('YC1 mobile: form-row stack + grid 1 cot', stacked.rowDir === 'column' || stacked.gridCols.split(' ').length === 1, JSON.stringify(stacked));

  const wrapOk = await page.evaluate(() => {
    const ta = document.querySelector('textarea');
    const field = document.querySelector('.dynamic-form-field');
    if (!ta || !field) return true;
    ta.value = 'A'.repeat(300);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return ta.scrollWidth <= ta.clientWidth + 20 && field.scrollWidth <= field.clientWidth + 20;
  });
  record('YC1 mobile: textarea dai khong pha layout', wrapOk);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(500);
  ov = await hOverflow(page);
  record('YC1 desktop 1280: khong tran ngang', ov <= 2, `overflowPx=${ov}`);
  const rowDirDesktop = await page.evaluate(() => {
    const row = document.querySelector('.form-row');
    return row ? getComputedStyle(row).flexDirection : '';
  });
  record('YC1 desktop: form-row nam ngang', rowDirDesktop === 'row', rowDirDesktop);
  await page.setViewportSize({ width: 375, height: 800 });

  // ============== YC2: desc responsive ==============
  const admin = await login(page, 'admin@station.com');
  await page.waitForTimeout(400);
  const descRes = await page.request.post(`${API}/api/admin/1office/preview`, {
    headers: { Authorization: `Bearer ${admin.token}` },
    data: { apiConfigId: 3, proposalId: 438 }
  });
  const descJson = await descRes.json();
  const html = descJson.data && descJson.data.html ? descJson.data.html : '';
  record('YC2 preview desc co HTML', html.length > 0, `len=${html.length}`);
  record('YC2 desc dung flex (khong con width:140px/nowrap)', html.includes('display:flex') && !html.includes('width:140px') && !html.includes('white-space:nowrap'), '');

  for (const w of [320, 375]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0">${html}</body></html>`);
    await page.waitForTimeout(300);
    const ov2 = await hOverflow(page);
    record(`YC2 desc mobile ${w}px: khong tran ngang`, ov2 <= 2, `overflowPx=${ov2}`);
  }
  await page.setViewportSize({ width: 375, height: 800 });

  // ============== YC3 ==============
  // Admin bell
  await page.goto(`${BASE}/admin/proposals`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  let badge = null;
  try { await page.waitForSelector('.bell-badge', { timeout: 6000 }); badge = await page.$eval('.bell-btn .bell-badge', el => el.textContent); } catch { /* none */ }
  record('YC3 admin: chuong co badge', badge !== null, `badge=${badge}`);
  if (badge) {
    await page.click('.bell-btn');
    await page.waitForTimeout(800);
    const items = await page.$$eval('.bell-item', els => els.map(e => ({ border: getComputedStyle(e).borderLeftColor, text: e.innerText.trim().slice(0, 50) })));
    record('YC3 admin: dropdown thong bao co mau', items.length > 0, items[0] ? items[0].border : '');
    await page.mouse.click(5, 350);
    await page.waitForTimeout(300);
  }

  // Reject modal UI (khong confirm de tranh doi du lieu)
  const select = await page.$('table select.select-xs');
  if (select) {
    await select.selectOption('REJECTED');
    await page.waitForTimeout(600);
    const modalText = await page.$eval('.modal .modal-box', el => el.innerText).catch(() => '');
    record('YC3 admin: mo modal nhap ly do khi chon Tu choi', modalText.includes('Từ chối'), '');
    const disabled = await page.$eval('.modal .modal-box button.btn-error', el => el.disabled).catch(() => true);
    record('YC3 admin: nut xac nhan khoa khi chua nhap ly do', disabled === true, '');
    const cancelBtn = await page.$('.modal .modal-box button.btn-ghost');
    if (cancelBtn) await cancelBtn.click();
    await page.waitForTimeout(400);
  } else {
    record('YC3 admin: co select trang thai', false, '');
  }

  // Reject 438 that su qua API (de test CTV)
  await page.request.put(`${API}/api/admin/proposals/438/status`, {
    headers: { Authorization: `Bearer ${admin.token}` },
    data: { status: 'REJECTED', reason: 'Thiếu hồ sơ pháp lý, vui lòng bổ sung.' }
  });

  // CTV side
  const ctv = await login(page, 'ctv_branch@example.com');
  await page.waitForTimeout(400);
  await page.goto(`${BASE}/my-proposals`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  badge = null;
  try { await page.waitForSelector('.bell-badge', { timeout: 6000 }); badge = await page.$eval('.bell-btn .bell-badge', el => el.textContent); } catch { /* none */ }
  record('YC3 CTV: chuong co badge', badge !== null, `badge=${badge}`);
  if (badge) {
    await page.click('.bell-btn');
    await page.waitForTimeout(800);
    const ctvItems = await page.$$eval('.bell-item', els => els.map(e => ({ border: getComputedStyle(e).borderLeftColor, text: e.innerText })));
    const hasReject = ctvItems.some(i => i.text.includes('từ chối') || i.text.includes('Thiếu'));
    record('YC3 CTV: thong bao tu choi (mau do) + ly do', hasReject, '');
    await page.mouse.click(5, 350);
    await page.waitForTimeout(300);
  }

  await page.goto(`${BASE}/my-proposals/view=438`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  const banner = await page.$eval('.alert-error', el => el.innerText).catch(() => '');
  record('YC3 CTV: banner ly do tu choi trong chi tiet', banner.includes('từ chối') || banner.includes('Thiếu'), banner.slice(0, 50).replace(/\n/g, ' '));

  const hasEditBtn = await page.$$eval('button', els => els.some(e => e.textContent.trim() === 'Sửa'));
  record('YC3 CTV: co nut Sua cho de xuat REJECTED', hasEditBtn);

  // Edit -> luu -> PENDING
  await page.goto(`${BASE}/my-proposals/edit=438`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  const saveBtn = await page.$('.popup-footer button.btn-primary');
  if (saveBtn) {
    const label = await saveBtn.textContent();
    record('YC3 CTV: nut luu la "Gui lai" khi REJECTED', label.trim() === 'Gửi lại', `label=${label.trim()}`);
    const popupOverflow = await page.evaluate(() => {
      const b = document.querySelector('.popup-body');
      return b ? b.scrollWidth - b.clientWidth : -1;
    });
    record('YC1 popup edit: khong tran ngang (scrollWidth=clientWidth)', popupOverflow <= 2, `overflowPx=${popupOverflow}`);
    await saveBtn.click();
    await page.waitForTimeout(2500);
    const st = await page.request.get(`${API}/api/admin/proposals/438`, { headers: { Authorization: `Bearer ${admin.token}` } });
    const sj = await st.json();
    const status = sj.data ? sj.data.status : '?';
    record('YC3 CTV: sua & gui lai => PENDING', status === 'PENDING', `status=${status}`);
  } else {
    record('YC3 CTV: co nut trong popup edit', false, '');
  }

  await browser.close();

  fs.writeFileSync('test-yc123-results.json', JSON.stringify({ results, at: new Date().toISOString() }, null, 2));
  const failed = results.filter(r => !r.pass);
  console.log(`\n=== TONG: ${results.length - failed.length}/${results.length} PASS ===`);
  if (failed.length) { console.log('FAILED:', failed.map(f => f.name).join(' | ')); process.exitCode = 1; }
}
main().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(2); });
