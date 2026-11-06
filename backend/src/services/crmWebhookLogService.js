// backend/src/services/crmWebhookLogService.js
const pool = require('../utils/db');

const logInbound = async ({ eventId, eventType, crmLeadId, leadId, status, httpStatus, payload, response, error, durationMs }) => {
  try {
    await pool.query(
      `INSERT INTO crm_webhook_logs (direction, sender, receiver, event_id, event_type, lead_id, crm_lead_id, status, http_status, payload, response, error, duration_ms)
       VALUES ('inbound', 'CRM', 'TMT-EGREEN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [eventId || null, eventType || null, leadId || null, crmLeadId || null, status || 'received', httpStatus || 200, payload ? JSON.stringify(payload) : null, response ? JSON.stringify(response) : null, error || null, durationMs || null]
    );
  } catch (e) { /* silent */ }
};

const logOutbound = async ({ eventId, eventType, leadId, crmLeadId, status, httpStatus, payload, response, error, durationMs }) => {
  try {
    await pool.query(
      `INSERT INTO crm_webhook_logs (direction, sender, receiver, event_id, event_type, lead_id, crm_lead_id, status, http_status, payload, response, error, duration_ms)
       VALUES ('outbound', 'TMT-EGREEN', 'CRM', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [eventId || null, eventType || null, leadId || null, crmLeadId || null, status || 'sent', httpStatus || null, payload ? JSON.stringify(payload) : null, response ? JSON.stringify(response) : null, error || null, durationMs || null]
    );
  } catch (e) { /* silent */ }
};

const cleanupOld = async (days = 120) => {
  try {
    await pool.query('DELETE FROM crm_webhook_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)', [days]);
  } catch (e) { /* silent */ }
};

module.exports = { logInbound, logOutbound, cleanupOld };
