// backend/src/controllers/crm/crmConfigController.js
const crmInboundPollingService = require('../../services/crm/crmInboundPollingService');
const crmOutboundService = require('../../services/crm/crmOutboundService');
const crmAdminLogService = require('../../services/crm/crmAdminLogService');

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
    const inbound = await crmInboundPollingService.pollOnce({ source: 'manual' });
    const outbound = await crmOutboundService.processBatch();
    res.json({ success: true, data: { inbound, outbound } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.listOutbox = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const status = req.query.status || null;
    const { rows, total } = await crmAdminLogService.listOutbox({ page, limit, status });
    res.json({ success: true, data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.retryOutbox = async (req, res) => {
  try {
    await crmAdminLogService.retryOutbox(Number(req.params.id));
    res.json({ success: true, message: 'Đã đưa event vào hàng chờ gửi lại' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.getOutboxDetail = async (req, res) => {
  try {
    const row = await crmAdminLogService.getOutboxDetail(Number(req.params.id));
    if (!row) return res.status(404).json({ success: false, message: 'Không tìm thấy event' });
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.cancelOutbox = async (req, res) => {
  try {
    const affected = await crmAdminLogService.cancelOutbox(Number(req.params.id));
    if (affected === 0) return res.status(400).json({ success: false, message: 'Event không ở trạng thái pending/failed' });
    res.json({ success: true, message: 'Đã hủy event' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.retryAllOutbox = async (req, res) => {
  try {
    const affected = await crmAdminLogService.retryAllOutbox();
    res.json({ success: true, data: { affected }, message: `Đã reset ${affected} event vào hàng chờ gửi lại` });
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
    const crmWebhookLogService = require('../../services/crm/crmWebhookLogService');
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

const logFilters = (query) => ({
  direction: query.direction || null,
  status: query.status || null,
  eventType: query.event_type || null,
  leadId: query.lead_id ? Number(query.lead_id) : null,
  crmLeadId: query.crm_lead_id || null,
  dateFrom: query.date_from || null,
  dateTo: query.date_to || null
});

exports.listLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const { data, total } = await crmAdminLogService.listLogs(logFilters(req.query), { page, limit });
    res.json({ success: true, data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({ success: false, message: 'Bảng crm_webhook_logs chưa tồn tại — cần chạy migration 102-crm-webhook-logs.sql' });
    }
    res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.getLogDetail = async (req, res) => {
  try {
    const row = await crmAdminLogService.getLogDetail(Number(req.params.id));
    if (!row) return res.status(404).json({ success: false, message: 'Không tìm thấy log' });
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.exportLogs = async (req, res) => {
  try {
    const XLSX = require('xlsx');
    const data = await crmAdminLogService.exportLogRows(logFilters(req.query));
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
