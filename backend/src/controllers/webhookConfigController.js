const webhookConfigService = require('../services/webhookConfigService');
const externalEventService = require('../services/externalEventService');

exports.list = async (req, res) => {
  try {
    const rows = await webhookConfigService.list();
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('List webhooks error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.create = async (req, res) => {
  try {
    const result = await webhookConfigService.create(req.body || {});
    res.status(201).json({ success: true, data: result, message: 'Tạo webhook thành công (secret chỉ hiện 1 lần)' });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Create webhook error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.rotate = async (req, res) => {
  try {
    const result = await webhookConfigService.rotate(req.params.id);
    res.json({ success: true, data: result, message: 'Đã tạo secret mới (secret cũ vẫn dùng được trong grace period)' });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Rotate webhook error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.setActive = async (req, res) => {
  try {
    const { is_active } = req.body || {};
    await webhookConfigService.setActive(req.params.id, is_active);
    res.json({ success: true, message: 'Cập nhật trạng thái thành công' });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Update webhook error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.remove = async (req, res) => {
  try {
    await webhookConfigService.remove(req.params.id);
    res.json({ success: true, message: 'Xóa webhook thành công' });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Delete webhook error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.testSend = async (req, res) => {
  try {
    const { event, proposal_code, contact_code, note } = req.body || {};
    const result = await externalEventService.applyExternalEvent({
      eventId: `manual-test-${Date.now()}`,
      event,
      proposalCode: proposal_code,
      contactCode: contact_code,
      note: note || 'Bắn thử từ quản lý webhook',
      eventTime: new Date().toISOString(),
      actor: 'webhook-test',
      source: 'script',
      ip: req.ip || null
    });
    res.json({ success: true, data: result });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Test webhook error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.inboundLogs = async (req, res) => {
  try {
    const pool = require('../utils/db');
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const sinceId = parseInt(req.query.since_id) || 0;
    const status = req.query.status || '';
    const where = [`direction = 'inbound'`];
    const params = [];
    if (sinceId > 0) {
      where.push('id > ?');
      params.push(sinceId);
    }
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    const [rows] = await pool.query(
      `SELECT id, action, entity_id, status, request_payload, response_payload, created_at
       FROM api_queue_logs WHERE ${where.join(' AND ')}
       ORDER BY id DESC LIMIT ?`,
      [...params, limit]
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Inbound logs error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
