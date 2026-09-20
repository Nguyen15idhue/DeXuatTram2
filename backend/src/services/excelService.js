const ExcelJS = require('exceljs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const pool = require('../utils/db');
const fieldDefinitionService = require('./fieldDefinitionService');
const dynamicUtils = require('./dynamicUtils');
const dataListService = require('./dataListService');
const addressEnrichment = require('./addressEnrichment');
const proximityService = require('./proximityService');
const { validateLatitude, validateLongitude, validatePhone, validateRequired, validateEmail } = require('../middlewares/validators');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

exports.uploadMiddleware = upload.single('file');

const ENTITY_TABLE_MAP = {
  stations: 'stations',
  users: 'users',
  station_proposals: 'station_proposals'
};

const VALID_STATUSES = {
  stations: ['PLANNING', 'ACTIVE', 'DEPLOYING', 'REJECTED'],
  users: ['ACTIVE', 'LOCKED'],
  station_proposals: ['PENDING', 'REVIEWING', 'PRINCIPLE_APPROVED', 'APPROVED', 'REJECTED', 'CANCELLED', 'CONTRACT_SIGNED', 'CONTRACT_FAILED', 'ARCHIVED']
};

const STATUS_LABEL_MAP = {
  stations: {
    'QUY HOẠCH': 'PLANNING',
    'HOẠT ĐỘNG': 'ACTIVE',
    'TRIỂN KHAI': 'DEPLOYING',
    'TỪ CHỐI/HỦY': 'REJECTED'
  }
};

const VALID_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SALES', 'CTV', 'NPP'];

const importJobs = new Map();
const IMPORT_JOB_TTL_MS = 30 * 60 * 1000;
function registerImportJob(jobId, total) {
  if (!jobId) return null;
  const now = Date.now();
  for (const [id, job] of importJobs) {
    if (now - job.ts > IMPORT_JOB_TTL_MS) importJobs.delete(id);
  }
  const job = { total, done: 0, status: 'running', ts: now };
  importJobs.set(String(jobId), job);
  return job;
}

exports.getImportProgress = async (req, res) => {
  const job = importJobs.get(String(req.params.jobId));
  if (!job) return res.json({ success: true, data: { status: 'not_found', total: 0, done: 0 } });
  res.json({ success: true, data: { status: job.status, total: job.total, done: job.done } });
};

const DEFAULT_STATUS = {
  stations: 'ACTIVE',
  users: 'ACTIVE',
  station_proposals: 'PENDING'
};

// Do dai toi da cac cot fixed (theo schema) de bao loi o preview thay vi "Data too long" khi confirm
const MAX_LENGTHS = {
  'users.full_name': 100,
  'users.email': 100,
  'users.phone': 20,
  'users.external_id': 100,
  'stations.name': 200,
  'stations.address': 255,
  'station_proposals.owner_name': 100,
  'station_proposals.owner_phone': 20,
  'station_proposals.address': 255,
  'station_proposals.area': 50,
  'station_proposals.land_type': 100
};

const HEADER_STYLE = {
  font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF667EEA' } },
  alignment: { horizontal: 'center', vertical: 'middle' },
  border: {
    top: { style: 'thin' },
    bottom: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' }
  }
};

const USAGE_LABELS = { table: 'bảng danh sách', excel_full: 'đầy đủ', excel_basic: 'cơ bản' };

const fileStamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

// Ten phan loai file excel theo bo cot da chon: table | excel_full | excel_basic | all
const viewSlug = (views) => {
  if (!views || views.length !== 1) return 'all';
  const u = views[0].usage || 'table';
  return u === 'table' ? 'table' : u;
};

const buildFileName = (entity, kind, views, withStamp = false) => {
  const parts = [];
  if (withStamp) parts.push(fileStamp());
  parts.push(kind);
  parts.push(entity);
  parts.push(viewSlug(views));
  return `${parts.join('_')}.xlsx`;
};

async function resolveView(entity, viewId, usage) {
  if (viewId) {
    const [rows] = await pool.query(
      'SELECT id, entity, name, `usage`, status FROM views WHERE id = ? AND entity = ? LIMIT 1',
      [viewId, entity]
    );
    if (rows.length > 0) return rows[0];
  }
  if (usage) {
    const [rows] = await pool.query(
      "SELECT id, entity, name, `usage`, status FROM views WHERE entity = ? AND `usage` = ? AND status = 'active' ORDER BY id LIMIT 1",
      [entity, usage]
    );
    if (rows.length > 0) return rows[0];
  }
  const [rows] = await pool.query(
    "SELECT id, entity, name, `usage`, status FROM views WHERE entity = ? AND `usage` = 'table' AND status = 'active' ORDER BY id LIMIT 1",
    [entity]
  );
  return rows[0] || null;
}

function safeSheetName(name, used = new Set()) {
  let base = String(name || 'Sheet')
    .replace(/[\[\]:*?/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^'+|'+$/g, '')
    .trim();
  if (!base || /^history$/i.test(base)) base = 'Sheet';
  base = base.slice(0, 31).trim() || 'Sheet';
  let candidate = base;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${i})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
    i++;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

async function resolveExportViews(entity, query) {
  const idsRaw = query.viewIds || query.view_ids || '';
  const ids = String(idsRaw).split(',').map(s => Number(String(s).trim())).filter(Boolean);
  if (ids.length > 0) {
    const out = [];
    for (const id of ids) {
      const v = await resolveView(entity, id, null);
      if (v) out.push(v);
    }
    if (out.length > 0) return out;
  }
  const single = await resolveView(entity, query.viewId ? Number(query.viewId) : null, query.usage || null);
  return single ? [single] : [];
}

async function getViewFields(viewId) {
  const [rows] = await pool.query(
    `SELECT vf.order_index, fd.\`key\`, fd.label, fd.type, fd.source_type, fd.required, fd.formula_config, fd.\`options\`
     FROM view_fields vf
     JOIN field_definitions fd ON vf.field_id = fd.id
     WHERE vf.view_id = ? AND vf.visible = 1 AND fd.status = 'active' AND fd.type <> 'password'
     ORDER BY vf.order_index`,
    [viewId]
  );
  return rows;
}

async function buildExportColumns(entity, view) {
  const viewFields = await getViewFields(view.id);

  const columns = [
    { key: '_stt', label: 'STT', type: 'number', source_type: 'system' }
  ];

  viewFields.forEach(f => {
    columns.push({ key: f.key, label: f.label, type: f.type, source_type: f.source_type });
  });

  // View 'cơ bản' = CHỈ các cột trong view (không nối thêm field còn lại)
  if (view.usage === 'excel_basic') return columns;

  const allFieldsResult = await pool.query(
    `SELECT \`key\`, label, type, source_type FROM field_definitions WHERE entity = ? AND status = 'active'`,
    [entity]
  );
  const allFields = allFieldsResult[0];

  const viewKeys = new Set(viewFields.map(f => f.key));
  allFields.filter(f => !viewKeys.has(f.key) && f.type !== 'password').forEach(f => {
    columns.push({ key: f.key, label: f.label, type: f.type, source_type: f.source_type });
  });

  return columns;
}

async function resolveExportForm(entity, query) {
  const rawId = query.formId ? Number(query.formId) : null;
  if (Number.isFinite(rawId) && rawId > 0) {
    const [rows] = await pool.query(
      "SELECT id, entity, name, purpose, status FROM forms WHERE id = ? AND entity = ? AND status = 'active' LIMIT 1",
      [rawId, entity]
    );
    if (rows.length > 0) return rows[0];
  }
  const purpose = query.purpose || 'view';
  const [rows] = await pool.query(
    'SELECT id, entity, name, purpose, status FROM forms WHERE entity = ? AND status = \'active\' ORDER BY (purpose = ?) DESC, is_default DESC, id ASC LIMIT 1',
    [entity, purpose]
  );
  return rows[0] || null;
}

async function buildFormColumns(entity, form) {
  let layout = form.layout_config;
  if (layout === undefined) {
    const [r] = await pool.query('SELECT layout_config FROM forms WHERE id = ? LIMIT 1', [form.id]);
    layout = r[0] ? r[0].layout_config : null;
  }
  if (typeof layout === 'string') { try { layout = JSON.parse(layout); } catch { layout = {}; } }
  const sections = (layout && layout.sections) || [];
  const sectionMap = {};
  sections.forEach((s) => { if (s && s.id) sectionMap[s.id] = s; });

  const referenced = new Set();
  sections.forEach((s) => {
    if (!s) return;
    const tabs = s.tabs || (s.type === 'tabs' ? [] : null);
    if (s.type === 'tabs' || Array.isArray(s.tabs)) {
      (s.tabs || []).forEach((t) => {
        (t.sectionRefs || []).forEach((ref) => referenced.add(ref));
      });
    }
  });

  const [ffRows] = await pool.query(
    'SELECT fd.`key` AS fkey, fd.label, fd.type, fd.source_type, ff.config FROM form_fields ff JOIN field_definitions fd ON fd.id = ff.field_id WHERE ff.form_id = ? AND fd.status = \'active\' AND fd.type <> \'password\'',
    [form.id]
  );
  const byRow = new Map();
  const noRow = [];
  ffRows.forEach((r) => {
    let cfg = r.config;
    if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch { cfg = {}; } }
    cfg = cfg || {};
    const item = {
      key: r.fkey, label: r.label, type: r.type, source_type: r.source_type,
      rowId: cfg.rowId || null, colIndex: Number.isFinite(cfg.colIndex) ? cfg.colIndex : 999,
      order: 0
    };
    if (item.rowId) {
      if (!byRow.has(item.rowId)) byRow.set(item.rowId, []);
      byRow.get(item.rowId).push(item);
    } else {
      noRow.push(r);
    }
  });
  byRow.forEach((arr) => arr.sort((a, b) => a.colIndex - b.colIndex));

  const columns = [{ key: '_stt', label: 'STT', type: 'number', source_type: 'system', sectionTitle: '', tabTitle: '' }];
  const seen = new Set(['_stt']);
  const pushField = (f, sectionTitle, tabTitle) => {
    if (!f || seen.has(f.key)) return;
    seen.add(f.key);
    columns.push({ key: f.key, label: f.label, type: f.type, source_type: f.source_type, sectionTitle: sectionTitle || '', tabTitle: tabTitle || '' });
  };
  const pushSectionRows = (sec, sectionTitle, tabTitle) => {
    (sec.rows || []).forEach((row) => {
      if (!row || !row.id) return;
      const fields = byRow.get(row.id) || [];
      fields.forEach((f) => pushField(f, sectionTitle, tabTitle));
    });
  };

  sections.forEach((sec) => {
    if (!sec || !sec.id) return;
    if (referenced.has(sec.id)) return;
    if (sec.type === 'tabs' || Array.isArray(sec.tabs)) {
      const groupTitle = sec.title || '';
      (sec.tabs || []).forEach((tab) => {
        const tabTitle = tab.title || '';
        (tab.sectionRefs || []).forEach((refId) => {
          const ref = sectionMap[refId];
          if (ref) pushSectionRows(ref, groupTitle, tabTitle);
        });
      });
      return;
    }
    pushSectionRows(sec, sec.title || '', '');
  });

  if (noRow.length > 0) {
    const [ordered] = await pool.query(
      'SELECT fd.`key` AS fkey, fd.label, fd.type, fd.source_type FROM form_fields ff JOIN field_definitions fd ON fd.id = ff.field_id WHERE ff.form_id = ? AND fd.status = \'active\' AND fd.type <> \'password\' ORDER BY ff.order_index',
      [form.id]
    );
    ordered.forEach((r) => {
      if (seen.has(r.fkey)) return;
      const hasRow = ffRows.some((x) => x.fkey === r.fkey && x.config);
      if (hasRow) return;
      pushField({ key: r.fkey, label: r.label, type: r.type, source_type: r.source_type }, '', '');
    });
  }

  return columns;
}

const FORM_R1_STYLE = {
  font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7490' } },
  alignment: { horizontal: 'center', vertical: 'middle' },
  border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
};

const FORM_R2_STYLE = {
  font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } },
  alignment: { horizontal: 'center', vertical: 'middle' },
  border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
};

function styleFormHeaderRows(sheet, columns) {
  [1, 2, 3].forEach((n) => { sheet.getRow(n).height = 25; });
  columns.forEach((col, idx) => {
    const c = idx + 1;
    const c1 = sheet.getRow(1).getCell(c);
    c1.value = col.sectionTitle || null;
    c1.font = FORM_R1_STYLE.font;
    c1.fill = FORM_R1_STYLE.fill;
    c1.alignment = FORM_R1_STYLE.alignment;
    c1.border = FORM_R1_STYLE.border;
    const c2 = sheet.getRow(2).getCell(c);
    c2.value = col.tabTitle || null;
    c2.font = FORM_R2_STYLE.font;
    c2.fill = FORM_R2_STYLE.fill;
    c2.alignment = FORM_R2_STYLE.alignment;
    c2.border = FORM_R2_STYLE.border;
    const c3 = sheet.getRow(3).getCell(c);
    c3.value = col.label;
    c3.font = HEADER_STYLE.font;
    c3.fill = HEADER_STYLE.fill;
    c3.alignment = HEADER_STYLE.alignment;
    c3.border = HEADER_STYLE.border;
  });

  let i = 0;
  while (i < columns.length) {
    const title = columns[i].sectionTitle || '';
    let j = i;
    while (j + 1 < columns.length && (columns[j + 1].sectionTitle || '') === title) j++;
    if (title && j > i) {
      sheet.mergeCells(1, i + 1, 1, j + 1);
    } else if (!title && j === i) {
      sheet.mergeCells(1, i + 1, 2, i + 1);
    } else if (!columns[i].tabTitle && j === i) {
      sheet.mergeCells(1, i + 1, 2, i + 1);
    }
    let k = i;
    while (k <= j) {
      const tab = columns[k].tabTitle || '';
      let m = k;
      while (m + 1 <= j && (columns[m + 1].tabTitle || '') === tab) m++;
      if (tab && m > k) sheet.mergeCells(2, k + 1, 2, m + 1);
      k = m + 1;
    }
    i = j + 1;
  }
  sheet.views = [{ state: 'frozen', ySplit: 3 }];
  sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: columns.length } };
}

function autoWidthColumnsForm(sheet, columns) {
  columns.forEach((col, idx) => {
    const colNum = idx + 1;
    let maxWidth = String(col.label || '').length + 4;
    const sLen = String(col.sectionTitle || '').length;
    const tLen = String(col.tabTitle || '').length;
    if (sLen > maxWidth) maxWidth = sLen;
    if (tLen > maxWidth) maxWidth = tLen;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 3) return;
      const cell = row.getCell(colNum);
      const val = cell.value != null ? String(cell.value) : '';
      if (val.length > maxWidth) maxWidth = val.length;
    });
    sheet.getColumn(colNum).width = Math.min(maxWidth + 2, 50);
  });
}

async function getFieldDefsForView(entity, view) {
  if (view && view.usage === 'excel_basic') {
    const rows = await getViewFields(view.id);
    return rows.map(r => ({
      key: r.key, label: r.label, type: r.type, source_type: r.source_type,
      required: r.required, formula_config: r.formula_config, options: r.options || null
    }));
  }
  const [rows] = await pool.query(
    'SELECT `key`, label, type, source_type, required, formula_config, `options` FROM field_definitions WHERE entity = ? AND status = \'active\' ORDER BY id',
    [entity]
  );
  return rows;
}


function buildImportColumns(entity, fieldDefs) {
  const columns = [
    { key: '_stt', label: 'STT', type: 'number', source_type: 'system', required: false }
  ];

  fieldDefs.forEach(f => {
    if (f.type === 'password') return;
    let formulaConfig = null;
    if (f.formula_config) {
      try { formulaConfig = typeof f.formula_config === 'string' ? JSON.parse(f.formula_config) : f.formula_config; } catch { formulaConfig = null; }
    }
    columns.push({
      key: f.key,
      label: f.label,
      type: f.type,
      source_type: f.source_type,
      required: !!f.required,
      computeMode: formulaConfig ? (formulaConfig.compute_mode || 'pre') : null,
      options: f.options || null
    });
  });

  return columns;
}

function getAllData(entity, filters = {}) {
  const table = ENTITY_TABLE_MAP[entity];
  if (!table) throw new Error(`Entity không hợp lệ: ${entity}`);
  const { search = '', status = '', scopeUserId, scopeBranchUserIds } = filters;
  const like = `%${search}%`;
  if (entity === 'stations') {
    const where = [];
    const params = [];
    if (search) { where.push('(s.name LIKE ? OR s.address LIKE ?)'); params.push(like, like); }
    if (status) { where.push('s.status = ?'); params.push(status); }
    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    return pool.query(`SELECT * FROM stations s ${whereClause} ORDER BY id DESC`, params);
  }
  if (entity === 'station_proposals') {
    const where = [];
    const params = [];
    if (scopeUserId) {
      where.push('p.user_id = ?'); params.push(scopeUserId);
    } else if (scopeBranchUserIds) {
      const ids = scopeBranchUserIds.split(',').map(Number).filter(n => !isNaN(n));
      if (ids.length > 0) {
        where.push(`p.user_id IN (${ids.map(() => '?').join(',')})`); params.push(...ids);
      }
    }
    if (status) { where.push('p.status = ?'); params.push(status); }
    if (search) { where.push('(p.owner_name LIKE ? OR p.address LIKE ? OR u.full_name LIKE ?)'); params.push(like, like, like); }
    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    const join = search ? 'JOIN users u ON p.user_id = u.id' : '';
    return pool.query(`SELECT p.* FROM station_proposals p ${join} ${whereClause} ORDER BY p.id DESC`, params);
  }
  if (entity === 'users') {
    const where = [];
    const params = [];
    if (search) { where.push('(full_name LIKE ? OR email LIKE ? OR phone LIKE ?)'); params.push(like, like, like); }
    if (status) { where.push('status = ?'); params.push(status); }
    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    return pool.query(`SELECT id, full_name, email, phone, role, status, parent_id, external_id, custom_data, created_at, updated_at FROM users ${whereClause} ORDER BY id DESC`, params);
  }
  return pool.query(`SELECT * FROM ${table} ORDER BY id DESC`);
}

function styleHeaderRow(sheet) {
  const headerRow = sheet.getRow(1);
  headerRow.height = 25;
  headerRow.eachCell((cell) => {
    cell.font = HEADER_STYLE.font;
    cell.fill = HEADER_STYLE.fill;
    cell.alignment = HEADER_STYLE.alignment;
    cell.border = HEADER_STYLE.border;
  });
}

function autoWidthColumns(sheet, columns) {
  columns.forEach((col, idx) => {
    const colNum = idx + 1;
    let maxWidth = col.label.length + 4;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const cell = row.getCell(colNum);
      const val = cell.value != null ? String(cell.value) : '';
      if (val.length > maxWidth) maxWidth = val.length;
    });
    sheet.getColumn(colNum).width = Math.min(maxWidth + 2, 50);
  });
}

function getSampleValue(col) {
  if (col.type === 'formula' && col.computeMode === 'post') return '';
  switch (col.type) {
    case 'number': return 0;
    case 'email': return 'example@email.com';
    case 'phone': return '0901234567';
    case 'date': return '01/01/2026';
    case 'datetime': return '01/01/2026 12:00';
    case 'boolean': return 'true';
    case 'select': return 'option1';
    case 'multiselect': return 'option1,option2';
    case 'file': return '(file upload - không import được)';
    default: return '';
  }
}

const REQUIRED_HEADERS = {
  station_proposals: ['latitude', 'longitude'],
  stations: ['name', 'latitude', 'longitude'],
  users: ['full_name', 'email']
};

function validateHeaders(headerRow, columns, entity) {
  const errors = [];
  const fileLabels = [];
  headerRow.eachCell({ includeEmpty: false }, (cell) => {
    const v = String(cell.value == null ? '' : cell.value).trim();
    if (v) fileLabels.push(v.toLowerCase());
  });

  const byKey = {};
  columns.forEach(c => { byKey[c.key] = c; });

  // Khong co entity (vd Data List) -> giu che do chat: doi DU moi cot
  if (!entity) {
    columns.forEach((col, i) => {
      if (i === 0 && col.key === '_stt') return;
      if (!fileLabels.includes(String(col.label).trim().toLowerCase())) {
        errors.push(`Thiếu cột: "${col.label}"`);
      }
    });
    return errors;
  }

  // 1. Chi doi cac cot BAT BUOC cua entity (va chi khi cot do nam trong bo cot dang dung)
  const requiredKeys = REQUIRED_HEADERS[entity] || [];
  for (const key of requiredKeys) {
    const col = byKey[key];
    if (!col) continue;
    if (!fileLabels.includes(String(col.label).trim().toLowerCase())) {
      errors.push(`Thiếu cột bắt buộc: "${col.label}"`);
    }
  }

  // 2. File phai khop it nhat 1 cot trong bo cot dang dung
  const matched = columns.some(c => c.key !== '_stt' && fileLabels.includes(String(c.label).trim().toLowerCase()));
  if (!matched) {
    errors.push('File không có cột nào thuộc bộ cột đã chọn');
  }

  return errors;
}

function buildHeaderMap(headerRow, columns) {
  const map = {};
  const usedKeys = new Set();
  const candidatesFor = (label) => columns.filter(c => c.key !== '_stt' && c.label.toLowerCase() === label);
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const label = String(cell.value == null ? '' : cell.value).trim().toLowerCase();
    if (!label) return;
    const candidates = candidatesFor(label);
    if (candidates.length === 0) return;
    const matched = candidates.find(c => !usedKeys.has(c.key)) || candidates[0];
    map[colNumber] = matched.key;
    usedKeys.add(matched.key);
  });
  return map;
}

function resolveSelectValue(cellValue, optionsJson, isMultiselect) {
  if (!cellValue || cellValue === '') return cellValue;
  const opts = dynamicUtils.parseOptions(optionsJson);
  if (!opts || opts.length === 0) return cellValue;

  const resolveOne = (str) => {
    for (const o of opts) {
      if (typeof o !== 'object' || !o) continue;
      if (String(o.value) === str) return o.value;
    }
    const lower = str.toLowerCase();
    for (const o of opts) {
      if (typeof o !== 'object' || !o) continue;
      if (o.label && String(o.label).toLowerCase() === lower) return o.value ?? o.label;
    }
    return str;
  };

  if (isMultiselect) {
    return String(cellValue).split(',').map(s => resolveOne(s.trim())).join(',');
  }
  return resolveOne(String(cellValue).trim());
}

function parseExcelRow(row, columns, entity, headerMap, userMap = null) {
  const fixedData = {};
  const dynamicData = {};
  const errors = [];

  const byKey = {};
  columns.forEach(c => { byKey[c.key] = c; });
  const valueByKey = {};
  if (headerMap) {
    Object.entries(headerMap).forEach(([colNumber, key]) => {
      const cell = row.getCell(Number(colNumber));
      valueByKey[key] = cell ? cell.value : '';
    });
  }

  if (entity === 'stations' || entity === 'station_proposals') {
    const rawLat = Number(valueByKey.latitude);
    const rawLng = Number(valueByKey.longitude);
    if (valueByKey.latitude !== '' && valueByKey.longitude !== '' && !isNaN(rawLat) && !isNaN(rawLng)
      && (rawLat < -90 || rawLat > 90) && rawLng >= -90 && rawLng <= 90 && Math.abs(rawLat) <= 180) {
      const t = valueByKey.latitude;
      valueByKey.latitude = valueByKey.longitude;
      valueByKey.longitude = t;
    }
  }

  columns.forEach(col => {
    if (col.key === '_stt') return;
    if (col.type === 'file') return;

    let value = Object.prototype.hasOwnProperty.call(valueByKey, col.key) ? valueByKey[col.key] : '';

    if (value && typeof value === 'object') {
      if (Array.isArray(value.richText)) {
        value = value.richText.map((t) => ((t && t.text) ? t.text : '')).join('');
      } else if (value.result !== undefined) {
        value = value.result;
      } else if (value.text !== undefined) {
        value = value.text; // hyperlink { text, hyperlink }
      } else if (value.hyperlink !== undefined) {
        value = value.hyperlink;
      }
    }

    if (value == null || value === '') {
      value = '';
    } else if (typeof value === 'number') {
      value = value;
    } else if (value instanceof Date) {
      value = value.toISOString().split('T')[0];
    } else {
      value = String(value).trim();
    }

    if (value !== '' && col.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors.push(`${col.label}: email không hợp lệ (${value})`);
      return;
    }

    if (value !== '' && entity === 'users' && col.type === 'phone') {
      value = String(value).replace(/\s+/g, ' ').trim(); // gom khoang trang/xuong dong
    }

    const maxLen = MAX_LENGTHS[`${entity}.${col.key}`];
    if (maxLen && value !== '' && String(value).length > maxLen) {
      errors.push(`${col.label}: tối đa ${maxLen} ký tự (hiện ${String(value).length}). Giá trị: ${String(value).replace(/\s+/g, ' ').slice(0, 40)}`);
      return;
    }

    const presentInFile = !headerMap || Object.values(headerMap).includes(col.key);
    if (value === '' && col.required && presentInFile) {
      if (entity === 'station_proposals' && (col.key === 'ma_tinh' || col.key === 'vung_mien') && dynamicData.province) {
        return;
      }
      errors.push(`${col.label} là bắt buộc`);
      return;
    }

    if (col.source_type === 'fixed') {
      if (col.key === 'latitude' || col.key === 'longitude') {
        if (value === '') {
          errors.push(`${col.label} là bắt buộc`);
          return;
        }
        const num = parseFloat(value);
        if (isNaN(num) || (col.key === 'latitude' && (num < -90 || num > 90)) || (col.key === 'longitude' && (num < -180 || num > 180))) {
          errors.push(`${col.label}: giá trị không hợp lệ (${value})`);
        } else {
          fixedData[col.key] = num;
        }
      } else if (col.type === 'number') {
        if (value === '') {
          fixedData[col.key] = null;
          return;
        }
        const num = parseFloat(value);
        if (isNaN(num)) {
          errors.push(`${col.label}: phải là số (${value})`);
        } else {
          fixedData[col.key] = num;
        }
      } else if (col.type === 'boolean') {
        fixedData[col.key] = value === 'true' || value === '1' || value === 'TRUE' ? 1 : 0;
      } else if (col.type === 'select' && entity && VALID_STATUSES[entity] && col.key === 'status') {
        let upper = String(value).toUpperCase();
        if (STATUS_LABEL_MAP[entity] && STATUS_LABEL_MAP[entity][upper]) upper = STATUS_LABEL_MAP[entity][upper];
        if (value !== '' && !VALID_STATUSES[entity].includes(upper)) {
          errors.push(`${col.label}: trạng thái không hợp lệ "${value}". Chấp nhận: ${VALID_STATUSES[entity].join(', ')}`);
        } else {
          fixedData[col.key] = upper || DEFAULT_STATUS[entity] || VALID_STATUSES[entity][0];
        }
      } else if (col.type === 'select' && entity === 'users' && col.key === 'role') {
        const upper = String(value).toUpperCase();
        if (value !== '' && !VALID_ROLES.includes(upper)) {
          errors.push(`${col.label}: vai trò không hợp lệ "${value}". Chấp nhận: ${VALID_ROLES.join(', ')}`);
        } else {
          fixedData[col.key] = upper || 'CTV';
        }
      } else {
        fixedData[col.key] = (col.type === 'select' || col.type === 'multiselect') && col.options
          ? resolveSelectValue(value, col.options, col.type === 'multiselect') : value;
      }
    } else {
      if (col.type === 'number' && value !== '') {
        const num = parseFloat(value);
        if (isNaN(num)) {
          errors.push(`${col.label}: phải là số (${value})`);
        } else {
          dynamicData[col.key] = num;
        }
      } else if (col.type === 'boolean') {
        dynamicData[col.key] = value === 'true' || value === '1' || value === 'TRUE';
      } else if (col.type === 'user') {
        if (value === '') {
          dynamicData[col.key] = '';
        } else {
          const numVal = Number(value);
          if (Number.isInteger(numVal) && numVal > 0) {
            if (userMap && userMap.byId && userMap.byId.has(numVal)) {
              dynamicData[col.key] = { id: numVal };
            } else {
              errors.push(`${col.label}: người dùng không tồn tại (${value})`);
            }
          } else {
            const key = String(value).trim().toLowerCase();
            if (userMap && userMap.byName && userMap.byName.has(key)) {
              dynamicData[col.key] = { id: userMap.byName.get(key) };
            } else {
              errors.push(`${col.label}: không tìm thấy người dùng "${value}"`);
            }
          }
        }
      } else {
        dynamicData[col.key] = (col.type === 'select' || col.type === 'multiselect') && col.options
          ? resolveSelectValue(value, col.options, col.type === 'multiselect') : value;
      }
    }
  });

  return { fixedData, dynamicData, errors };
}

async function getUserLabelMap() {
  const [rows] = await pool.query('SELECT id, full_name FROM users');
  const byId = new Map(rows.map(r => [Number(r.id), r.full_name || '']));
  const byName = new Map(rows.map(r => [String(r.full_name || '').trim().toLowerCase(), Number(r.id)]));
  return { byId, byName };
}

function exportRowToValues(row, columns, idx, token = '', userMap = null) {
  return columns.map(col => {
    if (col.key === '_stt') return idx + 1;

    let value;
    if (col.source_type === 'fixed') {
      value = row[col.key];
    } else {
      const custom = row.custom_data ? (typeof row.custom_data === 'string' ? JSON.parse(row.custom_data) : row.custom_data) : {};
      value = custom[col.key];
    }

    if (value == null) return '';

    if (col.type === 'password') return '********';

    if (col.type === 'user') {
      let uid = null;
      let label = '';
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const raw = value.id ?? value.user_id ?? value.value;
        const n = Number(raw);
        if (Number.isInteger(n) && n > 0) uid = n;
        if (value.label) label = String(value.label);
      } else if (value !== null && value !== undefined && value !== '') {
        const n = Number(value);
        if (Number.isInteger(n) && n > 0) uid = n;
        else label = String(value).trim();
      }
      if (!label && uid !== null && userMap && userMap.has(uid)) label = userMap.get(uid);
      if (label) return label;
      if (uid !== null) return `User #${uid}`;
      return '';
    }

    if (col.type === 'file') {
      const baseUrl = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/api\/?$/, '');
      const files = Array.isArray(value) ? value : [value];
      const fileData = files.filter(f => f && f.original_name).map(f => ({
        original_name: f.original_name,
        link: f.id ? `${baseUrl}/api/files/${f.id}/download${token ? `?token=${encodeURIComponent(token)}` : ''}` : null
      }));
      if (fileData.length === 0) return '';
      if (fileData.length === 1) return JSON.stringify(fileData[0]);
      return JSON.stringify(fileData);
    }

    if (typeof value === 'object' && value !== null && value.result !== undefined) {
      value = value.result;
    }

    if (col.type === 'table' || col.type === 'multiselect') {
      if (value === '') return '';
      try { return JSON.stringify(value); } catch { return String(value); }
    }

    if (typeof value === 'object') {
      try { return JSON.stringify(value); } catch { return String(value); }
    }

    return value;
  });
}

function mergeExportColumns(listOfColumns) {
  const merged = [];
  const seen = new Set();
  listOfColumns.forEach(cols => {
    (cols || []).forEach(c => {
      if (!seen.has(c.key)) {
        seen.add(c.key);
        merged.push(c);
      }
    });
  });
  return merged;
}

function pairLabel(p) {
  if (p.code) return p.code;
  return p.kind === 'station' ? `Trạm #${p.id}` : `Đề xuất #${p.id}`;
}

exports.exportDynamic = async (req, res) => {
  try {
    const { entity, search = '', status = '', scopeUserId, scopeBranchUserIds } = req.query;
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.query.token || '';

    if (!ENTITY_TABLE_MAP[entity]) {
      return res.status(400).json({ success: false, message: 'Entity không hợp lệ. Chọn: stations, users, station_proposals' });
    }

    if (req.query.layout === 'form') {
      const form = await resolveExportForm(entity, req.query);
      if (!form) {
        return res.status(400).json({ success: false, message: 'Chưa có form cho entity này' });
      }
      const columns = await buildFormColumns(entity, form);
      let userMap = null;
      if (columns.some(c => c.type === 'user')) {
        try {
          const m = await getUserLabelMap();
          userMap = m.byId;
        } catch { /* silent */ }
      }
      const [rows] = await getAllData(entity, { search, status, scopeUserId, scopeBranchUserIds });
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(entity);
      sheet.addRow(columns.map(() => null));
      sheet.addRow(columns.map(() => null));
      sheet.addRow(columns.map(() => null));
      styleFormHeaderRows(sheet, columns);
      rows.forEach((row, idx) => {
        sheet.addRow(exportRowToValues(row, columns, idx, token, userMap));
      });
      autoWidthColumnsForm(sheet, columns);
      const stamp = fileStamp();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${stamp}_export_${entity}_form.xlsx`);
      await workbook.xlsx.write(res);
      res.end();
      return;
    }

    const views = await resolveExportViews(entity, req.query);
    if (views.length === 0) {
      return res.status(400).json({ success: false, message: 'Chưa có view bảng cho entity này' });
    }

    const [rows] = await getAllData(entity, { search, status, scopeUserId, scopeBranchUserIds });

    const workbook = new ExcelJS.Workbook();
    const multi = views.length > 1;
    const usedNames = new Set();

    for (const view of views) {
      const columns = await buildExportColumns(entity, view);
      let userMap = null;
      if (columns.some(c => c.type === 'user')) {
        try {
          const m = await getUserLabelMap();
          userMap = m.byId;
        } catch { /* silent */ }
      }

      const sheet = workbook.addWorksheet(multi ? safeSheetName(view.name, usedNames) : entity);

      sheet.addRow(columns.map(c => c.label));
      styleHeaderRow(sheet);

      rows.forEach((row, idx) => {
        sheet.addRow(exportRowToValues(row, columns, idx, token, userMap));
      });

      autoWidthColumns(sheet, columns);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${buildFileName(entity, 'export', views, true)}`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export dynamic error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.exportDuplicates = async (req, res, ownUserId = null) => {
  try {
    const { min_m = 200, max_m = 2000 } = req.body || {};
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.query.token || '';
    const result = await proximityService.findDuplicates({ minM: min_m, maxM: max_m, ownUserId });
    const { pairs } = result;

    const oriented = pairs.map(pr => {
      if (pr.a.kind === 'station' && pr.b.kind === 'proposal') {
        return { a: pr.b, b: pr.a, distance_m: pr.distance_m };
      }
      return pr;
    });

    const collectSide = (side) => {
      const seen = new Set();
      const items = [];
      oriented.forEach(pr => {
        const p = pr[side];
        const k = `${p.kind}:${p.id}`;
        if (!seen.has(k)) {
          seen.add(k);
          items.push(p);
        }
      });
      return items;
    };
    const sideA = collectSide('a');
    const sideB = collectSide('b');

    const loadRecords = async (items) => {
      const byId = {};
      const proposalIds = items.filter(i => i.kind === 'proposal').map(i => i.id);
      const stationIds = items.filter(i => i.kind === 'station').map(i => i.id);
      if (proposalIds.length > 0) {
        const [rows] = await pool.query(
          `SELECT * FROM station_proposals WHERE id IN (${proposalIds.map(() => '?').join(',')})`,
          proposalIds
        );
        rows.forEach(r => { byId[`proposal:${r.id}`] = r; });
      }
      if (stationIds.length > 0) {
        const [rows] = await pool.query(
          `SELECT * FROM stations WHERE id IN (${stationIds.map(() => '?').join(',')})`,
          stationIds
        );
        rows.forEach(r => { byId[`station:${r.id}`] = r; });
      }
      return byId;
    };
    const recordsA = await loadRecords(sideA);
    const recordsB = await loadRecords(sideB);

    const proposalColumns = await buildExportColumns('station_proposals', await resolveView('station_proposals', null, 'table'));
    const stationColumns = await buildExportColumns('stations', await resolveView('stations', null, 'table'));
    const columnsA = mergeExportColumns([proposalColumns, stationColumns].filter((_, i) =>
      (i === 0 && sideA.some(x => x.kind === 'proposal')) || (i === 1 && sideA.some(x => x.kind === 'station'))));
    const columnsB = mergeExportColumns([proposalColumns, stationColumns].filter((_, i) =>
      (i === 0 && sideB.some(x => x.kind === 'proposal')) || (i === 1 && sideB.some(x => x.kind === 'station'))));

    const workbook = new ExcelJS.Workbook();

    const ketqua = workbook.addWorksheet('ketqua');
    ketqua.addRow(['STT', 'Bên A', 'Bên B', 'Khoảng cách (m)']);
    styleHeaderRow(ketqua);
    oriented.forEach((pr, idx) => {
      ketqua.addRow([idx + 1, pairLabel(pr.a), pairLabel(pr.b), pr.distance_m]);
    });
    autoWidthColumns(ketqua, [{ label: 'STT' }, { label: 'Bên A' }, { label: 'Bên B' }, { label: 'Khoảng cách (m)' }]);

    let dupUserMap = null;
    try {
      const m = await getUserLabelMap();
      dupUserMap = m.byId;
    } catch { /* silent */ }

    const fillSide = (name, side, records, columns) => {
      const sheet = workbook.addWorksheet(name);
      sheet.addRow(columns.map(c => c.label));
      styleHeaderRow(sheet);
      side.forEach((item, idx) => {
        const row = records[`${item.kind}:${item.id}`];
        sheet.addRow(row ? exportRowToValues(row, columns, idx, token, dupUserMap) : columns.map(() => ''));
      });
      autoWidthColumns(sheet, columns);
    };
    fillSide('Ben A', sideA, recordsA, columnsA.length > 0 ? columnsA : proposalColumns);
    fillSide('Ben B', sideB, recordsB, columnsB.length > 0 ? columnsB : proposalColumns);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileStamp()}_duplicates_export.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export duplicates error:', error);
    res.status(400).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

function getFileHeaderLabels(headerRow) {
  const labels = [];
  headerRow.eachCell({ includeEmpty: false }, (cell) => {
    const v = String(cell.value == null ? '' : cell.value).trim();
    if (v) labels.push(v);
  });
  return labels;
}

async function computeViewStats(entity, view, rawFileLabels) {
  // Bo cot he thong (STT) khoi viec doi chieu
  const fileLabels = rawFileLabels.filter(l => String(l).trim().toLowerCase() !== 'stt');
  const defs = await getFieldDefsForView(entity, view);
  const viewLabels = defs.map(d => String(d.label || '').trim()).filter(Boolean);
  const viewLower = viewLabels.map(l => l.toLowerCase());
  const fileLower = fileLabels.map(l => l.toLowerCase());
  const matched = viewLower.filter(l => fileLower.includes(l)).length;
  const missingViewColumns = viewLabels.filter((l, i) => !fileLower.includes(viewLower[i]));
  const unmatchedFileColumns = fileLabels.filter((l, i) => !viewLower.includes(fileLower[i]));
  const omittedFields = defs
    .filter(d => d.key !== '_stt' && !fileLower.includes(String(d.label || '').trim().toLowerCase()))
    .map(d => ({ key: d.key, label: d.label, required: !!d.required }));
  const denom = viewLabels.length + fileLabels.length;
  const score = denom === 0 ? 0 : (2 * matched) / denom;
  const coverage = viewLabels.length === 0 ? 0 : matched / viewLabels.length;
  return {
    viewId: view.id,
    name: view.name,
    usage: view.usage,
    score: Number(score.toFixed(3)),
    coverage: Number(coverage.toFixed(3)),
    matched,
    totalViewColumns: viewLabels.length,
    totalFileColumns: fileLabels.length,
    missingViewColumns,
    unmatchedFileColumns,
    omittedFields
  };
}

async function detectViewForFile(entity, fileLabels) {
  const [views] = await pool.query(
    "SELECT id, entity, name, `usage`, status FROM views WHERE entity = ? AND status = 'active' ORDER BY id",
    [entity]
  );
  const excelViews = views.filter(v => v.usage === 'excel_full' || v.usage === 'excel_basic');
  const candidates = excelViews.length > 0 ? excelViews : views;

  const results = [];
  for (const v of candidates) {
    results.push(await computeViewStats(entity, v, fileLabels));
  }
  results.sort((a, b) => b.score - a.score || b.coverage - a.coverage || a.viewId - b.viewId);
  return results;
}

exports.importPreviewDynamic = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn file Excel' });
    }

    const { entity } = req.query;
    const checkDuplicate = req.query.checkDuplicate !== 'false';
    const checkIntraFile = req.query.checkIntraFile !== 'false';
    if (!entity || !ENTITY_TABLE_MAP[entity]) {
      return res.status(400).json({ success: false, message: 'Entity không hợp lệ' });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const sheet = workbook.worksheets[0];

    if (!sheet || sheet.rowCount < 2) {
      return res.status(400).json({ success: false, message: 'File Excel trống hoặc không có dữ liệu' });
    }

    // --- Nhận diện bộ cột + cho phép override bằng viewId/usage ---
    const fileLabels = getFileHeaderLabels(sheet.getRow(1));
    const candidates = await detectViewForFile(entity, fileLabels);
    const best = candidates[0] || null;
    const confident = !!best && best.coverage >= 0.5;

    let view = null;
    let detectionSource = 'default';
    if (req.query.viewId) {
      view = await resolveView(entity, Number(req.query.viewId), null);
      detectionSource = 'override';
    } else if (req.query.usage) {
      view = await resolveView(entity, null, req.query.usage);
      detectionSource = 'override';
    } else if (best) {
      view = await resolveView(entity, best.viewId, null);
      detectionSource = 'auto';
    }
    if (!view) {
      view = await resolveView(entity, null, 'table');
    }
    if (!view) {
      return res.status(400).json({ success: false, message: 'Chưa có view nào cho entity này' });
    }

    const viewStats = await computeViewStats(entity, view, fileLabels);

    const detection = {
      detectedViewId: view.id,
      detectedViewName: view.name,
      detectedUsage: view.usage,
      source: detectionSource,
      confident: detectionSource === 'override' ? true : confident,
      score: viewStats.score,
      coverage: viewStats.coverage,
      autoDetectedViewId: best ? best.viewId : null,
      autoDetectedViewName: best ? best.name : null,
      candidates,
      unmatchedFileColumns: viewStats.unmatchedFileColumns,
      missingViewColumns: viewStats.missingViewColumns,
      omittedFields: viewStats.omittedFields,
      totalViewColumns: viewStats.totalViewColumns,
      totalFileColumns: viewStats.totalFileColumns
    };

    const fieldDefs = await getFieldDefsForView(entity, view);
    const columns = buildImportColumns(entity, fieldDefs);

    const headerColumns = entity === 'station_proposals'
      ? columns.filter(c => c.key !== 'ma_tinh' && c.key !== 'vung_mien')
      : columns;
    const headerErrors = validateHeaders(sheet.getRow(1), headerColumns, entity);
    if (headerErrors.length > 0) {
      return res.status(400).json({ success: false, message: `Lỗi header: ${headerErrors.join('; ')}`, data: { detection } });
    }

    const validRows = [];
    const errors = [];
    const previewWarnings = [];
    const headerMap = buildHeaderMap(sheet.getRow(1), columns);
    let importUserMap = null;
    if (columns.some(c => c.type === 'user')) {
      try {
        importUserMap = await getUserLabelMap();
      } catch { /* silent */ }
    }

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const isEmpty = row.values.every((v, i) => i === 0 || v == null || v === '');
      if (isEmpty) return;

      const parsed = parseExcelRow(row, columns, entity, headerMap, importUserMap);

      if (parsed.errors.length > 0) {
        errors.push({ row: rowNumber, errors: parsed.errors });
      } else {
        validRows.push({
          rowNumber,
          fixedData: parsed.fixedData,
          dynamicData: parsed.dynamicData
        });
      }
    });

    if (entity === 'station_proposals' || entity === 'stations') {
      const kept = [];
      const acceptedCoords = [];
      const warnings = [];
      for (const vr of validRows) {
        const lat = parseFloat(vr.fixedData.latitude);
        const lng = parseFloat(vr.fixedData.longitude);
        if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          if (checkDuplicate) {
            try {
              const opts = entity === 'stations' ? { kinds: ['station'] } : {};
              const nearby = await proximityService.checkNearby(lat, lng, 200, null, opts);
              if (nearby.is_duplicate) {
                const n = nearby.nearest;
                const who = n.kind === 'station' ? 'trạm' : 'đề xuất';
                const label = n.name ? ` "${n.name}"` : (n.code ? ` "${n.code}"` : '');
                const msg = `Vị trí gần với ${who} #${n.id}${label} (cách ${n.distance_m}m < 200m)`;
                vr.warnings = [...(vr.warnings || []), msg];
                warnings.push({ row: vr.rowNumber, warnings: [msg] });
              }
            } catch { /* silent */ }
          }
          if (checkIntraFile) {
            const dupInFile = acceptedCoords.find(c => proximityService.haversineM(lat, lng, c.lat, c.lng) < 200);
            if (dupInFile) {
              const msg = `Vị trí gần với dòng ${dupInFile.row} trong cùng file (< 200m)`;
              vr.warnings = [...(vr.warnings || []), msg];
              warnings.push({ row: vr.rowNumber, warnings: [msg] });
            }
          }
          acceptedCoords.push({ lat, lng, row: vr.rowNumber });
        }
        kept.push(vr);
      }
      validRows.length = 0;
      validRows.push(...kept);
      previewWarnings.push(...warnings);
    }

    if (entity === 'stations') {
      const [existing] = await pool.query(
        `SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.ma_tram')) AS code FROM stations WHERE JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.ma_tram')) IS NOT NULL`
      );
      const used = new Set(existing.map(r => r.code));
      const keptRows = [];
      for (const vr of validRows) {
        const code = vr.dynamicData.ma_tram;
        if (code) {
          if (used.has(code)) {
            errors.push({ row: vr.rowNumber, errors: [`Mã trạm "${code}" đã tồn tại, không cho import`] });
            continue;
          }
          used.add(code);
        }
        keptRows.push(vr);
      }
      validRows.length = 0;
      validRows.push(...keptRows);
    }

    if (entity === 'users') {
      const [existingUsers] = await pool.query('SELECT LOWER(email) AS email, external_id FROM users');
      const usedEmails = new Set(existingUsers.map(r => (r.email || '').toLowerCase()).filter(Boolean));
      const usedExt = new Set(existingUsers.map(r => r.external_id).filter(v => v !== null && v !== ''));
      const fileEmails = new Set();
      const fileExt = new Set();
      const isSuper = req.user && req.user.role === 'SUPER_ADMIN';
      const keptRows = [];
      for (const vr of validRows) {
        const email = String(vr.fixedData.email || '').trim().toLowerCase();
        const ext = String(vr.fixedData.external_id || '').trim();
        const role = String(vr.fixedData.role || 'CTV').toUpperCase();
        const rowErrors = [];
        if (email) {
          if (usedEmails.has(email) || fileEmails.has(email)) rowErrors.push(`Email "${vr.fixedData.email}" đã tồn tại, không cho import`);
          else fileEmails.add(email);
        }
        if (ext) {
          if (usedExt.has(ext) || fileExt.has(ext)) rowErrors.push(`Mã ngoài "${ext}" đã tồn tại, không cho import`);
          else fileExt.add(ext);
        }
        if (role === 'SUPER_ADMIN' && !isSuper) rowErrors.push('Không được import tài khoản Super Admin');
        if (rowErrors.length > 0) { errors.push({ row: vr.rowNumber, errors: rowErrors }); continue; }
        keptRows.push(vr);
      }
      validRows.length = 0;
      validRows.push(...keptRows);
    }

    if (entity === 'stations' || entity === 'station_proposals') {
      const keptRows = [];
      for (const vr of validRows) {
        const province = vr.dynamicData.province;
        if (province !== undefined && province !== null && String(province).trim() !== '') {
          try {
            const found = await dataListService.getDiaGioiByTenTinh(province);
            if (!found) {
              errors.push({ row: vr.rowNumber, errors: [`Tỉnh/Thành phố "${province}" không có trong danh mục`] });
              continue;
            }
          } catch { /* silent */ }
        }
        keptRows.push(vr);
      }
      validRows.length = 0;
      validRows.push(...keptRows);
    }

    res.json({
      success: true,
      data: {
        viewId: view.id,
        viewName: view.name,
        viewUsage: view.usage,
        detection,
        columns: columns.map(c => ({ key: c.key, label: c.label, type: c.type })),
        totalRows: validRows.length + errors.length,
        validRows: validRows.length,
        errorRows: errors.length,
        warningRows: previewWarnings.length,
        rows: validRows,
        errors,
        warnings: previewWarnings
      }
    });
  } catch (error) {
    console.error('Import preview dynamic error:', error);
    res.status(500).json({ success: false, message: 'Lỗi đọc file Excel. Vui lòng kiểm tra lại định dạng file.' });
  }
};

exports.importConfirmDynamic = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { entity, rows, viewId, jobId } = req.body;
    const skipGeocode = req.body.geocode === false || String(req.body.geocode).toLowerCase() === 'false' || String(req.body.geocode) === '0';
    const checkDuplicate = req.body.checkDuplicate !== false;
    const checkIntraFile = req.body.checkIntraFile !== false;
    const job = registerImportJob(jobId, Array.isArray(rows) ? rows.length : 0);

    if (!entity || !ENTITY_TABLE_MAP[entity]) {
      return res.status(400).json({ success: false, message: 'Entity không hợp lệ' });
    }

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Không có dữ liệu để import' });
    }

    const confirmView = viewId ? await resolveView(entity, Number(viewId), null) : null;

    const table = ENTITY_TABLE_MAP[entity];
    await connection.beginTransaction();

    let importSupplementDays = 7;
    if (entity === 'station_proposals') {
      try {
        const [cfgRows] = await connection.query("SELECT `value` FROM proposal_lifecycle_configs WHERE `key` = 'review_supplement_days' LIMIT 1");
        importSupplementDays = Math.max(1, Number((cfgRows[0] || {}).value) || 7);
      } catch { /* silent */ }
    }

    const dynamicEngineService = require('./dynamicEngineService');
    const [allDefs] = await connection.query(
      'SELECT `key`, formula_config FROM field_definitions WHERE entity = ? AND status = \'active\'',
      [entity]
    );
    let confirmTableDefs = [];
    try {
      const [tDefs] = await connection.query(
        "SELECT `key`, label, source_config FROM field_definitions WHERE entity = ? AND type = 'table' AND source_type = 'json' AND status = 'active'",
        [entity]
      );
      confirmTableDefs = (tDefs || []).map(r => ({ key: r.key, label: r.label, type: 'table', source_type: 'json', source_config: r.source_config }));
    } catch { /* silent */ }
    const postFormulaKeys = new Set(
      allDefs.filter(f => {
        if (!f.formula_config) return false;
        try {
          const fc = typeof f.formula_config === 'string' ? JSON.parse(f.formula_config) : f.formula_config;
          return fc.compute_mode === 'post';
        } catch { return false; }
      }).map(f => f.key)
    );
    const keepProvidedPost = entity === 'stations' ? new Set(['ma_tram', 'loai_uu_tien']) : new Set();

    let imported = 0;
    let failed = 0;
    const failDetails = [];
    const confirmWarnDetails = [];
    let defaultUserPasswordHash = null;
    const insertedCoords = [];
    const usedCodes = new Set();
    if (entity === 'stations') {
      const [existing] = await connection.query(
        `SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.ma_tram')) AS code FROM stations WHERE JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.ma_tram')) IS NOT NULL`
      );
      existing.forEach(r => { if (r.code) usedCodes.add(r.code); });
    }

    for (const row of rows) {
      try {
        const fixedData = row.fixedData || {};
        const dynamicData = row.dynamicData || {};
        try {
          const priceFlags = await dynamicUtils.resolveTablePrices({ ...fixedData, ...dynamicData }, dynamicData, confirmTableDefs);
          if (priceFlags.length > 0) confirmWarnDetails.push({ row: row.rowNumber || '?', warnings: priceFlags });
        } catch { /* silent */ }
        const keptPost = {};
        postFormulaKeys.forEach(k => {
          if (keepProvidedPost.has(k) && dynamicData[k] !== undefined && dynamicData[k] !== null && dynamicData[k] !== '') {
            keptPost[k] = dynamicData[k];
          }
          delete dynamicData[k];
        });
        if (entity === 'stations' && keptPost.loai_uu_tien !== undefined) {
          const n = Number(keptPost.loai_uu_tien);
          if (n !== 1 && n !== 2) throw new Error(`Loại ưu tiên không hợp lệ "${keptPost.loai_uu_tien}" (chấp nhận 1 hoặc 2)`);
          keptPost.loai_uu_tien = n;
        }

        if (entity === 'stations' || entity === 'station_proposals') {
          const coordErr = validateLatitude(fixedData.latitude) || validateLongitude(fixedData.longitude);
          if (coordErr) throw new Error(coordErr);
        }
        if (entity === 'station_proposals' || entity === 'stations') {
          const lat = parseFloat(fixedData.latitude);
          const lng = parseFloat(fixedData.longitude);
          const rowWarns = [];
          if (checkDuplicate) {
            const opts = entity === 'stations' ? { kinds: ['station'] } : {};
            const nearby = await proximityService.checkNearby(lat, lng, 200, null, opts);
            if (nearby.is_duplicate) {
              const n = nearby.nearest;
              const who = n.kind === 'station' ? 'trạm' : 'đề xuất';
              const label = n.name ? ` "${n.name}"` : (n.code ? ` "${n.code}"` : '');
              rowWarns.push(`Vị trí gần với ${who} #${n.id}${label} (cách ${n.distance_m}m < 200m)`);
            }
          }
          if (checkIntraFile) {
            for (const c of insertedCoords) {
              if (proximityService.haversineM(lat, lng, c.lat, c.lng) < 200) {
                rowWarns.push(`Vị trí gần với dòng ${c.row} trong cùng file import (< 200m)`);
                break;
              }
            }
          }
          if (rowWarns.length > 0) confirmWarnDetails.push({ row: row.rowNumber || '?', warnings: rowWarns });
          insertedCoords.push({ lat, lng, row: row.rowNumber });
        }
        if (entity === 'stations') {
          const code = dynamicData.ma_tram;
          if (code) {
            const [dup] = await connection.query(
              `SELECT id FROM stations WHERE JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.ma_tram')) = ? LIMIT 1`,
              [code]
            );
            if (dup.length > 0 || usedCodes.has(code)) throw new Error(`Mã trạm "${code}" đã tồn tại, không cho import`);
            usedCodes.add(code);
          }
        }
        if (entity === 'users') {
          const uErr = validateRequired(fixedData.full_name, 'Họ tên') || validateEmail(fixedData.email);
          if (uErr) throw new Error(uErr);
        }

        if (entity === 'station_proposals' || entity === 'stations') {
          if (!skipGeocode && process.env.GEOCODE_ON_IMPORT !== 'false') {
            await addressEnrichment.enrichDynamicData({ dynamicData, fixedData }).catch(() => {});
          }
          const provinceEmpty = !dynamicData.province || String(dynamicData.province).trim() === '';
          if (provinceEmpty && !dynamicData.ma_tinh) {
            await addressEnrichment.extractProvinceFromAddress({ dynamicData, fixedData }).catch(() => {});
          }
          if (dynamicData.province && String(dynamicData.province).trim() !== '') {
            await dataListService.applyDiaGioi(dynamicData);
          } else if (!dynamicData.ma_tinh) {
            console.warn(`[Import] Dòng ${row.rowNumber}: Không xác định được tỉnh/thành từ toạ độ và địa chỉ. Import bỏ qua.`);
          }
        }

        if (entity === 'station_proposals' && req.user && req.user.id) {
          fixedData.user_id = req.user.id;
          const proposalFieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
          await dynamicUtils.applyAutoUserFields(dynamicData, proposalFieldDefs, req.user.id, connection);
        }

        if (entity === 'users') {
          if (fixedData.password && String(fixedData.password).trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            fixedData.password = await bcrypt.hash(String(fixedData.password), salt);
          } else {
            if (!defaultUserPasswordHash) {
              const salt = await bcrypt.genSalt(10);
              defaultUserPasswordHash = await bcrypt.hash('123456', salt);
            }
            fixedData.password = defaultUserPasswordHash;
          }
          if (!fixedData.role) fixedData.role = 'CTV';
          if (!fixedData.status) fixedData.status = 'ACTIVE';
          if (fixedData.role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
            throw new Error('Không được import tài khoản Super Admin');
          }
          // external_id rong -> NULL (cot UNIQUE, nhieu ban ghi rong se vi pham unique)
          if (fixedData.external_id !== undefined && String(fixedData.external_id).trim() === '') {
            delete fixedData.external_id;
          }
        }

        // Cột NOT NULL không default: template/view excel_basic có thể thiếu cột
        // (preview vẫn hợp lệ vì chỉ required cột có trong file) → INSERT thiếu cột
        // sẽ lỗi MySQL 1364 "doesn't have a default value". Default '' như proposalService.
        if (entity === 'station_proposals') {
          if (fixedData.owner_name == null) fixedData.owner_name = '';
          if (fixedData.owner_phone == null) fixedData.owner_phone = '';
        }
        if (entity === 'stations') {
          if (fixedData.name == null) fixedData.name = '';
        }

        const fixedCols = Object.keys(fixedData);
        const fixedValues = Object.values(fixedData);

        if (fixedCols.length === 0) {
          failed++;
          failDetails.push({ row: row.rowNumber || '?', error: 'Không có dữ liệu cột cố định' });
          continue;
        }

        const placeholders = fixedCols.map(() => '?').join(', ');
        const [result] = await connection.query(
          `INSERT INTO ${table} (${fixedCols.join(', ')}) VALUES (${placeholders})`,
          fixedValues
        );
        if (entity === 'station_proposals') {
          await connection.query(
            'UPDATE station_proposals SET supplement_deadline_at = DATE_ADD(NOW(), INTERVAL ? DAY) WHERE id = ?',
            [importSupplementDays, result.insertId]
          );
        }

        const postResults = await dynamicEngineService.computePostFormulas(entity, result.insertId, dynamicData, req.user ? req.user.id : null, null, { connection, excludeKeys: Object.keys(keptPost) });
        const mergedDynamic = { ...dynamicData, ...postResults, ...keptPost };
        if (Object.keys(mergedDynamic).length > 0) {
          await connection.query(
            `UPDATE ${table} SET custom_data = ? WHERE id = ?`,
            [JSON.stringify(mergedDynamic), result.insertId]
          );
        }

        imported++;
      } catch (err) {
        failed++;
        failDetails.push({ row: row.rowNumber || '?', error: err.message });
      }
      if (job) { job.done++; job.ts = Date.now(); }
    }

    if (failed > 0) {
      await connection.rollback();
      if (job) { job.status = 'failed'; job.ts = Date.now(); }
      return res.status(400).json({
        success: false,
        message: `Import thất bại: ${failed} dòng lỗi. Tất cả đã được hoàn tác.`,
        data: { imported: 0, failed, failDetails }
      });
    }

    if (entity === 'stations') {
      const [codeRows] = await connection.query(
        `SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.ma_tram')) AS code FROM stations WHERE JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.ma_tram')) IS NOT NULL`
      );
      const maxByPrefix = {};
      const formulaService = require('./formulaService');
      for (const r of codeRows) {
        const parsed = formulaService.parseCodeToSeq(r.code);
        if (!parsed) continue;
        maxByPrefix[parsed.prefix] = Math.max(maxByPrefix[parsed.prefix] || 0, parsed.num);
      }
      for (const [prefix, max] of Object.entries(maxByPrefix)) {
        await connection.query(
          'INSERT INTO proposal_sequences (prefix, last_number) VALUES (?, ?) ON DUPLICATE KEY UPDATE last_number = GREATEST(last_number, VALUES(last_number))',
          [prefix, max]
        );
      }
    }

    await connection.commit();
    if (job) { job.status = 'done'; job.ts = Date.now(); }

    res.json({
      success: true,
      data: { imported, failed: 0, failDetails: [], warnDetails: confirmWarnDetails, viewId: confirmView ? confirmView.id : null, viewUsage: confirmView ? confirmView.usage : null },
      message: `Import thành công: ${imported} bản ghi`
    });
  } catch (error) {
    await connection.rollback();
    console.error('Import confirm dynamic error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  } finally {
    connection.release();
  }
};

exports.getTemplateDynamic = async (req, res) => {
  try {
    const { entity } = req.query;
    if (!entity || !ENTITY_TABLE_MAP[entity]) {
      return res.status(400).json({ success: false, message: 'Entity không hợp lệ' });
    }

    const views = await resolveExportViews(entity, req.query);
    if (views.length === 0) {
      return res.status(400).json({ success: false, message: 'Chưa có view cho entity này' });
    }

    const workbook = new ExcelJS.Workbook();
    const multi = views.length > 1;
    const usedNames = new Set();

    for (const view of views) {
      const fieldDefs = await getFieldDefsForView(entity, view);
      const columns = buildImportColumns(entity, fieldDefs);

      const sheet = workbook.addWorksheet(multi ? safeSheetName(view.name, usedNames) : entity);

      sheet.addRow(columns.map(c => c.label));
      styleHeaderRow(sheet);

      const sampleRow = sheet.addRow(columns.map(c => getSampleValue(c)));
      columns.forEach((c, idx) => {
        if (c.type === 'formula' && c.computeMode === 'post') {
          sampleRow.getCell(idx + 1).note = 'Bỏ trống - hệ thống tự sinh sau khi lưu';
        }
        if (entity === 'station_proposals' && (c.key === 'ma_tinh' || c.key === 'vung_mien')) {
          sampleRow.getCell(idx + 1).note = 'Bỏ trống - hệ thống tự suy từ Tỉnh thành';
        }
      });

      autoWidthColumns(sheet, columns);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${buildFileName(entity, 'template', views, false)}`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Get template dynamic error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.exportStations = async (req, res) => {
  req.query.entity = 'stations';
  return exports.exportDynamic(req, res);
};

exports.exportProposals = async (req, res) => {
  req.query.entity = 'station_proposals';
  if (req.user.role === 'SALES') {
    const [rows] = await pool.query('SELECT id FROM users WHERE id = ? OR parent_id = ?', [req.user.id, req.user.id]);
    req.query.scopeBranchUserIds = rows.map(r => r.id).join(',');
  }
  return exports.exportDynamic(req, res);
};

exports.exportUsers = async (req, res) => {
  req.query.entity = 'users';
  return exports.exportDynamic(req, res);
};

exports.getTemplate = async (req, res) => {
  if (!req.query.entity) req.query.entity = 'stations';
  return exports.getTemplateDynamic(req, res);
};

exports.importPreview = async (req, res) => {
  if (!req.query.entity) req.query.entity = 'stations';
  return exports.importPreviewDynamic(req, res);
};

exports.importConfirm = async (req, res) => {
  return exports.importConfirmDynamic(req, res);
};

exports.exportDataList = async (req, res) => {
  try {
    const { id } = req.params;
    const list = await dataListService.getById(id);
    if (!list) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy data list' });
    }

    const columnsConfig = Array.isArray(list.columns_config) ? list.columns_config : JSON.parse(list.columns_config || '[]');
    const columns = [
      { key: '_stt', label: 'STT', type: 'number' },
      ...columnsConfig.map(c => ({ key: c.key, label: c.label, type: c.type }))
    ];

    const rows = list.rows || [];

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(list.name || 'Data List');

    sheet.addRow(columns.map(c => c.label));
    styleHeaderRow(sheet);

    rows.forEach((row, idx) => {
      const data = row.data || {};
      const values = columns.map(col => {
        if (col.key === '_stt') return idx + 1;
        return data[col.key] != null ? data[col.key] : '';
      });
      sheet.addRow(values);
    });

    autoWidthColumns(sheet, columns);

    const safeName = (list.name || 'data_list').replace(/[^a-zA-Z0-9_\-]/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileStamp()}_${safeName}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export data list error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.importDataListPreview = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn file Excel' });
    }

    const { id } = req.params;
    const list = await dataListService.getById(id);
    if (!list) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy data list' });
    }

    const columnsConfig = Array.isArray(list.columns_config) ? list.columns_config : JSON.parse(list.columns_config || '[]');
    const columns = [
      { key: '_stt', label: 'STT', type: 'number' },
      ...columnsConfig
    ];

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const sheet = workbook.worksheets[0];

    if (!sheet || sheet.rowCount < 2) {
      return res.status(400).json({ success: false, message: 'File Excel trống hoặc không có dữ liệu' });
    }

    const headerErrors = validateHeaders(sheet.getRow(1), columns);
    if (headerErrors.length > 0) {
      return res.status(400).json({ success: false, message: `Lỗi header: ${headerErrors.join('; ')}` });
    }

    const headerMap = buildHeaderMap(sheet.getRow(1), columns);
    const byKey = {};
    columns.forEach(c => { byKey[c.key] = c; });

    const validRows = [];
    const errors = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const isEmpty = row.values.every((v, i) => i === 0 || v == null || v === '');
      if (isEmpty) return;

      const rowErrors = [];
      const rowData = {};

      const valueByKey = {};
      Object.entries(headerMap).forEach(([colNumber, key]) => {
        const cell = row.getCell(Number(colNumber));
        valueByKey[key] = cell ? cell.value : '';
      });

      columns.forEach((col) => {
        if (col.key === '_stt') return;

        let raw = Object.prototype.hasOwnProperty.call(valueByKey, col.key) ? valueByKey[col.key] : '';
        if (raw && typeof raw === 'object' && raw.result !== undefined) raw = raw.result;
        let value;
        if (raw == null || raw === '') value = '';
        else if (typeof raw === 'number') value = raw;
        else if (raw instanceof Date) value = raw.toISOString().split('T')[0];
        else value = String(raw).trim();

        if (col.type === 'number' && value !== '') {
          const num = parseFloat(value);
          if (isNaN(num)) {
            rowErrors.push(`${col.label}: phải là số (${value})`);
          } else {
            rowData[col.key] = num;
          }
        } else {
          rowData[col.key] = value;
        }
      });

      if (rowErrors.length > 0) {
        errors.push({ row: rowNumber, errors: rowErrors });
      } else {
        validRows.push({ rowNumber, data: rowData });
      }
    });

    res.json({
      success: true,
      data: {
        columns: columns.map(c => ({ key: c.key, label: c.label, type: c.type })),
        totalRows: validRows.length + errors.length,
        validRows: validRows.length,
        errorRows: errors.length,
        rows: validRows,
        errors
      }
    });
  } catch (error) {
    console.error('Import data list preview error:', error);
    res.status(500).json({ success: false, message: 'Lỗi đọc file Excel' });
  }
};

exports.importDataListConfirm = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = req.body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Không có dữ liệu để import' });
    }

    const list = await dataListService.getById(id);
    if (!list) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy data list' });
    }

    const insertRows = rows.map((row, idx) => ({
      data: row.data || {},
      sort_order: idx
    }));

    await dataListService.addRows(id, insertRows);

    res.json({
      success: true,
      data: { imported: rows.length },
      message: `Import thành công: ${rows.length} dòng`
    });
  } catch (error) {
    console.error('Import data list confirm error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
