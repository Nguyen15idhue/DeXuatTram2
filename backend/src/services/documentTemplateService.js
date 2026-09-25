const pool = require('../utils/db');
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const mammoth = require('mammoth');
const documentFormula = require('./documentFormula');

const parseJson = (v, fb) => {
  if (!v) return fb;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fb; }
};

const MODELS = ['TDT', 'NQ', 'LK'];

const normalizePartsCfg = (cfg) => {
  if (Array.isArray(cfg.parts) && cfg.parts.length) {
    return cfg.parts.map((p) => {
      if (!p || typeof p !== 'object') return null;
      if (p.kind) return p;
      if (p.table) return { ...p, kind: 'table' };
      if (p.listId) return { ...p, kind: 'datalist' };
      return null;
    }).filter(Boolean);
  }
  if (cfg.source === 'field' && cfg.table) return [{ kind: 'table', table: cfg.table, columns: cfg.columns || {} }];
  if (cfg.source === 'datalist' && cfg.listId) return [{ kind: 'datalist', listId: cfg.listId, columns: cfg.columns || {} }];
  return [];
};

exports.listTemplates = async () => {
  const [rows] = await pool.query(
    `SELECT t.id, t.name, t.entity, t.model, t.file_id, t.mapping, t.status, t.is_default,
            t.created_at, t.updated_at, f.original_name AS file_name, f.mime_type AS file_mime
     FROM document_templates t LEFT JOIN files f ON f.id = t.file_id
     ORDER BY t.is_default DESC, t.id ASC`
  );
  return rows.map((r) => ({ ...r, mapping: parseJson(r.mapping, {}) }));
};

exports.getTemplate = async (id) => {
  const [rows] = await pool.query(
    `SELECT t.id, t.name, t.entity, t.model, t.file_id, t.mapping, t.status, t.is_default,
            t.created_at, t.updated_at, f.original_name AS file_name, f.mime_type AS file_mime
     FROM document_templates t LEFT JOIN files f ON f.id = t.file_id WHERE t.id = ?`,
    [id]
  );
  if (rows.length === 0) return null;
  return { ...rows[0], mapping: parseJson(rows[0].mapping, {}) };
};

const assertTemplateInput = (body, isCreate) => {
  const { name, entity, model, file_id, mapping, status, is_default } = body || {};
  if (isCreate && (!name || !String(name).trim())) {
    throw Object.assign(new Error('Thiếu tên template'), { statusCode: 400 });
  }
  if (model !== undefined && model !== null && model !== '' && !MODELS.includes(model)) {
    throw Object.assign(new Error('Model phải là TDT/NQ/LK'), { statusCode: 400 });
  }
  if (status !== undefined && !['active', 'inactive'].includes(status)) {
    throw Object.assign(new Error('Trạng thái không hợp lệ'), { statusCode: 400 });
  }
  if (mapping !== undefined && mapping !== null && typeof mapping !== 'object') {
    throw Object.assign(new Error('Mapping phải là object'), { statusCode: 400 });
  }
  return {
    name: name !== undefined ? String(name).trim() : undefined,
    entity: entity !== undefined ? (String(entity).trim() || 'station_proposals') : undefined,
    model: model === '' || model === undefined ? null : model,
    file_id: file_id === '' || file_id === undefined ? null : Number(file_id),
    mapping: mapping === undefined ? undefined : mapping,
    status,
    is_default: is_default === undefined ? undefined : (is_default ? 1 : 0),
  };
};

exports.createTemplate = async (body) => {
  const v = assertTemplateInput(body, true);
  if (v.file_id) await assertDocxFile(v.file_id);
  const [result] = await pool.query(
    'INSERT INTO document_templates (`name`, `entity`, `model`, `file_id`, `mapping`, `status`, `is_default`) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [v.name, v.entity || 'station_proposals', v.model, v.file_id, v.mapping ? JSON.stringify(v.mapping) : null, 'active', 0]
  );
  return exports.getTemplate(result.insertId);
};

exports.updateTemplate = async (id, body) => {
  const existing = await exports.getTemplate(id);
  if (!existing) throw Object.assign(new Error('Không tìm thấy template'), { statusCode: 404 });
  const v = assertTemplateInput(body || {}, false);
  const sets = [];
  const params = [];
  const push = (col, val) => { if (val !== undefined) { sets.push(`\`${col}\` = ?`); params.push(val); } };
  push('name', v.name);
  if (body.entity !== undefined) push('entity', v.entity);
  if (body.model !== undefined) push('model', v.model);
  if (body.file_id !== undefined) {
    if (v.file_id) await assertDocxFile(v.file_id);
    push('file_id', v.file_id);
  }
  if (v.mapping !== undefined) { sets.push('`mapping` = ?'); params.push(v.mapping ? JSON.stringify(v.mapping) : null); }
  push('status', v.status);
  push('is_default', v.is_default);
  if (sets.length > 0) {
    await pool.query(`UPDATE document_templates SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  }
  return exports.getTemplate(id);
};

exports.deleteTemplate = async (id) => {
  const [result] = await pool.query('DELETE FROM document_templates WHERE id = ?', [id]);
  return result.affectedRows > 0;
};

async function assertDocxFile(fileId) {
  const [rows] = await pool.query('SELECT id, mime_type, original_name, status FROM files WHERE id = ?', [fileId]);
  if (rows.length === 0) throw Object.assign(new Error('Không tìm thấy file'), { statusCode: 400 });
  const f = rows[0];
  if (f.status !== 'active') throw Object.assign(new Error('File đã bị xóa'), { statusCode: 400 });
  const mime = String(f.mime_type || '').toLowerCase();
  const name = String(f.original_name || '').toLowerCase();
  const ok = mime.includes('wordprocessingml') || name.endsWith('.docx');
  if (!ok) throw Object.assign(new Error('File template phải là .docx'), { statusCode: 400 });
}

exports.listConstants = async () => {
  const [rows] = await pool.query('SELECT id, `key`, label, `value`, group_name, updated_at FROM document_constants ORDER BY group_name, id');
  return rows;
};

exports.updateConstants = async (items) => {
  if (!Array.isArray(items)) throw Object.assign(new Error('items phải là array'), { statusCode: 400 });
  for (const it of items) {
    if (!it || !it.key || !String(it.key).trim()) throw Object.assign(new Error('Mỗi hằng số cần key'), { statusCode: 400 });
    await pool.query(
      'INSERT INTO document_constants (`key`, label, `value`, group_name) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE label = VALUES(label), `value` = VALUES(`value`), group_name = VALUES(group_name)',
      [String(it.key).trim(), it.label ? String(it.label) : String(it.key).trim(), it.value !== undefined && it.value !== null ? String(it.value) : null, it.group_name ? String(it.group_name) : null]
    );
  }
  return exports.listConstants();
};

exports.deleteConstant = async (key) => {
  if (!key || !String(key).trim()) throw Object.assign(new Error('Thiếu key hằng số'), { statusCode: 400 });
  const [result] = await pool.query('DELETE FROM document_constants WHERE `key` = ?', [String(key).trim()]);
  return result.affectedRows > 0;
};

exports.listDatalists = async () => {
  const [rows] = await pool.query('SELECT id, `name`, columns_config FROM data_lists ORDER BY `name`');
  return rows.map((r) => ({ id: r.id, name: r.name, columns: parseJson(r.columns_config, []) }));
};

const textOf = (frag) => [...frag.matchAll(/<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
  .map((m) => m[2]).join('').replace(/\s+/g, ' ').trim();

async function readDocxXml(fileId) {
  const [rows] = await pool.query('SELECT storage_key, mime_type, original_name, status FROM files WHERE id = ?', [fileId]);
  if (rows.length === 0) throw Object.assign(new Error('Không tìm thấy file'), { statusCode: 400 });
  if (rows[0].status !== 'active') throw Object.assign(new Error('File đã bị xóa'), { statusCode: 400 });
  const filePath = path.join(__dirname, '../../storage/uploads', rows[0].storage_key);
  if (!fs.existsSync(filePath)) throw Object.assign(new Error('File vật lý không tồn tại'), { statusCode: 400 });
  const zip = new PizZip(fs.readFileSync(filePath));
  const entry = zip.file('word/document.xml');
  if (!entry) throw Object.assign(new Error('File docx không hợp lệ'), { statusCode: 400 });
  return { xml: entry.asText(), zip };
}

exports.readDocxXml = readDocxXml;

const extractTokens = (xml) => {
  const paras = xml.match(/<w:p(\s[^>]*)?>[\s\S]*?<\/w:p>/g) || [];
  const out = [];
  const seen = new Set();
  paras.forEach((p, i) => {
    const runs = [...p.matchAll(/<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[2]);
    const t = runs.join('').replace(/\s+/g, ' ').trim();
    if (!t || !t.includes('{')) return;
    const toks = [...t.matchAll(/\{[#/]?[a-zA-Z0-9_.]+\}/g)].map((m) => m[0]);
    toks.forEach((tok) => {
      const key = `${i}:${tok}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        token: tok,
        kind: tok.startsWith('{#') ? 'loop_open' : (tok.startsWith('{/') ? 'loop_close' : 'scalar'),
        context: t.slice(0, 90),
        order: i,
        split: !runs.some((r) => r.includes(tok)),
      });
    });
  });
  return out;
};

exports.listTokens = async (templateId) => {
  const tpl = await exports.getTemplate(templateId);
  if (!tpl) throw Object.assign(new Error('Không tìm thấy template'), { statusCode: 404 });
  if (!tpl.file_id) throw Object.assign(new Error('Template chưa gắn file .docx'), { statusCode: 400 });
  const { xml } = await readDocxXml(tpl.file_id);
  return extractTokens(xml);
};

exports.previewBlank = async (templateId) => {
  const tpl = await exports.getTemplate(templateId);
  if (!tpl) throw Object.assign(new Error('Không tìm thấy template'), { statusCode: 404 });
  if (!tpl.file_id) throw Object.assign(new Error('Template chưa gắn file .docx'), { statusCode: 400 });
  const [rows] = await pool.query('SELECT storage_key, status FROM files WHERE id = ?', [tpl.file_id]);
  if (rows.length === 0 || rows[0].status !== 'active') throw Object.assign(new Error('File không khả dụng'), { statusCode: 400 });
  const filePath = path.join(__dirname, '../../storage/uploads', rows[0].storage_key);
  const result = await mammoth.convertToHtml({ path: filePath });
  return { html: result.value, messages: result.messages || [] };
};

const getTableColumns = async (entity, tableKey) => {
  const [rows] = await pool.query(
    "SELECT source_config FROM field_definitions WHERE entity = ? AND `key` = ? AND type = 'table' AND status = 'active' LIMIT 1",
    [entity, tableKey]
  );
  if (rows.length === 0) return null;
  const sc = parseJson(rows[0].source_config, {});
  return (sc.columns || []).map((c) => c.key).filter(Boolean);
};

exports.validateMapping = async (templateId, mapping) => {
  const tpl = await exports.getTemplate(templateId);
  if (!tpl) throw Object.assign(new Error('Không tìm thấy template'), { statusCode: 404 });
  const m = mapping || tpl.mapping || {};
  const errors = [];
  const tokens = (m.tokens && typeof m.tokens === 'object') ? m.tokens : {};
  const loops = (m.loops && typeof m.loops === 'object') ? m.loops : {};
  for (const [tok, src] of Object.entries(tokens)) {
    if (!src || typeof src !== 'object' || !src.source) { errors.push(`Token "${tok}" chưa gán nguồn`); continue; }
    if (!['field', 'const', 'datalist'].includes(src.source)) errors.push(`Token "${tok}" nguồn không hợp lệ`);
    if (src.source === 'datalist' && (!src.listId || !src.column)) errors.push(`Token "${tok}" thiếu listId/column`);
  }
  for (const [loopKey, cfg] of Object.entries(loops)) {
    if (!cfg || typeof cfg !== 'object') { errors.push(`Loop "${loopKey}" chưa cấu hình`); continue; }
    if (cfg.source === 'fixed') continue;
    const parts = normalizePartsCfg(cfg);
    if (!parts.length) {
      if (cfg.source === 'computed' && cfg.key === 'tdt_cost') {
        const cols = ['khoan_muc', 'so_luong', 'don_gia', 'thanh_tien'];
        (cfg.footers || []).forEach((f) => {
          const v = documentFormula.validate(f.formula, cols, null);
          if (!v.valid) errors.push(`Loop "${loopKey}" footer "${f.label || f.id}": ${v.error}`);
        });
        continue;
      }
      errors.push(`Loop "${loopKey}" chưa cấu hình nguồn`);
      continue;
    }
    const tokSet = new Set();
    for (const part of parts) {
      let realCols = [];
      let srcLabel;
      if (part.kind === 'datalist') {
        srcLabel = `danh mục #${part.listId}`;
        if (!part.listId) { errors.push(`Loop "${loopKey}" nhóm danh mục thiếu listId`); continue; }
        const [dl] = await pool.query('SELECT columns_config FROM data_lists WHERE id = ?', [part.listId]);
        if (dl.length === 0) { errors.push(`Loop "${loopKey}" không tìm thấy data list #${part.listId}`); continue; }
        realCols = (parseJson(dl[0].columns_config, []) || []).map((c) => c.key).filter(Boolean);
      } else {
        srcLabel = `bảng "${part.table}"`;
        if (!part.table) { errors.push(`Loop "${loopKey}" nhóm bảng thiếu table`); continue; }
        const cols = await getTableColumns(tpl.entity || 'station_proposals', part.table);
        if (!cols) { errors.push(`Loop "${loopKey}" không tìm thấy trường bảng "${part.table}"`); continue; }
        realCols = cols;
      }
      for (const [tokCol, srcCol] of Object.entries(part.columns || {})) {
        if (!srcCol) continue;
        tokSet.add(tokCol);
        if (!realCols.includes(srcCol)) errors.push(`Loop "${loopKey}" cột "${tokCol}" trỏ tới cột không tồn tại "${srcCol}" trong ${srcLabel}`);
      }
    }
    for (const [tok, src] of Object.entries(cfg.scalars || {})) {
      if (!src || typeof src !== 'object' || !src.source) { errors.push(`Loop "${loopKey}" ô "${tok}" chưa gán nguồn`); continue; }
      if (!['field', 'const', 'datalist'].includes(src.source)) errors.push(`Loop "${loopKey}" ô "${tok}" nguồn không hợp lệ`);
      if (src.source === 'datalist' && (!src.listId || !src.column)) errors.push(`Loop "${loopKey}" ô "${tok}" thiếu listId/column`);
      tokSet.add(tok);
    }
    for (const f of (cfg.footers || [])) {
      const v = documentFormula.validate(f.formula, [...tokSet], null);
      if (!v.valid) errors.push(`Loop "${loopKey}" footer "${f.label || f.id}": ${v.error}`);
    }
  }
  if (tpl.file_id) {
    try {
      const found = await exports.listTokens(templateId);
      const opens = found.filter((t) => t.kind === 'loop_open').map((t) => t.token.replace(/[{}#/]/g, ''));
      const closes = found.filter((t) => t.kind === 'loop_close').map((t) => t.token.replace(/[{}#/]/g, ''));
      opens.forEach((o) => { if (!closes.includes(o)) errors.push(`Loop "{#${o}}" thiếu "{/${o}}"`); });
      closes.forEach((c) => { if (!opens.includes(c)) errors.push(`Loop "{/${c}}" thiếu "{#${c}}"`); });
      found.filter((t) => t.split).forEach((t) => errors.push(`Token "${t.token}" bị split-run (nằm trên nhiều run)`));
      const boundNames = new Set(Object.keys(tokens));
      for (const [loopKey, cfg] of Object.entries(loops)) {
        boundNames.add(loopKey);
        boundNames.add('stt');
        normalizePartsCfg(cfg).forEach((part) => { Object.keys((part && part.columns) || {}).forEach((c) => boundNames.add(c)); });
        Object.keys(cfg.scalars || {}).forEach((c) => boundNames.add(c));
        (cfg.footers || []).forEach((f) => {
          boundNames.add(`${loopKey}_f_${f.id}_value`);
          boundNames.add(`${loopKey}_f_${f.id}_label`);
        });
      }
      for (const t of found) {
        const name = t.token.replace(/[{}#/]/g, '');
        if (!boundNames.has(name)) errors.push(`Token "${t.token}" trong file chưa được bind`);
      }
    } catch {}
  }
  return { valid: errors.length === 0, errors };
};
