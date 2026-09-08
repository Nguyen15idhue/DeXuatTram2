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

  const merged = {
    entity: data.entity !== undefined ? data.entity : existing.entity,
    key: data.key !== undefined ? data.key : existing.key,
    label: data.label !== undefined ? data.label : existing.label,
    type: data.type !== undefined ? data.type : existing.type,
    source_type: data.source_type !== undefined ? data.source_type : existing.source_type,
    required: data.required !== undefined ? data.required : existing.required,
    validation: data.validation !== undefined ? data.validation : existing.validation,
    options: data.options !== undefined ? data.options : existing.options,
    formula: data.formula !== undefined ? data.formula : existing.formula,
    placeholder: data.placeholder !== undefined ? data.placeholder : existing.placeholder,
    help_text: data.help_text !== undefined ? data.help_text : existing.help_text,
    status: data.status !== undefined ? data.status : existing.status,
    number_format: data.number_format !== undefined ? data.number_format : existing.number_format,
    decimal_places: data.decimal_places !== undefined ? data.decimal_places : existing.decimal_places,
    display_format: data.display_format !== undefined ? data.display_format : existing.display_format,
    unit: data.unit !== undefined ? data.unit : existing.unit,
    date_format: data.date_format !== undefined ? data.date_format : existing.date_format,
    timezone: data.timezone !== undefined ? data.timezone : existing.timezone,
    source_config: data.source_config !== undefined ? data.source_config : existing.source_config,
    parent_field: data.parent_field !== undefined ? data.parent_field : existing.parent_field,
    option_style: data.option_style !== undefined ? data.option_style : existing.option_style,
    file_config: data.file_config !== undefined ? data.file_config : existing.file_config,
    formula_config: data.formula_config !== undefined ? data.formula_config : existing.formula_config,
    data_list_id: data.data_list_id !== undefined ? data.data_list_id : existing.data_list_id,
    data_list_column: data.data_list_column !== undefined ? data.data_list_column : existing.data_list_column,
    data_list_label_column: data.data_list_label_column !== undefined ? data.data_list_label_column : existing.data_list_label_column,
    relation_key: data.relation_key !== undefined ? data.relation_key : existing.relation_key,
    table_config: data.table_config !== undefined ? data.table_config : existing.source_config
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
  await pool.query('DELETE FROM field_definitions WHERE id = ?', [id]);
};

exports.updateFieldDefinitionStatus = async (id, status) => {
  await pool.query(
    'UPDATE field_definitions SET status = ?, updated_at = NOW() WHERE id = ?',
    [status, id]
  );
  const [rows] = await pool.query('SELECT * FROM field_definitions WHERE id = ?', [id]);
  return rows[0];
};
