// backend/src/services/crmInboundPollingService.js
const pool = require('../utils/db');
const crmInboundService = require('./crmInboundService');
const crmStatusMapping = require('../integrations/crm/crmStatusMapping');

const CRM_API_BASE = 'https://crm.tmt-vietnam.com/api/v1/partner';
const POLL_LIMIT = 200;

const getConfig = () => {
  const apiKey = String(process.env.TMT_CRM_API_KEY || '').trim();
  const configured = !!apiKey;
  return {
    configured,
    apiKey,
    message: configured ? 'OK' : 'TMT_CRM_API_KEY chưa cấu hình'
  };
};

const getCursor = async () => {
  const [rows] = await pool.query("SELECT `value` FROM crm_sync_state WHERE `key` = 'crm_leads_cursor' LIMIT 1");
  return rows.length ? rows[0].value : null;
};

const setCursor = async (cursor) => {
  await pool.query(
    "INSERT INTO crm_sync_state (`key`, `value`) VALUES ('crm_leads_cursor', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = NOW()",
    [cursor || null]
  );
};

const pollOnce = async (options = {}) => {
  const source = options.source === 'manual' ? 'manual' : 'auto';
  const eventType = source === 'manual' ? 'manual_sync' : 'poll';
  const startedAt = Date.now();
  const config = getConfig();
  const crmWebhookLogService = require('./crmWebhookLogService');
  if (!config.configured) {
    if (source === 'manual') {
      await crmWebhookLogService.logInbound({
        eventId: null, eventType, status: 'failed', httpStatus: null,
        payload: { source }, error: config.message, durationMs: Date.now() - startedAt
      });
    }
    return { processed: 0, error: config.message };
  }

  // Tạm dừng đồng bộ tăng dần khi đang chạy đồng bộ toàn bộ (tránh tranh cursor).
  let fullSyncActive = false;
  try {
    const [active] = await pool.query("SELECT id FROM crm_full_sync_runs WHERE status IN ('QUEUED','RUNNING') LIMIT 1");
    fullSyncActive = active.length > 0;
  } catch { /* bảng chưa migrate */ }
  if (fullSyncActive) {
    if (source === 'manual') {
      await crmWebhookLogService.logInbound({
        eventId: null, eventType, status: 'skipped', httpStatus: null,
        payload: { source, reason: 'full_sync_running' },
        durationMs: Date.now() - startedAt
      });
    }
    return { processed: 0, skipped: true, reason: 'Đang chạy đồng bộ toàn bộ khách hàng' };
  }

  let cursor = await getCursor();
  let totalProcessed = 0;
  let pages = 0;
  let fetched = 0;
  const maxPages = 50;
  try {
    while (pages < maxPages) {
      const url = `${CRM_API_BASE}/leads?limit=${POLL_LIMIT}` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'Accept': 'application/json' }
      });
      if (!res.ok) {
        await crmWebhookLogService.logInbound({
          eventId: null, eventType, status: 'failed', httpStatus: res.status,
          payload: { source, cursor: cursor || null }, error: `HTTP ${res.status}`,
          durationMs: Date.now() - startedAt
        });
        return { processed: totalProcessed, error: `HTTP ${res.status}` };
      }
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await res.text();
        await crmWebhookLogService.logInbound({
          eventId: null, eventType, status: 'failed', httpStatus: res.status,
          payload: { source, cursor: cursor || null }, error: `Non-JSON: ${text.slice(0, 100)}`,
          durationMs: Date.now() - startedAt
        });
        return { processed: totalProcessed, error: `CRM trả về ${contentType}, không phải JSON: ${text.slice(0, 100)}` };
      }
      const body = await res.json();
      const leads = Array.isArray(body && body.data) ? body.data : [];
      fetched += leads.length;
      for (const lead of leads) {
        try {
          await crmInboundService.upsertLeadFromCrm(lead, pool);
          totalProcessed++;
        } catch (e) {
          console.error('[CrmInboundPolling] upsert failed:', e.message);
        }
      }
      cursor = body.nextCursor || null;
      const more = body.more === true;
      await crmWebhookLogService.logInbound({
        eventId: null, eventType, status: 'processed', httpStatus: res.status,
        payload: { source, fetched: leads.length, processed: totalProcessed, cursor: cursor || null },
        response: { nextCursor: cursor, more }, durationMs: Date.now() - startedAt
      });
      if (!more || !cursor) break;
      pages++;
    }
    if (cursor) await setCursor(cursor);
    return { processed: totalProcessed };
  } catch (error) {
    await crmWebhookLogService.logInbound({
      eventId: null, eventType, status: 'failed', httpStatus: null,
      payload: { source, fetched }, error: error.message || 'poll error',
      durationMs: Date.now() - startedAt
    });
    return { processed: totalProcessed, error: error.message || 'poll error' };
  }
};

module.exports = { getConfig, getCursor, setCursor, pollOnce };
