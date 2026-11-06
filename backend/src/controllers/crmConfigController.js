// backend/src/controllers/crmConfigController.js
const crmInboundPollingService = require('../services/crmInboundPollingService');
const crmOutboundService = require('../services/crmOutboundService');
const pool = require('../utils/db');

exports.getConfig = async (req, res) => {
  try {
    const inbound = crmInboundPollingService.getConfig();
    const outbound = crmOutboundService.getConfig();
    res.json({
      success: true,
      data: {
        inbound: { configured: inbound.configured, message: inbound.message },
        outbound: { configured: outbound.configured, message: outbound.message, url: outbound.url ? '(set)' : null },
        env: {
          TMT_CRM_API_KEY: !!process.env.TMT_CRM_API_KEY,
          TMT_CRM_WEBHOOK_URL: !!process.env.TMT_CRM_WEBHOOK_URL,
          TMT_CRM_WEBHOOK_SECRET: !!process.env.TMT_CRM_WEBHOOK_SECRET,
          CRM_WEBHOOK_IPS: process.env.CRM_WEBHOOK_IPS || '',
          CRM_IMPORT_USER_ID: process.env.CRM_IMPORT_USER_ID || null
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.syncNow = async (req, res) => {
  try {
    const result = await crmInboundPollingService.pollOnce();
    const outbox = await crmOutboundService.processBatch();
    res.json({ success: true, data: { inbound: result, outbound: outbox } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.listOutbox = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const status = req.query.status || null;
    const where = status ? 'WHERE status = ?' : '';
    const params = status ? [status, limit, offset] : [limit, offset];
    const [rows] = await pool.query(
      `SELECT id, event_id, event_type, lead_id, crm_lead_id, status, attempts, next_retry_at, created_at, sent_at, last_error
         FROM crm_outbox ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      params
    );
    const [countRows] = await pool.query(`SELECT COUNT(*) AS n FROM crm_outbox ${where}`, status ? [status] : []);
    res.json({ success: true, data: rows, pagination: { page, limit, total: countRows[0].n, totalPages: Math.ceil(countRows[0].n / limit) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.retryOutbox = async (req, res) => {
  try {
    const id = Number(req.params.id);
    await pool.query("UPDATE crm_outbox SET status = 'pending', next_retry_at = NOW(), last_error = NULL WHERE id = ?", [id]);
    res.json({ success: true, message: 'Đã đưa event vào hàng chờ gửi lại' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.retryAllOutbox = async (req, res) => {
  try {
    const [r] = await pool.query("UPDATE crm_outbox SET status = 'pending', attempts = 0, next_retry_at = NOW(), last_error = NULL WHERE status IN ('pending','failed')");
    res.json({ success: true, data: { affected: r.affectedRows }, message: `Đã reset ${r.affectedRows} event vào hàng chờ gửi lại` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.testWebhook = async (req, res) => {
  try {
    const config = crmOutboundService.getConfig();
    if (!config.configured) {
      return res.status(400).json({ success: false, message: config.message });
    }
    const testEvent = {
      id: `eg_test_${Date.now()}`,
      type: 'lead.care',
      occurredAt: new Date().toISOString(),
      data: {
        leadId: 'TEST_LEAD',
        channel: 'Hệ thống',
        note: 'Test webhook từ TMT-EGREEN',
        staff: 'System',
        ref: 'EG-TEST'
      }
    };
    const result = await crmOutboundService.sendBatch([testEvent]);
    const crmWebhookLogService = require('../services/crmWebhookLogService');
    await crmWebhookLogService.logOutbound({
      eventId: testEvent.id, eventType: testEvent.type, leadId: null, crmLeadId: 'TEST_LEAD',
      status: result.sent ? 'sent' : 'failed', httpStatus: result.status || null,
      payload: testEvent, response: result.response || null, error: result.error || null, durationMs: null
    });
    res.json({ success: result.sent, data: result, message: result.sent ? 'Gửi test thành công' : (result.error || 'Gửi thất bại') });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};
exports.listLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const direction = req.query.direction || null;
    const status = req.query.status || null;
    const leadId = req.query.lead_id ? Number(req.query.lead_id) : null;
    const crmLeadId = req.query.crm_lead_id || null;
    const dateFrom = req.query.date_from || null;
    const dateTo = req.query.date_to || null;
    const where = [];
    const params = [];
    if (direction) { where.push('direction = ?'); params.push(direction); }
    if (status) { where.push('status = ?'); params.push(status); }
    if (leadId) { where.push('lead_id = ?'); params.push(leadId); }
    if (crmLeadId) { where.push('crm_lead_id = ?'); params.push(crmLeadId); }
    if (dateFrom) { where.push('created_at >= ?'); params.push(`${String(dateFrom).slice(0,10)} 00:00:00`); }
    if (dateTo) { where.push('created_at <= ?'); params.push(`${String(dateTo).slice(0,10)} 23:59:59`); }
    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const [rows] = await pool.query(
      `SELECT id, direction, sender, receiver, event_id, event_type, lead_id, crm_lead_id, status, http_status, duration_ms, created_at
         FROM crm_webhook_logs ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [countRows] = await pool.query(`SELECT COUNT(*) AS n FROM crm_webhook_logs ${whereClause}`, params);
    res.json({ success: true, data: rows, pagination: { page, limit, total: countRows[0].n, totalPages: Math.ceil(countRows[0].n / limit) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.getLogDetail = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query('SELECT * FROM crm_webhook_logs WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Không tìm thấy log' });
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.exportLogs = async (req, res) => {
  try {
    const XLSX = require('xlsx');
    const direction = req.query.direction || null;
    const status = req.query.status || null;
    const dateFrom = req.query.date_from || null;
    const dateTo = req.query.date_to || null;
    const where = [];
    const params = [];
    if (direction) { where.push('direction = ?'); params.push(direction); }
    if (status) { where.push('status = ?'); params.push(status); }
    if (dateFrom) { where.push('created_at >= ?'); params.push(`${String(dateFrom).slice(0,10)} 00:00:00`); }
    if (dateTo) { where.push('created_at <= ?'); params.push(`${String(dateTo).slice(0,10)} 23:59:59`); }
    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const [rows] = await pool.query(
      `SELECT id, direction, sender, receiver, event_id, event_type, lead_id, crm_lead_id, status, http_status, duration_ms, created_at, payload, response, error
         FROM crm_webhook_logs ${whereClause} ORDER BY id DESC LIMIT 5000`,
      params
    );
    const data = rows.map((r) => ({
      'ID': r.id,
      'Hướng': r.direction,
      'Bên gửi': r.sender,
      'Bên nhận': r.receiver,
      'Event ID': r.event_id,
      'Event type': r.event_type,
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
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Webhook Logs');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="crm_webhook_logs.xlsx"');
    res.send(buf);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};
