const pool = require('../utils/db');

exports.parseOptions = (optionsJson) => {
  if (!optionsJson) return [];
  if (Array.isArray(optionsJson)) return optionsJson;
  if (typeof optionsJson === 'string') {
    try {
      return JSON.parse(optionsJson);
    } catch {
      return [];
    }
  }
  return optionsJson;
};

exports.validateField = (fieldDef, value) => {
  const errors = [];

  if (fieldDef.required && (value === undefined || value === null || value === '')) {
    errors.push(`${fieldDef.label} là bắt buộc`);
    return errors;
  }

  if (value === undefined || value === null || value === '') return errors;

  switch (fieldDef.type) {
    case 'number':
      const num = Number(value);
      if (isNaN(num)) {
        errors.push(`${fieldDef.label} phải là số`);
      } else if (fieldDef.number_format === 'integer' && !Number.isInteger(num)) {
        errors.push(`${fieldDef.label} phải là số nguyên`);
      } else if (fieldDef.decimal_places != null) {
        const parts = String(num).split('.');
        if (parts.length > 1 && parts[1].length > fieldDef.decimal_places) {
          errors.push(`${fieldDef.label} tối đa ${fieldDef.decimal_places} chữ số thập phân`);
        }
      }
      break;

    case 'email':
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        errors.push(`${fieldDef.label} không hợp lệ`);
      }
      break;

    case 'phone':
      const phoneRegex = /^\d{10}$/;
      if (!phoneRegex.test(value)) {
        errors.push(`${fieldDef.label} phải có đúng 10 chữ số`);
      }
      break;

    case 'url':
      try {
        new URL(value);
      } catch {
        errors.push(`${fieldDef.label} không hợp lệ`);
      }
      break;

    case 'date':
      if (isNaN(Date.parse(value))) {
        errors.push(`${fieldDef.label} không hợp lệ`);
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean' && value !== 0 && value !== 1 && value !== '0' && value !== '1') {
        errors.push(`${fieldDef.label} không hợp lệ`);
      }
      break;

    case 'select':
      const options = exports.parseOptions(fieldDef.options).map(o => (o && typeof o === 'object' ? (o.value ?? o.label) : o));
      if (options.length > 0 && !options.includes(value)) {
        errors.push(`${fieldDef.label} không hợp lệ`);
      }
      break;

    case 'multiselect':
      if (!Array.isArray(value)) {
        errors.push(`${fieldDef.label} phải là mảng`);
      } else {
        const multiOptions = exports.parseOptions(fieldDef.options).map(o => (o && typeof o === 'object' ? (o.value ?? o.label) : o));
        if (multiOptions.length > 0) {
          const invalid = value.filter(v => !multiOptions.includes(v));
          if (invalid.length > 0) {
            errors.push(`${fieldDef.label} chứa giá trị không hợp lệ: ${invalid.join(', ')}`);
          }
        }
      }
      break;

    case 'file':
      if (fieldDef.file_config && fieldDef.file_config.maxSize && value) {
        const files = Array.isArray(value) ? value : [value];
        const maxSizeBytes = fieldDef.file_config.maxSize * 1024 * 1024;
        for (const f of files) {
          if (f.size && f.size > maxSizeBytes) {
            errors.push(`${fieldDef.label}: file "${f.name || ''}" vượt quá ${fieldDef.file_config.maxSize}MB`);
          }
        }
      }
      break;

    case 'table': {
      if (!Array.isArray(value)) {
        errors.push(`${fieldDef.label} phải là mảng`);
        break;
      }
      const tc = typeof fieldDef.source_config === 'string'
        ? (() => { try { return JSON.parse(fieldDef.source_config); } catch { return {}; } })()
        : (fieldDef.source_config || {});
      if (tc.min_rows != null && value.length < tc.min_rows) {
        errors.push(`${fieldDef.label} phải có ít nhất ${tc.min_rows} dòng`);
      }
      if (tc.max_rows != null && value.length > tc.max_rows) {
        errors.push(`${fieldDef.label} không được quá ${tc.max_rows} dòng`);
      }
      break;
    }

    case 'user': {
      let rawUserId = value;
      if (typeof value === 'object' && value !== null) {
        rawUserId = value.id ?? value.user_id ?? value.value;
      }
      const userIdNum = Number(rawUserId);
      if (!Number.isInteger(userIdNum) || userIdNum <= 0) {
        errors.push(`${fieldDef.label} không hợp lệ`);
      }
      break;
    }

    case 'textarea':
    case 'text':
    case 'formula':
      if (fieldDef.type === 'formula') {
        const fc = typeof fieldDef.formula_config === 'string'
          ? (() => { try { return JSON.parse(fieldDef.formula_config); } catch { return {}; } })()
          : (fieldDef.formula_config || {});
        if (fc.compute_mode === 'post') return errors;
      }
    default:
      break;
  }

  return errors;
};

exports.validateData = async (entity, data, fieldDefs) => {
  const allErrors = [];

  if (!fieldDefs || fieldDefs.length === 0) return allErrors;

  for (const fieldDef of fieldDefs) {
    const value = data[fieldDef.key];
    const errors = exports.validateField(fieldDef, value);
    allErrors.push(...errors);
  }

  const userChecks = [];
  for (const fieldDef of fieldDefs) {
    if (fieldDef.type !== 'user') continue;
    const value = data[fieldDef.key];
    if (value === undefined || value === null || value === '') continue;
    let raw = value;
    if (typeof value === 'object' && value !== null) raw = value.id ?? value.user_id ?? value.value;
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0) userChecks.push({ fieldDef, id: n });
  }
  if (userChecks.length > 0) {
    const ids = [...new Set(userChecks.map(u => u.id))];
    try {
      const [rows] = await pool.query(`SELECT id FROM users WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
      const found = new Set(rows.map(r => Number(r.id)));
      for (const { fieldDef, id } of userChecks) {
        if (!found.has(id)) allErrors.push(`${fieldDef.label} không tồn tại`);
      }
    } catch { /* silent */ }
  }

  return allErrors;
};

exports.splitData = (entity, data, fieldDefs) => {
  const fixedData = {};
  const dynamicData = {};

  if (!fieldDefs || fieldDefs.length === 0) {
    Object.keys(data).forEach(key => { fixedData[key] = data[key]; });
    return { fixedData, dynamicData };
  }

  const dynamicKeys = new Set(
    fieldDefs.filter(f => f.source_type === 'json').map(f => f.key)
  );

  Object.keys(data).forEach(key => {
    if (dynamicKeys.has(key)) {
      dynamicData[key] = data[key];
    } else {
      fixedData[key] = data[key];
    }
  });

  return { fixedData, dynamicData };
};

exports.mergeData = (row, fieldDefs) => {
  if (!row || !fieldDefs || fieldDefs.length === 0) return row;

  const result = { ...row };

  if (row.custom_data && typeof row.custom_data === 'string') {
    try {
      result.custom_data = JSON.parse(row.custom_data);
    } catch {
      result.custom_data = {};
    }
  } else if (row.custom_data && typeof row.custom_data === 'object') {
    result.custom_data = row.custom_data;
  } else {
    result.custom_data = {};
  }

  fieldDefs.forEach(fd => {
    if (result[fd.key] === undefined && result.custom_data[fd.key] !== undefined) {
      result[fd.key] = result.custom_data[fd.key];
    }
  });

  return result;
};

const parseSourceConfig = (val) => {
  if (!val) return {};
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return {}; }
};

exports.parseSourceConfig = parseSourceConfig;

exports.applyAutoUserFields = async (dynamicData, fieldDefs, userId, connection = null) => {
  if (!dynamicData || !fieldDefs || fieldDefs.length === 0) return dynamicData;
  const autoFields = fieldDefs.filter(f => {
    if (f.type !== 'user') return false;
    const sc = parseSourceConfig(f.source_config);
    return sc.auto_user === 'current_user' || sc.auto_user === 'parent_sales' || sc.auto_user === 'owner_or_manager';
  });
  if (autoFields.length === 0) return dynamicData;

  const db = connection || pool;
  const currentId = Number(userId) > 0 ? Number(userId) : null;
  let parentId = null;
  let currentRole = '';
  if (currentId) {
    try {
      const [rows] = await db.query('SELECT role, parent_id FROM users WHERE id = ?', [currentId]);
      if (rows.length > 0) {
        currentRole = rows[0].role || '';
        if (rows[0].parent_id) parentId = Number(rows[0].parent_id);
      }
    } catch { /* silent */ }
  }

  autoFields.forEach(f => {
    const sc = parseSourceConfig(f.source_config);
    if (!currentId) {
      dynamicData[f.key] = '';
      return;
    }
    let id = currentId;
    if (sc.auto_user === 'parent_sales') {
      id = parentId || currentId;
    } else if (sc.auto_user === 'owner_or_manager') {
      id = currentRole === 'CTV' ? (parentId || currentId) : currentId;
    }
    dynamicData[f.key] = { id };
  });

  return dynamicData;
};

exports.buildDynamicSetClause = (data, fieldDefs) => {
  if (!fieldDefs || fieldDefs.length === 0) return null;

  const dynamicKeys = Object.keys(data).filter(key =>
    fieldDefs.some(fd => fd.key === key)
  );

  if (dynamicKeys.length === 0) return null;

  const dynamicObj = {};
  dynamicKeys.forEach(key => { dynamicObj[key] = data[key]; });

  return JSON.stringify(dynamicObj);
};

exports.getFieldDefinitionsByEntity = async (entity) => {
  const [rows] = await pool.query(
    'SELECT * FROM field_definitions WHERE entity = ? AND status = ?',
    [entity, 'active']
  );
  return rows;
};

exports.enrichUserFields = async (record, fieldDefs, preloadedMap = null) => {
  if (!record || !fieldDefs || fieldDefs.length === 0) return record;
  const userFields = fieldDefs.filter(f => f.type === 'user');
  if (userFields.length === 0) return record;
  const getId = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const raw = (typeof v === 'object' && v !== null) ? (v.id ?? v.user_id ?? v.value) : v;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  const idSet = new Set();
  for (const f of userFields) {
    const v = record[f.key] !== undefined ? record[f.key] : (record.custom_data && record.custom_data[f.key]);
    const id = getId(v);
    if (id !== null) idSet.add(id);
  }
  if (idSet.size === 0) return record;
  let nameMap = preloadedMap;
  if (!nameMap) {
    nameMap = new Map();
    try {
      const ids = [...idSet];
      const [rows] = await pool.query(`SELECT id, full_name FROM users WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
      nameMap = new Map(rows.map(r => [Number(r.id), r.full_name || '']));
    } catch { /* silent */ }
  }
  if (!nameMap || nameMap.size === 0) return record;
  const out = { ...record };
  const cd = { ...(out.custom_data || {}) };
  for (const f of userFields) {
    const cur = out[f.key] !== undefined ? out[f.key] : cd[f.key];
    const id = getId(cur);
    if (id === null || !nameMap.has(id)) continue;
    const label = nameMap.get(id);
    const enriched = (typeof cur === 'object' && cur !== null) ? { ...cur, label } : { id, label };
    if (out[f.key] !== undefined) out[f.key] = enriched;
    if (cd[f.key] !== undefined) cd[f.key] = enriched;
  }
  out.custom_data = cd;
  return out;
};

exports.enrichUserFieldsMany = async (records, fieldDefs) => {
  if (!records || records.length === 0 || !fieldDefs || fieldDefs.length === 0) return records;
  const userFields = fieldDefs.filter(f => f.type === 'user');
  if (userFields.length === 0) return records;
  const getId = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const raw = (typeof v === 'object' && v !== null) ? (v.id ?? v.user_id ?? v.value) : v;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  const idSet = new Set();
  for (const rec of records) {
    for (const f of userFields) {
      const v = rec[f.key] !== undefined ? rec[f.key] : (rec.custom_data && rec.custom_data[f.key]);
      const id = getId(v);
      if (id !== null) idSet.add(id);
    }
  }
  let nameMap = new Map();
  if (idSet.size > 0) {
    try {
      const ids = [...idSet];
      const [rows] = await pool.query(`SELECT id, full_name FROM users WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
      nameMap = new Map(rows.map(r => [Number(r.id), r.full_name || '']));
    } catch { /* silent */ }
  }
  const out = [];
  for (const rec of records) {
    out.push(await exports.enrichUserFields(rec, fieldDefs, nameMap));
  }
  return out;
};
