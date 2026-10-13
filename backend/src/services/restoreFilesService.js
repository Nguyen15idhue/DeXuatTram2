const pool = require('../utils/db');
const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, '../../storage/uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30000;

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
const ALLOWED_MIMES = new Set(Object.keys(MIME_TO_EXT));
const BLOCKED_EXTS = new Set(['.svg', '.html', '.htm', '.js', '.mjs', '.exe', '.php', '.phtml', '.sh', '.bat', '.cmd', '.msi', '.dll', '.jar', '.py', '.pl', '.cgi']);

const FIELD_KEYWORDS = {
  CCCD_ng_dai_dien: ['cccd'],
  dkkd_cccd_hkd: ['dkkd', 'gpkd', 'dang ky', 'giay phep'],
  legal_document: ['gcn', 'so do', 'so hong', 'quyen su dung', 'chung nhan'],
  hop_dong_thue: ['hop dong', 'thue dat'],
  hien_trang_mat_bang: ['toan canh', 'toan mat bang', 'mat bang'],
  vi_tri_lap_tru: ['vi tri', 'tru sac'],
  site_images: ['hien truong']
};

function norm(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim();
}

function stripCodePrefix(name, code) {
  let s = String(name || '');
  const c = String(code || '').trim();
  if (c && s.startsWith(`${c}_`)) s = s.slice(c.length + 1);
  return s.replace(/_\d+(\.[^.]+)?$/, '$1');
}

function planFileAssignment(filenames, fileFieldDefs, code) {
  const fields = (fileFieldDefs || []).filter((f) => f && f.type === 'file');
  const labelNorm = fields.map((f) => ({ key: f.key, label: norm(f.label || f.key) }));
  const assigned = {};
  const unassigned = [];
  for (const name of filenames || []) {
    const base = stripCodePrefix(String(name || '').split(/[\\/]/).pop() || '', code);
    const nb = norm(base.replace(/\.[^.]+$/, ''));
    let hit = null;
    let bestLen = 0;
    for (const f of labelNorm) {
      if (!f.label) continue;
      if (nb.includes(f.label) || f.label.includes(nb)) {
        if (f.label.length > bestLen) { bestLen = f.label.length; hit = f.key; }
      }
    }
    if (!hit) {
      outer: for (const f of fields) {
        const kws = FIELD_KEYWORDS[f.key] || [];
        for (const kw of kws) {
          if (nb.includes(kw)) { hit = f.key; break outer; }
        }
      }
    }
    if (hit) {
      if (!assigned[hit]) assigned[hit] = [];
      assigned[hit].push(name);
    } else {
      unassigned.push(name);
    }
  }
  return { assigned, unassigned };
}

function verifyMagic(buf, mime) {
  if (!buf || buf.length < 4) return false;
  if (mime === 'image/png') return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  if (mime === 'image/jpeg') return buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
  if (mime === 'image/gif') return buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a';
  if (mime === 'image/webp') return buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  if (mime === 'application/pdf') return buf.toString('ascii', 0, 4) === '%PDF';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    return buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04;
  }
  if (mime === 'application/msword' || mime === 'application/vnd.ms-excel') {
    return (buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0) || (buf[0] === 0x50 && buf[1] === 0x4B);
  }
  return true;
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

exports.planFileAssignment = planFileAssignment;

exports.downloadAndStoreFiles = async (contactFiles, userId, assignment) => {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const dir = path.join(UPLOAD_DIR, 'restore', `${dd}-${mm}-${yyyy}`);
  fs.mkdirSync(dir, { recursive: true });

  const byName = new Map();
  for (const f of contactFiles || []) {
    const nm = f && (f.filename || f.title);
    if (nm && f.path && !byName.has(nm)) byName.set(nm, f.path);
  }
  const nameToField = {};
  Object.entries(assignment || {}).forEach(([fieldKey, names]) => {
    (names || []).forEach((n) => { nameToField[n] = fieldKey; });
  });

  const attached = {};
  const failed = [];
  for (const [name, url] of byName) {
    const fieldKey = nameToField[name];
    if (!fieldKey) continue;
    try {
      if (!/^https?:\/\//i.test(url)) throw new Error('URL không hợp lệ');
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`Tải thất bại (HTTP ${res.status})`);
      const mime = String(res.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
      if (!ALLOWED_MIMES.has(mime)) throw new Error(`Định dạng không hỗ trợ (${mime || 'unknown'})`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > MAX_FILE_SIZE) throw new Error('File rỗng hoặc quá 10MB');
      if (!verifyMagic(buf, mime)) throw new Error('File không đúng định dạng');
      const base = String(name).split(/[\\/]/).pop() || 'file';
      const lower = base.toLowerCase();
      const parts = lower.split('.');
      for (let i = 1; i < parts.length; i++) {
        if (BLOCKED_EXTS.has('.' + parts[i])) throw new Error('Đuôi file bị chặn');
      }
      const ext = MIME_TO_EXT[mime];
      const rand = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const fname = `${Date.now()}-${rand}${ext}`;
      fs.writeFileSync(path.join(dir, fname), buf);
      const storageKey = `restore/${dd}-${mm}-${yyyy}/${fname}`;
      const [result] = await pool.query(
        `INSERT INTO files (original_name, storage_key, mime_type, size, checksum, uploaded_by, submitter_ip, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
        [base.slice(0, 500), storageKey, mime, buf.length, null, userId || null, null]
      );
      const entry = {
        id: result.insertId,
        original_name: base,
        storage_key: storageKey,
        mime_type: mime,
        size: buf.length,
        checksum: null,
        status: 'active',
        uploaded_by: userId || null,
        storage_provider: 'local'
      };
      if (!attached[fieldKey]) attached[fieldKey] = [];
      attached[fieldKey].push(entry);
    } catch (err) {
      failed.push({ name, error: err.message });
    }
  }
  return { attached, failed };
};
