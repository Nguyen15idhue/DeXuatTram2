const fs = require('node:fs/promises');
const path = require('node:path');
const JSZip = require('jszip');
const pool = require('../utils/db');
const fileService = require('./fileService');

const MAX_FILES = 20;
const MAX_SIZE = 10 * 1024 * 1024;
const TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};
const err = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

const normalizeFiles = (files, documents) => {
  const values = files === undefined && Array.isArray(documents)
    ? documents.map(document => ({ id: document?.file_id })) : files;
  if (!Array.isArray(values) || values.length < 1 || values.length > MAX_FILES) {
    throw err(`Vui lòng chọn từ 1 đến ${MAX_FILES} file chủ tịch đã ký`);
  }
  const ids = values.map(file => {
    const value = file && typeof file === 'object' ? file.id ?? file.file_id : file;
    if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) {
      throw err('Mã file chủ tịch không hợp lệ');
    }
    return Number(value);
  });
  if (ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw err('Mã file chủ tịch không hợp lệ');
  if (new Set(ids).size !== ids.length) throw err('Không được chọn trùng file chủ tịch đã ký');
  return ids;
};

const list = async (proposalId, executor = pool) => {
  const [rows] = await executor.query(
    `SELECT f.id,f.original_name,f.mime_type,f.size,cf.order_index,cf.uploaded_by,cf.created_at
     FROM proposal_chairman_files cf JOIN files f ON f.id=cf.file_id
     WHERE cf.proposal_id=? ORDER BY cf.order_index,cf.id`, [proposalId]);
  return rows;
};

const validate = async (ids, user, ip) => {
  for (const id of ids) {
    const stored = await fileService.getFilePath(id);
    if (!stored || stored.file.status === 'deleted') throw err(`Không tìm thấy file #${id}`);
    const { file, filePath } = stored;
    const extension = path.extname(file.original_name || '').toLowerCase();
    if (!TYPES[extension] || TYPES[extension] !== file.mime_type) {
      throw err(`File "${file.original_name}" không phải ảnh, Word hoặc PDF được hỗ trợ`);
    }
    const access = require('../controllers/fileController');
    if (!access.verifyFileSignature(filePath, file.mime_type)) {
      throw err(`Nội dung file "${file.original_name}" không đúng định dạng`);
    }
    const stat = await fs.stat(filePath);
    if (stat.size < 1 || stat.size > MAX_SIZE || Number(file.size) > MAX_SIZE) {
      throw err(`File "${file.original_name}" phải có dung lượng từ 1 byte đến 10MB`);
    }
    if (!await access.canAccessFile(file, { user, ip })) {
      throw err(`Không có quyền sử dụng file "${file.original_name}"`, 403);
    }
  }
};

const download = async ({ user, id, fileId, ip } = {}) => {
  const signatures = require('./proposalSignatureService');
  await signatures.getDetail({ user, id });
  const files = await list(id);
  if (!files.length) throw err('Đề xuất chưa có file chủ tịch đã ký', 404);
  if (fileId !== undefined && !files.some(file => file.id === Number(fileId))) {
    throw err('File không thuộc danh sách chủ tịch đã ký của đề xuất', 404);
  }
  const read = async file => {
    const stored = await fileService.getFilePath(file.id);
    if (!stored || stored.file.status === 'deleted') throw err(`Không tìm thấy file "${file.original_name}"`, 404);
    if (!await require('../controllers/fileController').canAccessFile(stored.file, { user, ip })) {
      throw err('Không có quyền tải file chủ tịch đã ký', 403);
    }
    return fs.readFile(stored.filePath);
  };
  if (fileId !== undefined) {
    const file = files.find(file => file.id === Number(fileId));
    return { original_name: file.original_name, mime_type: file.mime_type, bytes: await read(file) };
  }
  const archive = new JSZip();
  for (const [index, file] of files.entries()) {
    const name = path.basename(String(file.original_name).replace(/\\/g, '/')).replace(/[\r\n"]/g, '_');
    archive.file(`${index + 1}_${file.id}_${name}`, await read(file));
  }
  return { original_name: `BCDX-${id}-chu-tich.zip`, mime_type: 'application/zip',
    bytes: await archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }) };
};

module.exports = { normalizeFiles, validate, list, download, MAX_FILES, MAX_SIZE };
