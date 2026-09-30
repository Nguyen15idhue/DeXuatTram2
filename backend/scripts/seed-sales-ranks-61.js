const pool = require('../src/utils/db');

const D = 'tmt-vietnam.com';
const GDTT_NPP = `phongnh.egreen@${D}`;
const GDKV_NPP = `cuongth.egreen@${D}`;
const GDTT_CSDA = `duonglv.egreen@${D}`;
const GDKV_CSDA = `trangnt.egreen@${D}`;

async function main() {
  const stats = { role: 0, parent: 0, skipped: [] };
  const idOf = async (email) => {
    const [r] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    return r.length ? r[0].id : null;
  };
  const pairs = [
    { gdtt: GDTT_NPP, gdkv: GDKV_NPP },
    { gdtt: GDTT_CSDA, gdkv: GDKV_CSDA },
  ];
  for (const p of pairs) {
    const gdttId = await idOf(p.gdtt);
    const gdkvId = await idOf(p.gdkv);
    if (!gdttId) stats.skipped.push(p.gdtt);
    if (!gdkvId) stats.skipped.push(p.gdkv);
    if (gdttId) {
      const [u] = await pool.query('SELECT role, parent_id FROM users WHERE id = ?', [gdttId]);
      if (u[0].role !== 'SALES') { await pool.query("UPDATE users SET role = 'SALES' WHERE id = ?", [gdttId]); stats.role++; }
      if (u[0].parent_id !== null) { await pool.query('UPDATE users SET parent_id = NULL WHERE id = ?', [gdttId]); stats.parent++; }
    }
    if (gdkvId && gdttId) {
      const [u] = await pool.query('SELECT role, parent_id FROM users WHERE id = ?', [gdkvId]);
      if (u[0].role !== 'SALES') { await pool.query("UPDATE users SET role = 'SALES' WHERE id = ?", [gdkvId]); stats.role++; }
      if (Number(u[0].parent_id) !== Number(gdttId)) { await pool.query('UPDATE users SET parent_id = ? WHERE id = ?', [gdttId, gdkvId]); stats.parent++; }
    }
  }
  console.log(JSON.stringify(stats));
  process.exit(0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
