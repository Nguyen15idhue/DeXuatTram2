const pool = require('../utils/db');
const proposalLifecycle = require('./proposalLifecycle');

const EVENT_TO_STATUS = {
  APPROVED: 'APPROVED',
  PRINCIPLE_APPROVED: 'PRINCIPLE_APPROVED',
  ARCHIVED: 'ARCHIVED',
  CONTRACT_SIGNED: 'CONTRACT_SIGNED',
  CONTRACT_FAILED: 'CONTRACT_FAILED',
  CANCELLED: 'CANCELLED',
  SIGNED: 'CONTRACT_SIGNED',
  SIGN_FAILED: 'CONTRACT_FAILED'
};

exports.EVENT_TO_STATUS = EVENT_TO_STATUS;

const err = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const STALE_EVENT_DAYS = 30;

async function logInbound({ eventId, body, result, ok }) {
  const entityId = (result && result.applied && result.applied[0] && result.applied[0].proposal_id) || null;
  await pool.query(
    `INSERT INTO api_queue_logs
      (api_config_id, action, entity_type, entity_id, status, direction, request_payload, response_payload, started_at, completed_at)
     VALUES (NULL, 'webhook', 'station_proposals', ?, ?, 'inbound', ?, ?, NOW(), NOW())`,
    [entityId, ok ? 'completed' : 'failed', JSON.stringify(body), result ? JSON.stringify(result) : null]
  );
}

async function notifyAdmins(title, message, proposalId) {
  try {
    const notificationService = require('./notificationService');
    const [admins] = await pool.query(
      `SELECT id FROM users WHERE role IN ('SUPER_ADMIN', 'ADMIN') AND status = 'ACTIVE'`
    );
    for (const a of admins) {
      try {
        await notificationService.create({
          userId: a.id,
          type: 'AUTO_FAILED',
          title,
          message,
          entityType: 'station_proposals',
          entityId: proposalId || null,
          createdBy: null
        });
      } catch { /* silent */ }
    }
  } catch { /* silent */ }
}

async function failNotified(eventId, body, errorMessage, proposalId) {
  const result = {
    event_id: eventId,
    event: body.event,
    new_status: null,
    applied: [],
    errors: [{ error: errorMessage }],
    applied_at: new Date().toISOString()
  };
  await logInbound({ eventId, body, result, ok: false });
  await notifyAdmins(
    'Webhook 1Office thất bại',
    `Event ${body.event || '?'} (${eventId}): ${errorMessage}`,
    proposalId || null
  );
  return result;
}

exports.applyExternalEvent = async ({ eventId, event, proposalCode, contactCode, note, eventTime, actor, source = 'webhook', ip }) => {
  if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
    throw err('Thiếu event_id (idempotency key)', 400);
  }
  const toStatus = EVENT_TO_STATUS[event];
  if (!toStatus) {
    throw err('event không hợp lệ (PRINCIPLE_APPROVED | APPROVED | ARCHIVED | CONTRACT_SIGNED | CONTRACT_FAILED | CANCELLED)', 400);
  }
  if (!proposalCode && !contactCode) {
    throw err('Cần proposal_code hoặc contact_code', 400);
  }

  const body = { event_id: eventId, event, proposal_code: proposalCode || null, contact_code: contactCode || null, note: note || null, event_time: eventTime || null, actor: actor || null };

  const [dup] = await pool.query(
    `SELECT response_payload FROM api_queue_logs
     WHERE direction = 'inbound' AND status = 'completed'
       AND JSON_UNQUOTE(JSON_EXTRACT(request_payload, '$.event_id')) = ?
     ORDER BY id DESC LIMIT 1`,
    [eventId]
  );
  if (dup.length > 0 && dup[0].response_payload) {
    const prev = typeof dup[0].response_payload === 'string' ? JSON.parse(dup[0].response_payload) : dup[0].response_payload;
    return { ...prev, duplicate: true };
  }

  if (eventTime) {
    const ts = new Date(eventTime).getTime();
    if (!Number.isNaN(ts) && Date.now() - ts > STALE_EVENT_DAYS * 24 * 3600 * 1000) {
      const msg = `event_time quá cũ (>${STALE_EVENT_DAYS} ngày)`;
      await failNotified(eventId, body, msg, null);
      throw err(msg, 400);
    }
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
    const msg = 'Không tìm thấy đề xuất theo mã đã gửi';
    await failNotified(eventId, body, msg, null);
    throw err(msg, 404);
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
  if (applied.length === 0) {
    await notifyAdmins(
      'Webhook 1Office thất bại',
      `Event ${event} (${eventId}): ${errors.map(e => `#${e.proposal_id}: ${e.error}`).join('; ')}`,
      rows[0] ? rows[0].id : null
    );
  }
  return result;
};
