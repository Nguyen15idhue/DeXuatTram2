const { chromium } = require('playwright');
const mysql = require('../backend/node_modules/mysql2/promise');
const proposalService = require('../backend/src/services/proposalService');

const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
const check = (name, ok, extra) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
};

async function main() {
  const pool = mysql.createPool({ host: 'localhost', port: 3306, user: 'root', password: 'password', database: 'station_management' });
  const created = await proposalService.createProposal(1, {
    latitude: 21.0, longitude: 105.8,
    owner_name: 'Test FE Extend', owner_phone: '0900000033', address: 'Ha Noi',
    province: 'Thành phố Hà Nội', mo_hinh_dau_tu: 'TDT'
  }, { actorRole: 'SUPER_ADMIN' });
  const pid = created.id;
  check('setup tao de xuat', !!pid);
  const [d0] = await pool.query('SELECT supplement_deadline_at AS d FROM station_proposals WHERE id = ?', [pid]);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    const res = await page.request.post(`${API}/api/auth/login`, { data: { email: 'admin@station.com', password: '123456' } });
    const { data } = await res.json();
    await page.goto(`${BASE}/admin/proposals/edit=${pid}`);
    await page.evaluate((t) => localStorage.setItem('token', t), data.token);
    await page.goto(`${BASE}/admin/proposals/edit=${pid}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.popup-detail', { timeout: 15000 });
    await page.waitForTimeout(1500);

    const extBtn = page.locator('.popup-detail button:has-text("Gia hạn")');
    check('popup hien nut Gia han', await extBtn.count() >= 1);
    const beforeText = await page.textContent('.popup-detail');
    const beforeDay = (beforeText || '').match(/Còn (\d+) ngày/);
    await extBtn.first().click();
    await page.waitForSelector('.confirm-dialog', { timeout: 5000 });
    const dlgText = await page.textContent('.confirm-dialog');
    check('dialog co o ngay/gio/ly do', (dlgText || '').includes('Số ngày') && (dlgText || '').includes('Lý do gia hạn'));

    await page.locator('.confirm-dialog button:has-text("Gia hạn")').click();
    await page.waitForTimeout(800);
    const errText = await page.textContent('.confirm-dialog');
    check('validate ly do bat buoc', (errText || '').includes('Vui lòng nhập lý do gia hạn'));

    const dayInput = page.locator('.confirm-dialog input[type="number"]').first();
    await dayInput.fill('1');
    await page.locator('.confirm-dialog textarea').fill('Cho them thoi gian lay so');
    await page.locator('.confirm-dialog button:has-text("Gia hạn")').click();
    await page.waitForTimeout(2500);
    const [d1] = await pool.query('SELECT supplement_deadline_at AS d FROM station_proposals WHERE id = ?', [pid]);
    const diffH = Math.round((new Date(d1[0].d).getTime() - new Date(d0[0].d).getTime()) / 3600000);
    check('deadline duoc cong 24h', diffH === 24, `diff=${diffH}h`);
    const [lg] = await pool.query(
      "SELECT COUNT(*) AS n FROM proposal_activity_logs WHERE proposal_id = ? AND action = 'deadline_extended'",
      [pid]
    );
    check('ghi log deadline_extended', Number(lg[0].n) === 1, `logs=${lg[0].n}`);
    const afterText = await page.textContent('.popup-detail');
    const afterDay = (afterText || '').match(/Còn (\d+) ngày/);
    check('countdown hien gio moi', !!beforeDay && !!afterDay && Number(afterDay[1]) === Number(beforeDay[1]) + 1, `${beforeDay && beforeDay[0]} -> ${afterDay && afterDay[0]}`);
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
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
