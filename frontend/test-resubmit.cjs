const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const out = [];
const log = (n, p, note = '') => { out.push({ n, p: !!p, note }); console.log(`${p ? 'PASS' : 'FAIL'} | ${n}${note ? ' | ' + note : ''}`); };

async function login(page, email) {
  const res = await page.request.post(`${API}/api/auth/login`, { data: { email, password: '123456' } });
  const j = await res.json();
  await page.goto(`${BASE}/login`);
  await page.evaluate((t) => localStorage.setItem('token', t), j.data.token);
  return j.data;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const admin = await login(page, 'admin@station.com');
  const adminH = { Authorization: `Bearer ${admin.token}` };

  // Baseline: so thong bao cua CTV 33 va admin
  const ctvLogin = await page.request.post(`${API}/api/auth/login`, { data: { email: 'ctv@gmail.com', password: '123456' } });
  const ctv = (await ctvLogin.json()).data;
  const ctvH = { Authorization: `Bearer ${ctv.token}` };
  const beforeCtv = (await (await page.request.get(`${API}/api/notifications/unread-count`, { headers: ctvH })).json()).data.count;
  const beforeAdmin = (await (await page.request.get(`${API}/api/notifications/unread-count`, { headers: adminH })).json()).data.count;
  console.log(`baseline: CTV33 unread=${beforeCtv}, admin unread=${beforeAdmin}`);

  // 1) Admin reject proposal 431 (owner CTV 33) qua UI modal
  await page.goto(`${BASE}/admin/proposals`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await page.fill('input[placeholder="Tìm theo tên, địa chỉ, SĐT, mã đề xuất..."]', 'User Test B6C');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1800);

  const row = page.locator('tr', { hasText: 'User Test B6C' }).first();
  const sel = row.locator('select.select-xs');
  const hasRow = await sel.count();
  log('Tim thay de xuat 431 cua CTV', hasRow > 0, '');
  if (hasRow > 0) {
    await sel.selectOption('REJECTED');
    await page.waitForTimeout(700);
    await page.fill('.modal .modal-box textarea', 'Thiếu giấy tờ, vui lòng bổ sung và gửi lại.');
    await page.waitForTimeout(300);
    await page.click('.modal .modal-box button.btn-error');
    await page.waitForTimeout(2500);
  }

  // 2) CTV nhan thong bao
  const afterCtv = (await (await page.request.get(`${API}/api/notifications/unread-count`, { headers: ctvH })).json()).data.count;
  log('Reject => CTV nhan thong bao (unread tang)', afterCtv > beforeCtv, `before=${beforeCtv} after=${afterCtv}`);

  // 3) CTV UI: bell + edit -> nut "Gui lai"
  await login(page, 'ctv@gmail.com');
  await page.goto(`${BASE}/my-proposals`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  const badge = await page.$eval('.bell-btn .bell-badge', el => el.textContent).catch(() => null);
  log('CTV bell co badge', badge !== null, `badge=${badge}`);

  await page.goto(`${BASE}/my-proposals/edit=431`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1800);
  const btnText = await page.$eval('.popup-footer button.btn-primary', el => el.textContent.trim()).catch(() => '');
  log('Nut luu doi thanh "Gui lai" khi REJECTED', btnText === 'Gửi lại', `text='${btnText}'`);

  if (btnText === 'Gửi lại') {
    await page.click('.popup-footer button.btn-primary');
    await page.waitForTimeout(2800);
    const st = (await (await page.request.get(`${API}/api/admin/proposals/431`, { headers: adminH })).json()).data;
    log('An "Gui lai" => status PENDING', st && st.status === 'PENDING', `status=${st && st.status}`);
  }

  // 4) Reviewer (admin) nhan thong bao gui lai
  const afterAdmin = (await (await page.request.get(`${API}/api/notifications/unread-count`, { headers: adminH })).json()).data.count;
  log('Gui lai => reviewer nhan thong bao', afterAdmin > beforeAdmin, `before=${beforeAdmin} after=${afterAdmin}`);

  await browser.close();
  const failed = out.filter(x => !x.p);
  console.log(`\n=== ${out.length - failed.length}/${out.length} PASS ===`);
  if (failed.length) process.exitCode = 1;
}
main().catch(e => { console.error('ERR', e); process.exit(2); });
