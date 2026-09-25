const pool = require('../utils/db');
const dataListService = require('./dataListService');

const LINK_OPS = ['=', '!=', 'contains', 'not_contains', 'in', 'empty', 'not_empty'];

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

exports.validateTableLink = async (entity, tableConfig) => {
  const columns = (tableConfig && tableConfig.columns) || [];
  if (columns.length === 0) return;
  const [fieldRows] = await pool.query(
    "SELECT `key` FROM field_definitions WHERE entity = ? AND status = 'active'",
    [entity]
  );
  const fieldKeys = new Set(fieldRows.map((r) => r.key));
  const dlColsCache = {};
  const dlColumns = async (dlId) => {
    if (!dlId) return [];
    if (!dlColsCache[dlId]) {
      const dl = await dataListService.getById(Number(dlId));
      const cfg = dl && dl.columns_config ? dl.columns_config : [];
      dlColsCache[dlId] = cfg.map((c) => c.key);
    }
    return dlColsCache[dlId];
  };
  for (const col of columns) {
    if (!col) continue;
    if (col.data_list_id && col.data_list_column) {
      const keys = await dlColumns(col.data_list_id);
      if (keys.length > 0 && !keys.includes(col.data_list_column)) {
        throw badRequest(`Cột "${col.label || col.key}": Cột giá trị "${col.data_list_column}" không có trong DataList đã chọn`);
      }
    }
    const link = col.data_link;
    if (!link || !link.enabled) continue;
    const dlId = link.datalist_id || col.data_list_id;
    if (!dlId) throw badRequest(`Cột "${col.label || col.key}": chưa chọn Danh mục dữ liệu`);
    const bKeys = await dlColumns(dlId);
    if (bKeys.length === 0) throw badRequest(`Cột "${col.label || col.key}": DataList đã chọn không có cột nào`);
    const defaultColumn = link.default_column || col.data_list_column;
    if (!defaultColumn) throw badRequest(`Cột "${col.label || col.key}": chưa chọn Cột mặc định`);
    if (!bKeys.includes(defaultColumn)) {
      throw badRequest(`Cột "${col.label || col.key}": Cột mặc định "${defaultColumn}" không có trong DataList`);
    }
    const trigger = link.trigger_column;
    if (trigger) {
      if (!columns.some((c) => c && c.key === trigger)) {
        throw badRequest(`Cột "${col.label || col.key}": cột kích hoạt "${trigger}" không có trong table`);
      }
      for (const [i, cond] of ((link.conditions || [])).entries()) {
        const n = i + 1;
        if (!cond.field || !fieldKeys.has(cond.field)) {
          throw badRequest(`Cột "${col.label || col.key}": điều kiện ${n} dùng field "${cond.field || '(trống)'}" không tồn tại trong entity`);
        }
        if (!LINK_OPS.includes(cond.op)) {
          throw badRequest(`Cột "${col.label || col.key}": điều kiện ${n} có toán tử không hợp lệ`);
        }
        if (!cond.column || !bKeys.includes(cond.column)) {
          throw badRequest(`Cột "${col.label || col.key}": điều kiện ${n} lấy cột "${cond.column || '(trống)'}" không có trong DataList`);
        }
      }
    }
  }
};

exports.getAllFieldDefinitions = async (entity, status, search, type, page, limit) => {
  const offset = (page - 1) * limit;
  let where = [];
  let params = [];

  if (entity) {
    where.push('entity = ?');
    params.push(entity);
  }

  if (status) {
    where.push('status = ?');
    params.push(status);
  }

  if (search) {
    where.push('(label LIKE ? OR `key` LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (type) {
    where.push('type = ?');
    params.push(type);
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

  const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM field_definitions ${whereClause}`, params);
  const total = countResult[0].total;

  const [rows] = await pool.query(
    `SELECT * FROM field_definitions ${whereClause} ORDER BY entity, \`key\` LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    fieldDefinitions: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
};

exports.getFieldDefinitionById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM field_definitions WHERE id = ?', [id]);
  return rows.length > 0 ? rows[0] : null;
};

exports.getFieldDefinitionsByEntity = async (entity) => {
  const [rows] = await pool.query(
    'SELECT * FROM field_definitions WHERE entity = ? AND status = ? ORDER BY `key`',
    [entity, 'active']
  );
  return rows;
};

exports.createFieldDefinition = async (data) => {
  const {
    entity, key, label, type, source_type, required, validation, options, formula, placeholder, help_text, status,
    number_format, decimal_places, display_format, unit, date_format, timezone,
    source_config, parent_field, option_style, file_config, formula_config, data_list_id, data_list_column, data_list_label_column, relation_key,
    table_config
  } = data;
  if (type === 'table') {
    const cfg = table_config !== undefined ? table_config : source_config;
    const parsed = Array.isArray(cfg) ? { columns: cfg } : (typeof cfg === 'string' ? (() => { try { return JSON.parse(cfg); } catch { return null; } })() : cfg);
    await exports.validateTableLink(entity, parsed);
  }
  const [result] = await pool.query(
    `INSERT INTO field_definitions (
      entity, \`key\`, label, type, number_format, decimal_places, display_format, unit, date_format, timezone,
      source_type, required, validation, options, source_config, parent_field, option_style,
      file_config, formula_config, formula, placeholder, help_text, status, data_list_id, data_list_column, data_list_label_column, relation_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entity,
      key,
      label,
      type || 'text',
      number_format || null,
      decimal_places != null ? decimal_places : null,
      display_format || 'plain',
      unit || null,
      date_format || null,
      timezone || null,
      source_type || 'json',
      required ? 1 : 0,
      validation ? JSON.stringify(validation) : null,
      options ? JSON.stringify(options) : null,
      (type === 'table' && table_config) ? JSON.stringify(table_config) : (source_config ? JSON.stringify(source_config) : null),
      parent_field || null,
      option_style ? JSON.stringify(option_style) : null,
      file_config ? JSON.stringify(file_config) : null,
      formula_config ? JSON.stringify(formula_config) : null,
      formula || null,
      placeholder || null,
      help_text || null,
      status || 'active',
      data_list_id || null,
      data_list_column || null,
      data_list_label_column || null,
      relation_key || null
    ]
  );
  const [rows] = await pool.query('SELECT * FROM field_definitions WHERE id = ?', [result.insertId]);
  return rows[0];
};

exports.updateFieldDefinition = async (id, data) => {
  const existing = await exports.getFieldDefinitionById(id);
  if (!existing) throw new Error('Field not found');

  // Field bị khóa: chỉ cho phép đổi label + required (nguồn bắt buộc duy nhất),
  // mọi thuộc tính khác (key/type/source_type/...) giữ nguyên
  const effectiveData = existing.is_locked
    ? {
        label: data.label !== undefined ? data.label : existing.label,
        required: data.required !== undefined ? data.required : existing.required
      }
    : data;

  // Field bị khóa: options chỉ được cập nhật duy nhất key `icon` theo value đã khớp,
  // mọi thứ khác (label/value/color/...) giữ nguyên bản đang lưu.
  const parseJsonArr = (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : null; } catch { return null; } }
    return null;
  };
  let lockedIconOptions = existing.options;
  if (existing.is_locked && data.options !== undefined) {
    const incoming = parseJsonArr(data.options);
    const current = parseJsonArr(existing.options);
    if (incoming && current) {
      const next = current.map((opt) => {
        const match = incoming.find((o) => o && opt && String(o.value) === String(opt.value));
        if (!match) return opt;
        const icon = typeof match.icon === 'string' ? match.icon : null;
        return { ...opt, icon: icon || undefined };
      });
      lockedIconOptions = JSON.stringify(next);
    }
  }

  const merged = {
    entity: effectiveData.entity !== undefined ? effectiveData.entity : existing.entity,
    key: effectiveData.key !== undefined ? effectiveData.key : existing.key,
    label: effectiveData.label !== undefined ? effectiveData.label : existing.label,
    type: effectiveData.type !== undefined ? effectiveData.type : existing.type,
    source_type: effectiveData.source_type !== undefined ? effectiveData.source_type : existing.source_type,
    required: effectiveData.required !== undefined ? effectiveData.required : existing.required,
    validation: effectiveData.validation !== undefined ? effectiveData.validation : existing.validation,
    options: existing.is_locked ? lockedIconOptions : (effectiveData.options !== undefined ? effectiveData.options : existing.options),
    formula: effectiveData.formula !== undefined ? effectiveData.formula : existing.formula,
    placeholder: effectiveData.placeholder !== undefined ? effectiveData.placeholder : existing.placeholder,
    help_text: effectiveData.help_text !== undefined ? effectiveData.help_text : existing.help_text,
    status: effectiveData.status !== undefined ? effectiveData.status : existing.status,
    number_format: effectiveData.number_format !== undefined ? effectiveData.number_format : existing.number_format,
    decimal_places: effectiveData.decimal_places !== undefined ? effectiveData.decimal_places : existing.decimal_places,
    display_format: effectiveData.display_format !== undefined ? effectiveData.display_format : existing.display_format,
    unit: effectiveData.unit !== undefined ? effectiveData.unit : existing.unit,
    date_format: effectiveData.date_format !== undefined ? effectiveData.date_format : existing.date_format,
    timezone: effectiveData.timezone !== undefined ? effectiveData.timezone : existing.timezone,
    source_config: effectiveData.source_config !== undefined ? effectiveData.source_config : existing.source_config,
    parent_field: effectiveData.parent_field !== undefined ? effectiveData.parent_field : existing.parent_field,
    option_style: effectiveData.option_style !== undefined ? effectiveData.option_style : existing.option_style,
    file_config: effectiveData.file_config !== undefined ? effectiveData.file_config : existing.file_config,
    formula_config: effectiveData.formula_config !== undefined ? effectiveData.formula_config : existing.formula_config,
    data_list_id: effectiveData.data_list_id !== undefined ? effectiveData.data_list_id : existing.data_list_id,
    data_list_column: effectiveData.data_list_column !== undefined ? effectiveData.data_list_column : existing.data_list_column,
    data_list_label_column: effectiveData.data_list_label_column !== undefined ? effectiveData.data_list_label_column : existing.data_list_label_column,
    relation_key: effectiveData.relation_key !== undefined ? effectiveData.relation_key : existing.relation_key,
    table_config: effectiveData.table_config !== undefined ? effectiveData.table_config : existing.source_config
  };

  const entity = merged.entity;
  const key = merged.key;
  const label = merged.label;
  const type = merged.type;

  const sourceConfigToSave = (type === 'table' && merged.table_config)
    ? JSON.stringify(merged.table_config)
    : (merged.source_config ? JSON.stringify(merged.source_config) : null);

  if (type === 'table' && !existing.is_locked && (data.table_config !== undefined || data.source_config !== undefined)) {
    const incoming = data.table_config !== undefined ? data.table_config : data.source_config;
    const parsed = typeof incoming === 'string' ? (() => { try { return JSON.parse(incoming); } catch { return null; } })() : incoming;
    await exports.validateTableLink(entity, parsed);
  }

  await pool.query(
    `UPDATE field_definitions SET
      entity = ?, \`key\` = ?, label = ?, type = ?,
      number_format = ?, decimal_places = ?, display_format = ?, unit = ?, date_format = ?, timezone = ?,
      source_type = ?, required = ?,
      validation = ?, options = ?, source_config = ?, parent_field = ?,
      option_style = ?, file_config = ?, formula_config = ?,
      formula = ?, placeholder = ?, help_text = ?, status = ?,
      data_list_id = ?, data_list_column = ?, data_list_label_column = ?, relation_key = ?,
      updated_at = NOW()
     WHERE id = ?`,
    [
      entity,
      key,
      label,
      type,
      merged.number_format || null,
      merged.decimal_places != null ? merged.decimal_places : null,
      merged.display_format || 'plain',
      merged.unit || null,
      merged.date_format || null,
      merged.timezone || null,
      merged.source_type || 'json',
      merged.required ? 1 : 0,
      merged.validation ? (typeof merged.validation === 'string' ? merged.validation : JSON.stringify(merged.validation)) : null,
      merged.options ? (typeof merged.options === 'string' ? merged.options : JSON.stringify(merged.options)) : null,
      sourceConfigToSave,
      merged.parent_field || null,
      merged.option_style ? (typeof merged.option_style === 'string' ? merged.option_style : JSON.stringify(merged.option_style)) : null,
      merged.file_config ? (typeof merged.file_config === 'string' ? merged.file_config : JSON.stringify(merged.file_config)) : null,
      merged.formula_config ? (typeof merged.formula_config === 'string' ? merged.formula_config : JSON.stringify(merged.formula_config)) : null,
      merged.formula || null,
      merged.placeholder || null,
      merged.help_text || null,
      merged.status || 'active',
      merged.data_list_id || null,
      merged.data_list_column || null,
      merged.data_list_label_column || null,
      merged.relation_key || null,
      id
    ]
  );
  const [rows] = await pool.query('SELECT * FROM field_definitions WHERE id = ?', [id]);
  return rows[0];
};

exports.deleteFieldDefinition = async (id) => {
  const existing = await exports.getFieldDefinitionById(id);
  if (!existing) {
    const err = new Error('Field not found');
    err.code = 'FIELD_NOT_FOUND';
    throw err;
  }
  if (existing.is_locked) {
    const err = new Error('Field đang bị khóa, không thể xóa');
    err.code = 'FIELD_LOCKED';
    throw err;
  }
  await pool.query('DELETE FROM field_definitions WHERE id = ?', [id]);
};

exports.setFieldDefinitionLock = async (id, locked) => {
  await pool.query('UPDATE field_definitions SET is_locked = ?, updated_at = NOW() WHERE id = ?', [locked ? 1 : 0, id]);
  const [rows] = await pool.query('SELECT * FROM field_definitions WHERE id = ?', [id]);
  return rows[0];
};

exports.updateFieldDefinitionStatus = async (id, status) => {
  await pool.query(
    'UPDATE field_definitions SET status = ?, updated_at = NOW() WHERE id = ?',
    [status, id]
  );
  const [rows] = await pool.query('SELECT * FROM field_definitions WHERE id = ?', [id]);
  return rows[0];
};
