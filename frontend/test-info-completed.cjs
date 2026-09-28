const { chromium } = require('playwright');
const mysql = require('../backend/node_modules/mysql2/promise');

const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
const check = (name, ok, extra) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
};

async function main() {
  const pool = mysql.createPool({ host: 'localhost', port: 3306, user: 'root', password: 'password', database: 'station_management' });
  const ids = {};
  const setup = async (key, deadlineSql, completed) => {
    const [ins] = await pool.query(
      `INSERT INTO station_proposals (user_id, status, latitude, longitude, owner_name, owner_phone, custom_data, supplement_deadline_at, info_completed_at)
       VALUES (1, 'PENDING', 10.1, 106.1, ?, '0900000000', CAST('{}' AS JSON), ${deadlineSql}, ${completed ? 'NOW()' : 'NULL'})`,
      [`TEST_FE_${key}`]
    );
    ids[key] = ins.insertId;
  };
  await setup('SOON', 'DATE_ADD(NOW(), INTERVAL 10 HOUR)', false);
  await setup('OVERDUE', 'DATE_SUB(NOW(), INTERVAL 2 HOUR)', false);
  await setup('DONE', 'DATE_ADD(NOW(), INTERVAL 10 HOUR)', true);
  await setup('FAR', 'DATE_ADD(NOW(), INTERVAL 3 DAY)', false);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    const res = await page.request.post(`${API}/api/auth/login`, { data: { email: 'admin@station.com', password: '123456' } });
    const { data } = await res.json();
    check('login admin OK', !!data.token);
    await page.goto(`${BASE}/admin/proposals`);
    await page.evaluate((t) => localStorage.setItem('token', t), data.token);
    await page.goto(`${BASE}/admin/proposals`);
    await page.waitForLoadState('networkidle');
    await page.locator('text=TEST_FE_SOON').first().waitFor({ timeout: 20000 });

    const bodyText = await page.textContent('body');
    check('bang hien badge Con han (sap het han)', /Còn \d+ ngày/.test(bodyText || ''));
    check('bang KHONG hien dem Qua han', !/Quá hạn/.test(bodyText || ''));
    check('bang hien dem nguoc xa han (dang Ngay)', /Còn 0[23] ngày \d{2}:\d{2}:\d{2}/.test(bodyText || ''));
    check('row qua han dung o 00 dong bang', (bodyText || '').includes('TEST_FE_OVERDUE') && /Còn 00 ngày 00:00:00/.test(bodyText || ''));
    const zeroBg = await page.locator('.badge', { hasText: 'Còn 00 ngày' }).first().evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => '');
    check('badge so 0 nen xam nhat', zeroBg.replace(/\s+/g, '') === 'rgb(243,244,246)', zeroBg);

    const myReopen = await page.request.post(`${API}/api/my-proposals/${ids.DONE}/reopen-info`, {
      headers: { Authorization: `Bearer ${data.token}` }
    });
    check('my-route reopen (chu record) 200', myReopen.status() === 200, `status=${myReopen.status()}`);
    const myConfirm = await page.request.post(`${API}/api/my-proposals/${ids.DONE}/confirm-info`, {
      headers: { Authorization: `Bearer ${data.token}` }
    });
    check('my-route confirm (chu record) 200', myConfirm.status() === 200, `status=${myConfirm.status()}`);

    await page.goto(`${BASE}/admin/proposals/view=${ids.SOON}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.popup-detail', { timeout: 15000 });
    await page.waitForTimeout(1500);
    const confirmBtn = page.locator('.popup-detail button:has-text("Xác nhận đã đủ thông tin")');
    check('popup hien nut xac nhan', await confirmBtn.count() === 1);
    const countdownAlert = await page.locator('.popup-detail .alert-warning, .popup-detail .alert-info').count();
    check('popup hien canh bao Con han', countdownAlert >= 1);
    await confirmBtn.first().click();
    await page.waitForSelector('.confirm-dialog', { timeout: 5000 });
    const dlgTitle = await page.textContent('.confirm-dialog');
    check('popup xac nhan chong bam nham', (dlgTitle || '').includes('Xác nhận đủ thông tin?'));
    await page.locator('.confirm-dialog button:has-text("Xác nhận")').click();
    await page.locator('.popup-detail button:has-text("Mở lại để bổ sung")').waitFor({ timeout: 10000 });
    check('xac nhan xong chuyen sang nut undo', true);
    const afterText = await page.textContent('.popup-detail');
    check('xac nhan xong an countdown', !/Còn \d+ ngày/.test(afterText || ''));

    await page.locator('.popup-detail button:has-text("Mở lại để bổ sung")').click();
    await page.waitForSelector('.confirm-dialog', { timeout: 5000 });
    const dlgTitle2 = await page.textContent('.confirm-dialog');
    check('undo co popup xac nhan', (dlgTitle2 || '').includes('Mở lại để bổ sung?'));
    await page.locator('.confirm-dialog button:has-text("Mở lại")').click();
    await page.locator('.popup-detail button:has-text("Xác nhận đã đủ thông tin")').waitFor({ timeout: 10000 });
    check('undo xong ve nut xac nhan', true);

    await page.goto(`${BASE}/admin/proposals/view=${ids.OVERDUE}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.popup-detail', { timeout: 15000 });
    await page.waitForTimeout(1500);
    const odText = await page.textContent('.popup-detail');
    check('popup qua han hien so 0 dong bang', /Còn 00 ngày 00:00:00/.test(odText || '') && !/Quá hạn \d|Hết hạn/.test(odText || ''));

    await page.goto(`${BASE}/my-proposals`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    const myText = await page.textContent('body');
    check('trang user khong hien Qua han', !/Quá hạn/.test(myText || ''));
  } finally {
    await browser.close();
    for (const k of Object.keys(ids)) {
      const id = ids[k];
      await pool.query('DELETE FROM proposal_activity_logs WHERE proposal_id = ?', [id]);
      await pool.query("DELETE FROM notifications WHERE entity_type = 'station_proposals' AND entity_id = ?", [id]);
      await pool.query('DELETE FROM station_proposals WHERE id = ?', [id]);
    }
    await pool.end();
  }
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nTOTAL ${results.length}, FAILED ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
