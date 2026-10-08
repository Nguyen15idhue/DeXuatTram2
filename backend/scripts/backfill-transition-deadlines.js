require('dotenv').config();
const pool = require('../src/utils/db');

const COUNTDOWN_CONFIG_KEY = 'supplement_countdown_config';
const DEFAULT_RULES = {
  PENDING: { days: 3, hours: 0, minutes: 0 },
  APPROVED: { days: 15, hours: 0, minutes: 0 }
};

function partToMs(part) {
  if (!part) return 0;
  return ((Number(part.days) || 0) * 24 * 60 + (Number(part.hours) || 0) * 60 + (Number(part.minutes) || 0)) * 60 * 1000;
}

async function getTransitionMsMap() {
  const [rows] = await pool.query('SELECT `value` FROM proposal_lifecycle_configs WHERE `key` = ? LIMIT 1', [COUNTDOWN_CONFIG_KEY]);
  let rules = [];
  try {
    const parsed = rows[0] && rows[0].value ? JSON.parse(rows[0].value) : null;
    rules = (parsed && Array.isArray(parsed.rules)) ? parsed.rules : [];
  } catch { rules = []; }
  const map = {};
  ['PENDING', 'APPROVED'].forEach((status) => {
    const rule = rules.find((r) => r && r.status === status);
    const part = (rule && rule.transition) || null;
    const ms = part ? partToMs(part) : 0;
    map[status] = ms > 0 ? ms : partToMs(DEFAULT_RULES[status]);
    map[`${status}_disabled`] = part ? !part.enabled : false;
  });
  return map;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const statusArg = (process.argv.find((a) => a.startsWith('--status=')) || '').split('=')[1];
  const statuses = statusArg ? [statusArg.toUpperCase()] : ['PENDING', 'APPROVED'];
  const invalid = statuses.filter((s) => !['PENDING', 'APPROVED'].includes(s));
  if (invalid.length) {
    console.error(`[backfill-transition] status khong hop le: ${invalid.join(', ')} (chi PENDING/APPROVED)`);
    process.exit(1);
  }

  const msMap = await getTransitionMsMap();
  let total = 0;
  let updated = 0;

  for (const status of statuses) {
    const [rows] = await pool.query(
      `SELECT id, status, transition_deadline_at, created_at, updated_at
       FROM station_proposals
       WHERE status = ? AND transition_deadline_at IS NULL
       ORDER BY id`,
      [status]
    );
    const offsetMs = msMap[status];
    console.log(`\n[backfill-transition] ${status}: ${rows.length} record(s) thieu transition_deadline_at (config = ${Math.round(offsetMs / 60000)} phut${msMap[`${status}_disabled`] ? ', status dang TAT trong config -> van backfill theo gia tri default' : ''})`);
    if (rows.length === 0) continue;
    total += rows.length;

    rows.forEach((r) => {
      const deadline = new Date(Date.now() + offsetMs);
      console.log(
        `  ${String(r.id).padStart(6)} | ${status.padEnd(8)} | cu: ${r.transition_deadline_at || 'NULL'} | moi: ${deadline.toISOString().slice(0, 19).replace('T', ' ')} | created=${r.created_at ? String(r.created_at).slice(0, 19) : '-'}`
      );
    });

    if (apply) {
      for (const r of rows) {
        const deadline = new Date(Date.now() + offsetMs);
        const [res] = await pool.query(
          'UPDATE station_proposals SET transition_deadline_at = ?, updated_at = updated_at WHERE id = ? AND transition_deadline_at IS NULL',
          [deadline, r.id]
        );
        updated += res.affectedRows || 0;
      }
    }
  }

  console.log(`\n[backfill-transition] tong=${total} | mode=${apply ? 'APPLY' : 'DRY-RUN'}${apply ? ` | updated=${updated}` : ''}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
