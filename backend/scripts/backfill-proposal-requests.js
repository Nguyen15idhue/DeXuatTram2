require('dotenv').config();
const pool = require('../src/utils/db');

// Backfill proposal_requests tu proposal_activity_logs cho cac yêu cầu sinh
// TRUOC migration 175 (hợp nhất yêu cầu đề xuất). Mỗi log khớp 1 yêu cầu với
// round_no = thứ tự xuất hiện của log cùng đề xuất + cùng loại; nếu đã tồn tại
// bản ghi (proposal_id, request_type, round_no) thì bỏ qua.
//
// DRY-RUN mặc định; chạy `node scripts/backfill-proposal-requests.js --apply` để ghi.

const ACTION_TYPE_MAP = {
  layout_supplement_requested: 'LAYOUT_SUPPLEMENT',
  report_revision_requested: 'REVISE_BCDX',
  report_update_requested: 'UPDATE_INFO',
  review_regrade_requested: 'RE_GRADE',
  review_to_tgd: 'TGD_REVIEW',
  deadline_extended: 'SUPPLEMENT'
};

async function main() {
  const apply = process.argv.includes('--apply');
  const actions = Object.keys(ACTION_TYPE_MAP);
  const [logs] = await pool.query(
    `SELECT id, proposal_id, action, from_status, to_status, reject_reason, actor_id, created_at
     FROM proposal_activity_logs
     WHERE action IN (${actions.map(() => '?').join(',')})
     ORDER BY proposal_id, created_at, id`,
    actions
  );
  const [existing] = await pool.query(
    'SELECT proposal_id, request_type, round_no FROM proposal_requests'
  );
  const existingKeys = new Set(existing.map((r) => `${r.proposal_id}:${r.request_type}:${r.round_no}`));

  const roundsByProposalAction = new Map();
  let total = 0;
  let inserted = 0;
  const rowsToInsert = [];

  for (const log of logs) {
    const type = ACTION_TYPE_MAP[log.action];
    const key = String(log.proposal_id);
    if (!roundsByProposalAction.has(key)) roundsByProposalAction.set(key, {});
    const byAction = roundsByProposalAction.get(key);
    byAction[type] = (byAction[type] || 0) + 1;
    const round = byAction[type];
    if (existingKeys.has(`${log.proposal_id}:${type}:${round}`)) continue;
    total += 1;
    const note = type === 'SUPPLEMENT' ? 'Gia hạn thời gian bổ sung thông tin' : null;
    const createdAt = log.created_at ? new Date(log.created_at) : new Date();
    rowsToInsert.push({
      proposalId: log.proposal_id,
      type,
      description: log.reject_reason || null,
      requestedBy: log.actor_id || null,
      previousStatus: log.from_status || null,
      currentStatus: log.to_status || null,
      note,
      round,
      createdAt
    });
  }

  console.log(`[backfill-requests] logs khop: ${logs.length} | yeu cau con thieu: ${total} (mode=${apply ? 'APPLY' : 'DRY-RUN'})`);
  rowsToInsert.forEach((r) => {
    console.log(`  proposal=${r.proposalId} | ${r.type} | lap=${r.round} | mo ta=${(r.description || '').slice(0, 60)}`);
  });

  if (apply) {
    for (const r of rowsToInsert) {
      const [res] = await pool.query(
        `INSERT INTO proposal_requests
          (proposal_id, request_type, description, requested_by, previous_status, current_status,
           round_no, note, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
        [r.proposalId, r.type, r.description, r.requestedBy, r.previousStatus, r.currentStatus, r.round, r.note, r.createdAt]
      );
      inserted += res.affectedRows || 0;
    }
    console.log(`[backfill-requests] da chen ${inserted} yeu cau`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
