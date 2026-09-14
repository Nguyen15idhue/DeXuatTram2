const pool = require('../utils/db');

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

  const merged = {
    entity: effectiveData.entity !== undefined ? effectiveData.entity : existing.entity,
    key: effectiveData.key !== undefined ? effectiveData.key : existing.key,
    label: effectiveData.label !== undefined ? effectiveData.label : existing.label,
    type: effectiveData.type !== undefined ? effectiveData.type : existing.type,
    source_type: effectiveData.source_type !== undefined ? effectiveData.source_type : existing.source_type,
    required: effectiveData.required !== undefined ? effectiveData.required : existing.required,
    validation: effectiveData.validation !== undefined ? effectiveData.validation : existing.validation,
    options: effectiveData.options !== undefined ? effectiveData.options : existing.options,
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
