const Docxtemplater = require('docxtemplater');
const JSZip = require('jszip');
const pool = require('../utils/db');
const dynamicUtils = require('./dynamicUtils');
const adminProposalService = require('./adminProposalService');
const adminUserService = require('./adminUserService');
const dataListService = require('./dataListService');
const documentFormula = require('./documentFormula');
const documentTemplateService = require('./documentTemplateService');

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const parseJson = (v, fb) => {
  if (!v) return fb;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fb; }
};

let fieldCache = null;
let fieldCacheTime = 0;
const getFieldMap = async () => {
  const now = Date.now();
  if (fieldCache && now - fieldCacheTime < 60000) return fieldCache;
  const defs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const map = {};
  (defs || []).forEach((d) => {
    const sc = parseJson(d.source_config, {});
    map[d.key] = { label: d.label || d.key, type: d.type || 'text', columns: sc.columns || [] };
  });
  fieldCache = map;
  fieldCacheTime = now;
  return map;
};
exports.clearCache = () => { fieldCache = null; fieldCacheTime = 0; };

const pad2 = (n) => String(n).padStart(2, '0');
const formatDateVal = (v, withTime) => {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return String(v);
  const s = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  return withTime ? `${s} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : s;
};

const formatNumberVal = (v) => {
  const n = Number(v);
  if (v === '' || v === null || v === undefined || isNaN(n)) return String(v ?? '');
  return n.toLocaleString('vi-VN');
};

const TABLE_FMTS = {
  plain: { separator: '', decimal: '.' },
  dot: { separator: '.', decimal: ',' },
  comma: { separator: ',', decimal: '.' },
  space: { separator: ' ', decimal: ',' },
};
const formatColNumber = (v, col) => {
  const num = Number(v);
  if (isNaN(num)) return String(v);
  const fmt = TABLE_FMTS[(col && col.display_format) || 'plain'] || TABLE_FMTS.plain;
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  const dec = col && col.decimal_places !== undefined && col.decimal_places !== null && col.decimal_places >= 0
    ? abs.toFixed(col.decimal_places).split('.') : null;
  let intPart;
  let decPart = '';
  if (dec) {
    intPart = dec[0];
    decPart = dec[1] || '';
  } else {
    const str = String(abs);
    const idx = str.indexOf('.');
    intPart = idx >= 0 ? str.substring(0, idx) : str;
    decPart = idx >= 0 ? str.substring(idx + 1) : '';
  }
  let out = sign + intPart.replace(/\B(?=(\d{3})+(?!\d))/g, fmt.separator);
  if (decPart) out += fmt.decimal + decPart;
  if (col && col.unit) out += ' ' + col.unit;
  return out;
};

const toNum = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(/\s/g, ''));
  return isNaN(n) ? null : n;
};

const resolveUserName = async (v, cache) => {
  const id = (v && typeof v === 'object') ? (v.id ?? v.user_id) : v;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return '';
  if (!cache.has(n)) {
    try {
      const u = await adminUserService.findById(n);
      cache.set(n, u ? u.full_name : '');
    } catch {
      cache.set(n, '');
    }
  }
  return cache.get(n) || '';
};

const formatScalar = async (key, value, fieldMap, userCache) => {
  if (value === null || value === undefined || value === '') return '';
  const def = fieldMap[key] || {};
  const type = def.type || 'text';
  if (type === 'user') return resolveUserName(value, userCache);
  if (type === 'date') return formatDateVal(value, false);
  if (type === 'datetime') return formatDateVal(value, true);
  if (type === 'number') return formatNumberVal(value);
  if (type === 'boolean') return value ? 'Có' : 'Không';
  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
      return value.map((r) => r.original_name || r.name || r.label || '').filter(Boolean).join(', ');
    }
    return value.map((x) => String(x)).join(', ');
  }
  if (typeof value === 'object') {
    if (typeof value.label === 'string' && value.label) return value.label;
    return '';
  }
  return String(value);
};

const getDatalist = async (ctx, listId) => {
  const id = Number(listId);
  if (!Number.isInteger(id) || id <= 0) return null;
  if (!ctx.dlCache.has(id)) {
    try {
      ctx.dlCache.set(id, await dataListService.getById(id));
    } catch {
      ctx.dlCache.set(id, null);
    }
  }
  return ctx.dlCache.get(id);
};

const applyFormat = (src, value) => {
  if (!src || !src.format || value === null || value === undefined || value === '') return value;
  if (src.format === 'number') return formatNumberVal(value);
  if (src.format === 'date') return formatDateVal(value, false);
  if (src.format === 'datetime') return formatDateVal(value, true);
  return value;
};

const resolveToken = async (src, ctx) => {
  if (!src || typeof src !== 'object') return '';
  if (src.source === 'const') return applyFormat(src, ctx.consts[src.key] ?? '');
  if (src.source === 'field') {
    const raw = ctx.proposal[src.key];
    if (src.format) {
      const def = ctx.fieldMap[src.key] || {};
      if (def.type === 'user') return resolveUserName(raw, ctx.userCache);
      if (raw === null || raw === undefined || raw === '') return '';
      return applyFormat(src, raw);
    }
    return formatScalar(src.key, raw, ctx.fieldMap, ctx.userCache);
  }
  if (src.source === 'datalist') {
    const list = await getDatalist(ctx, src.listId);
    if (!list) return '';
    const rows = list.rows || [];
    let row = null;
    if (src.match && src.match.column) {
      row = rows.find((r) => String((r.data || {})[src.match.column] ?? '') === String(src.match.value ?? ''));
    } else if (rows.length > 0) {
      row = rows[0];
    }
    if (!row) return '';
    const v = (row.data || {})[src.column];
    return applyFormat(src, v === null || v === undefined ? '' : String(v));
  }
  return '';
};

const tableColDefs = (ctx, tableKey) => {
  const def = ctx.fieldMap[tableKey];
  const map = {};
  ((def && def.columns) || []).forEach((c) => { map[c.key] = c; });
  return map;
};

const formatLoopCell = (raw, colDef) => {
  if (raw === null || raw === undefined || raw === '') return '';
  if (typeof raw === 'number' || (colDef && String(colDef.column_type || '').toLowerCase() === 'number')) {
    const n = toNum(raw);
    if (n !== null) return formatColNumber(n, colDef || {});
  }
  if (typeof raw === 'object') {
    if (typeof raw.label === 'string' && raw.label) return raw.label;
    return '';
  }
  return String(raw);
};

const buildTdtCost = (proposal) => {
  const rows = [];
  const tru = Array.isArray(proposal.tdt_tru) ? proposal.tdt_tru : [];
  const cp = Array.isArray(proposal.tdt_chi_phi_khac) ? proposal.tdt_chi_phi_khac : [];
  tru.forEach((r) => rows.push({
    khoan_muc: r.loai_tru ?? '', so_luong: r.so_luong ?? '', don_gia: r.don_gia ?? '', thanh_tien: r.thanh_tien ?? '',
  }));
  cp.forEach((r) => rows.push({
    khoan_muc: r.loai_chi_phi ?? '', so_luong: '', don_gia: '', thanh_tien: r.so_tien ?? '',
  }));
  return rows;
};

const normalizeParts = (cfg) => {
  if (Array.isArray(cfg.parts) && cfg.parts.length) {
    return cfg.parts.map((p) => {
      if (!p || typeof p !== 'object') return null;
      if (p.kind) return p;
      if (p.table) return { ...p, kind: 'table' };
      if (p.listId) return { ...p, kind: 'datalist' };
      return null;
    }).filter(Boolean);
  }
  if (cfg.source === 'field' && cfg.table) {
    return [{ kind: 'table', table: cfg.table, columns: { ...(cfg.columns || {}) } }];
  }
  if (cfg.source === 'datalist' && cfg.listId) {
    return [{ kind: 'datalist', listId: cfg.listId, columns: { ...(cfg.columns || {}) } }];
  }
  return [];
};

const partRows = async (ctx, part) => {
  if (part.kind === 'datalist') {
    const dl = await getDatalist(ctx, part.listId);
    const rows = ((dl && dl.rows) || []).map((r) => r.data || {});
    const defs = {};
    (((dl && (dl.columns_config || dl.columns)) || [])).forEach((c) => { defs[c.key] = c; });
    return { rows, defs };
  }
  const arr = ctx.proposal[part.table];
  return { rows: (Array.isArray(arr) ? arr : []).map((r) => ({ ...(r || {}) })), defs: tableColDefs(ctx, part.table) };
};

const buildLoop = async (cfg, ctx) => {
  const scalars = (cfg.scalars && typeof cfg.scalars === 'object') ? cfg.scalars : {};
  const parts = normalizeParts(cfg);
  const raws = [];
  const rowDefs = [];
  let legacy = false;

  if (parts.length) {
    for (const part of parts) {
      const { rows, defs } = await partRows(ctx, part);
      for (const r of rows) {
        const o = {};
        const d = {};
        for (const [tok, srcCol] of Object.entries(part.columns || {})) {
          if (!srcCol) continue;
          o[tok] = r[srcCol];
          if (defs[srcCol]) d[tok] = defs[srcCol];
        }
        raws.push(o);
        rowDefs.push(d);
      }
    }
  } else if (cfg.source === 'computed' && cfg.key === 'tdt_cost') {
    legacy = true;
    buildTdtCost(ctx.proposal).forEach((r) => { raws.push(r); rowDefs.push({}); });
  }

  const scalarVals = {};
  for (const [tok, src] of Object.entries(scalars)) {
    scalarVals[tok] = await resolveToken(src, ctx);
  }

  const tokenSet = new Set();
  raws.forEach((r) => Object.keys(r).forEach((k) => tokenSet.add(k)));
  Object.keys(scalarVals).forEach((k) => tokenSet.add(k));
  const tokens = [...tokenSet];

  const display = raws.map((r, i) => {
    const o = { stt: i + 1 };
    tokens.forEach((t) => {
      const raw = r[t];
      if ((raw === null || raw === undefined || raw === '') && scalarVals[t] !== undefined) {
        o[t] = scalarVals[t];
        return;
      }
      o[t] = formatLoopCell(raw, rowDefs[i] && rowDefs[i][t]);
    });
    return o;
  });

  return { display, raws, rowDefs, scalarVals, tokens, computed: parts.length > 0 || legacy };
};

const computeFooters = (loopKey, cfg, raws, scalarVals) => {
  const out = {};
  const tokens = new Set();
  raws.forEach((r) => Object.keys(r).forEach((t) => tokens.add(t)));
  Object.keys(scalarVals || {}).forEach((t) => tokens.add(t));
  for (const f of (cfg.footers || [])) {
    const aggs = {};
    tokens.forEach((t) => {
      aggs[t] = documentFormula.columnAggregates(raws, (r) => {
        const v = (r && r[t] !== undefined && r[t] !== null && r[t] !== '') ? r[t] : (scalarVals || {})[t];
        return toNum(v);
      });
    });
    let val = '';
    try {
      val = documentFormula.evaluate(f.formula, aggs, null);
    } catch {
      val = '#ERR';
    }
    out[`${loopKey}_f_${f.id}_value`] = typeof val === 'number' && isFinite(val) ? formatNumberVal(val) : String(val ?? '');
    out[`${loopKey}_f_${f.id}_label`] = f.label || '';
  }
  return out;
};

const loadConsts = async () => {
  const [rows] = await pool.query('SELECT `key`, `value` FROM document_constants');
  const map = {};
  rows.forEach((r) => { map[r.key] = r.value ?? ''; });
  return map;
};

const buildData = async (proposal, mapping) => {
  const fieldMap = await getFieldMap();
  const consts = await loadConsts();
  const ctx = { proposal, fieldMap, consts, userCache: new Map(), dlCache: new Map() };
  const data = {};
  const loopInfos = {};
  for (const [tok, src] of Object.entries((mapping && mapping.tokens) || {})) {
    data[tok] = await resolveToken(src, ctx);
  }
  for (const [loopKey, cfg] of Object.entries((mapping && mapping.loops) || {})) {
    if (!cfg || typeof cfg !== 'object') { data[loopKey] = []; loopInfos[loopKey] = { count: 0 }; continue; }
    const { display, raws, scalarVals } = await buildLoop(cfg, ctx);
    data[loopKey] = display;
    loopInfos[loopKey] = { count: display.length };
    Object.assign(data, computeFooters(loopKey, cfg, raws, scalarVals));
  }
  return { data, loopInfos };
};

const stripEmptyLoopRow = (zip, loopKey) => {
  const entry = zip.file('word/document.xml');
  if (!entry) return;
  const xml = entry.asText();
  const rows = xml.match(/<w:tr(\s[^>]*)?>[\s\S]*?<\/w:tr>/g) || [];
  for (const r of rows) {
    if (r.includes(`{#${loopKey}}`)) {
      zip.file('word/document.xml', xml.replace(r, () => ''));
      return;
    }
  }
};

const resolveTemplate = async (model, templateId) => {
  if (templateId) {
    const [rows] = await pool.query(
      "SELECT id, `name`, entity, model, file_id, mapping, status FROM document_templates WHERE id = ? AND entity = 'station_proposals' AND status = 'active' LIMIT 1",
      [templateId]
    );
    if (rows.length === 0 || !rows[0].file_id) {
      throw Object.assign(new Error('Template không khả dụng'), { statusCode: 400 });
    }
    rows[0].mapping = parseJson(rows[0].mapping, {});
    return rows[0];
  }
  const [rows] = await pool.query(
    `SELECT id, \`name\`, entity, model, file_id, mapping, status FROM document_templates
     WHERE entity = 'station_proposals' AND status = 'active' AND (model = ? OR model IS NULL)
     ORDER BY CASE WHEN model = ? THEN 0 ELSE 1 END, is_default DESC, id ASC LIMIT 1`,
    [model, model]
  );
  if (rows.length === 0 || !rows[0].file_id) {
    throw Object.assign(new Error(`Chưa cấu hình template cho mô hình ${model || '(trống)'}`), { statusCode: 400 });
  }
  rows[0].mapping = parseJson(rows[0].mapping, {});
  return rows[0];
};

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

const safeName = (s, fallback) => {
  const v = String(s || '').replace(/[\\/:"*?<>|]/g, '-').replace(/\s+/g, ' ').trim();
  return v || fallback;
};

exports.exportReports = async (proposalIds, opts = {}) => {
  const warnings = [];
  const skipped = [];
  const results = [];
  const fail = (pid, reason) => {
    warnings.push({ proposalId: pid, reason });
    skipped.push(pid);
  };
  for (const pid of proposalIds) {
    const rec = await adminProposalService.getProposalWithUser(pid);
    if (!rec) { fail(pid, 'không tìm thấy'); continue; }
    const model = rec.mo_hinh_dau_tu || '';
    if (model === 'NQ_LK') { fail(pid, 'chưa hỗ trợ mô hình NQ_LK'); continue; }
    // TODO(P58-L2): chỉ cho xuất khi status=Duyệt chủ trương
    let tpl;
    try {
      tpl = await resolveTemplate(model, opts.templateId);
    } catch (e) {
      fail(pid, e.message || 'không có template');
      continue;
    }
    const mapping = tpl.mapping || {};
    const { data, loopInfos } = await buildData(rec, mapping);
    const { zip } = await documentTemplateService.readDocxXml(tpl.file_id);
    for (const [loopKey, cfg] of Object.entries(mapping.loops || {})) {
      if (cfg && cfg.render && cfg.render.empty === 'hide' && (loopInfos[loopKey] || { count: 0 }).count === 0) {
        stripEmptyLoopRow(zip, loopKey);
      }
    }
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
    try {
      doc.render(data);
    } catch (e) {
      const details = e && e.properties && Array.isArray(e.properties.errors)
        ? e.properties.errors.map((x) => x.message || String(x)).join('; ')
        : (e && e.message) || 'Lỗi render';
      fail(pid, details);
      continue;
    }
    const buffer = doc.getZip().generate({ type: 'nodebuffer' });
    const code = rec.ma_de_xuat || rec.ma_de_xuat_gen || `#${rec.id}`;
    results.push({ proposalId: pid, code, buffer });
  }
  if (results.length === 0) {
    const err = new Error(`Không có đề xuất nào xuất được${warnings.length ? ': ' + warnings.map((w) => `#${w.proposalId} ${w.reason}`).join('; ') : ''}`);
    err.statusCode = 400;
    err.details = { generated: 0, skipped, warnings };
    throw err;
  }
  if (results.length === 1) {
    const r = results[0];
    return { kind: 'docx', buffer: r.buffer, filename: `${stamp()}_báo cáo đề xuất_${safeName(r.code, `de-xuat-${r.proposalId}`)}.docx`, contentType: DOCX_MIME, warnings, skipped };
  }
  const zip = new JSZip();
  results.forEach((r) => zip.file(`${stamp()}_báo cáo đề xuất_${safeName(r.code, `de-xuat-${r.proposalId}`)}.docx`, r.buffer));
  return { kind: 'zip', buffer: await zip.generateAsync({ type: 'nodebuffer' }), filename: `${stamp()}_báo cáo đề xuất.zip`, contentType: 'application/zip', warnings, skipped };
};
