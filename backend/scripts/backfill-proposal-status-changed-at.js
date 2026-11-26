require('dotenv').config();
const pool = require('../src/utils/db');
const { LOCK_NAME } = require('../src/services/proposal/proposalSheetSyncService');

const backfill = async (connection, apply) => {
  const counts = { eligible: 0, missing: 0, mismatch: 0, updated: 0, concurrent: 0 };
  let lastId = 0;
  while (true) {
    const [rows] = await connection.query(
        `SELECT p.id, p.status, l.id AS log_id, l.to_status, l.created_at AS log_created_at
           FROM station_proposals p
           LEFT JOIN proposal_status_change_times t ON t.proposal_id = p.id
           LEFT JOIN proposal_activity_logs l ON l.id = (
             SELECT l2.id FROM proposal_activity_logs l2
              WHERE l2.proposal_id = p.id
                AND (l2.action = 'created' OR
                     (l2.action = 'status_change' AND NOT (l2.from_status <=> l2.to_status)))
              ORDER BY l2.created_at DESC, l2.id DESC LIMIT 1
           )
          WHERE p.id > ? AND t.proposal_id IS NULL ORDER BY p.id LIMIT 200`,
        [lastId]
    );
    if (!rows.length) break;
    for (const row of rows) {
      lastId = row.id;
      if (!row.log_id || !row.to_status || !row.log_created_at) {
        counts.missing++;
      } else if (row.to_status !== row.status) {
        counts.mismatch++;
      } else {
        counts.eligible++;
        if (apply) {
          await connection.beginTransaction();
          let insertingTime = true;
          try {
            const [result] = await connection.query(
                `INSERT INTO proposal_status_change_times (proposal_id, status, changed_at)
                 SELECT p.id, p.status, l.created_at FROM station_proposals p
                   JOIN proposal_activity_logs l ON l.id = ?
                  WHERE p.id = ? AND p.status = ? AND l.created_at IS NOT NULL
                    AND NOT EXISTS (SELECT 1 FROM proposal_status_change_times t WHERE t.proposal_id = p.id)`,
                [row.log_id, row.id, row.status]
            );
            insertingTime = false;
            if (result.affectedRows === 1) {
              await connection.query(
                  `INSERT INTO proposal_sheet_sync_queue
                    (proposal_id, operation, requested_version, synced_version, status, attempt_count, next_attempt_at)
                   VALUES (?, 'UPSERT', 1, 0, 'PENDING', 0, NOW())
                   ON DUPLICATE KEY UPDATE
                     requested_version = requested_version + 1, operation = 'UPSERT',
                     status = IF(status = 'PROCESSING', 'PROCESSING', 'PENDING'),
                     attempt_count = IF(status = 'PROCESSING', attempt_count, 0),
                     next_attempt_at = NOW(), last_error = NULL, updated_at = NOW()`,
                  [row.id]
              );
              counts.updated++;
            } else counts.concurrent++;
            await connection.commit();
          } catch (error) {
            await connection.rollback();
            if (insertingTime && error.code === 'ER_DUP_ENTRY') {
              counts.concurrent++;
              continue;
            }
            throw error;
          }
        }
      }
    }
  }
  return counts;
};

const main = async () => {
  const args = new Set(process.argv.slice(2));
  const allowed = new Set(['--apply', '--confirm-backup', '--confirm-workers-stopped']);
  const unknown = [...args].filter((arg) => !allowed.has(arg));
  if (unknown.length) throw new Error(`Tham số không hợp lệ: ${unknown.join(', ')}`);
  const apply = args.has('--apply');
  if (apply && (!args.has('--confirm-backup') || !args.has('--confirm-workers-stopped'))) {
    throw new Error('Cần sao lưu dữ liệu, dừng worker đề xuất và xác nhận bằng --confirm-backup --confirm-workers-stopped');
  }
  const connection = await pool.getConnection();
  let locked = false;
  try {
    if (apply) {
      const [locks] = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [LOCK_NAME]);
      locked = Number(locks[0]?.acquired) === 1;
      if (!locked) throw new Error('Worker đồng bộ đang chạy; dừng worker rồi thử lại');
    }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...await backfill(connection, apply) }));
  } finally {
    try {
      if (locked) await connection.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
    } finally {
      connection.release();
    }
  }
};

if (require.main === module) {
  main()
    .catch((error) => { console.error(`[ProposalStatusBackfill] ${error.message}`); process.exitCode = 1; })
    .finally(() => pool.end());
}

module.exports = { backfill };
