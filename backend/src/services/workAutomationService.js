const crypto = require('crypto');
const https = require('https');
const { URL } = require('url');
const pool = require('../utils/db');
const apiConfigService = require('./apiConfigService');

const sessions = new Map();

const secretKey = () => {
  const raw = [process.env.AUTOMATION_KEY, process.env.JWT_SECRET].filter(Boolean).join('|');
  if (!raw) throw Object.assign(new Error('Thieu AUTOMATION_KEY/JWT_SECRET'), { statusCode: 500 });
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
};

exports.encryptSecret = (plain) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return Buffer.from(JSON.stringify({ iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') })).toString('base64');
};

exports.decryptSecret = (enc) => {
  const o = JSON.parse(Buffer.from(String(enc), 'base64').toString('utf8'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(o.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(o.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(o.data, 'base64')), decipher.final()]).toString('utf8');
};

exports.maskRow = (row) => {
  if (!row) return row;
  const out = { ...row };
  out.password_set = !!out.password_enc;
  out.api_token_set = !!out.api_token_enc;
  if (out.template_process_ids && typeof out.template_process_ids === 'string') {
    try { out.template_process_ids = JSON.parse(out.template_process_ids); } catch { out.template_process_ids = []; }
  }
  delete out.password_enc;
  delete out.api_token_enc;
  return out;
};

exports.getByKey = async (key) => {
  const [rows] = await pool.query('SELECT * FROM work_automations WHERE automation_key = ?', [key]);
  return rows.length > 0 ? rows[0] : null;
};

exports.list = async () => {
  const [rows] = await pool.query('SELECT * FROM work_automations ORDER BY automation_type ASC, id ASC');
  return rows.map(exports.maskRow);
};

exports.getByType = async (type) => {
  const [rows] = await pool.query('SELECT * FROM work_automations WHERE automation_type = ? ORDER BY id ASC', [type]);
  return rows;
};

exports.getFirstByType = async (type) => {
  const [rows] = await pool.query('SELECT * FROM work_automations WHERE automation_type = ? ORDER BY enabled DESC, id ASC LIMIT 1', [type]);
  return rows.length > 0 ? rows[0] : null;
};

const AUTOMATION_TYPES = ['assign_process', 'sync_sheet'];
const AUTOMATION_KEY_TYPE = { auto_assign_process: 'assign_process', sync_process_report: 'sync_sheet' };

const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);

exports.create = async (fields) => {
  const {
    automation_key, automation_type, name, enabled = 0,
    project_code = '2', project_title, retry_max = 3, retry_interval_s = 20, find_timeout_s = 60,
    username, note, spreadsheet_id = null, sheet_mode = 'per_version', frequency_min = 15, write_mode = 'upsert', sa_email,
  } = fields;

  if (!name || !String(name).trim()) throw Object.assign(new Error('Tên automation là bắt buộc'), { statusCode: 400 });

  let type = automation_type;
  if (!type) {
    // Auto-detect from provided key or default to first type
    if (automation_key) {
      const keyType = AUTOMATION_KEY_TYPE[automation_key];
      if (keyType) type = keyType;
    }
    if (!type) type = 'sync_sheet'; // default type for new automation
  }
  if (!AUTOMATION_TYPES.includes(type)) throw Object.assign(new Error('automation_type không hợp lệ'), { statusCode: 400 });

  // Always generate a unique key; if user provided key that already exists as a seed type,
  // suffix it to avoid collision and create new row
  let key = automation_key || `${type}_${slug(name) || 'auto'}`;
  const [dup] = await pool.query('SELECT id FROM work_automations WHERE automation_key = ?', [key]);
  if (dup.length > 0) {
    // If the key matches a known seed type, suffix to create new row
    const seedKeys = ['auto_assign_process', 'sync_process_report'];
    if (seedKeys.includes(key)) {
      key = `${key}_${Date.now().toString(36)}`;
    } else {
      // For custom keys, still make unique via counter-style suffix
      key = `${key}_${Date.now().toString(36)}`;
    }
  }

  const cols = ['automation_key', 'automation_type', 'name', 'enabled', 'project_code', 'project_title', 'retry_max', 'retry_interval_s', 'find_timeout_s', 'username', 'note', 'spreadsheet_id', 'sheet_mode', 'frequency_min', 'template_scan_hours', 'write_mode', 'sa_email'];
  const params = [key, type, String(name).trim(), enabled ? 1 : 0, project_code, project_title || null, retry_max, retry_interval_s, find_timeout_s, username || null, note || null, spreadsheet_id || null, sheet_mode, frequency_min, fields.template_scan_hours || 24, write_mode, sa_email || null];

  const [r] = await pool.query(`INSERT INTO work_automations (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, params);
  const [rows] = await pool.query('SELECT * FROM work_automations WHERE id = ?', [r.insertId]);
  return exports.maskRow(rows[0]);
};

exports.updateByKey = async (key, fields) => {
  const existing = await exports.getByKey(key);
  if (!existing) throw Object.assign(new Error('Khong tim thay automation'), { statusCode: 404 });
  const cols = [];
  const params = [];
  const allow = { name: 1, enabled: 1, project_code: 1, project_title: 1, retry_max: 1, retry_interval_s: 1, find_timeout_s: 1, username: 1, note: 1, spreadsheet_id: 1, sheet_mode: 1, frequency_min: 1, template_scan_hours: 1, write_mode: 1, sa_email: 1, template_process_ids: 1 };
  for (const [k, v] of Object.entries(fields)) {
    if (!allow[k]) continue;
    if ((k === 'frequency_min') || (k === 'retry_max') || (k === 'retry_interval_s') || (k === 'find_timeout_s') || (k === 'template_scan_hours')) {
      const n = parseInt(v, 10);
      if (!Number.isFinite(n) || n < 1) continue;
      cols.push(`\`${k}\` = ?`);
      params.push(n);
      continue;
    }
    if (k === 'template_process_ids') {
      cols.push('`template_process_ids` = ?');
      params.push(Array.isArray(v) ? JSON.stringify(v) : (v || null));
      continue;
    }
    cols.push(`\`${k}\` = ?`);
    params.push(v);
  }
  if ('password' in fields) {
    cols.push('password_enc = ?');
    params.push(fields.password ? exports.encryptSecret(fields.password) : existing.password_enc);
  }
  if ('api_token' in fields) {
    cols.push('api_token_enc = ?');
    params.push(fields.api_token ? exports.encryptSecret(fields.api_token) : existing.api_token_enc);
  }
  if (cols.length === 0) return exports.maskRow(existing);
  params.push(key);
  await pool.query(`UPDATE work_automations SET ${cols.join(', ')} WHERE automation_key = ?`, params);
  sessions.delete(existing.id);
  const [rows] = await pool.query('SELECT * FROM work_automations WHERE automation_key = ?', [key]);
  return exports.maskRow(rows[0]);
};

const webBaseUrl = async () => {
  try {
    const cfg = await apiConfigService.getDefaultPushConfig();
    if (cfg && cfg.base_url) return String(cfg.base_url).replace(/\/$/, '');
  } catch { /* silent */ }
  return 'https://egr.1office.vn';
};

const cookieOf = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');

const httpsRequest = (urlStr, { method = 'GET', headers = {}, body = null, timeout = 15000 } = {}) => new Promise((resolve, reject) => {
  const u = new URL(urlStr);
  const opts = {
    hostname: u.hostname, port: 443, path: u.pathname + u.search, method,
    headers: { ...headers, 'User-Agent': 'StationBot/1.0' },
    timeout,
  };
  const req = https.request(opts, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => {
      const rawHeaders = res.rawHeaders || [];
      const setCookie = [];
      for (let i = 0; i < rawHeaders.length; i += 2) {
        if (rawHeaders[i].toLowerCase() === 'set-cookie') setCookie.push(rawHeaders[i + 1]);
      }
      resolve({
        status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300,
        headers: { get: (k) => (k.toLowerCase() === 'set-cookie' ? setCookie : res.headers[k.toLowerCase()]) || null, getSetCookie: () => setCookie },
        body: Buffer.concat(chunks).toString('utf8'),
      });
    });
  });
  req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  req.on('error', reject);
  if (body) req.write(body);
  req.end();
});

const doWebLogin = async (base, username, password) => {
  const jar = {};
  const store = (res) => {
    const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of raw) {
      const kv = c.split(';')[0];
      const i = kv.indexOf('=');
      if (i > 0) jar[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
    }
  };
  let r = await httpsRequest(`${base}/login`);
  store(r);
  r = await httpsRequest(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Cookie: cookieOf(jar), Referer: `${base}/login` },
    body: new URLSearchParams({ username: String(username), userpwd: String(password), url_login: `${base}/login`, lang: 'vi' }).toString(),
  });
  store(r);
  if (r.status !== 302) throw Object.assign(new Error('Sai tai khoan hoac mat khau 1Office'), { statusCode: 401 });
  const v = await httpsRequest(`${base}/apps`, { headers: { Cookie: cookieOf(jar) } });
  if (v.status !== 200 || v.body.includes('form-login')) throw Object.assign(new Error('Phien dang nhap 1Office khong hop le'), { statusCode: 401 });
  return jar;
};

exports.testLogin = async ({ username, password, apiToken } = {}) => {
  const base = await webBaseUrl();
  if (!username || !password) throw Object.assign(new Error('Thieu tai khoan/mat khau'), { statusCode: 400 });
  const jar = await doWebLogin(base, username, password);
  let apiOk = null;
  if (apiToken) {
    const r = await httpsRequest(`${base}/api/work/process/gets?access_token=${encodeURIComponent(apiToken)}&limit=1&page=1`, { headers: { Cookie: cookieOf(jar) } });
    const j = JSON.parse(r.body || '{}');
    apiOk = r.ok && j && j.error === false;
    if (!apiOk) throw Object.assign(new Error('Work API token khong dung duoc (kiem tra quyen object work)'), { statusCode: 401 });
  }
  return { ok: true, web: true, api: apiToken ? !!apiOk : null, checked_at: new Date().toISOString() };
};

const ensureSession = async (auto) => {
  const base = await webBaseUrl();
  const hit = sessions.get(auto.id);
  if (hit && hit.base === base) return { base, jar: hit.jar };
  if (!auto.username || !auto.password_enc) throw Object.assign(new Error('Automation chua cau hinh tai khoan 1Office'), { statusCode: 400 });
  const jar = await doWebLogin(base, auto.username, exports.decryptSecret(auto.password_enc));
  sessions.set(auto.id, { base, jar, at: Date.now() });
  return { base, jar };
};

exports.findProcessByCode = async (apiToken, code) => {
  const base = await webBaseUrl();
  if (!apiToken) throw Object.assign(new Error('Thieu work API token'), { statusCode: 400 });
  const r = await fetch(`${base}/api/work/process/gets?access_token=${encodeURIComponent(apiToken)}&limit=50&page=1&filters=${encodeURIComponent(JSON.stringify([{ s: code }]))}`, { signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j || j.error !== false) throw new Error('Khong doc duoc danh sach quy trinh 1Office');
  const rows = Array.isArray(j.data) ? j.data : [];
  const roots = rows.filter((d) => !d.parent_id && String(d.title || '').includes(code));
  if (roots.length > 0) return { id: roots[0].ID, title: roots[0].title, children: rows.filter((d) => d.ID !== roots[0].ID).map((d) => d.ID) };
  const exact = rows.filter((d) => String(d.title || '').trim().endsWith(code));
  if (exact.length > 0) return { id: exact[0].ID, title: exact[0].title, children: [] };
  return null;
};

exports.getProcessProject = async (apiToken, processId) => {
  const base = await webBaseUrl();
  const r = await fetch(`${base}/api/work/process/item?access_token=${encodeURIComponent(apiToken)}&id=${encodeURIComponent(processId)}`, { signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => ({}));
  const d = (j && j.data) || {};
  return { project_code: d.project_code || null, project_title: d.project_title || null };
};

exports.resolveProjectId = async (apiToken, projectCode) => {
  const base = await webBaseUrl();
  const r = await fetch(`${base}/api/work/project/gets?access_token=${encodeURIComponent(apiToken)}&limit=50&page=1`, { signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => ({}));
  const rows = j && Array.isArray(j.data) ? j.data : [];
  const hit = rows.find((p) => String(p.code) === String(projectCode));
  if (!hit) throw new Error(`Khong tim thay du an ma "${projectCode}" ben 1Office`);
  return { id: hit.ID, code: hit.code, title: hit.title };
};

exports.moveProcessToProject = async (auto, processId, projectNumericId, reloginOnce = true) => {
  const { base, jar } = await ensureSession(auto);
  const body = new URLSearchParams({ ID: String(processId), project_id: String(projectNumericId), parent_id: '', inlineLogin: '1' }).toString();
  const r = await httpsRequest(`${base}/apps/work-task-task/moveprocess?_json=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Cookie: cookieOf(jar), Referer: `${base}/`, 'X-Requested-With': 'XMLHttpRequest' },
    body,
  });
  const j = JSON.parse(r.body || '{}');
  if (j && j.error_login && reloginOnce) {
    sessions.delete(auto.id);
    return exports.moveProcessToProject(auto, processId, projectNumericId, false);
  }
  if (!r.ok || !j || j.close !== true) throw new Error((j && (j.message || j.notice)) || '1Office tu choi lenh gán');
  return { moved: true, notice: j.notice || null };
};

exports.clearSession = (automationId) => sessions.delete(automationId);

exports.createPendingRun = async ({ automationId, proposalId, proposalCode, contactCode, trigger = 'auto' }) => {
  const [dup] = await pool.query(
    `SELECT id FROM work_automation_runs WHERE automation_id = ? AND proposal_id <=> ? AND status IN ('pending','running') LIMIT 1`,
    [automationId, proposalId]
  );
  if (dup.length > 0) return { id: dup[0].id, deduped: true };
  const [r] =   await pool.query(
    `INSERT INTO work_automation_runs (automation_id, proposal_id, proposal_code, contact_code, \`trigger\`, action, status) VALUES (?, ?, ?, ?, ?, 'move_to_project', 'pending')`,
    [automationId, proposalId, proposalCode || null, contactCode || null, trigger]
  );
  return { id: r.insertId, deduped: false };
};

exports.createSyncRun = async ({ automationId, trigger = 'manual', version = null }) => {
  const [r] = await pool.query(
    `INSERT INTO work_automation_runs (automation_id, \`trigger\`, action, status, request_json) VALUES (?, ?, 'sync_to_sheet', 'pending', ?)`,
    [automationId, trigger, JSON.stringify({ version: version || 'all' })]
  );
  return { id: r.insertId };
};

exports.hasActiveSyncRun = async (automationId) => {
  const [rows] = await pool.query(
    `SELECT id FROM work_automation_runs WHERE automation_id = ? AND action = 'sync_to_sheet' AND status IN ('pending','running') LIMIT 1`,
    [automationId]
  );
  return rows.length > 0;
};

exports.resetStaleSyncRuns = async () => {
  const [r] = await pool.query(
    `UPDATE work_automation_runs SET status = 'failed', error = 'Bi ngat khi khoi dong lai', finished_at = NOW() WHERE action = 'sync_to_sheet' AND status = 'running'`
  );
  return r.affectedRows;
};

const finishRun = async (id, patch) => {
  const cols = [];
  const params = [];
  for (const [k, v] of Object.entries(patch)) {
    cols.push(`\`${k}\` = ?`);
    params.push(v === undefined || v === null ? null : (v instanceof Date || typeof v !== 'object' ? v : JSON.stringify(v)));
  }
  cols.push('updated_at = NOW()');
  params.push(id);
  await pool.query(`UPDATE work_automation_runs SET ${cols.join(', ')} WHERE id = ?`, params);
};
exports.finishRun = finishRun;

const notifyFailed = async (run, reason) => {
  try {
    const notificationService = require('./notificationService');
    const [admins] = await pool.query(`SELECT id FROM users WHERE role IN ('SUPER_ADMIN','ADMIN') AND status = 'ACTIVE'`);
    for (const a of admins) {
      await notificationService.create({
        userId: a.id,
        type: 'AUTOMATION_FAILED',
        title: 'Automation gán quy trình thất bại',
        message: `Mã đề xuất: ${run.proposal_code || `#${run.proposal_id}`} · Lý do: ${reason}`,
        entityType: 'automation_run',
        entityId: run.id,
      });
    }
  } catch { /* silent */ }
};

const processOneRun = async (run) => {
  const [arows] = await pool.query('SELECT * FROM work_automations WHERE id = ?', [run.automation_id]);
  const auto = arows.length ? arows[0] : null;
  if (!auto || !auto.enabled) {
    await finishRun(run.id, { status: 'skipped', error: 'Automation dang tat' });
    return { id: run.id, status: 'skipped' };
  }
  if (!auto.username || !auto.password_enc || !auto.api_token_enc) {
    await finishRun(run.id, { status: 'failed', error: 'Thieu tai khoan 1Office hoac work API token', finished_at: new Date() });
    await notifyFailed(run, 'Thieu tai khoan 1Office hoac work API token');
    return { id: run.id, status: 'failed' };
  }
  const attempt = (run.attempt || 0) + 1;
  const elapsedS = (Date.now() - new Date(run.created_at).getTime()) / 1000;
  await finishRun(run.id, { status: 'running', attempt, started_at: run.started_at || new Date() });
  const apiToken = exports.decryptSecret(auto.api_token_enc);
  let found = null;
  try {
    found = await exports.findProcessByCode(apiToken, run.proposal_code);
  } catch (e) {
    found = null;
  }
  if (!found) {
    if (elapsedS >= auto.find_timeout_s || attempt >= auto.retry_max) {
      await finishRun(run.id, { status: 'failed', error: `Qua ${auto.find_timeout_s}s van khong thay quy trinh theo ma ${run.proposal_code}`, finished_at: new Date() });
      await notifyFailed(run, `Qua ${auto.find_timeout_s}s van khong thay quy trinh theo ma ${run.proposal_code}`);
      return { id: run.id, status: 'failed' };
    }
    await finishRun(run.id, { status: 'pending', error: `Lan ${attempt}: chua thay quy trinh, cho thu lai` });
    return { id: run.id, status: 'pending' };
  }
  try {
    const proj = await exports.getProcessProject(apiToken, found.id);
    if (String(proj.project_code) === String(auto.project_code)) {
      await finishRun(run.id, { status: 'skipped', process_id: found.id, error: 'Quy trinh da o dung du an', finished_at: new Date() });
      return { id: run.id, status: 'skipped' };
    }
    const target = await exports.resolveProjectId(apiToken, auto.project_code);
    const mv = await exports.moveProcessToProject(auto, found.id, target.id);
    await pool.query('UPDATE work_automations SET project_title = ? WHERE id = ?', [target.title, auto.id]).catch(() => {});
    await finishRun(run.id, {
      status: 'success', process_id: found.id,
      request_json: { process_id: found.id, project_id: target.id, project_code: target.code },
      response_json: mv, finished_at: new Date(),
    });
    return { id: run.id, status: 'success' };
  } catch (e) {
    if (attempt >= auto.retry_max) {
      await finishRun(run.id, { status: 'failed', process_id: found.id, error: e.message, finished_at: new Date() });
      await notifyFailed(run, e.message);
      return { id: run.id, status: 'failed' };
    }
    await finishRun(run.id, { status: 'pending', process_id: found.id, error: `Lan ${attempt}: ${e.message}` });
    return { id: run.id, status: 'pending' };
  }
};

exports.processDueRuns = async () => {
  const [runs] = await pool.query(
    `SELECT r.* FROM work_automation_runs r JOIN work_automations a ON a.id = r.automation_id
     WHERE a.automation_type = 'assign_process' AND a.enabled = 1 AND r.status IN ('pending','running')
       AND r.updated_at <= DATE_SUB(NOW(), INTERVAL a.retry_interval_s SECOND)
     ORDER BY r.id ASC LIMIT 10`
  );
  const out = [];
  for (const run of runs) {
    try {
      out.push(await processOneRun(run));
    } catch (e) {
      out.push({ id: run.id, status: 'error', error: e.message });
    }
  }
  return out;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

exports.runManual = async (proposalCode, key) => {
  let auto;
  if (key) auto = await exports.getByKey(key);
  if (!auto) auto = await exports.getFirstByType('assign_process');
  if (!auto) throw Object.assign(new Error('Khong tim thay automation'), { statusCode: 404 });
  const code = String(proposalCode || '').trim();
  if (!code) throw Object.assign(new Error('Thieu ma de xuat'), { statusCode: 400 });
  const [pRows] = await pool.query('SELECT id FROM station_proposals WHERE tracking_code = ? LIMIT 1', [code]);
  const { id: runId } = await exports.createPendingRun({
    automationId: auto.id,
    proposalId: pRows.length > 0 ? pRows[0].id : null,
    proposalCode: code,
    trigger: 'manual',
  });
  const deadline = Date.now() + auto.find_timeout_s * 1000;
  let last = { id: runId, status: 'pending' };
  for (let i = 0; i < auto.retry_max; i++) {
    const [rows] = await pool.query('SELECT * FROM work_automation_runs WHERE id = ?', [runId]);
    if (!rows.length) break;
    last = await processOneRun(rows[0]);
    if (['success', 'failed', 'skipped'].includes(last.status)) break;
    if (Date.now() + auto.retry_interval_s * 1000 > deadline) {
      await sleep(Math.max(0, deadline - Date.now()));
      const [r2] = await pool.query('SELECT * FROM work_automation_runs WHERE id = ?', [runId]);
      if (r2.length) last = await processOneRun(r2[0]);
      break;
    }
    await sleep(auto.retry_interval_s * 1000);
  }
  const [final] = await pool.query('SELECT * FROM work_automation_runs WHERE id = ?', [runId]);
  return final.length > 0 ? final[0] : { id: runId, status: last.status };
};
