const pool = require('../../utils/db');

const summarizeLog = (row) => {
  let payload = row.payload;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { payload = null; }
  }
  if (!payload || typeof payload !== 'object') return '';
  if (row.event_type === 'poll' || row.event_type === 'manual_sync') {
    const parts = [];
    parts.push(payload.source === 'manual' ? 'Thủ công' : 'Tự động');
    const fetched = payload.fetched !== undefined ? payload.fetched : payload.count;
    if (fetched !== undefined) parts.push(`${fetched} khách trả về`);
    if (payload.processed !== undefined) parts.push(`${payload.processed} cập nhật`);
    return parts.join(' · ');
  }
  if (row.event_type === 'batch') {
    const n = Array.isArray(payload.events) ? payload.events.length : 0;
    return `${n} sự kiện`;
  }
  if (row.event_type === 'full_sync') {
    const parts = [];
    if (payload.runId) parts.push(`Lần #${payload.runId}`);
    if (payload.fetched !== undefined) parts.push(`${payload.fetched} khách`);
    if (payload.inserted !== undefined) parts.push(`thêm ${payload.inserted}`);
    if (payload.updated !== undefined) parts.push(`cập nhật ${payload.updated}`);
    if (payload.skipped) parts.push(`bỏ qua ${payload.skipped}`);
    if (payload.failed) parts.push(`lỗi ${payload.failed}`);
    return parts.join(' · ');
  }
  return '';
};

const buildLogWhere = (filters, { withLeadFilters = false } = {}) => {
  const where = [];
  const params = [];
  const { direction, status, eventType, dateFrom, dateTo, leadId, crmLeadId } = filters;
  if (direction) { where.push('direction = ?'); params.push(direction); }
  if (status) { where.push('status = ?'); params.push(status); }
  if (eventType === 'sync') { where.push("event_type IN ('poll','manual_sync','full_sync')"); }
  else if (eventType) { where.push('event_type = ?'); params.push(eventType); }
  if (withLeadFilters) {
    if (leadId) { where.push('lead_id = ?'); params.push(leadId); }
    if (crmLeadId) { where.push('crm_lead_id = ?'); params.push(crmLeadId); }
  }
  if (dateFrom) { where.push('created_at >= ?'); params.push(`${String(dateFrom).slice(0, 10)} 00:00:00`); }
  if (dateTo) { where.push('created_at <= ?'); params.push(`${String(dateTo).slice(0, 10)} 23:59:59`); }
  return { whereClause: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
};

const listOutbox = async ({ page, limit, status }) => {
  const offset = (page - 1) * limit;
  const where = status ? 'WHERE status = ?' : '';
  const params = status ? [status, limit, offset] : [limit, offset];
  const [rows] = await pool.query(
    `SELECT id, event_id, event_type, lead_id, crm_lead_id, status, attempts, next_retry_at, created_at, sent_at, last_error
       FROM crm_outbox ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    params
  );
  const [countRows] = await pool.query(`SELECT COUNT(*) AS n FROM crm_outbox ${where}`, status ? [status] : []);
  return { rows, total: countRows[0].n };
};

const retryOutbox = async (id) => {
  await pool.query("UPDATE crm_outbox SET status = 'pending', next_retry_at = NOW(), last_error = NULL WHERE id = ?", [id]);
};

const getOutboxDetail = async (id) => {
  const [rows] = await pool.query('SELECT * FROM crm_outbox WHERE id = ?', [id]);
  return rows[0] || null;
};

const cancelOutbox = async (id) => {
  const [r] = await pool.query("UPDATE crm_outbox SET status = 'cancelled', last_error = 'Cancelled by admin' WHERE id = ? AND status IN ('pending','failed')", [id]);
  return r.affectedRows;
};

const retryAllOutbox = async () => {
  const [r] = await pool.query("UPDATE crm_outbox SET status = 'pending', attempts = 0, next_retry_at = NOW(), last_error = NULL WHERE status IN ('pending','failed')");
  return r.affectedRows;
};

const listLogs = async (filters, { page, limit }) => {
  const offset = (page - 1) * limit;
  const { whereClause, params } = buildLogWhere(filters, { withLeadFilters: true });
  const [rows] = await pool.query(
    `SELECT id, direction, sender, receiver, event_id, event_type, lead_id, crm_lead_id, status, http_status, duration_ms, payload, created_at
       FROM crm_webhook_logs ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const data = rows.map((row) => {
    const { payload, ...rest } = row;
    return { ...rest, summary: summarizeLog(row) };
  });
  const [countRows] = await pool.query(`SELECT COUNT(*) AS n FROM crm_webhook_logs ${whereClause}`, params);
  return { data, total: countRows[0].n };
};

const getLogDetail = async (id) => {
  const [rows] = await pool.query('SELECT * FROM crm_webhook_logs WHERE id = ?', [id]);
  return rows[0] || null;
};

const exportLogRows = async (filters) => {
  const { whereClause, params } = buildLogWhere(filters);
  const [rows] = await pool.query(
    `SELECT id, direction, sender, receiver, event_id, event_type, lead_id, crm_lead_id, status, http_status, duration_ms, created_at, payload, response, error
       FROM crm_webhook_logs ${whereClause} ORDER BY id DESC LIMIT 5000`,
    params
  );
  return rows.map((r) => ({
    'ID': r.id,
    'Hướng': r.direction,
    'Bên gửi': r.sender,
    'Bên nhận': r.receiver,
    'Event ID': r.event_id,
    'Event type': r.event_type,
    'Nội dung': summarizeLog(r),
    'Lead ID': r.lead_id,
    'CRM Lead ID': r.crm_lead_id,
    'Trạng thái': r.status,
    'HTTP status': r.http_status,
    'Thời gian (ms)': r.duration_ms,
    'Thời gian': r.created_at,
    'Payload': r.payload ? (typeof r.payload === 'string' ? r.payload : JSON.stringify(r.payload)) : '',
    'Response': r.response ? (typeof r.response === 'string' ? r.response : JSON.stringify(r.response)) : '',
    'Lỗi': r.error || ''
  }));
};

module.exports = {
  listOutbox,
  retryOutbox,
  getOutboxDetail,
  cancelOutbox,
  retryAllOutbox,
  listLogs,
  getLogDetail,
  exportLogRows
};
