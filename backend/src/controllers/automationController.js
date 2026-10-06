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
  if ('spreadsheet_id' in body) out.spreadsheet_id = String(body.spreadsheet_id || '').slice(0, 128) || null;
  if ('sheet_mode' in body) out.sheet_mode = String(body.sheet_mode || 'per_version').slice(0, 16);
  if ('write_mode' in body) out.write_mode = String(body.write_mode || 'upsert').slice(0, 16);
  if ('frequency_min' in body) {
    const n = parseInt(body.frequency_min, 10);
    if (!Number.isFinite(n) || n < 5 || n > 1440) throw Object.assign(new Error('frequency_min phai tu 5 den 1440'), { statusCode: 400 });
    out.frequency_min = n;
  }
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

exports.get = async (req, res) => getByKey(AUTOMATION_KEY, req, res);

exports.getByKeyRoute = async (req, res) => {
  const key = String(req.params.key || '');
  if (!ALLOWED_KEYS.includes(key)) return res.status(404).json({ success: false, message: 'Không hỗ trợ automation này' });
  return getByKey(key, req, res);
};

async function getByKey(key, req, res) {
  try {
    const row = await workAutomationService.getByKey(key);
    if (!row) return res.status(404).json({ success: false, message: 'Không tìm thấy automation' });
    res.json({ success: true, data: workAutomationService.maskRow(row) });
  } catch (error) {
    console.error('Get automation error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
}

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

const ALLOWED_KEYS = ['auto_assign_process', 'sync_process_report'];

exports.updateByKey = async (req, res) => {
  try {
    const key = String(req.params.key || '');
    if (!ALLOWED_KEYS.includes(key)) return res.status(404).json({ success: false, message: 'Không hỗ trợ automation này' });
    const data = await workAutomationService.updateByKey(key, cleanUpdate(req.body || {}));
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

exports.runs = async (req, res) => runsByKey(AUTOMATION_KEY, req, res);

exports.runDetail = async (req, res) => runDetailByKey(AUTOMATION_KEY, req, res);

exports.syncRuns = async (req, res) => runsByKey(SYNC_KEY, req, res);

exports.syncRunDetail = async (req, res) => runDetailByKey(SYNC_KEY, req, res);

async function runsByKey(key, req, res) {
  try {
    const auto = await workAutomationService.getByKey(key);
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

async function runDetailByKey(key, req, res) {
  try {
    const auto = await workAutomationService.getByKey(key);
    if (!auto) return res.status(404).json({ success: false, message: 'Không tìm thấy automation' });
    const [rows] = await pool.query('SELECT * FROM work_automation_runs WHERE id = ? AND automation_id = ? LIMIT 1', [req.params.id, auto.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Không tìm thấy lượt chạy' });
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Get automation run error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const SYNC_KEY = 'sync_process_report';
const syncService = () => require('../services/syncReportService');
const sheetService = () => require('../services/googleSheetService');

const needSyncAuto = async () => {
  const auto = await syncService().getSyncAutomation();
  if (!auto) throw Object.assign(new Error('Không tìm thấy automation sync'), { statusCode: 404 });
  return auto;
};

exports.syncVersions = async (req, res) => {
  try {
    const pool = require('../utils/db');
    const [rows] = await pool.query('SELECT version, JSON_UNQUOTE(JSON_EXTRACT(tree_json, "$.template")) AS template, fetched_at, JSON_LENGTH(tree_json, "$.nodes") AS nodes FROM automation_field_cache ORDER BY version ASC');
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('List sync versions error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.syncFields = async (req, res) => {
  try {
    const version = String(req.query.version || '').trim();
    if (!version) return res.status(400).json({ success: false, message: 'Thiếu version' });
    const data = await syncService().getFieldTree(version, { refresh: req.query.refresh === '1' });
    res.json({ success: true, data });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    console.error('Get sync fields error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.syncMappingsGet = async (req, res) => {
  try {
    const auto = await needSyncAuto();
    const version = String(req.query.version || '').trim();
    if (!version) return res.status(400).json({ success: false, message: 'Thiếu version' });
    res.json({ success: true, data: await syncService().getMappings(auto.id, version) });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    console.error('Get sync mappings error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.syncMappingsPut = async (req, res) => {
  try {
    const auto = await needSyncAuto();
    const version = String(req.query.version || '').trim();
    if (!version) return res.status(400).json({ success: false, message: 'Thiếu version' });
    const items = Array.isArray(req.body && req.body.items) ? req.body.items : req.body;
    res.json({ success: true, data: await syncService().saveMappings(auto.id, version, items), message: 'Đã lưu mapping' });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    console.error('Save sync mappings error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.syncCopyMap = async (req, res) => {  try {
    const auto = await needSyncAuto();
    const { from_version, to_version } = req.body || {};
    if (!from_version || !to_version) return res.status(400).json({ success: false, message: 'Thiếu from_version/to_version' });
    res.json({ success: true, data: await syncService().copyMappings(auto.id, from_version, to_version), message: 'Đã copy mapping' });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    console.error('Copy sync map error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.syncAutoMatch = async (req, res) => {
  try {
    const auto = await needSyncAuto();
    const { version } = req.body || {};
    if (!version) return res.status(400).json({ success: false, message: 'Thiếu version' });
    const data = await syncService().autoMatch(auto.id, version);
    res.json({ success: true, data, message: `Đã auto-match thêm ${data.added} trường` });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    console.error('Auto match error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.syncMappingsDelete = async (req, res) => {
  try {
    const auto = await needSyncAuto();
    const version = String(req.query.version || '').trim();
    const pool = require('../utils/db');
    if (version && version !== 'all') {
      const [r] = await pool.query('DELETE FROM automation_sheet_mappings WHERE automation_id = ? AND version = ?', [auto.id, version]);
      return res.json({ success: true, data: { version, deleted: r.affectedRows }, message: `Đã xóa ${r.affectedRows} mapping (ver ${version})` });
    }
    const [r] = await pool.query('DELETE FROM automation_sheet_mappings WHERE automation_id = ?', [auto.id]);
    res.json({ success: true, data: { version: 'all', deleted: r.affectedRows }, message: `Đã xóa ${r.affectedRows} mapping (tất cả version)` });
  } catch (error) {
    console.error('Delete sync mappings error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.syncSheetHeaders = async (req, res) => {  try {
    const auto = await needSyncAuto();
    if (!auto.spreadsheet_id) return res.status(400).json({ success: false, message: 'Chưa cấu hình Sheet ID' });
    const tab = String(req.query.tab || '').trim();
    if (!tab) return res.status(400).json({ success: false, message: 'Thiếu tab' });
    res.json({ success: true, data: await sheetService().getHeaders(auto.spreadsheet_id, tab) });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    console.error('Get sheet headers error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.syncSheetAddColumn = async (req, res) => {
  try {
    const auto = await needSyncAuto();
    if (!auto.spreadsheet_id) return res.status(400).json({ success: false, message: 'Chưa cấu hình Sheet ID' });
    const { tab, header } = req.body || {};
    if (!tab || !String(header || '').trim()) return res.status(400).json({ success: false, message: 'Thiếu tab/header' });
    res.json({ success: true, data: await sheetService().appendColumn(auto.spreadsheet_id, tab, String(header).trim()) });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    console.error('Add sheet column error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.syncTest = async (req, res) => {
  try {
    const auto = await needSyncAuto();
    const { version, limit } = req.body || {};
    const data = await syncService().dryRun(auto, { version, limit: Math.min(5, Math.max(1, parseInt(limit, 10) || 3)) });
    res.json({ success: true, data });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    console.error('Test sync error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.syncRun = async (req, res) => {
  try {
    const auto = await needSyncAuto();
    const { version } = req.body || {};
    const data = await syncService().runSync(auto, { version, trigger: 'manual' });
    res.json({ success: true, data });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    console.error('Manual sync error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.syncSampleExcel = async (req, res) => {
  try {
    const auto = await needSyncAuto();
    const version = String(req.query.version || '').trim();
    if (!version) return res.status(400).json({ success: false, message: 'Thiếu version' });
    const buf = await syncService().sampleExcel(auto, version);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="sync-mau-ver${version}.xlsx"`);
    res.send(buf);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    console.error('Sample excel error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
