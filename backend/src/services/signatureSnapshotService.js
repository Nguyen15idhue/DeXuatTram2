const crypto = require('crypto');
const pool = require('../utils/db');

const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

exports.read = async (configId) => {
  if (!configId) return null;
  const [rows] = await pool.query(
    'SELECT image_data, image_sha256 FROM proposal_signature_snapshots WHERE config_id = ?',
    [configId]
  );
  if (!rows.length) return null;
  const bytes = rows[0].image_data;
  if (!Buffer.isBuffer(bytes) || digest(bytes) !== rows[0].image_sha256) {
    throw Object.assign(new Error('Bản chụp chữ ký đã ký không toàn vẹn'), { statusCode: 409 });
  }
  return bytes;
};

exports.save = async (configId, bytes, executor) => {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 16 * 1024 * 1024 - 1) {
    throw Object.assign(new Error('Ảnh chữ ký vượt quá giới hạn lưu bản chụp'), { statusCode: 400 });
  }
  await executor.query(
    'INSERT INTO proposal_signature_snapshots (config_id, image_data, image_sha256) VALUES (?, ?, ?)',
    [configId, bytes, digest(bytes)]
  );
};

exports.preserveLegacy = async (signatureId, executor) => {
  const [configs] = await executor.query(
    `SELECT c.id FROM proposal_signature_configs c
     LEFT JOIN proposal_signature_snapshots s ON s.config_id = c.id
     WHERE c.signature_id = ? AND s.config_id IS NULL ORDER BY c.id`,
    [signatureId]
  );
  if (!configs.length) return;
  const image = await require('./signedDocumentService').validateSignature(signatureId);
  for (const config of configs) await exports.save(config.id, image.bytes, executor);
};
