const { chromium } = require('playwright');
const mysql = require('../backend/node_modules/mysql2/promise');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
const check = (name, ok, extra) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
};
const main = async () => {
  const pool = mysql.createPool({ host: 'localhost', port: 3306, user: 'root', password: 'password', database: 'station_management' });
  const [ins] = await pool.query(
    `INSERT INTO station_proposals (user_id, status, latitude, longitude, owner_name, owner_phone, custom_data, supplement_deadline_at, info_completed_at)
     VALUES (1, 'PENDING', 10.1, 106.1, 'TEST POPUP', '0900000000', CAST('{}' AS JSON), DATE_ADD(NOW(), INTERVAL 2 DAY), NULL)`
  );
  const pid = ins.insertId;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    const res = await page.request.post(`${API}/api/auth/login`, { data: { email: 'admin@station.com', password: '123456' } });
    const { data } = await res.json();
    await page.goto(`${BASE}/admin/proposals/view=${pid}`);
    await page.evaluate((t) => localStorage.setItem('token', t), data.token);
    await page.goto(`${BASE}/admin/proposals/view=${pid}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.popup-detail', { timeout: 15000 });
    await page.waitForTimeout(1500);

    await page.locator('.popup-detail button:has-text("Xem log")').click();
    await page.waitForSelector('.modal-box', { timeout: 8000 });
    check('mo popup log', true);
    await page.locator('.modal-box h3').click();
    await page.waitForTimeout(500);
    const parentOpen = await page.locator('.popup-detail').count() === 1;
    const logOpen = await page.locator('.modal-box').count() >= 1;
    check('click trong popup log khong tat popup cha', parentOpen && logOpen);

    const box = await page.locator('.modal-box').boundingBox();
    await page.mouse.click(box.x - 30, box.y + 100);
    await page.waitForTimeout(500);
    const logClosed = await page.locator('.modal-box').count() === 0;
    const parentStill = await page.locator('.popup-detail').count() === 1;
    check('click backdrop log chi tat log, cha van mo', logClosed && parentStill);

    await page.locator('.popup-detail button:has-text("Xác nhận đã đủ thông tin")').click();
    await page.waitForSelector('.confirm-dialog', { timeout: 5000 });
    await page.locator('.confirm-dialog').click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(500);
    const dlgOpen = await page.locator('.confirm-dialog').count() === 1;
    const parentStill2 = await page.locator('.popup-detail').count() === 1;
    check('click trong confirm dialog khong tat popup cha', parentStill2);
    await page.locator('.confirm-dialog button:has-text("Hủy")').click();
    check('dong confirm binh thuong', await page.locator('.confirm-dialog').count() === 0 && dlgOpen);
  } finally {
    await browser.close();
    await pool.query('DELETE FROM proposal_activity_logs WHERE proposal_id = ?', [pid]);
    await pool.query("DELETE FROM notifications WHERE entity_type = 'station_proposals' AND entity_id = ?", [pid]);
    await pool.query('DELETE FROM station_proposals WHERE id = ?', [pid]);
    await pool.end();
  }
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nTOTAL ${results.length}, FAILED ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
};
main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
