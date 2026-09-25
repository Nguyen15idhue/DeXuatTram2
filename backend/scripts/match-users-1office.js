try { require('dotenv').config(); } catch { /* env provided by container */ }
const pool = require('../src/utils/db');

const APPLY = process.argv.includes('--apply');
const SYSTEM = '1office';

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const parseCd = (v) => {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return {}; }
};

async function getCanonicalOptions(entity, key) {
  const [rows] = await pool.query('SELECT `options` FROM field_definitions WHERE entity=? AND `key`=? LIMIT 1', [entity, key]);
  const map = new Map();
  if (rows.length && rows[0].options) {
    let opts = rows[0].options;
    if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch { opts = []; } }
    (opts || []).forEach((o) => {
      const v = (o && typeof o === 'object') ? (o.value ?? o.label) : o;
      if (v != null) map.set(norm(v), v);
    });
  }
  return map;
}

async function main() {
  const cvMap = await getCanonicalOptions('users', 'chuc_vu');
  const pbMap = await getCanonicalOptions('users', 'department');

  const [euRows] = await pool.query(
    'SELECT id, external_id, contact_id, code, fullname, department_name, raw_data FROM external_users WHERE `system`=? AND is_active=1',
    [SYSTEM]
  );
  const byEmail = new Map();
  const byName = new Map();
  euRows.forEach((r) => {
    const raw = parseCd(r.raw_data);
    const rec = { ...r, raw, jobTitle: raw.job_title || raw.job_title_name || '' };
    const email = raw.email ? String(raw.email).trim().toLowerCase() : '';
    if (email) byEmail.set(email, rec);
    const nm = norm(r.fullname);
    if (nm) { if (!byName.has(nm)) byName.set(nm, []); byName.get(nm).push(rec); }
  });

  const [users] = await pool.query('SELECT id, full_name, email, role, parent_id, external_id, custom_data FROM users ORDER BY id');

  const matchReport = [];
  const unmatched = [];
  const extChanges = [];
  const matched = new Map();

  for (const u of users) {
    const email = u.email ? String(u.email).trim().toLowerCase() : '';
    let eu = email ? byEmail.get(email) : null;
    if (!eu) {
      const cand = byName.get(norm(u.full_name)) || [];
      if (cand.length === 1) eu = cand[0];
    }
    if (!eu) { unmatched.push(u); continue; }
    matched.set(u.id, eu);
    matchReport.push({ user: u, eu });

    if (!u.external_id) {
      extChanges.push({ userId: u.id, name: u.full_name, from: null, to: eu.code });
    } else if (eu.code && String(u.external_id) !== String(eu.code)) {
      extChanges.push({ userId: u.id, name: u.full_name, from: u.external_id, to: eu.code, conflict: true });
    }
  }

  const [mapRows] = await pool.query('SELECT user_id, external_id FROM user_external_map WHERE `system`=?', [SYSTEM]);
  const mapByUser = new Map(mapRows.map((r) => [Number(r.user_id), String(r.external_id)]));
  const mapByExt = new Map(mapRows.map((r) => [String(r.external_id), Number(r.user_id)]));
  const mapChanges = [];
  for (const { user, eu } of matchReport) {
    const cur = mapByUser.get(Number(user.id));
    const wanted = String(eu.external_id);
    if (cur === wanted) continue;
    const owner = mapByExt.get(wanted);
    if (owner && owner !== Number(user.id)) {
      mapChanges.push({ userId: user.id, name: user.full_name, from: cur ?? null, to: wanted, conflict: `đã thuộc user ${owner}` });
      continue;
    }
    mapChanges.push({ userId: user.id, name: user.full_name, from: cur ?? null, to: wanted });
  }

  const proposals = [];
  for (const { user, eu } of matchReport) {
    const cd = parseCd(user.custom_data);
    const p = { userId: user.id, name: user.full_name };
    if (!cd.department && eu.department_name) {
      const canon = pbMap.get(norm(eu.department_name));
      if (canon) p.department = canon;
    }
    if (!cd.chuc_vu && eu.jobTitle) {
      const canon = cvMap.get(norm(eu.jobTitle));
      if (canon) p.chuc_vu = canon;
    }
    if (p.department || p.chuc_vu) proposals.push(p);
  }

  const propById = new Map(proposals.map((p) => [p.userId, p]));
  const byDept = {};
  for (const u of users) {
    const cd = parseCd(u.custom_data);
    const prop = propById.get(u.id) || {};
    const dept = cd.department || prop.department || '';
    const cv = cd.chuc_vu || prop.chuc_vu || '';
    if (cv === 'Giám đốc Trung tâm Kinh doanh' || cv === 'Giám đốc Khu vực') {
      if (!byDept[dept]) byDept[dept] = { gdtt: [], gdkv: [] };
      if (cv === 'Giám đốc Trung tâm Kinh doanh') byDept[dept].gdtt.push(u);
      else byDept[dept].gdkv.push(u);
    }
  }
  const parentChanges = [];
  for (const [dept, g] of Object.entries(byDept)) {
    if (g.gdtt.length !== 1) {
      parentChanges.push({ warn: `Phòng "${dept || '(trống)'}" có ${g.gdtt.length} GĐTT → bỏ qua phân nhánh` });
      continue;
    }
    const gdtt = g.gdtt[0];
    if (gdtt.parent_id !== null) parentChanges.push({ userId: gdtt.id, name: gdtt.full_name, role: gdtt.role, dept, from: gdtt.parent_id, to: null });
    g.gdkv.forEach((k) => {
      if (Number(k.parent_id) !== Number(gdtt.id)) {
        parentChanges.push({ userId: k.id, name: k.full_name, role: k.role, dept, from: k.parent_id, to: gdtt.id });
      }
    });
  }

  const line = (s) => console.log(s);
  line('=== MATCH users ↔ 1Office ===');
  line(`Tổng users: ${users.length} | matched: ${matchReport.length} | unmatched: ${unmatched.length}`);
  matchReport.forEach(({ user, eu }) => line(`  ${user.id}\t${user.full_name}\t→\t#${eu.external_id} ${eu.code}\t${eu.fullname}\t${eu.department_name}`));
  if (unmatched.length) {
    line('--- UNMATCHED ---');
    unmatched.forEach((u) => line(`  ${u.id}\t${u.full_name}\t${u.email}\t${u.role}`));
  }
  line('\n=== external_id changes (Mã NV) ===');
  extChanges.length ? extChanges.forEach((c) => line(`  ${c.userId} ${c.name}: ${c.from ?? '(trống)'} → ${c.to}${c.conflict ? '  [CONFLICT]' : ''}`)) : line('  (none)');
  line('\n=== user_external_map changes ===');
  mapChanges.length ? mapChanges.forEach((c) => line(`  ${c.userId} ${c.name}: ${c.from ?? '(chưa)'} → ${c.to}${c.conflict ? '  [CONFLICT] ' + c.conflict : ''}`)) : line('  (none)');
  line('\n=== department/chuc_vu fill (chỉ khi trống) ===');
  proposals.length ? proposals.forEach((p) => line(`  ${p.userId} ${p.name}:${p.department ? ' pb=' + p.department : ''}${p.chuc_vu ? ' cv=' + p.chuc_vu : ''}`)) : line('  (none)');
  line('\n=== phân nhánh (parent_id) ===');
  parentChanges.length ? parentChanges.forEach((c) => c.warn ? line('  [WARN] ' + c.warn) : line(`  ${c.userId} ${c.name} (${c.role}, ${c.dept}): ${c.from ?? 'NULL'} → ${c.to ?? 'NULL'}`)) : line('  (none)');

  if (!APPLY) {
    line('\n(DRY-RUN) Chưa ghi gì. Chạy lại với --apply để áp dụng.');
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let n = 0;
    for (const c of extChanges) {
      if (c.conflict) continue;
      await conn.query("UPDATE users SET external_id=? WHERE id=? AND (external_id IS NULL OR external_id='')", [c.to, c.userId]);
      n++;
    }
    for (const c of mapChanges) {
      if (c.conflict) continue;
      await conn.query('INSERT INTO user_external_map (user_id, `system`, external_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE external_id=VALUES(external_id)', [c.userId, SYSTEM, c.to]);
      n++;
    }
    for (const p of proposals) {
      const [rows] = await conn.query('SELECT custom_data FROM users WHERE id=?', [p.userId]);
      const cd = parseCd(rows[0].custom_data);
      if (p.department && !cd.department) cd.department = p.department;
      if (p.chuc_vu && !cd.chuc_vu) cd.chuc_vu = p.chuc_vu;
      await conn.query('UPDATE users SET custom_data=? WHERE id=?', [JSON.stringify(cd), p.userId]);
      n++;
    }
    for (const c of parentChanges) {
      if (c.warn) continue;
      await conn.query('UPDATE users SET parent_id=? WHERE id=?', [c.to, c.userId]);
      n++;
    }
    await conn.commit();
    line(`\nĐÃ ÁP DỤNG: ${n} thay đổi.`);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
