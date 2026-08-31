const pool = require('../utils/db');
const fs = require('fs');
const path = require('path');

exports.uploadFile = async (file, userId, originalNameOverride) => {
  const storageKey = file.filename;
  const relativePath = file.path.replace(/\\/g, '/').split('storage/uploads/')[1] || file.filename;
  const originalName = originalNameOverride || file.originalname || 'unknown';

  const [result] = await pool.query(
    `INSERT INTO files (original_name, storage_key, mime_type, size, checksum, uploaded_by, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      originalName,
      relativePath,
      file.mimetype,
      file.size,
      null,
      userId || null,
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
