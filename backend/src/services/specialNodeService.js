const pool = require('../utils/db');
const ttlCache = require('../utils/ttlCache');

const CACHE_KEY = 'specialnodes:all';
const CACHE_TTL_MS = 60 * 1000;

const CUSTOM_KEY_RE = /^custom_[a-z0-9_]+$/;
const FIELD_KEY_RE = /^[a-z0-9_]+$/;
const FIELD_KINDS = new Set(['static', 'node', 'process', 'contact']);

const parseJson = (v, fallback) => {
  if (v === undefined || v === null) return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fallback; }
};

const normList = (v) => {
  if (v === undefined || v === null) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.map((x) => String(x ?? '').trim()).filter(Boolean);
};

const validateFields = (fields) => {
  if (fields === undefined || fields === null) return [];
  if (!Array.isArray(fields)) {
    throw Object.assign(new Error('fields phải là mảng'), { statusCode: 400 });
  }
  return fields.map((f, i) => {
    if (!f || typeof f !== 'object') throw Object.assign(new Error(`Trường #${i + 1} không hợp lệ`), { statusCode: 400 });
    const key = String(f.key || '').trim();
    const label = String(f.label || '').trim();
    const kind = String(f.kind || 'static').trim();
    if (!FIELD_KEY_RE.test(key)) throw Object.assign(new Error(`Key trường "${key}" chỉ gồm chữ thường, số, gạch dưới`), { statusCode: 400 });
    if (!label) throw Object.assign(new Error(`Trường "${key}" thiếu nhãn`), { statusCode: 400 });
    if (!FIELD_KINDS.has(kind)) throw Object.assign(new Error(`Loại trường "${kind}" phải là một trong: static, node, process, contact`), { statusCode: 400 });
    if (kind !== 'static' && !String(f.ref || '').trim()) {
      throw Object.assign(new Error(`Trường "${key}" thiếu ref nguồn dữ liệu`), { statusCode: 400 });
    }
    if (kind === 'node' && /custom_|latest_status/i.test(String(f.ref || ''))) {
      throw Object.assign(new Error(`Trường "${key}" không được trỏ sang node đặc biệt khác (tránh vòng lặp)`), { statusCode: 400 });
    }
    return { key, label, kind, ref: String(f.ref || '').trim() || null, text: f.text !== undefined && f.text !== null ? String(f.text) : null };
  });
};

const validateMembers = (members, fallbackNodes) => {
  let list = members;
  if (list === undefined || list === null) list = (fallbackNodes || []).map((n) => ({ node: n, field: 'status' }));
  if (!Array.isArray(list) || list.length === 0) {
    throw Object.assign(new Error('Nhóm cần ít nhất 1 node'), { statusCode: 400 });
  }
  return list.map((m, i) => {
    const node = String((m && m.node) || '').trim();
    if (!node) throw Object.assign(new Error(`Mục #${i + 1} thiếu node`), { statusCode: 400 });
    const field = String((m && m.field) || 'status').trim() || 'status';
    return { node, field };
  });
};

const validateGroups = (groups) => {
  if (groups === undefined || groups === null) return [];
  if (!Array.isArray(groups)) {
    throw Object.assign(new Error('groups phải là mảng'), { statusCode: 400 });
  }
  return groups.map((g, i) => {
    if (!g || typeof g !== 'object') throw Object.assign(new Error(`Nhóm #${i + 1} không hợp lệ`), { statusCode: 400 });
    const action = String(g.action || '').trim();
    if (!action) throw Object.assign(new Error(`Nhóm #${i + 1} thiếu tên hành động`), { statusCode: 400 });
    return {
      action,
      template: String(g.template || '').trim() || null,
      members: validateMembers(g.members, g.nodes),
      exclude: normList(g.exclude),
    };
  });
};

const rowToDef = (r) => ({
  id: r.id,
  node_key: r.node_key,
  title: r.title,
  fields: parseJson(r.fields, []),
  config: parseJson(r.config, {}),
  is_default: !!r.is_default,
  deletable: !!r.deletable,
  updated_at: r.updated_at,
});

exports.list = async () => {
  const cached = ttlCache.get(CACHE_KEY);
  if (cached !== undefined) return cached;
  let rows = [];
  try {
    const [res] = await pool.query('SELECT * FROM automation_special_nodes ORDER BY is_default DESC, id ASC');
    rows = res.map(rowToDef);
  } catch (err) {
    if (err && err.code !== 'ER_NO_SUCH_TABLE') throw err;
    rows = [];
  }
  ttlCache.set(CACHE_KEY, rows, CACHE_TTL_MS);
  return rows;
};

exports.clearCache = () => {
  try { ttlCache.del(CACHE_KEY); } catch { /* silent */ }
};

exports.getByKey = async (key) => {
  const list = await exports.list();
  return list.find((d) => d.node_key === key) || null;
};

exports.create = async (data) => {
  const title = String((data && data.title) || '').trim();
  if (!title) throw Object.assign(new Error('Thiếu tên node'), { statusCode: 400 });
  let nodeKey = String((data && data.node_key) || '').trim().toLowerCase();
  if (!nodeKey) {
    const slug = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'node';
    nodeKey = `custom_${slug}`;
  }
  if (!CUSTOM_KEY_RE.test(nodeKey)) {
    throw Object.assign(new Error('Key node phải dạng custom_chu_thuong (chữ thường, số, gạch dưới)'), { statusCode: 400 });
  }
  if (['contact', 'latest_status'].includes(nodeKey)) {
    throw Object.assign(new Error(`Key "${nodeKey}" dành cho node mặc định`), { statusCode: 400 });
  }
  const fields = validateFields(data && data.fields);
  if (fields.length === 0) throw Object.assign(new Error('Node tự tạo cần ít nhất 1 trường'), { statusCode: 400 });
  const [dup] = await pool.query('SELECT id FROM automation_special_nodes WHERE node_key = ? LIMIT 1', [nodeKey]);
  if (dup.length > 0) throw Object.assign(new Error(`Key "${nodeKey}" đã tồn tại`), { statusCode: 409 });
  const [res] = await pool.query(
    'INSERT INTO automation_special_nodes (node_key, title, fields, config, is_default, deletable) VALUES (?, ?, ?, ?, 0, 1)',
    [nodeKey, title, JSON.stringify(fields), JSON.stringify({})]
  );
  exports.clearCache();
  const [rows] = await pool.query('SELECT * FROM automation_special_nodes WHERE id = ?', [res.insertId]);
  return rowToDef(rows[0]);
};

exports.update = async (key, data) => {
  const [existing] = await pool.query('SELECT * FROM automation_special_nodes WHERE node_key = ? LIMIT 1', [key]);
  if (existing.length === 0) throw Object.assign(new Error('Không tìm thấy node'), { statusCode: 404 });
  const prev = rowToDef(existing[0]);
  const next = { title: prev.title, fields: prev.fields, config: prev.config };
  if (data.title !== undefined) {
    const title = String(data.title || '').trim();
    if (!title) throw Object.assign(new Error('Tên node không được để trống'), { statusCode: 400 });
    next.title = title;
  }
  if (!prev.deletable) {
    if (data.fields !== undefined || (data.config !== undefined && key === 'contact')) {
      throw Object.assign(new Error('Node mặc định chỉ được sửa tên' + (key === 'latest_status' ? ' và nhóm hành động' : '')), { statusCode: 400 });
    }
    if (data.config !== undefined && key === 'latest_status') {
      const cfg = (data.config && typeof data.config === 'object') ? data.config : {};
      next.config = { ...(prev.config || {}), groups: validateGroups(cfg.groups !== undefined ? cfg.groups : (prev.config || {}).groups) };
    }
  } else {
    if (data.fields !== undefined) next.fields = validateFields(data.fields);
    if (data.config !== undefined) {
      const cfg = (data.config && typeof data.config === 'object') ? data.config : {};
      next.config = { groups: validateGroups(cfg.groups) };
    }
  }
  await pool.query(
    'UPDATE automation_special_nodes SET title = ?, fields = ?, config = ?, updated_at = NOW() WHERE node_key = ?',
    [next.title, JSON.stringify(next.fields || []), JSON.stringify(next.config || {}), key]
  );
  exports.clearCache();
  const [rows] = await pool.query('SELECT * FROM automation_special_nodes WHERE node_key = ? LIMIT 1', [key]);
  return rowToDef(rows[0]);
};

exports.remove = async (key) => {
  const [existing] = await pool.query('SELECT * FROM automation_special_nodes WHERE node_key = ? LIMIT 1', [key]);
  if (existing.length === 0) throw Object.assign(new Error('Không tìm thấy node'), { statusCode: 404 });
  if (!existing[0].deletable) throw Object.assign(new Error('Node mặc định không được xóa'), { statusCode: 400 });
  await pool.query('DELETE FROM automation_special_nodes WHERE node_key = ? LIMIT 1', [key]);
  exports.clearCache();
  return { node_key: key };
};
