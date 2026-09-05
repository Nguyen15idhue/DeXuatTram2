const pool = require('../utils/db');
const fs = require('fs');
const path = require('path');

exports.uploadFile = async (file, userId, originalNameOverride, submitterIp) => {
  const storageKey = file.filename;
  const relativePath = file.path.replace(/\\/g, '/').split('storage/uploads/')[1] || file.filename;
  const rawName = originalNameOverride || file.originalname || 'unknown';
  const originalName = originalNameOverride
    ? rawName
    : Buffer.from(rawName, 'latin1').toString('utf8');

  const [result] = await pool.query(
    `INSERT INTO files (original_name, storage_key, mime_type, size, checksum, uploaded_by, submitter_ip, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      originalName,
      relativePath,
      file.mimetype,
      file.size,
      null,
      userId || null,
      submitterIp || null,
      'active'
    ]
  );

  const [rows] = await pool.query('SELECT * FROM files WHERE id = ?', [result.insertId]);
  return rows[0];
};

exports.getFileById = async (id) => {
  const [rows] = await pool.query(
    `SELECT f.*, u.full_name as uploader_name
     FROM files f
     LEFT JOIN users u ON f.uploaded_by = u.id
     WHERE f.id = ?`,
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
};

exports.getFilePath = async (id) => {
  const file = await exports.getFileById(id);
  if (!file || file.status === 'deleted') return null;

  const filePath = path.join(__dirname, '../../storage/uploads', file.storage_key);
  if (!fs.existsSync(filePath)) return null;

  return { file, filePath };
};

exports.deleteFile = async (id) => {
  const file = await exports.getFileById(id);
  if (!file) return null;

  await pool.query(
    "UPDATE files SET status = 'deleted' WHERE id = ?",
    [id]
  );

  const filePath = path.join(__dirname, '../../storage/uploads', file.storage_key);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error('Error deleting physical file:', err);
    }
  }

  return file;
};

exports.cleanupOrphanGuestFiles = async (ttlHours) => {
  const ttl = Number(ttlHours) || 24;
  const [candidates] = await pool.query(
    `SELECT id FROM files
     WHERE uploaded_by IS NULL AND submitter_ip IS NOT NULL AND status = 'active'
     AND created_at < (NOW() - INTERVAL ? HOUR)`,
    [ttl]
  );
  if (candidates.length === 0) return { deleted: 0 };

  const [proposalRows] = await pool.query('SELECT custom_data FROM station_proposals');
  const [stationRows] = await pool.query('SELECT custom_data FROM stations');
  const usedIds = new Set();
  [...proposalRows, ...stationRows].forEach(r => {
    try {
      const cd = typeof r.custom_data === 'string' ? JSON.parse(r.custom_data) : (r.custom_data || {});
      Object.values(cd).forEach(v => {
        const arr = Array.isArray(v) ? v : (v ? [v] : []);
        arr.forEach(f => { if (f && f.id) usedIds.add(Number(f.id)); });
      });
    } catch { /* silent */ }
  });

  let deleted = 0;
  for (const row of candidates) {
    if (usedIds.has(Number(row.id))) continue;
    const removed = await exports.deleteFile(row.id);
    if (removed) deleted++;
  }
  return { deleted };
};
