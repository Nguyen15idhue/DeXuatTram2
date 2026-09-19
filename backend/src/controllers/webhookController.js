const crypto = require('crypto');
const externalEventService = require('../services/externalEventService');
const apiConfigService = require('../services/apiConfigService');

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
  return String(val).split(',').map(s => s.trim()).filter(Boolean);
};

const resolveSecrets = async () => {
  const secrets = [
    ...splitSecrets(process.env.ONEOFFICE_WEBHOOK_SECRET),
    ...splitSecrets(process.env.ONEOFFICE_WEBHOOK_SECRET_PREV),
    ...splitSecrets(process.env.ONEOFFICE_WEBHOOK_SECRET_STAGING)
  ];
  try {
    const webhookConfigService = require('../services/webhookConfigService');
    const tableSecrets = await webhookConfigService.getActiveSecrets();
    secrets.push(...tableSecrets);
  } catch { /* silent */ }
  try {
    const r = await apiConfigService.getAll();
    const configs = (r && r.configs) || [];
    for (const c of configs) {
      if (c.system_key !== '1office' || c.api_type !== 'contact' || !c.is_active) continue;
      let auth = c.auth_config;
      if (typeof auth === 'string') {
        try { auth = JSON.parse(auth); } catch { auth = null; }
      }
      if (auth && auth.webhook_secret) secrets.push(String(auth.webhook_secret));
      if (auth && auth.webhook_secret_prev) secrets.push(String(auth.webhook_secret_prev));
    }
  } catch { /* silent: chi dung env secret */ }
  return [...new Set(secrets)];
};

const bearerOf = (req) => {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : '';
};

const verifyWebhookSecret = async (req, res, next) => {
  const allowedIps = String(process.env.ONEOFFICE_WEBHOOK_IPS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (allowedIps.length > 0) {
    const ip = req.ip || '';
    const ok = allowedIps.some(a => a === ip || (a.endsWith('*') && ip.startsWith(a.slice(0, -1))));
    if (!ok) {
      return res.status(403).json({ success: false, message: 'IP không được phép gọi webhook' });
    }
  }
  const provided = bearerOf(req) || req.headers['x-webhook-secret'] || req.query.secret;
  const secrets = await resolveSecrets();
  if (secrets.length === 0) {
    return res.status(503).json({ success: false, message: 'Webhook chưa cấu hình secret (ONEOFFICE_WEBHOOK_SECRET)' });
  }
  if (!provided || !secrets.some(s => safeEqual(provided, s))) {
    return res.status(401).json({ success: false, message: 'Webhook secret không hợp lệ' });
  }
  next();
};

exports.proposalStatus = [
  verifyWebhookSecret,
  async (req, res) => {
    try {
      const { event_id, event, proposal_code, contact_code, note, event_time, actor } = req.body || {};
      const result = await externalEventService.applyExternalEvent({
        eventId: event_id,
        event,
        proposalCode: proposal_code,
        contactCode: contact_code,
        note,
        eventTime: event_time,
        actor,
        source: 'webhook',
        ip: req.ip || null
      });
      res.json({ success: true, data: result });
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({ success: false, message: error.message });
      }
      console.error('Webhook proposal-status error:', error);
      res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }
];
