require('dotenv').config();
const pool = require('../src/utils/db');

async function main() {
  const [proposals] = await pool.query(
    'SELECT id, user_id, status, reject_reason, reviewed_by, reviewed_at, created_at FROM station_proposals ORDER BY id'
  );
  let created = 0;
  let reviewed = 0;
  let skipped = 0;

  for (const p of proposals) {
    const [hasLog] = await pool.query(
      'SELECT COUNT(*) AS n FROM proposal_activity_logs WHERE proposal_id = ?',
      [p.id]
    );
    if (hasLog[0].n > 0) {
      skipped++;
      continue;
    }
    await pool.query(
      `INSERT INTO proposal_activity_logs (proposal_id, action, from_status, to_status, actor_id, source, created_at)
       VALUES (?, 'created', NULL, 'PENDING', ?, 'user', ?)`,
      [p.id, p.user_id || null, p.created_at]
    );
    created++;
    if (p.reviewed_at && p.status !== 'PENDING') {
      await pool.query(
        `INSERT INTO proposal_activity_logs (proposal_id, action, from_status, to_status, reject_reason, actor_id, source, created_at)
         VALUES (?, 'status_change', 'PENDING', ?, ?, ?, 'user', ?)`,
        [p.id, p.status, p.reject_reason || null, p.reviewed_by || null, p.reviewed_at]
      );
      reviewed++;
    }
  }

  console.log(`[backfill-activity] proposals=${proposals.length} created=${created} reviewed=${reviewed} skipped=${skipped}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
