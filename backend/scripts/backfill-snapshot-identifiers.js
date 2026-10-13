require('dotenv').config();
const pool = require('../src/utils/db');
const reportMirrorService = require('../src/services/reportMirrorService');

const apply = process.argv.includes('--apply');
const automationArg = (process.argv.find((a) => a.startsWith('--automation=')) || '').split('=')[1];

(async () => {
  let automationId = null;
  if (automationArg) {
    const [rows] = await pool.query('SELECT id FROM work_automations WHERE automation_key = ? LIMIT 1', [automationArg]);
    if (rows.length === 0) {
      console.error(`[backfill-snapshot] automation_key khong ton tai: ${automationArg}`);
      process.exit(1);
    }
    automationId = rows[0].id;
  }
  if (!apply) {
    const stats = await reportMirrorService.getMirrorStats();
    console.log('[backfill-snapshot] DRY-RUN (them --apply de ghi):');
    stats.forEach((s) => console.log(`  automation=${s.automation_key} version=${s.version} total=${s.total} linked=${s.linked} unlinked=${s.unlinked}`));
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS total FROM automation_sync_snapshots WHERE (proposal_code IS NULL AND contact_code IS NULL)${automationId !== null ? ' AND automation_id = ?' : ''}`,
      automationId !== null ? [automationId] : []
    );
    console.log(`[backfill-snapshot] snapshot chua co identifier: ${rows[0].total}`);
    process.exit(0);
  }
  const result = await reportMirrorService.backfillIdentifiers({ automationId, limit: 10000 });
  console.log(`[backfill-snapshot] APPLY scanned=${result.scanned} | updated=${result.updated} | unlinked=${result.unlinked}`);
  process.exit(0);
})().catch((e) => { console.error('[backfill-snapshot] ERROR', e.message); process.exit(1); });
