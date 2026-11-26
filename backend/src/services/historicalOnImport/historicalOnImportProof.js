const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const fail = message => Object.assign(new Error(message), { statusCode: 400 });
const secret = () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required for historical import');
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update('historical-on-preview-v1').digest();
};
const fileHash = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const catalogHash = row => crypto.createHash('sha256').update(JSON.stringify(
  (row.poles || []).map(({ model, name, supplier, pole_id, supplier_id }) =>
    ({ model, name, supplier, pole_id, supplier_id }))
)).digest('hex');

const createProof = (buffer, actor, rows) => {
  if (!Buffer.isBuffer(buffer) || !buffer.length || !Number.isSafeInteger(Number(actor?.id))
    || Number(actor.id) < 1 || actor.role !== 'SUPER_ADMIN'
    || !Array.isArray(rows) || !rows.length || rows.some(row => row.errors.length)) {
    throw fail('File chưa được kiểm tra hợp lệ');
  }
  const targets = rows.map(row => ({
    row: row.row, action: row.action, proposal_id: row.proposal_id,
    snapshot_fingerprint: row.snapshot_fingerprint || null,
    owner_id: row.owner?.id || null, catalog_fingerprint: catalogHash(row)
  }));
  const seen = new Set();
  for (const target of targets) {
    if (!Number.isSafeInteger(target.row) || target.row < 2 || seen.has(target.row)
      || !['create', 'update'].includes(target.action)
      || (target.action === 'update' && (!Number.isSafeInteger(Number(target.proposal_id))
        || Number(target.proposal_id) < 1 || !/^[a-f0-9]{64}$/.test(target.snapshot_fingerprint || '')))
      || (target.action === 'create' && (target.proposal_id || target.snapshot_fingerprint))) {
      throw fail('Kết quả xem trước không hợp lệ; hãy kiểm tra lại file');
    }
    seen.add(target.row);
  }
  return jwt.sign({
    purpose: 'historical-on-import', batch_key: crypto.randomUUID(),
    actor_id: Number(actor.id), token_version: Number(actor.tokenVersion || 0),
    file_hash: fileHash(buffer), targets
  }, secret(), { algorithm: 'HS256', expiresIn: '1h' });
};

const verifyProof = (proof, buffer, actor) => {
  let claims;
  try {
    claims = jwt.verify(proof, secret(), { algorithms: ['HS256'] });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      throw fail('Phiên xem trước không hợp lệ hoặc đã hết hạn; hãy kiểm tra lại file');
    }
    throw error;
  }
  if (claims.purpose !== 'historical-on-import' || actor?.role !== 'SUPER_ADMIN' || claims.actor_id !== Number(actor?.id)
    || claims.token_version !== Number(actor?.tokenVersion || 0)
    || !Buffer.isBuffer(buffer) || claims.file_hash !== fileHash(buffer)
    || !/^[a-f0-9-]{36}$/.test(String(claims.batch_key || ''))
    || !Array.isArray(claims.targets) || !claims.targets.length) {
    throw fail('File hoặc người xác nhận khác với lần xem trước; hãy kiểm tra lại file');
  }
  return claims;
};

module.exports = { createProof, verifyProof, catalogHash };
