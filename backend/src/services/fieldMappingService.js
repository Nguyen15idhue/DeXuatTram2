const pool = require('../utils/db');

const ALLOWED_TYPES = ['text', 'textarea', 'number', 'email', 'phone', 'url', 'date', 'datetime', 'boolean', 'select', 'multiselect', 'file', 'formula', 'password', 'table'];

exports.getAllByConfig = async (apiConfigId) => {
  const [rows] = await pool.query(
    'SELECT * FROM api_field_mappings WHERE api_config_id = ? ORDER BY id ASC',
    [apiConfigId]
  );
  return rows;
};

exports.getById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM api_field_mappings WHERE id = ?', [id]);
  return rows.length > 0 ? rows[0] : null;
};

exports.getByTarget = async (apiConfigId, targetField) => {
  const [rows] = await pool.query(
    'SELECT * FROM api_field_mappings WHERE api_config_id = ? AND target_field = ? LIMIT 1',
    [apiConfigId, targetField]
  );
  return rows.length > 0 ? rows[0] : null;
};

exports.create = async (data) => {
  const { api_config_id, source_field, target_field, target_field_type, sync_enabled, direction, default_value, transform_rules } = data;

  if (!source_field || !source_field.trim()) {
    throw Object.assign(new Error('source_field không được để trống'), { statusCode: 400 });
  }
  if (!target_field || !target_field.trim()) {
    throw Object.assign(new Error('target_field không được để trống'), { statusCode: 400 });
  }
  if (target_field_type && !ALLOWED_TYPES.includes(target_field_type)) {
    throw Object.assign(new Error(`target_field_type phải là một trong: ${ALLOWED_TYPES.join(', ')}`), { statusCode: 400 });
  }

  const [existing] = await pool.query(
    'SELECT id FROM api_field_mappings WHERE api_config_id = ? AND target_field = ?',
    [api_config_id, target_field.trim()]
  );
  if (existing.length > 0) {
    throw Object.assign(new Error(`Trường đích "${target_field}" đã được map`), { statusCode: 400 });
  }

  const [result] = await pool.query(
    `INSERT INTO api_field_mappings (api_config_id, source_field, target_field, target_field_type, sync_enabled, direction, default_value, transform_rules)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      api_config_id,
      source_field.trim(),
      target_field.trim(),
      target_field_type || 'text',
      sync_enabled !== undefined ? (sync_enabled ? 1 : 0) : 1,
      direction || 'both',
      default_value || null,
      transform_rules ? (typeof transform_rules === 'string' ? transform_rules : JSON.stringify(transform_rules)) : null
    ]
  );

  const [rows] = await pool.query('SELECT * FROM api_field_mappings WHERE id = ?', [result.insertId]);
  return rows[0];
};

exports.update = async (id, data) => {
  const existing = await exports.getById(id);
  if (!existing) {
    throw Object.assign(new Error('Không tìm thấy field mapping'), { statusCode: 404 });
  }

  if (data.target_field_type && !ALLOWED_TYPES.includes(data.target_field_type)) {
    throw Object.assign(new Error(`target_field_type phải là một trong: ${ALLOWED_TYPES.join(', ')}`), { statusCode: 400 });
  }

  if (data.target_field && data.target_field.trim() !== existing.target_field) {
    const [dup] = await pool.query(
      'SELECT id FROM api_field_mappings WHERE api_config_id = ? AND target_field = ? AND id != ?',
      [existing.api_config_id, data.target_field.trim(), id]
    );
    if (dup.length > 0) {
      throw Object.assign(new Error(`Trường đích "${data.target_field}" đã được map`), { statusCode: 400 });
    }
  }

  const merged = {
    source_field: data.source_field !== undefined ? data.source_field.trim() : existing.source_field,
    target_field: data.target_field !== undefined ? data.target_field.trim() : existing.target_field,
    target_field_type: data.target_field_type !== undefined ? data.target_field_type : existing.target_field_type,
    sync_enabled: data.sync_enabled !== undefined ? (data.sync_enabled ? 1 : 0) : existing.sync_enabled,
    direction: existing.direction,
    default_value: data.default_value !== undefined ? data.default_value : existing.default_value,
    transform_rules: data.transform_rules !== undefined
      ? (typeof data.transform_rules === 'string' ? data.transform_rules : JSON.stringify(data.transform_rules))
      : existing.transform_rules
  };

  await pool.query(
    `UPDATE api_field_mappings SET
      source_field = ?, target_field = ?, target_field_type = ?,
      sync_enabled = ?, direction = ?, default_value = ?, transform_rules = ?,
      updated_at = NOW()
     WHERE id = ?`,
    [merged.source_field, merged.target_field, merged.target_field_type, merged.sync_enabled, merged.direction, merged.default_value, merged.transform_rules, id]
  );

  const [rows] = await pool.query('SELECT * FROM api_field_mappings WHERE id = ?', [id]);
  return rows[0];
};

exports.remove = async (id) => {
  const existing = await exports.getById(id);
  if (!existing) {
    throw Object.assign(new Error('Không tìm thấy field mapping'), { statusCode: 404 });
  }
  await pool.query('DELETE FROM api_field_mappings WHERE id = ?', [id]);
  return existing;
};

exports.removeAllByConfig = async (apiConfigId) => {
  await pool.query('DELETE FROM api_field_mappings WHERE api_config_id = ?', [apiConfigId]);
};

exports.getUsedInDescFields = async (apiConfigId) => {
  const [rows] = await pool.query(
    'SELECT source_field FROM api_field_mappings WHERE api_config_id = ? AND used_in_desc = 1',
    [apiConfigId]
  );
  return rows.map(r => r.source_field);
};

exports.setUsedInDesc = async (id, usedInDesc) => {
  await pool.query(
    'UPDATE api_field_mappings SET used_in_desc = ?, updated_at = NOW() WHERE id = ?',
    [usedInDesc ? 1 : 0, id]
  );
};

exports.checkFieldConflict = async (fieldKey, apiConfigId) => {
  const usedFields = await exports.getUsedInDescFields(apiConfigId);
  return usedFields.includes(fieldKey);
};
