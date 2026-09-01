const pool = require('../utils/db');

exports.getAllFieldDefinitions = async (entity, status, page, limit) => {
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
    source_config, parent_field, option_style, file_config, formula_config, data_list_id, data_list_column, relation_key
  } = data;
  const [result] = await pool.query(
    `INSERT INTO field_definitions (
      entity, \`key\`, label, type, number_format, decimal_places, display_format, unit, date_format, timezone,
      source_type, required, validation, options, source_config, parent_field, option_style,
      file_config, formula_config, formula, placeholder, help_text, status, data_list_id, data_list_column, relation_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      source_config ? JSON.stringify(source_config) : null,
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
      relation_key || null
    ]
  );
  const [rows] = await pool.query('SELECT * FROM field_definitions WHERE id = ?', [result.insertId]);
  return rows[0];
};

exports.updateFieldDefinition = async (id, data) => {
  const {
    entity, key, label, type, source_type, required, validation, options, formula, placeholder, help_text, status,
    number_format, decimal_places, display_format, unit, date_format, timezone,
    source_config, parent_field, option_style, file_config, formula_config, data_list_id, data_list_column, relation_key
  } = data;
  await pool.query(
    `UPDATE field_definitions SET
      entity = ?, \`key\` = ?, label = ?, type = ?,
      number_format = ?, decimal_places = ?, display_format = ?, unit = ?, date_format = ?, timezone = ?,
      source_type = ?, required = ?,
      validation = ?, options = ?, source_config = ?, parent_field = ?,
      option_style = ?, file_config = ?, formula_config = ?,
      formula = ?, placeholder = ?, help_text = ?, status = ?,
      data_list_id = ?, data_list_column = ?, relation_key = ?,
      updated_at = NOW()
     WHERE id = ?`,
    [
      entity,
      key,
      label,
      type,
      number_format || null,
      decimal_places != null ? decimal_places : null,
      display_format || 'plain',
      unit || null,
      date_format || null,
      timezone || null,
      source_type,
      required ? 1 : 0,
      validation ? JSON.stringify(validation) : null,
      options ? JSON.stringify(options) : null,
      source_config ? JSON.stringify(source_config) : null,
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
      relation_key || null,
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
