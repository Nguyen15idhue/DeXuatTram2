require('dotenv').config();
const pool = require('../src/utils/db');

const D = 'tmt-vietnam.com';
const TT = {
  BAC: { email: `thanhnn.egreen@${D}`, pb: 'Trung tâm KD miền Bắc', cv: 'Giám đốc Trung tâm Kinh doanh' },
  TRUNG: { email: `thuongpx.egreen@${D}`, pb: 'Trung tâm KD miền Trung', cv: 'Giám đốc Trung tâm Kinh doanh' },
  NAM: { email: `nhatnh.egreen@${D}`, pb: 'Trung tâm KD miền Nam', cv: 'Giám đốc Trung tâm Kinh doanh' }
};
const KV = [
  [`duydbk.egreen@${D}`, 'BAC'], [`trieunq.egreen@${D}`, 'BAC'], [`namth.egreen@${D}`, 'BAC'],
  [`huynhtv.egreen@${D}`, 'BAC'], [`trunglq.egreen@${D}`, 'BAC'], [`thaontt.egreen@${D}`, 'BAC'],
  [`binhltt.egreen@${D}`, 'BAC'], [`anhln.egreen@${D}`, 'TRUNG'], [`luannbd.egreen@${D}`, 'TRUNG'],
  [`quocpt.egreen@${D}`, 'NAM'], [`trungpd.egreen@${D}`, 'NAM'], [`taild.egreen@${D}`, 'NAM']
];
const OTHERS = [
  [`tonggiamdoc-egreen@${D}`, 'Ban Tổng Giám đốc', 'Tổng Giám đốc'],
  [`namtt.egreen@${D}`, 'Ban Tổng Giám đốc', 'Phó Tổng Giám đốc'],
  [`phongnh.egreen@${D}`, 'Kênh Nhà phân phối', 'Phó Tổng Giám đốc Quản lý và Phát triển Nhà phân phối'],
  [`cuongth.egreen@${D}`, 'Kênh Nhà phân phối', 'Trưởng phòng phụ trách kênh NPP'],
  [`thanhmv.egreen@${D}`, 'Phòng Setup và Vận hành', 'Trưởng phòng Setup và Vận hành'],
  [`phuongnth.egreen@${D}`, 'Back office', 'Admin'],
  [`chink.egreen@${D}`, 'Back office', 'Admin'],
  [`loanvb.egreen@${D}`, 'Back office', 'Trợ lý Tổng Giám đốc'],
  [`duonglv.egreen@${D}`, 'Phòng Chính sách và Phát triển dự án', 'TP chính sách và phát triển dự án'],
  [`tudn.egreen@${D}`, 'Phòng Chiến lược KD', 'Chuyên viên Chiến lược Kinh doanh'],
  [`truongphongcongnghe-egreen@${D}`, 'Phòng Công nghệ và Quy hoạch', 'Trưởng phòng Công nghệ và Quy hoạch'],
  [`thangnv.egreen@${D}`, 'Phòng Công nghệ và Quy hoạch', 'Chuyên viên Quy hoạch'],
  [`hungvq.egreen@${D}`, 'Phòng Setup và Vận hành', 'Chuyên viên Kỹ thuật'],
  [`nguyendv.egreen@${D}`, 'Phòng Công nghệ và Quy hoạch', 'Chuyên viên Công nghệ'],
  [`trangnt.egreen@${D}`, 'Phòng Chính sách và Phát triển dự án', 'Chuyên viên Phát triển Dự án']
];

const setCustom = async (id, pb, cv) => {
  const [rows] = await pool.query('SELECT custom_data FROM users WHERE id = ?', [id]);
  let cd = {};
  try { cd = rows[0].custom_data ? (typeof rows[0].custom_data === 'string' ? JSON.parse(rows[0].custom_data) : rows[0].custom_data) : {}; } catch { cd = {}; }
  if (pb) cd.department = pb;
  if (cv) cd.chuc_vu = cv;
  if ('phong_ban' in cd) delete cd.phong_ban;
  await pool.query('UPDATE users SET custom_data = ? WHERE id = ?', [JSON.stringify(cd), id]);
};

async function main() {
  const stats = { role: 0, parent: 0, dept: 0, skipped: [] };
  const idOf = async (email) => {
    const [r] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    return r.length ? r[0].id : null;
  };
  const ttIds = {};
  for (const k of Object.keys(TT)) {
    const id = await idOf(TT[k].email);
    if (!id) { stats.skipped.push(TT[k].email); continue; }
    const [u] = await pool.query('SELECT role, parent_id FROM users WHERE id = ?', [id]);
    if (u[0].role !== 'SALES') { await pool.query("UPDATE users SET role = 'SALES', parent_id = NULL WHERE id = ?", [id]); stats.role++; }
    else if (u[0].parent_id !== null) { await pool.query('UPDATE users SET parent_id = NULL WHERE id = ?', [id]); stats.parent++; }
    await setCustom(id, TT[k].pb, TT[k].cv); stats.dept++;
    ttIds[k] = id;
  }
  for (const [email, region] of KV) {
    const id = await idOf(email);
    if (!id || !ttIds[region]) { stats.skipped.push(email); continue; }
    const [u] = await pool.query('SELECT role, parent_id FROM users WHERE id = ?', [id]);
    if (u[0].role !== 'SALES') { await pool.query("UPDATE users SET role = 'SALES' WHERE id = ?", [id]); stats.role++; }
    if (u[0].parent_id !== ttIds[region]) { await pool.query('UPDATE users SET parent_id = ? WHERE id = ?', [ttIds[region], id]); stats.parent++; }
    await setCustom(id, TT[region].pb, 'Giám đốc Khu vực'); stats.dept++;
  }
  for (const [email, pb, cv] of OTHERS) {
    const id = await idOf(email);
    if (!id) { stats.skipped.push(email); continue; }
    await setCustom(id, pb, cv); stats.dept++;
  }
  console.log(JSON.stringify(stats));
  process.exit(0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
