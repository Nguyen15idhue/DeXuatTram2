const pool = require('../utils/db');
const crypto = require('crypto');

const maskRow = (row) => {
  if (!row) return row;
  const out = { ...row };
  const hasSecret = !!out.secret;
  const hasPrev = !!out.secret_prev;
  delete out.secret;
  delete out.secret_prev;
  out.secret_set = hasSecret;
  out.secret_prev_set = hasPrev;
  return out;
};

exports.maskRow = maskRow;

exports.list = async () => {
  const [rows] = await pool.query('SELECT * FROM webhook_configs ORDER BY id ASC');
  return rows.map(maskRow);
};

exports.getById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM webhook_configs WHERE id = ?', [id]);
  return rows.length > 0 ? rows[0] : null;
};

exports.getActiveSecrets = async () => {
  const [rows] = await pool.query(
    "SELECT secret, secret_prev FROM webhook_configs WHERE is_active = 1 AND secret IS NOT NULL AND secret <> ''"
  );
  const out = [];
  rows.forEach(r => {
    if (r.secret) out.push(String(r.secret));
    if (r.secret_prev) out.push(String(r.secret_prev));
  });
  return out;
};

exports.create = async ({ name, note }) => {
  if (!name || !String(name).trim()) {
    throw Object.assign(new Error('Tên webhook không được để trống'), { statusCode: 400 });
  }
  const secret = crypto.randomBytes(32).toString('hex');
  try {
    const [result] = await pool.query(
      'INSERT INTO webhook_configs (name, secret, note) VALUES (?, ?, ?)',
      [String(name).trim(), secret, note ? String(note).trim() : null]
    );
    return { id: result.insertId, secret };
  } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') {
      throw Object.assign(new Error('Tên webhook đã tồn tại'), { statusCode: 400 });
    }
    throw e;
  }
};

exports.rotate = async (id) => {
  const existing = await exports.getById(id);
  if (!existing) {
    throw Object.assign(new Error('Không tìm thấy webhook'), { statusCode: 404 });
  }
  const fresh = crypto.randomBytes(32).toString('hex');
  await pool.query(
    'UPDATE webhook_configs SET secret_prev = secret, secret = ?, updated_at = NOW() WHERE id = ?',
    [fresh, id]
  );
  return { webhook_secret: fresh, rotated_at: new Date().toISOString() };
};

exports.setActive = async (id, isActive) => {
  const existing = await exports.getById(id);
  if (!existing) {
    throw Object.assign(new Error('Không tìm thấy webhook'), { statusCode: 404 });
  }
  await pool.query('UPDATE webhook_configs SET is_active = ?, updated_at = NOW() WHERE id = ?', [isActive ? 1 : 0, id]);
  return true;
};

exports.remove = async (id) => {
  const existing = await exports.getById(id);
  if (!existing) {
    throw Object.assign(new Error('Không tìm thấy webhook'), { statusCode: 404 });
  }
  await pool.query('DELETE FROM webhook_configs WHERE id = ?', [id]);
  return true;
};
