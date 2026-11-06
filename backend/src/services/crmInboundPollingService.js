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

const pollOnce = async () => {
  const config = getConfig();
  if (!config.configured) return { processed: 0, error: config.message };
  let cursor = await getCursor();
  let totalProcessed = 0;
  let pages = 0;
  const maxPages = 50;
  try {
    while (pages < maxPages) {
      const url = `${CRM_API_BASE}/leads?limit=${POLL_LIMIT}` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' }
      });
      if (!res.ok) {
        return { processed: totalProcessed, error: `HTTP ${res.status}` };
      }
      const body = await res.json();
      const leads = Array.isArray(body && body.data) ? body.data : [];
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
      if (!more || !cursor) break;
      pages++;
    }
    if (cursor) await setCursor(cursor);
    return { processed: totalProcessed };
  } catch (error) {
    return { processed: totalProcessed, error: error.message || 'poll error' };
  }
};

module.exports = { getConfig, getCursor, setCursor, pollOnce };
