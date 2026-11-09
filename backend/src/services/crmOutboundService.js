// backend/src/services/crmOutboundService.js
const pool = require('../utils/db');
const crypto = require('crypto');
const crmStatusMapping = require('../integrations/crm/crmStatusMapping');

const CRM_WEBHOOK_URL = () => String(process.env.TMT_CRM_WEBHOOK_URL || '').trim();
const CRM_SECRET = () => String(process.env.TMT_CRM_WEBHOOK_SECRET || '').trim();
// Mã lỗi HTTP mà CRM yêu cầu KHÔNG retry (guide đối tác: chỉ retry khi mất mạng hoặc 5xx).
const NO_RETRY_STATUSES = new Set([400, 401, 403, 404]);

const sign = (ts, body) => {
  const secret = CRM_SECRET();
  if (!secret) return null;
  return 'sha256=' + crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
};

// Format ISO như ví dụ spec CRM: 2026-11-05T09:30:00+07:00 (không ms, múi giờ Việt Nam,
// không phụ thuộc TZ máy chủ).
const formatIsoVn = (date) => {
  let d = new Date(date);
  if (Number.isNaN(d.getTime())) d = new Date();
  return new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 19) + '+07:00';
};

// Enqueue an event into crm_outbox (idempotent by event_id).
const enqueue = async ({ eventId, eventType, leadId, crmLeadId, payload, conn = pool }) => {
  if (!eventId) return null;
  try {
    await conn.query(
      `INSERT INTO crm_outbox (event_id, event_type, lead_id, crm_lead_id, payload, status, next_retry_at)
       VALUES (?, ?, ?, ?, ?, 'pending', NOW())
       ON DUPLICATE KEY UPDATE id = id`,
      [eventId, eventType, leadId || null, crmLeadId || null, JSON.stringify(payload || {})]
    );
  } catch (e) {
    // ignore duplicate
  }
  return eventId;
};

// Build HMAC headers
const buildHeaders = (body) => {
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = sign(ts, body);
  const headers = { 'Content-Type': 'application/json', 'X-TMT-Timestamp': ts };
  if (sig) headers['X-TMT-Signature'] = sig;
  return { headers, ts };
};

// Lấy danh sách event id CRM báo lỗi trong response (spec: errors: [{id, error}]).
const extractErroredEventIds = (parsed) => {
  if (!parsed || !Array.isArray(parsed.errors)) return [];
  return parsed.errors
    .map((e) => (e && e.id != null ? String(e.id) : null))
    .filter(Boolean);
};

// Send a single batch to CRM.
// HTTP 2xx CHƯA chắc chắn thành công nghiệp vụ: CRM có thể trả ok:false hoặc errors[] per-event.
const sendBatch = async (events) => {
  const url = CRM_WEBHOOK_URL();
  if (!url) return { sent: false, reason: 'empty webhook_url', sentCount: 0 };
  const body = JSON.stringify({ events });
  const { headers } = buildHeaders(body);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { method: 'POST', headers, body, signal: ctrl.signal });
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    const status = res.status;
    if (status >= 200 && status < 300) {
      const erroredIds = extractErroredEventIds(parsed);
      // CRM có thể trả 2xx kèm errors[] per-event (partial success).
      if (erroredIds.length > 0) {
        return { sent: true, status, response: parsed, partial: true, sentCount: events.length - erroredIds.length, failedEventIds: erroredIds, error: `CRM từ chối ${erroredIds.length} event` };
      }
      if (parsed && parsed.ok === false) {
        // ok:false mà không chỉ event nào lỗi → coi cả batch bị từ chối, retry.
        return { sent: false, status, response: parsed, error: 'CRM trả ok:false', retryAll: true, failedEventIds: [] };
      }
      return { sent: true, status, response: parsed, sentCount: events.length, failedEventIds: [] };
    }
    const permanentFail = NO_RETRY_STATUSES.has(status);
    const rateLimited = status === 429;
    return { sent: false, status, response: parsed, error: `HTTP ${status}`, permanentFail, rateLimited, failedEventIds: [] };
  } catch (e) {
    return { sent: false, error: e.message || 'fetch error', permanentFail: false, rateLimited: false, failedEventIds: [] };
  } finally {
    clearTimeout(timer);
  }
};

// Process pending outbox rows
const processBatch = async (batchSize = 500) => {
  const report = { processed: 0, sent: 0, failed: 0, retried: 0, error: null };
  const url = CRM_WEBHOOK_URL();
  if (!url) { report.error = 'CRM_WEBHOOK_URL not configured'; return report; }

  const [rows] = await pool.query(
    `SELECT id, event_id, event_type, lead_id, crm_lead_id, payload, attempts, created_at
       FROM crm_outbox
      WHERE status = 'pending' AND (next_retry_at IS NULL OR next_retry_at <= NOW())
      ORDER BY id ASC LIMIT ?`,
    [batchSize]
  );
  if (rows.length === 0) return report;

  // Group into batches of 500 (CRM limit)
  const batch = rows.slice(0, 500);
  const crmWebhookLogService = require('./crmWebhookLogService');
  const logSend = (status, result) => crmWebhookLogService.logOutbound({
    eventId: batch.map((r) => r.event_id).join(','),
    eventType: 'batch',
    leadId: null,
    crmLeadId: null,
    status,
    httpStatus: result.status || null,
    payload: { events: events.map((e) => e.id) },
    response: result.response || null,
    error: result.error || null,
    durationMs: null
  });

  const events = batch.map((r) => {
    let payload = r.payload;
    if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch { payload = {}; } }
    // occurredAt = thời điểm sự kiện xảy ra (created_at của row outbox), format ISO +07:00 như spec.
    return { id: r.event_id, type: r.event_type, occurredAt: formatIsoVn(r.created_at), data: payload };
  });

  report.processed = batch.length;
  const result = await sendBatch(events);

  if (result.sent && !result.partial) {
    const ids = batch.map((r) => r.id);
    await pool.query(
      `UPDATE crm_outbox SET status = 'sent', sent_at = NOW(), attempts = attempts + 1, response = ?, last_error = NULL WHERE id IN (${ids.map(() => '?').join(',')})`,
      [JSON.stringify(result.response || {}), ...ids]
    );
    report.sent = batch.length;
    await logSend('sent', result);
    return report;
  }

  if (result.sent && result.partial) {
    // 2xx + một phần event bị CRM từ chối: phần OK → sent, phần lỗi → pending để gửi lại.
    const failedIdSet = new Set(result.failedEventIds.map((sid) => String(sid)));
    const okRows = batch.filter((r) => !failedIdSet.has(String(r.event_id)));
    const failedRows = batch.filter((r) => failedIdSet.has(String(r.event_id)));
    if (okRows.length) {
      const okIds = okRows.map((r) => r.id);
      await pool.query(
        `UPDATE crm_outbox SET status = 'sent', sent_at = NOW(), attempts = attempts + 1, response = ?, last_error = NULL WHERE id IN (${okIds.map(() => '?').join(',')})`,
        [JSON.stringify(result.response || {}), ...okIds]
      );
    }
    for (const r of failedRows) {
      const attempts = (r.attempts || 0) + 1;
      const status = attempts >= 10 ? 'failed' : 'pending';
      await pool.query(
        `UPDATE crm_outbox SET status = ?, attempts = ?, next_retry_at = ${status === 'failed' ? 'NULL' : 'DATE_ADD(NOW(), INTERVAL 1 MINUTE)'}, last_error = ? WHERE id = ?`,
        [status, attempts, result.error || 'CRM báo lỗi event', r.id]
      );
      if (status === 'failed') report.failed++;
      else report.retried++;
    }
    report.sent += okRows.length;
    await logSend('failed', result);
    return report;
  }

  if (result.permanentFail) {
    // 400/401/403/404: CRM không chấp nhận (format/chữ ký/link/tắt) — đánh dấu failed ngay,
    // không retry để không spam CRM (guide: "không thử lại khi 400/401/403/404").
    for (const r of batch) {
      await pool.query(
        `UPDATE crm_outbox SET status = 'failed', attempts = attempts + 1, next_retry_at = NULL, last_error = ? WHERE id = ?`,
        [result.error || `HTTP ${result.status}`, r.id]
      );
    }
    report.failed = batch.length;
    await logSend('failed', result);
    return report;
  }

  if (result.rateLimited) {
    // 429 = chờ 60 giây rồi thử lại (không tăng attempts, đúng lệnh chờ 60s của guide).
    for (const r of batch) {
      await pool.query(
        `UPDATE crm_outbox SET status = 'pending', next_retry_at = DATE_ADD(NOW(), INTERVAL 60 SECOND), last_error = ? WHERE id = ?`,
        [result.error || 'HTTP 429', r.id]
      );
    }
    report.retried = batch.length;
    await logSend('failed', result);
    return report;
  }

  if (result.retryAll) {
    // 2xx nhưng CRM trả ok:false mà không chỉ rõ event nào lỗi → retry cả batch.
    for (const r of batch) {
      const attempts = (r.attempts || 0) + 1;
      let delayMin = 1;
      if (attempts === 2) delayMin = 5;
      else if (attempts === 3) delayMin = 15;
      else if (attempts === 4) delayMin = 60;
      else if (attempts >= 5) delayMin = 360;
      const status = attempts >= 10 ? 'failed' : 'pending';
      await pool.query(
        `UPDATE crm_outbox SET status = ?, attempts = ?, next_retry_at = DATE_ADD(NOW(), INTERVAL ? MINUTE), last_error = ? WHERE id = ?`,
        [status, attempts, delayMin, result.error || 'CRM trả ok:false', r.id]
      );
      if (status === 'failed') report.failed++;
      else report.retried++;
    }
    await logSend('failed', result);
    return report;
  }

  // 5xx / timeout / lỗi mạng: retry với backoff, quá 10 lần thì failed.
  for (const r of batch) {
    const attempts = (r.attempts || 0) + 1;
    let delayMin = 1;
    if (attempts === 2) delayMin = 5;
    else if (attempts === 3) delayMin = 15;
    else if (attempts === 4) delayMin = 60;
    else if (attempts >= 5) delayMin = 360; // 6h
    const status = attempts >= 10 ? 'failed' : 'pending';
    await pool.query(
      `UPDATE crm_outbox SET status = ?, attempts = ?, next_retry_at = DATE_ADD(NOW(), INTERVAL ? MINUTE), last_error = ? WHERE id = ?`,
      [status, attempts, delayMin, result.error || 'send failed', r.id]
    );
    if (status === 'failed') report.failed++;
    else report.retried++;
  }
  await logSend('failed', result);
  return report;
};

const getConfig = () => {
  const url = CRM_WEBHOOK_URL();
  const secret = CRM_SECRET();
  const apiKey = String(process.env.TMT_CRM_API_KEY || '').trim();
  return {
    configured: !!url && !!secret && !!apiKey,
    url, secret: !!secret, apiKey: !!apiKey,
    message: (!url || !secret || !apiKey) ? 'Thiếu TMT_CRM_WEBHOOK_URL / TMT_CRM_WEBHOOK_SECRET / TMT_CRM_API_KEY' : 'OK'
  };
};

module.exports = { enqueue, sendBatch, processBatch, getConfig, sign, formatIsoVn };
