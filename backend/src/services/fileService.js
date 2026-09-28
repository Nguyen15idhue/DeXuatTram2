const pool = require('../utils/db');
const fs = require('fs');
const path = require('path');

const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'text/csv': '.csv',
  'text/plain': '.txt'
};

const sanitizeNamePart = (s) => String(s == null ? '' : s)
  .replace(/[\x00-\x1F\x7F]/g, '')
  .replace(/[\\/]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

exports.sanitizeNamePart = sanitizeNamePart;

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

const extOf = (fileRow) => {
  const fromName = path.extname(String((fileRow && fileRow.original_name) || ''));
  if (fromName) return fromName;
  const mime = String((fileRow && fileRow.mime_type) || '').toLowerCase().split(';')[0].trim();
  return MIME_TO_EXT[mime] || '';
};

exports.renameProposalFiles = async ({ dynamicData, fieldDefs, maDeXuat, connection = null }) => {
  if (!dynamicData || !Array.isArray(fieldDefs) || fieldDefs.length === 0) return 0;
  const code = sanitizeNamePart(maDeXuat) || 'DX';
  const db = connection || pool;
  const fileFields = fieldDefs.filter((f) => f && f.type === 'file' && f.source_type === 'json');
  let changed = 0;
  for (const fd of fileFields) {
    const val = dynamicData[fd.key];
    const list = Array.isArray(val) ? val : (val ? [val] : []);
    if (list.length === 0) continue;
    const label = sanitizeNamePart(fd.label || fd.key) || fd.key;
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const fid = Number(item && item.id);
      if (!Number.isInteger(fid) || fid <= 0) continue;
      let rows;
      try {
        [rows] = await db.query("SELECT id, original_name, mime_type, status FROM files WHERE id = ? LIMIT 1", [fid]);
      } catch { continue; }
      if (!rows || rows.length === 0 || rows[0].status === 'deleted') continue;
      const nextName = `${code}_${label}_${i + 1}${extOf(rows[0])}`;
      if (rows[0].original_name !== nextName) {
        try {
          await db.query('UPDATE files SET original_name = ? WHERE id = ?', [nextName, fid]);
        } catch { continue; }
      }
      if (item && typeof item === 'object') {
        if (item.original_name !== nextName) {
          item.original_name = nextName;
          changed++;
        }
      } else {
        list[i] = { id: fid, original_name: nextName };
        changed++;
      }
    }
    if (!Array.isArray(val)) dynamicData[fd.key] = list.length > 0 ? list[0] : val;
  }
  return changed;
};
