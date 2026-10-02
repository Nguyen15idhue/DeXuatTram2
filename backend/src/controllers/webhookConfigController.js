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

exports.testSendWork = async (req, res) => {
  try {
    const pool = require('../utils/db');
    const apiConfigService = require('../services/apiConfigService');
    const oneOfficeService = require('../services/oneOfficeService');
    const { ID, project_id } = req.body || {};
    if (ID === undefined || ID === null || String(ID).trim() === '') {
      return res.status(400).json({ success: false, message: 'Thiếu ID quy trình' });
    }
    if (project_id === undefined || project_id === null || String(project_id).trim() === '') {
      return res.status(400).json({ success: false, message: 'Thiếu project_id' });
    }
    const stored = await apiConfigService.getDefaultPushConfig();
    if (!stored) {
      return res.status(400).json({ success: false, message: 'Chưa có cấu hình API 1Office active' });
    }
    let auth = stored.auth_config;
    if (typeof auth === 'string') {
      try { auth = JSON.parse(auth); } catch { auth = {}; }
    }
    const token = (auth && (auth.access_token || auth.token || auth.admin_token)) || '';
    if (!token) {
      return res.status(400).json({ success: false, message: 'Cấu hình API thiếu token' });
    }
    const startedAt = Date.now();
    const upstream = await oneOfficeService.updateWorkProcess({
      baseUrl: stored.base_url,
      token,
      ID: String(ID),
      project_id: String(project_id)
    });
    const masked = token.length > 8 ? `${token.slice(0, 4)}***${token.slice(-4)}` : '***';
    await pool.query(
      `INSERT INTO api_queue_logs
        (api_config_id, action, entity_type, entity_id, status, direction, request_payload, response_payload, started_at, completed_at)
       VALUES (?, 'work_process_update', 'work_process', NULL, ?, 'push', ?, ?, NOW(), NOW())`,
      [stored.id, upstream.success ? 'completed' : 'failed',
        JSON.stringify({ ID: String(ID), project_id: String(project_id), token: masked, token_source: 'stored', latency_ms: Date.now() - startedAt, via: 'admin-test-send-work' }),
        JSON.stringify({ status: upstream.status, error: upstream.error || null })]
    ).catch(() => {});
    if (!upstream.success) {
      return res.status(upstream.status || 502).json({ success: false, message: upstream.error || '1Office trả lỗi', data: upstream.data });
    }
    res.json({ success: true, data: upstream.data });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Test send work error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.inboundLogs = async (req, res) => {
  try {
    const pool = require('../utils/db');
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const sinceId = parseInt(req.query.since_id) || 0;
    const status = req.query.status || '';
    const action = req.query.action || '';
    const allowedActions = ['webhook', 'work_process_move', 'work_process_update'];
    const where = [];
    const params = [];
    if (action && allowedActions.includes(action)) {
      where.push('action = ?');
      params.push(action);
    } else {
      where.push(`direction = 'inbound'`);
    }
    if (sinceId > 0) {
      where.push('id > ?');
      params.push(sinceId);
    }
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    const [rows] = await pool.query(
      `SELECT id, action, entity_id, status, direction, request_payload, response_payload, created_at
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
