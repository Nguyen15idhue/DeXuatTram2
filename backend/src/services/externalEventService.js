const pool = require('../utils/db');
const proposalLifecycle = require('./proposalLifecycle');

const EVENT_TO_STATUS = {
  APPROVED: 'APPROVED',
  SIGNED: 'CONTRACT_SIGNED',
  SIGN_FAILED: 'CONTRACT_FAILED'
};

exports.EVENT_TO_STATUS = EVENT_TO_STATUS;

const err = (message, statusCode) => Object.assign(new Error(message), { statusCode });

async function logInbound({ eventId, body, result, ok }) {
  const entityId = (result && result.applied && result.applied[0] && result.applied[0].proposal_id) || null;
  await pool.query(
    `INSERT INTO api_queue_logs
      (api_config_id, action, entity_type, entity_id, status, direction, request_payload, response_payload, started_at, completed_at)
     VALUES (NULL, 'webhook', 'station_proposals', ?, ?, 'inbound', ?, ?, NOW(), NOW())`,
    [entityId, ok ? 'completed' : 'failed', JSON.stringify(body), result ? JSON.stringify(result) : null]
  );
}

exports.applyExternalEvent = async ({ eventId, event, proposalCode, contactCode, note, eventTime, actor, source = 'webhook', ip }) => {
  if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
    throw err('Thiếu event_id (idempotency key)', 400);
  }
  const toStatus = EVENT_TO_STATUS[event];
  if (!toStatus) {
    throw err('event không hợp lệ (APPROVED | SIGNED | SIGN_FAILED)', 400);
  }
  if (!proposalCode && !contactCode) {
    throw err('Cần proposal_code hoặc contact_code', 400);
  }

  const body = { event_id: eventId, event, proposal_code: proposalCode || null, contact_code: contactCode || null, note: note || null, event_time: eventTime || null, actor: actor || null };

  const [dup] = await pool.query(
    `SELECT response_payload FROM api_queue_logs
     WHERE direction = 'inbound' AND JSON_UNQUOTE(JSON_EXTRACT(request_payload, '$.event_id')) = ?
     ORDER BY id DESC LIMIT 1`,
    [eventId]
  );
  if (dup.length > 0 && dup[0].response_payload) {
    const prev = typeof dup[0].response_payload === 'string' ? JSON.parse(dup[0].response_payload) : dup[0].response_payload;
    return { ...prev, duplicate: true };
  }

  let rows = [];
  if (proposalCode) {
    [rows] = await pool.query(
      `SELECT id, status FROM station_proposals
       WHERE tracking_code = ? OR ma_de_xuat_gen = ? OR JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.ma_de_xuat')) = ?`,
      [proposalCode, proposalCode, proposalCode]
    );
  }
  if (rows.length === 0 && contactCode) {
    [rows] = await pool.query(
      'SELECT id, status FROM station_proposals WHERE contact_1office_code = ?',
      [contactCode]
    );
  }
  if (rows.length === 0) {
    throw err('Không tìm thấy đề xuất theo mã đã gửi', 404);
  }

  const applied = [];
  const errors = [];
  for (const p of rows) {
    try {
      const r = await proposalLifecycle.transition(p.id, toStatus, {
        reason: note || null, actorId: null, actorRole: null, source, manualOverride: false, ip: ip || null
      });
      applied.push({ proposal_id: p.id, old_status: r.prevStatus, new_status: r.status, unchanged: !!r.unchanged });
    } catch (e) {
      errors.push({ proposal_id: p.id, error: e.message });
    }
  }

  const result = {
    event_id: eventId,
    event,
    new_status: toStatus,
    applied,
    errors,
    applied_at: new Date().toISOString()
  };
  await logInbound({ eventId, body, result, ok: applied.length > 0 });
  return result;
};
