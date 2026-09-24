const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const ExcelJS = require('exceljs');

const DEFAULT_MAX_MB = 5;
const DEFAULT_MAX_FILES = 3;
const TEXT_LIMIT = 12000;

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv', 'text/plain',
]);

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt']);

const BLOCKED_EXTS = new Set(['.svg', '.html', '.htm', '.js', '.mjs', '.exe', '.php', '.phtml', '.sh', '.bat', '.cmd', '.msi', '.dll', '.jar', '.py', '.pl', '.cgi']);

function maxBytes() {
  const mb = Number(process.env.ASSISTANT_MAX_FILE_MB) || DEFAULT_MAX_MB;
  return mb * 1024 * 1024;
}

function maxFiles() {
  return Number(process.env.ASSISTANT_MAX_FILES) || DEFAULT_MAX_FILES;
}

function extOf(name) {
  const base = String(name || '').split(/[\\/]/).pop() || '';
  const dot = base.toLowerCase().lastIndexOf('.');
  return dot >= 0 ? base.toLowerCase().slice(dot) : '';
}

function allowed(name, mime) {
  const m = String(mime || '').toLowerCase().split(';')[0].trim();
  const raw = String(name || '');
  const base = raw.split(/[\\/]/).pop() || '';
  const lower = base.toLowerCase();
  const parts = lower.split('.');
  if (parts.length > 1) {
    for (let i = 1; i < parts.length; i += 1) {
      if (BLOCKED_EXTS.has(`.${parts[i]}`)) return false;
    }
  }
  if (m && ALLOWED_MIME.has(m)) return true;
  const ext = extOf(raw);
  return ext && ALLOWED_EXT.has(ext);
}

function fileFilter(req, file, cb) {
  if (allowed(file.originalname, file.mimetype)) return cb(null, true);
  cb(new Error('Chỉ chấp nhận ảnh (jpg/png/gif/webp) và tài liệu (PDF, Word, Excel, CSV, TXT)'));
}

function checkMagic(buffer, mime, ext) {
  if (!buffer || buffer.length < 4) return false;
  const head4 = buffer.toString('ascii', 0, 4);
  if (mime === 'image/png') return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  if (mime === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === 'image/gif') return head4 === 'GIF8';
  if (mime === 'image/webp') return head4 === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  if (mime === 'application/pdf') return head4 === '%PDF';
  if (ext === '.docx' || ext === '.xlsx') return buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (ext === '.doc' || ext === '.xls') return (buffer[0] === 0xd0 && buffer[1] === 0xcf) || (buffer[0] === 0x50 && buffer[1] === 0x4b);
  return true;
}

function bad(message) {
  const err = new Error(message);
  err.statusCode = 400;
  throw err;
}

function trunc(text) {
  const s = String(text || '');
  return s.length > TEXT_LIMIT ? `${s.slice(0, TEXT_LIMIT)}\n…(đã cắt bớt)` : s;
}

async function extractDocx(buffer) {
  const out = await mammoth.extractRawText({ buffer });
  const text = String(out && out.value ? out.value : '').trim();
  if (!text) bad('Không đọc được nội dung tệp Word này');
  return trunc(text);
}

async function extractXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const parts = [];
  wb.eachSheet((ws) => {
    parts.push(`[Sheet: ${ws.name}]`);
    let rowCount = 0;
    ws.eachRow((row) => {
      if (rowCount >= 500) return;
      rowCount += 1;
      const vals = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        const v = cell.text !== undefined && cell.text !== null ? String(cell.text) : '';
        if (vals.length < 20) vals.push(v);
      });
      parts.push(vals.join(' | '));
    });
  });
  const text = parts.join('\n').trim();
  if (!text) bad('Không đọc được nội dung tệp Excel này');
  return trunc(text);
}

async function extractPdf(buffer) {
  try {
    const out = await pdfParse(buffer);
    const text = String(out && out.text ? out.text : '').trim();
    return text ? trunc(text) : '';
  } catch {
    return '';
  }
}

async function processOne(file) {
  const name = String(file.originalname || 'tep');
  const mime = String(file.mimetype || '').toLowerCase().split(';')[0].trim();
  const ext = extOf(name);
  if (!allowed(name, mime)) bad(`Tệp "${name}" không đúng định dạng cho phép`);
  if (file.size > maxBytes()) bad(`Tệp "${name}" vượt quá ${Math.round(maxBytes() / 1024 / 1024)}MB`);
  const buffer = file.buffer;
  if (!buffer || buffer.length === 0) bad(`Tệp "${name}" rỗng`);
  const isImage = mime.startsWith('image/');
  if (!isImage && mime !== 'text/csv' && mime !== 'text/plain' && !checkMagic(buffer, mime, ext)) {
    bad(`Tệp "${name}" nội dung không khớp định dạng`);
  }
  if (isImage) {
    return { kind: 'image', name, mime, base64: buffer.toString('base64'), text: '' };
  }
  try {
    if (mime === 'application/pdf' || ext === '.pdf') {
      return { kind: 'pdf', name, mime: 'application/pdf', base64: buffer.toString('base64'), text: await extractPdf(buffer) };
    }
    if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === '.docx') {
      return { kind: 'doc', name, mime, base64: null, text: await extractDocx(buffer) };
    }
    if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || ext === '.xlsx') {
      return { kind: 'doc', name, mime, base64: null, text: await extractXlsx(buffer) };
    }
    if (mime === 'text/csv' || mime === 'text/plain' || ext === '.csv' || ext === '.txt') {
      const text = buffer.toString('utf8').replace(/^\uFEFF/, '').trim();
      if (!text) bad(`Tệp "${name}" rỗng`);
      return { kind: 'doc', name, mime, base64: null, text: trunc(text) };
    }
  } catch (e) {
    if (e && e.statusCode) throw e;
    bad(`Không đọc được tệp "${name}"`);
  }
  if (ext === '.doc') bad(`Tệp "${name}" là Word cũ (.doc), hãy chuyển sang .docx rồi gửi lại`);
  bad(`Tệp "${name}" là Excel cũ (.xls), hãy chuyển sang .xlsx rồi gửi lại`);
}

async function processFiles(files) {
  const list = Array.isArray(files) ? files : [];
  if (list.length === 0) return null;
  if (list.length > maxFiles()) bad(`Tối đa ${maxFiles()} tệp mỗi lượt`);
  const items = [];
  for (const f of list) items.push(await processOne(f));
  const inlines = items
    .filter((x) => x.base64)
    .map((x) => ({ mime: x.kind === 'pdf' ? 'application/pdf' : x.mime, base64: x.base64 }));
  const docParts = items
    .filter((x) => x.text)
    .map((x) => `--- Tệp: ${x.name} ---\n${x.text}`);
  return {
    items,
    inlines,
    docText: docParts.join('\n\n'),
    types: [...new Set(items.map((x) => x.kind))],
  };
}

module.exports = { processFiles, processOne, fileFilter, allowed, maxBytes, maxFiles, ALLOWED_MIME, ALLOWED_EXT };
