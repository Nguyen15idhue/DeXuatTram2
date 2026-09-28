const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mysql = require('../backend/node_modules/mysql2/promise');
const proposalService = require('../backend/src/services/proposalService');

const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
const check = (name, ok, extra) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
};

const makePng = (filePath, seed) => {
  const b = Buffer.alloc(200);
  b[0] = 0x89; b[1] = 0x50; b[2] = 0x4e; b[3] = 0x47; b[4] = 0x0d; b[5] = 0x0a; b[6] = 0x1a; b[7] = 0x0a;
  b.writeUInt32BE(seed, 20);
  fs.writeFileSync(filePath, b);
};

async function main() {
  const pool = mysql.createPool({ host: 'localhost', port: 3306, user: 'root', password: 'password', database: 'station_management' });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-rename-'));
  const png1 = path.join(tmpDir, 'tu do A.png');
  const png2 = path.join(tmpDir, 'tu do B.png');
  makePng(png1, 101);
  makePng(png2, 102);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const res = await page.request.post(`${API}/api/auth/login`, { data: { email: 'admin@station.com', password: '123456' } });
  const { data } = await res.json();
  const dummyFd = new FormData();
  dummyFd.append('file', new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' }), 'dummy.png');
  const dummyUp = await fetch(`${API}/api/files/upload`, {
    method: 'POST', headers: { Authorization: `Bearer ${data.token}` }, body: dummyFd
  });
  if (!dummyUp.ok) throw new Error(`dummy upload HTTP ${dummyUp.status}: ${(await dummyUp.text()).slice(0, 120)}`);
  const dummyJson = await dummyUp.json();
  const dummy = dummyJson.data;
  check('setup upload dummy OK', !!dummy.id);

  const created = await proposalService.createProposal(1, {
    latitude: 21.0, longitude: 105.8,
    owner_name: 'Test FE Rename', owner_phone: '0900000022', address: 'Ha Noi',
    province: 'Thành phố Hà Nội', xa_phuong: 'Phường Hoàn Kiếm', mo_hinh_dau_tu: 'TDT',
    dien_tich_mat_bang: '100', nguon_dien: 'Điện lưới', quan_he_mat_bang: 'chu_dat',
    loai_tru: 'AC 7kW', investment_cost: 1000000,
    doi_tac: 'Test', lk_dia_chi_dkkd: 'Test', lk_mst: '123', nq_mst: '123',
    loai_khach_hang: 'Cá nhân',
    CCCD_ng_dai_dien: [dummy], dkkd_cccd_hkd: [dummy],
    hien_trang_mat_bang: [dummy], legal_document: [dummy],
    tdt_tru: [{ loai_tru: 'Test', so_luong: 1, don_gia: 1000 }],
    tdt_chi_phi_khac: [{ loai_chi_phi: 'Test', so_tien: 1000 }]
  }, { actorRole: 'SUPER_ADMIN' });
  const pid = created.id;
  const ma = created.ma_de_xuat;
  check('setup tao de xuat TDT', !!pid && !!ma, `ma=${ma}`);

  try {
    await page.goto(`${BASE}/admin/proposals/edit=${pid}`);
    await page.evaluate((t) => localStorage.setItem('token', t), data.token);
    await page.goto(`${BASE}/admin/proposals/edit=${pid}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.popup-detail', { timeout: 15000 });
    await page.waitForTimeout(1500);

    const fileInput = page.locator('[data-field-key="vi_tri_lap_tru"] input[type="file"]');
    check('tim thay o upload vi_tri_lap_tru', await fileInput.count() === 1);
    await fileInput.setInputFiles([png1, png2]);
    await page.waitForFunction(() => !document.body.textContent.includes('Đang upload'), { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const beforeSave = await page.textContent('.popup-detail');
    check('upload xong hien ten tu do', (beforeSave || '').includes('tu do A.png'));

    await page.locator('.popup-footer button:has-text("Lưu")').click();
    await page.locator('.popup-detail button:has-text("Sửa")').waitFor({ timeout: 20000 });
    check('luu thanh cong ve view mode', true);
    const afterSave = await page.textContent('.popup-detail');
    const exp1 = `${ma}_Ảnh vị trí dự kiến lắp đặt trụ sạc_1.png`;
    const exp2 = `${ma}_Ảnh vị trí dự kiến lắp đặt trụ sạc_2.png`;
    check('UI khong con ten tu do', !(afterSave || '').includes('tu do A.png'));
    await page.locator('[data-field-key="vi_tri_lap_tru"] .field-file-btn:has-text("Xem file")').click();
    await page.waitForTimeout(1500);
    const fileListText = await page.textContent('body');
    check('UI hien ten chuan sau luu (file1)', (fileListText || '').includes(exp1));
    check('UI hien ten chuan sau luu (file2)', (fileListText || '').includes(exp2));

    const [pr] = await pool.query('SELECT custom_data FROM station_proposals WHERE id = ?', [pid]);
    const cd = typeof pr[0].custom_data === 'string' ? JSON.parse(pr[0].custom_data) : pr[0].custom_data;
    const names = (cd.vi_tri_lap_tru || []).map((f) => f.original_name).sort();
    check('DB luu dung 2 ten chuan', names.length === 2 && names[0] === exp1 && names[1] === exp2, names.join(' | '));
    const [frow] = await pool.query('SELECT id FROM files WHERE original_name = ? LIMIT 1', [exp1]);
    const dl = await fetch(`${API}/api/files/${frow[0].id}/download?token=${encodeURIComponent(data.token)}`);
    const disp = dl.headers.get('content-disposition') || '';
    check('download dung ten chuan', dl.status === 200 && disp.includes(encodeURIComponent(exp1).slice(0, 30)), `status=${dl.status}`);
  } finally {
    await browser.close();
    const [pr] = await pool.query('SELECT custom_data FROM station_proposals WHERE id = ?', [pid]).catch(() => [[{}]]);
    try {
      const cd = typeof pr[0].custom_data === 'string' ? JSON.parse(pr[0].custom_data) : pr[0].custom_data;
      const allFiles = [];
      Object.values(cd || {}).forEach((v) => {
        (Array.isArray(v) ? v : (v ? [v] : [])).forEach((f) => { if (f && f.id) allFiles.push(f.id); });
      });
      for (const fid of [...new Set(allFiles)]) {
        await pool.query("UPDATE files SET status = 'deleted' WHERE id = ?", [fid]);
      }
    } catch { /* silent */ }
    await pool.query('DELETE FROM proposal_activity_logs WHERE proposal_id = ?', [pid]);
    await pool.query("DELETE FROM notifications WHERE entity_type = 'station_proposals' AND entity_id = ?", [pid]);
    await pool.query('DELETE FROM station_proposals WHERE id = ?', [pid]);
    await pool.end();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nTOTAL ${results.length}, FAILED ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  try { fs.writeFileSync(path.join(os.tmpdir(), 'ferename-stack.txt'), e.stack || String(e)); } catch { /* silent */ }
  console.error('FATAL', e.message);
  process.exit(2);
});
