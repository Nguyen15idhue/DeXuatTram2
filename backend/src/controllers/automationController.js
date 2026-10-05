const workAutomationService = require('../services/workAutomationService');
const pool = require('../utils/db');

const AUTOMATION_KEY = 'auto_assign_process';

const cleanUpdate = (body) => {
  const out = {};
  if ('enabled' in body) out.enabled = body.enabled ? 1 : 0;
  if ('project_code' in body) {
    const v = String(body.project_code || '').trim();
    if (!v) throw Object.assign(new Error('Ma du an khong duoc de trong'), { statusCode: 400 });
    out.project_code = v;
  }
  if ('project_title' in body) out.project_title = String(body.project_title || '').slice(0, 255) || null;
  for (const k of ['retry_max', 'retry_interval_s', 'find_timeout_s']) {
    if (k in body) {
      const v = parseInt(body[k], 10);
      if (!Number.isFinite(v) || v < 1 || v > 3600) throw Object.assign(new Error(`${k} phai tu 1 den 3600`), { statusCode: 400 });
      out[k] = v;
    }
  }
  if (out.retry_max !== undefined && out.retry_max > 20) throw Object.assign(new Error('retry_max toi da 20'), { statusCode: 400 });
  if ('username' in body) out.username = String(body.username || '').slice(0, 255) || null;
  if ('note' in body) out.note = String(body.note || '').slice(0, 2000) || null;
  if ('password' in body && body.password !== undefined && body.password !== null && String(body.password) !== '') {
    out.password = String(body.password);
  }
  if ('api_token' in body && body.api_token !== undefined && body.api_token !== null && String(body.api_token) !== '') {
    out.api_token = String(body.api_token);
  }
  return out;
};

exports.list = async (req, res) => {
  try {
    res.json({ success: true, data: await workAutomationService.list() });
  } catch (error) {
    console.error('List automations error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.get = async (req, res) => {
  try {
    const row = await workAutomationService.getByKey(AUTOMATION_KEY);
    if (!row) return res.status(404).json({ success: false, message: 'Không tìm thấy automation' });
    res.json({ success: true, data: workAutomationService.maskRow(row) });
  } catch (error) {
    console.error('Get automation error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.update = async (req, res) => {
  try {
    const data = await workAutomationService.updateByKey(AUTOMATION_KEY, cleanUpdate(req.body || {}));
    res.json({ success: true, data, message: 'Đã lưu cấu hình' });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    console.error('Update automation error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.testLogin = async (req, res) => {
  try {
    const { username, password, api_token } = req.body || {};
    let u = username;
    let p = password;
    let t = api_token;
    if ((!u || !p) || !t) {
      const saved = await workAutomationService.getByKey(AUTOMATION_KEY);
      if (!saved) return res.status(404).json({ success: false, message: 'Không tìm thấy automation' });
      if (!u && saved.username) u = saved.username;
      if ((!p || String(p) === '') && saved.password_enc) p = workAutomationService.decryptSecret(saved.password_enc);
      if ((!t || String(t) === '') && saved.api_token_enc) t = workAutomationService.decryptSecret(saved.api_token_enc);
    }
    const data = await workAutomationService.testLogin({ username: u, password: p, apiToken: t });
    res.json({ success: true, data });
  } catch (error) {
    if (error.statusCode === 401) return res.status(200).json({ success: false, message: error.message });
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    console.error('Test automation login error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.runManual = async (req, res) => {
  try {
    const { proposal_code } = req.body || {};
    const run = await workAutomationService.runManual(proposal_code);
    res.json({ success: true, data: run });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    console.error('Manual automation run error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.runs = async (req, res) => {
  try {
    const auto = await workAutomationService.getByKey(AUTOMATION_KEY);
    if (!auto) return res.status(404).json({ success: false, message: 'Không tìm thấy automation' });
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const status = String(req.query.status || '').trim();
    const where = ['automation_id = ?'];
    const params = [auto.id];
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM work_automation_runs WHERE ${where.join(' AND ')}`, params);
    const [rows] = await pool.query(
      `SELECT id, automation_id, proposal_id, proposal_code, contact_code, process_id, \`trigger\`, action, status, attempt, error, started_at, finished_at, created_at
       FROM work_automation_runs WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]
    );
    res.json({ success: true, data: rows, pagination: { page, limit, total } });
  } catch (error) {
    console.error('List automation runs error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.runDetail = async (req, res) => {
  try {
    const auto = await workAutomationService.getByKey(AUTOMATION_KEY);
    if (!auto) return res.status(404).json({ success: false, message: 'Không tìm thấy automation' });
    const [rows] = await pool.query('SELECT * FROM work_automation_runs WHERE id = ? AND automation_id = ? LIMIT 1', [req.params.id, auto.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Không tìm thấy lượt chạy' });
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Get automation run error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
