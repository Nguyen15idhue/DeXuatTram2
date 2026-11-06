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
    res.json({ success: result.sent, data: result, message: result.sent ? 'Gửi test thành công' : (result.error || 'Gửi thất bại') });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};
