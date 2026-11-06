// backend/src/services/crmOutboundService.js
const pool = require('../utils/db');
const crypto = require('crypto');
const crmStatusMapping = require('../integrations/crm/crmStatusMapping');

const CRM_WEBHOOK_URL = () => String(process.env.TMT_CRM_WEBHOOK_URL || '').trim();
const CRM_SECRET = () => String(process.env.TMT_CRM_WEBHOOK_SECRET || '').trim();

const sign = (ts, body) => {
  const secret = CRM_SECRET();
  if (!secret) return null;
  return 'sha256=' + crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
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

// Send a single batch to CRM
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
    if (res.ok) {
      return { sent: true, status: res.status, response: parsed, sentCount: events.length };
    }
    return { sent: false, status: res.status, response: parsed, error: `HTTP ${res.status}` };
  } catch (e) {
    return { sent: false, error: e.message || 'fetch error' };
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
    `SELECT id, event_id, event_type, lead_id, crm_lead_id, payload, attempts
       FROM crm_outbox
      WHERE status = 'pending' AND (next_retry_at IS NULL OR next_retry_at <= NOW())
      ORDER BY id ASC LIMIT ?`,
    [batchSize]
  );
  if (rows.length === 0) return report;

  // Group into batches of 500 (CRM limit)
  const batch = rows.slice(0, 500);
  const events = batch.map((r) => {
    let payload = r.payload;
    if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch { payload = {}; } }
    return { id: r.event_id, type: r.event_type, occurredAt: new Date().toISOString(), data: payload };
  });

  report.processed = batch.length;
  const result = await sendBatch(events);

  if (result.sent) {
    const ids = batch.map((r) => r.id);
    await pool.query(
      `UPDATE crm_outbox SET status = 'sent', sent_at = NOW(), attempts = attempts + 1, response = ? WHERE id IN (${ids.map(() => '?').join(',')})`,
      [JSON.stringify(result.response || {}), ...ids]
    );
    report.sent = batch.length;
  } else {
    // retry with backoff
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
  }
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

module.exports = { enqueue, sendBatch, processBatch, getConfig, sign };
