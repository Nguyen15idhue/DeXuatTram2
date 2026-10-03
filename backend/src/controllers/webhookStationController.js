const pool = require('../utils/db');
const { verifyWebhookSecret } = require('./webhookController');
const stationService = require('../services/stationService');
const stationActivityService = require('../services/stationActivityService');
const dynamicUtils = require('../services/dynamicUtils');
const notificationService = require('../services/notificationService');

const STATION_STATUSES = ['PLANNING', 'ACTIVE', 'DEPLOYING', 'REJECTED'];

const DEDUP_TTL_HOURS = Math.max(1, parseInt(process.env.WEBHOOK_DEDUP_TTL_HOURS || '24', 10) || 24);

const err = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const normVal = (v) => {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
};

const excerptOf = (body) => {
  try {
    const s = JSON.stringify(body && typeof body === 'object' ? body : {});
    return s.length > 2000 ? s.slice(0, 2000) + '…' : s;
  } catch { return ''; }
};

async function logInbound({ body, result, ok, stationId }) {
  await pool.query(
    `INSERT INTO api_queue_logs
      (api_config_id, action, entity_type, entity_id, status, direction, request_payload, response_payload, started_at, completed_at)
     VALUES (NULL, 'webhook', 'stations', ?, ?, 'inbound', ?, ?, NOW(), NOW())`,
    [stationId || null, ok ? 'completed' : 'failed', JSON.stringify(body), result ? JSON.stringify(result) : null]
  );
}

async function notifyAdmins(title, message, stationId) {
  try {
    const [admins] = await pool.query(
      `SELECT id FROM users WHERE role IN ('SUPER_ADMIN', 'ADMIN') AND status = 'ACTIVE'`
    );
    for (const a of admins) {
      try {
        await notificationService.create({
          userId: a.id,
          type: 'STATION_SYNC',
          title,
          message,
          entityType: 'stations',
          entityId: stationId || null,
          createdBy: null
        });
      } catch { /* silent */ }
    }
  } catch { /* silent */ }
}

exports.stationUpdate = [
  verifyWebhookSecret,
  async (req, res) => {
    const body = req.body || {};
    const { event_id, ma_tram, station_code, status, fields, note, actor } = body;
    try {
      if (!event_id || typeof event_id !== 'string' || !event_id.trim()) {
        throw err('Thiếu event_id (idempotency key)', 400);
      }
      const code = [station_code, ma_tram].map(v => (v === undefined || v === null ? '' : String(v).trim())).find(v => v !== '') || '';
      if (!code) {
        throw err('Thiếu mã trạm (ma_tram)', 400);
      }
      if (status !== undefined && status !== null && String(status).trim() !== '' && !STATION_STATUSES.includes(status)) {
        throw err('Trạng thái trạm không hợp lệ (PLANNING | ACTIVE | DEPLOYING | REJECTED)', 400);
      }

      const [dup] = await pool.query(
        `SELECT response_payload FROM api_queue_logs
         WHERE direction = 'inbound' AND status = 'completed'
           AND created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
           AND JSON_UNQUOTE(JSON_EXTRACT(request_payload, '$.event_id')) = ?
         ORDER BY id DESC LIMIT 1`,
        [DEDUP_TTL_HOURS, event_id]
      );
      if (dup.length > 0 && dup[0].response_payload) {
        const prev = typeof dup[0].response_payload === 'string' ? JSON.parse(dup[0].response_payload) : dup[0].response_payload;
        return res.json({ success: true, data: { ...prev, duplicate: true } });
      }

      const [srows] = await pool.query(
        `SELECT * FROM stations WHERE JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.ma_tram')) = ? LIMIT 1`,
        [code]
      );
      if (srows.length === 0) {
        const msg = `Không tìm thấy trạm theo mã "${code}"`;
        await logInbound({ body, result: { event_id, error: msg }, ok: false, stationId: null });
        await notifyAdmins('Webhook trạm 1Office thất bại', `Event ${event_id}: ${msg}`, null);
        throw err(msg, 404);
      }
      const station = srows[0];
      const before = await stationService.getStationById(station.id);

      const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('stations');
      const labelOf = (key) => {
        const f = (fieldDefs || []).find(d => d.key === key);
        return (f && f.label) || key;
      };
      const defKeys = new Set((fieldDefs || []).map(f => f.key));
      const ignoredKeys = [];
      const updates = {};
      if (status !== undefined && status !== null && String(status).trim() !== '') {
        updates.status = status;
      }
      const incoming = fields && typeof fields === 'object' && !Array.isArray(fields) ? fields : {};
      for (const k of Object.keys(incoming)) {
        if (k === 'ma_tram' || !defKeys.has(k)) {
          ignoredKeys.push(k);
          continue;
        }
        updates[k] = incoming[k];
      }

      const statusChanged = updates.status !== undefined && updates.status !== before.status;
      const fieldKeys = Object.keys(updates).filter(k => k !== 'status');
      if (!statusChanged && fieldKeys.length === 0) {
        const result = { event_id, station_id: station.id, updated_fields: [], ignored_keys: ignoredKeys, unchanged: true };
        await logInbound({ body, result, ok: true, stationId: station.id });
        return res.json({ success: true, data: result });
      }

      await stationService.updateStation(station.id, updates);
      const after = await stationService.getStationById(station.id);

      const diff = {};
      for (const k of fieldKeys) {
        const o = normVal(before ? before[k] : '').slice(0, 500);
        const n = normVal(after ? after[k] : '').slice(0, 500);
        if (o !== n) diff[k] = { label: labelOf(k), old: o, new: n };
      }
      const inboundExcerpt = { event_id, note: note || null, actor: actor || null, excerpt: excerptOf(body) };
      const loggedRows = [];
      if (statusChanged) {
        await stationActivityService.logActivity({
          stationId: station.id, action: 'status_change',
          fromStatus: before.status, toStatus: after.status,
          changedFields: { ...diff, _inbound: inboundExcerpt },
          reason: note || null, actorId: null, actorRole: null, source: 'webhook', ip: req.ip || null
        });
        loggedRows.push('status_change');
      }
      if (fieldKeys.length > 0) {
        await stationActivityService.logActivity({
          stationId: station.id, action: 'updated',
          fromStatus: before.status, toStatus: after.status,
          changedFields: { ...diff, _inbound: inboundExcerpt },
          reason: note || null, actorId: null, actorRole: null, source: 'webhook', ip: req.ip || null
        });
        loggedRows.push('updated');
      }

      const result = {
        event_id, station_id: station.id,
        updated_fields: fieldKeys,
        status_changed: statusChanged,
        ignored_keys: ignoredKeys,
        logged: loggedRows
      };
      await logInbound({ body, result, ok: true, stationId: station.id });
      return res.json({ success: true, data: result });
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({ success: false, message: error.message });
      }
      console.error('Webhook station-update error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }
];
