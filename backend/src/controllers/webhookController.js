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

const resolveSecrets = async () => {
  const secrets = [];
  if (process.env.ONEOFFICE_WEBHOOK_SECRET) secrets.push(process.env.ONEOFFICE_WEBHOOK_SECRET);
  try {
    const r = await apiConfigService.getAll();
    const configs = (r && r.configs) || [];
    for (const c of configs) {
      if (c.system_key !== '1office' || c.api_type !== 'contact' || !c.is_active) continue;
      let auth = c.auth_config;
      if (typeof auth === 'string') {
        try { auth = JSON.parse(auth); } catch { auth = null; }
      }
      if (auth && auth.webhook_secret) secrets.push(auth.webhook_secret);
    }
  } catch { /* silent: chi dung env secret */ }
  return secrets;
};

const verifyWebhookSecret = async (req, res, next) => {
  const provided = req.headers['x-webhook-secret'] || req.query.secret;
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
