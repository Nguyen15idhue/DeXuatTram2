const crypto = require('crypto');
const pool = require('../utils/db');
const apiConfigService = require('../services/apiConfigService');
const oneOfficeService = require('../services/oneOfficeService');

const safeEqual = (a, b) => {
  const sa = String(a || '');
  const sb = String(b || '');
  if (sa.length === 0 || sa.length !== sb.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sa), Buffer.from(sb));
  } catch {
    return false;
  }
};

const splitSecrets = (val) => {
  if (!val) return [];
  return String(val).split(',').map((s) => s.trim()).filter(Boolean);
};

const resolveWorkSecrets = async () => {
  const secrets = [
    ...splitSecrets(process.env.ONEOFFICE_WORK_SIGNATURE),
    ...splitSecrets(process.env.ONEOFFICE_WORK_SIGNATURE_PREV),
    ...splitSecrets(process.env.ONEOFFICE_WORK_SIGNATURE_STAGING),
    ...splitSecrets(process.env.ONEOFFICE_WEBHOOK_SECRET),
    ...splitSecrets(process.env.ONEOFFICE_WEBHOOK_SECRET_PREV),
    ...splitSecrets(process.env.ONEOFFICE_WEBHOOK_SECRET_STAGING)
  ];
  try {
    const webhookConfigService = require('../services/webhookConfigService');
    const tableSecrets = await webhookConfigService.getActiveSecrets();
    secrets.push(...tableSecrets);
  } catch { /* silent */ }
  return [...new Set(secrets)];
};

const bearerOf = (req) => {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : '';
};

const verifyWorkSignature = async (req, res, next) => {
  const allowedIps = String(process.env.ONEOFFICE_WEBHOOK_IPS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowedIps.length > 0) {
    const ip = req.ip || '';
    const ok = allowedIps.some((a) => a === ip || (a.endsWith('*') && ip.startsWith(a.slice(0, -1))));
    if (!ok) {
      return res.status(403).json({ error: true, message: 'IP không được phép gọi webhook' });
    }
  }
  const provided = req.headers['x-1office-signature'] || req.headers['x-webhook-secret'] || bearerOf(req) || req.query.secret;
  const secrets = await resolveWorkSecrets();
  if (secrets.length === 0) {
    return res.status(503).json({ error: true, message: 'Webhook chưa cấu hình secret (ONEOFFICE_WORK_SIGNATURE)' });
  }
  if (!provided || !secrets.some((s) => safeEqual(provided, s))) {
    return res.status(401).json({ error: true, message: 'Chữ ký webhook không hợp lệ' });
  }
  next();
};

const firstPresent = (...vals) => {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return undefined;
};

const parseAuthToken = (authConfig) => {
  const auth = typeof authConfig === 'string'
    ? (() => { try { return JSON.parse(authConfig); } catch { return {}; } })()
    : (authConfig || {});
  return auth.access_token || auth.token || auth.admin_token || '';
};

const resolveTokenAndBaseUrl = async (req) => {
  const body = req.body || {};
  const query = req.query || {};
  const fromCaller = firstPresent(body.access_token, query.access_token);
  const baseUrlRaw = firstPresent(body.base_url, query.base_url);
  let stored = null;
  try {
    stored = await apiConfigService.getDefaultPushConfig();
  } catch { stored = null; }
  const token = fromCaller || (stored ? parseAuthToken(stored.auth_config) : '');
  const baseUrl = baseUrlRaw || (stored ? stored.base_url : 'https://egr.1office.vn');
  return { token: String(token || ''), baseUrl: String(baseUrl || 'https://egr.1office.vn'), apiConfigId: stored ? stored.id : null, tokenSource: fromCaller ? 'caller' : 'stored' };
};

const maskToken = (t) => {
  const s = String(t || '');
  if (!s) return '';
  if (s.length <= 8) return '***';
  return `${s.slice(0, 4)}***${s.slice(-4)}`;
};

const logQueueRow = async ({ apiConfigId, action, direction, status, requestPayload, responsePayload }) => {
  await pool.query(
    `INSERT INTO api_queue_logs
      (api_config_id, action, entity_type, entity_id, status, direction, request_payload, response_payload, started_at, completed_at)
     VALUES (?, ?, 'work_process', NULL, ?, ?, ?, ?, NOW(), NOW())`,
    [apiConfigId, action, status, direction, JSON.stringify(requestPayload), responsePayload ? JSON.stringify(responsePayload) : null]
  );
};

exports.moveToProject = [
  verifyWorkSignature,
  async (req, res) => {
    const body = req.body || {};
    const ID = firstPresent(body.ID, body.id, body.postId, req.query.ID, req.query.id);
    const projectId = firstPresent(body.project_id, body.projectId, req.query.project_id);
    if (ID === undefined || projectId === undefined) {
      return res.status(400).json({ error: true, message: 'Thiếu ID hoặc project_id' });
    }

    let resolved;
    try {
      resolved = await resolveTokenAndBaseUrl(req);
    } catch (e) {
      return res.status(500).json({ error: true, message: 'Không đọc được cấu hình token' });
    }
    if (!resolved.token) {
      await logQueueRow({
        apiConfigId: resolved.apiConfigId,
        action: 'work_process_move',
        direction: 'inbound',
        status: 'failed',
        requestPayload: { ID: String(ID), project_id: String(projectId), token_source: resolved.tokenSource, ip: req.ip || null },
        responsePayload: { error: true, message: 'Thiếu access_token (caller không gửi, DB không có)' }
      });
      return res.status(400).json({ error: true, message: 'Thiếu access_token (caller không gửi, DB không có)' });
    }

    const startedAt = Date.now();
    try {
      const upstream = await oneOfficeService.updateWorkProcess({
        baseUrl: resolved.baseUrl,
        token: resolved.token,
        ID: String(ID),
        project_id: String(projectId)
      });
      const latencyMs = Date.now() - startedAt;

      await logQueueRow({
        apiConfigId: resolved.apiConfigId,
        action: 'work_process_update',
        direction: 'push',
        status: upstream.success ? 'completed' : 'failed',
        requestPayload: { ID: String(ID), project_id: String(projectId), token: maskToken(resolved.token), token_source: resolved.tokenSource, latency_ms: latencyMs },
        responsePayload: { status: upstream.status, error: upstream.error || null, data_keys: upstream.data ? Object.keys(upstream.data) : [] }
      });
      await logQueueRow({
        apiConfigId: resolved.apiConfigId,
        action: 'work_process_move',
        direction: 'inbound',
        status: upstream.success ? 'completed' : 'failed',
        requestPayload: { ID: String(ID), project_id: String(projectId), token_source: resolved.tokenSource, ip: req.ip || null },
        responsePayload: upstream.data || { error: upstream.error }
      });

      if (!upstream.success) {
        return res.status(upstream.status || 502).set('X-Proxied-By', 'dexuat-webhook').json(
          upstream.data && typeof upstream.data === 'object'
            ? { ...upstream.data, proxied: true }
            : { error: true, message: upstream.error || '1Office trả lỗi', proxied: true }
        );
      }
      return res.status(upstream.status || 200).set('X-Proxied-By', 'dexuat-webhook').json(upstream.data);
    } catch (e) {
      const statusCode = e.statusCode || 500;
      await logQueueRow({
        apiConfigId: resolved.apiConfigId,
        action: 'work_process_move',
        direction: 'inbound',
        status: 'failed',
        requestPayload: { ID: String(ID), project_id: String(projectId), token_source: resolved.tokenSource, ip: req.ip || null },
        responsePayload: { error: true, message: e.message }
      }).catch(() => {});
      return res.status(statusCode).json({ error: true, message: e.message || 'Lỗi server' });
    }
  }
];
