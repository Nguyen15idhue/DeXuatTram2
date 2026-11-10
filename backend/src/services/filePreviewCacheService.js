// backend/src/services/filePreviewCacheService.js
// Cache PDF preview cho file Word: convert 1 lan, luu PDF vao files table + mapping.
const pool = require('../utils/db');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const libreOfficeService = require('./libreOfficeService');
const fileService = require('./fileService');

const STORAGE_ROOT = path.join(__dirname, '../../storage/uploads');
const SYSTEM_USER_ID = null;

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const isWord = (mime) => {
  const m = String(mime || '').toLowerCase();
  return m === 'application/msword' ||
    m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
};

const isPdf = (mime) => String(mime || '').toLowerCase() === 'application/pdf';

const getCache = async (sourceFileId) => {
  const [rows] = await pool.query(
    'SELECT pdf_file_id, source_hash FROM file_preview_cache WHERE source_file_id = ? LIMIT 1',
    [sourceFileId]
  );
  if (!rows.length) return null;
  const cached = rows[0];
  // verify pdf file still exists
  const pdfFile = await fileService.getFileById(cached.pdf_file_id);
  if (!pdfFile || pdfFile.status === 'deleted') return null;
  return { pdfFileId: cached.pdf_file_id, sourceHash: cached.source_hash };
};

const savePdfToFiles = async (pdfBuffer, originalName, sourceFile) => {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const dir = path.join(STORAGE_ROOT, `${dd}-${mm}-${yyyy}`);
  fs.mkdirSync(dir, { recursive: true });
  const storageKey = `${dd}-${mm}-${yyyy}/preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
  const fullPath = path.join(STORAGE_ROOT, storageKey);
  fs.writeFileSync(fullPath, pdfBuffer);

  const [result] = await pool.query(
    `INSERT INTO files (original_name, storage_key, mime_type, size, checksum, uploaded_by, submitter_ip, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      originalName.replace(/\.[^.]+$/, '') + '.pdf',
      storageKey.replace(/\\/g, '/'),
      'application/pdf',
      pdfBuffer.length,
      sha256(pdfBuffer),
      sourceFile.uploaded_by || null,
      null,
      'active',
    ]
  );
  const [rows] = await pool.query('SELECT * FROM files WHERE id = ?', [result.insertId]);
  return rows[0];
};

const getPreviewPdfFileId = async (sourceFileId) => {
  const sourceFile = await fileService.getFileById(sourceFileId);
  if (!sourceFile || sourceFile.status === 'deleted') return null;

  const mime = sourceFile.mime_type || '';

  // PDF gốc → trả chính nó
  if (isPdf(mime)) return sourceFileId;

  if (!isWord(mime)) return null;

  // cache hit
  const cached = await getCache(sourceFileId);
  if (cached) {
    const result = await fileService.getFilePath(cached.pdfFileId);
    if (result) return cached.pdfFileId;
  }

  // convert
  const result = await fileService.getFilePath(sourceFileId);
  if (!result) return null;
  const inputBuffer = fs.readFileSync(result.filePath);
  const ext = path.extname(sourceFile.original_name || '').toLowerCase() || '.docx';
  const { pdfBuffer } = await libreOfficeService.convertToPdf(inputBuffer, ext);

  const pdfFile = await savePdfToFiles(pdfBuffer, sourceFile.original_name || 'document', sourceFile);

  // upsert cache
  await pool.query(
    `INSERT INTO file_preview_cache (source_file_id, pdf_file_id, source_hash)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE pdf_file_id = VALUES(pdf_file_id), source_hash = VALUES(source_hash), created_at = NOW()`,
    [sourceFileId, pdfFile.id, sha256(inputBuffer)]
  );

  return pdfFile.id;
};

module.exports = { getPreviewPdfFileId, isWord, isPdf };
