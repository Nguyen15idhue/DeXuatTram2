// backend/src/middlewares/crmWebhookAuth.js
// Xác thực webhook inbound từ TMT CRM: IP whitelist + HMAC-SHA256 + timestamp skew.
const crypto = require('crypto');

const timingSafeEqual = (a, b) => {
  const sa = String(a || '');
  const sb = String(b || '');
  if (sa.length === 0 || sa.length !== sb.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sa), Buffer.from(sb));
  } catch {
    return false;
  }
};

const MAX_SKEW_SEC = 5 * 60;

const crmWebhookAuth = async (req, res, next) => {
  // 1) IP whitelist (nếu cấu hình)
  const allowedIps = String(process.env.CRM_WEBHOOK_IPS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (allowedIps.length > 0) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const ok = allowedIps.some((a) => a === ip || (a.endsWith('*') && ip.startsWith(a.slice(0, -1))));
    if (!ok) {
      return res.status(403).json({ success: false, message: 'IP không được phép gọi webhook CRM' });
    }
  }

  const secret = String(process.env.TMT_CRM_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    return res.status(503).json({ success: false, message: 'Webhook CRM chưa cấu hình secret (TMT_CRM_WEBHOOK_SECRET)' });
  }

  const tsHeader = String(req.headers['x-tmt-timestamp'] || '').trim();
  const sigHeader = String(req.headers['x-tmt-signature'] || '').trim();
  if (!tsHeader || !sigHeader) {
    return res.status(401).json({ success: false, message: 'Thiếu X-TMT-Timestamp hoặc X-TMT-Signature' });
  }

  const ts = Number(tsHeader);
  if (!Number.isFinite(ts)) {
    return res.status(401).json({ success: false, message: 'X-TMT-Timestamp không hợp lệ' });
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > MAX_SKEW_SEC) {
    return res.status(401).json({ success: false, message: 'Lệch giờ quá 5 phút (X-TMT-Timestamp)' });
  }

  // raw body: express.json() đã parse; cần raw. Dùng req.rawBody nếu có, fallback JSON.stringify(req.body)
  const rawBody = req.rawBody || JSON.stringify(req.body || {});
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(`${tsHeader}.${rawBody}`).digest('hex');
  if (!timingSafeEqual(expected, sigHeader)) {
    return res.status(401).json({ success: false, message: 'Chữ ký webhook không hợp lệ (BAD_SIGNATURE)' });
  }

  next();
};

module.exports = crmWebhookAuth;
module.exports.crmWebhookAuth = crmWebhookAuth;
