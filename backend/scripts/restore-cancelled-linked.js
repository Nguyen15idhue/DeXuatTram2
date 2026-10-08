require('dotenv').config();
const pool = require('../src/utils/db');

const RESTORE_REASON = 'Khôi phục đề xuất liên kết 1Office bị hủy';

async function selectTargets(connection) {
  const [rows] = await connection.query(
    `SELECT id, ma_de_xuat_gen AS ma_de_xuat, reject_reason, supplement_deadline_at, transition_deadline_at,
            contact_1office_id, contact_1office_code, sync_status
     FROM station_proposals
     WHERE status = 'CANCELLED'
       AND (contact_1office_id IS NOT NULL OR contact_1office_code IS NOT NULL)
     ORDER BY id`
  );
  return rows;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const targets = await selectTargets(pool);

  console.log(`[restore-cancelled-linked] mode=${apply ? 'APPLY' : 'DRY-RUN'} | tim thay ${targets.length} record(s) CANCELLED da lien ket 1Office`);
  targets.forEach((r) => {
    console.log(
      `  ${String(r.id).padStart(6)} | ${String(r.ma_de_xuat || '-').padEnd(14)} | reason: ${r.reject_reason ? String(r.reject_reason).slice(0, 60) : 'NULL'} | supp: ${r.supplement_deadline_at ? String(r.supplement_deadline_at).slice(0, 19) : 'NULL'} | trans: ${r.transition_deadline_at ? String(r.transition_deadline_at).slice(0, 19) : 'NULL'} | 1office: ${r.contact_1office_code || r.contact_1office_id}`
    );
  });

  if (!apply) {
    console.log('[restore-cancelled-linked] DRY-RUN — khong thay doi du lieu. Chay lai voi --apply de thuc hien.');
    process.exit(0);
  }

  let restored = 0;
  for (const r of targets) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [res] = await conn.query(
        `UPDATE station_proposals
         SET status = 'REVIEWING',
             info_completed_at = NOW(),
             reject_reason = NULL,
             updated_at = NOW()
         WHERE id = ? AND status = 'CANCELLED'`,
        [r.id]
      );
      if (res.affectedRows > 0) {
        await conn.query(
          `INSERT INTO proposal_activity_logs
             (proposal_id, action, from_status, to_status, reject_reason, actor_id, actor_role, source, manual_override)
           VALUES (?, 'status_change', 'CANCELLED', 'REVIEWING', ?, NULL, NULL, 'script', 1)`,
          [r.id, RESTORE_REASON]
        );
        restored++;
        console.log(`  restored #${r.id} (${r.ma_de_xuat}) -> REVIEWING`);
      } else {
        console.log(`  skip #${r.id}: khong con khop dieu kien`);
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      console.error(`  loi #${r.id}:`, e.message);
    } finally {
      conn.release();
    }
  }

  console.log(`[restore-cancelled-linked] tong=${targets.length} | restored=${restored}`);
  console.log('[restore-cancelled-linked] ghi nho: khong notification, khong push 1Office, khong cham api_queue_logs');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
