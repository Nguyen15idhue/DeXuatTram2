const pool = require('./src/utils/db');
const worker = require('./src/workers/proposalLifecycleWorker');

const results = [];
const check = (name, ok, extra) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
};

async function main() {
  const [ins] = await pool.query(
    `INSERT INTO station_proposals (user_id, status, latitude, longitude, owner_name, owner_phone, custom_data, supplement_deadline_at)
     VALUES (3, 'PENDING', 10.1, 106.1, 'Test Overdue', '0900000000', CAST('{}' AS JSON), DATE_SUB(NOW(), INTERVAL 2 HOUR))`
  );
  const testId = ins.insertId;
  try {
    const [n0] = await pool.query(
      "SELECT COUNT(*) AS n FROM notifications WHERE entity_type = 'station_proposals' AND entity_id = ? AND type = 'SUPPLEMENT_OVERDUE'",
      [testId]
    );
    const acted = await worker.processDeadlines();
    check('processDeadlines chay khong loi', Number.isInteger(acted), `acted=${acted}`);
    const [n1] = await pool.query(
      "SELECT COUNT(*) AS n FROM notifications WHERE entity_type = 'station_proposals' AND entity_id = ? AND type = 'SUPPLEMENT_OVERDUE'",
      [testId]
    );
    check('khong tao chuong qua han', Number(n1[0].n) === Number(n0[0].n), `before=${n0[0].n} after=${n1[0].n}`);
    const [logs] = await pool.query(
      "SELECT COUNT(*) AS n FROM proposal_activity_logs WHERE proposal_id = ? AND action = 'deadline_overdue'",
      [testId]
    );
    check('van ghi log audit deadline_overdue', Number(logs[0].n) === 1, `logs=${logs[0].n}`);
    const acted2 = await worker.processDeadlines();
    const [logs2] = await pool.query(
      "SELECT COUNT(*) AS n FROM proposal_activity_logs WHERE proposal_id = ? AND action = 'deadline_overdue'",
      [testId]
    );
    check('chay lap khong ghi log trung', Number(logs2[0].n) === 1, `acted2=${acted2} logs=${logs2[0].n}`);
  } finally {
    await pool.query('DELETE FROM proposal_activity_logs WHERE proposal_id = ?', [testId]);
    await pool.query("DELETE FROM notifications WHERE entity_type = 'station_proposals' AND entity_id = ?", [testId]);
    await pool.query('DELETE FROM station_proposals WHERE id = ?', [testId]);
  }
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nTOTAL ${results.length}, FAILED ${failed}`);
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => { console.error('FATAL', e.message); try { await pool.end(); } catch { /* silent */ } process.exit(2); });
