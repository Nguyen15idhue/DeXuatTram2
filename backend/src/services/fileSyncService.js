const pool = require('../utils/db');
const fs = require('fs');
const path = require('path');
const oneOfficeService = require('./oneOfficeService');

const STORAGE_PATH = path.join(__dirname, '../../storage/uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats', 'text/'];

exports.loadFiles = async (proposalId) => {
  const [rows] = await pool.query(
    'SELECT custom_data FROM station_proposals WHERE id = ?',
    [proposalId]
  );
  if (rows.length === 0) return [];

  const customData = typeof rows[0].custom_data === 'string'
    ? JSON.parse(rows[0].custom_data)
    : (rows[0].custom_data || {});

  const [fieldRows] = await pool.query(
    "SELECT `key` FROM field_definitions WHERE entity = 'station_proposals' AND type = 'file'"
  );
  const fileFields = fieldRows.map(r => r.key);

  const files = [];
  for (const fieldKey of fileFields) {
    const fieldFiles = customData[fieldKey] || [];
    for (const file of fieldFiles) {
      if (file.status === 'active') {
        files.push({ ...file, source: fieldKey });
      }
    }
  }

  return files;
};

exports.base64Encode = async (storageKey) => {
  const filePath = path.join(STORAGE_PATH, storageKey);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${storageKey}`);
  }
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${stat.size} bytes (max ${MAX_FILE_SIZE})`);
  }
  const buffer = fs.readFileSync(filePath);
  return buffer.toString('base64');
};

exports.splitBatch = (files, maxPerBatch = 5) => {
  const batches = [];
  for (let i = 0; i < files.length; i += maxPerBatch) {
    batches.push(files.slice(i, i + maxPerBatch));
  }
  return batches;
};

exports.uploadFiles = async (proposalId, apiConfigId) => {
  const files = await exports.loadFiles(proposalId);
  if (files.length === 0) {
    return { success: true, message: 'Không có file để upload', totalFiles: 0 };
  }

  const filesWithBase64 = [];
  for (const file of files) {
    try {
      const base64Content = await exports.base64Encode(file.storage_key);
      filesWithBase64.push({
        name: file.original_name,
        type: file.mime_type,
        content: base64Content
      });
    } catch (err) {
      console.error(`[FileSync] Error encoding file ${file.original_name}:`, err.message);
    }
  }

  if (filesWithBase64.length === 0) {
    return { success: false, message: 'Không encode được file nào', totalFiles: 0 };
  }

  const result = await oneOfficeService.uploadFilesInBatches(apiConfigId, filesWithBase64);
  return {
    success: result.success,
    totalFiles: filesWithBase64.length,
    fileNames: filesWithBase64.map(f => f.name),
    ...result
  };
};

exports.checkFileConflicts = async (proposalId) => {
  const files = await exports.loadFiles(proposalId);
  const conflicts = [];

  const [rows] = await pool.query(
    'SELECT last_synced_data FROM station_proposals WHERE id = ?',
    [proposalId]
  );
  const lastSynced = rows.length > 0 ? rows[0].last_synced_data : null;
  const syncedFiles = lastSynced?.files_result?.batches?.flatMap(b => b.fileNames) || [];

  for (const file of files) {
    const filePath = path.join(STORAGE_PATH, file.storage_key);
    const exists = fs.existsSync(filePath);
    const sizeOk = file.size <= MAX_FILE_SIZE;
    const typeOk = ALLOWED_MIME_PREFIXES.some(prefix => file.mime_type?.startsWith(prefix));
    const alreadySynced = syncedFiles.includes(file.original_name);

    if (!exists) conflicts.push({ file: file.original_name, reason: 'File không tồn tại trên server' });
    else if (!sizeOk) conflicts.push({ file: file.original_name, reason: `File quá lớn: ${file.size} bytes (max ${MAX_FILE_SIZE})` });
    else if (!typeOk) conflicts.push({ file: file.original_name, reason: `Loại file không hỗ trợ: ${file.mime_type}` });
    else if (alreadySynced) conflicts.push({ file: file.original_name, reason: 'File đã được sync trước đó' });
  }

  return { valid: conflicts.length === 0, conflicts, totalFiles: files.length, syncedCount: syncedFiles.length };
};
