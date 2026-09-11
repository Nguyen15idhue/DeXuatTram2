const pool = require('../utils/db');

exports.getAll = async (search, isActive, page = 1, limit = 50) => {
  const offset = (page - 1) * limit;
  const where = [];
  const params = [];

  if (search) {
    where.push('(name LIKE ? OR description LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (isActive !== undefined && isActive !== null) {
    where.push('is_active = ?');
    params.push(isActive ? 1 : 0);
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

  const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM api_configs ${whereClause}`, params);
  const total = countResult[0].total;

  const [rows] = await pool.query(
    `SELECT * FROM api_configs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    configs: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
};

exports.getById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM api_configs WHERE id = ?', [id]);
  return rows.length > 0 ? rows[0] : null;
};

exports.create = async (data) => {
  const { name, base_url, auth_type, auth_config, description, is_active, created_by, api_type, sync_enabled, sync_cron, system_key } = data;

  const [existing] = await pool.query('SELECT id FROM api_configs WHERE name = ?', [name]);
  if (existing.length > 0) {
    throw Object.assign(new Error('Tên cấu hình API đã tồn tại'), { statusCode: 400 });
  }

  const [result] = await pool.query(
    `INSERT INTO api_configs (name, base_url, auth_type, auth_config, description, is_active, created_by, api_type, sync_enabled, sync_cron, system_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name.trim(),
      base_url.trim(),
      auth_type || 'token',
      typeof auth_config === 'string' ? auth_config : JSON.stringify(auth_config),
      description || null,
      is_active !== undefined ? (is_active ? 1 : 0) : 1,
      created_by || null,
      api_type || 'contact',
      sync_enabled ? 1 : 0,
      sync_cron || null,
      system_key || '1office'
    ]
  );

  const [rows] = await pool.query('SELECT * FROM api_configs WHERE id = ?', [result.insertId]);
  return rows[0];
};

exports.update = async (id, data) => {
  const existing = await exports.getById(id);
  if (!existing) {
    throw Object.assign(new Error('Không tìm thấy cấu hình API'), { statusCode: 404 });
  }

  if (data.name && data.name.trim() !== existing.name) {
    const [dup] = await pool.query('SELECT id FROM api_configs WHERE name = ? AND id != ?', [data.name.trim(), id]);
    if (dup.length > 0) {
      throw Object.assign(new Error('Tên cấu hình API đã tồn tại'), { statusCode: 400 });
    }
  }

  const merged = {
    name: data.name !== undefined ? data.name.trim() : existing.name,
    base_url: data.base_url !== undefined ? data.base_url.trim() : existing.base_url,
    auth_type: data.auth_type !== undefined ? data.auth_type : existing.auth_type,
    auth_config: data.auth_config !== undefined
      ? (typeof data.auth_config === 'string' ? data.auth_config : JSON.stringify(data.auth_config))
      : (typeof existing.auth_config === 'string' ? existing.auth_config : JSON.stringify(existing.auth_config)),
    description: data.description !== undefined ? data.description : existing.description,
    is_active: data.is_active !== undefined ? (data.is_active ? 1 : 0) : existing.is_active,
    api_type: data.api_type !== undefined ? data.api_type : existing.api_type,
    sync_enabled: data.sync_enabled !== undefined ? (data.sync_enabled ? 1 : 0) : existing.sync_enabled,
    sync_cron: data.sync_cron !== undefined ? (data.sync_cron || null) : existing.sync_cron
  };

  await pool.query(
    `UPDATE api_configs SET
      name = ?, base_url = ?, auth_type = ?, auth_config = ?,
      description = ?, is_active = ?, api_type = ?, sync_enabled = ?, sync_cron = ?, updated_at = NOW()
     WHERE id = ?`,
    [merged.name, merged.base_url, merged.auth_type, merged.auth_config, merged.description, merged.is_active, merged.api_type, merged.sync_enabled, merged.sync_cron, id]
  );

  const [rows] = await pool.query('SELECT * FROM api_configs WHERE id = ?', [id]);
  return rows[0];
};

exports.markSyncResult = async (id, status, message = null) => {
  await pool.query(
    'UPDATE api_configs SET last_sync_at = NOW(), last_sync_status = ?, last_sync_message = ? WHERE id = ?',
    [status || null, message || null, id]
  );
};

exports.getSyncableConfigs = async () => {
  const [rows] = await pool.query(
    "SELECT * FROM api_configs WHERE api_type = 'personnel' AND sync_enabled = 1 AND is_active = 1"
  );
  return rows;
};

exports.remove = async (id) => {
  const existing = await exports.getById(id);
  if (!existing) {
    throw Object.assign(new Error('Không tìm thấy cấu hình API'), { statusCode: 404 });
  }
  if (existing.is_active) {
    throw Object.assign(new Error('Cấu hình đang active. Vui lòng tắt active trước khi xóa'), { statusCode: 400 });
  }
  await pool.query('DELETE FROM api_configs WHERE id = ?', [id]);
  return existing;
};

exports.getFieldMetadata = async (id) => {
  const config = await exports.getById(id);
  if (!config) return null;
  if (!config.field_metadata) return {};
  return typeof config.field_metadata === 'string' ? JSON.parse(config.field_metadata) : config.field_metadata;
};

exports.updateFieldMetadata = async (id, metadata) => {
  await pool.query(
    'UPDATE api_configs SET field_metadata = ?, updated_at = NOW() WHERE id = ?',
    [JSON.stringify(metadata), id]
  );
  return metadata;
};

exports.mergeFieldMetadata = async (configId, apiFields) => {
  const existing = await exports.getFieldMetadata(configId);
  const merged = { ...existing };
  apiFields.forEach(f => {
    if (!merged[f.key]) {
      merged[f.key] = { label: f.label || f.key, type: f.type || 'text', options: f.options || [] };
    } else if (merged[f.key].label === f.key && f.label !== f.key) {
      merged[f.key].label = f.label;
    }
  });
  await exports.updateFieldMetadata(configId, merged);
  return merged;
};

exports.getSelectedFields = async (id) => {
  const config = await exports.getById(id);
  if (!config) return null;
  if (!config.selected_fields) return null;
  return typeof config.selected_fields === 'string' ? JSON.parse(config.selected_fields) : config.selected_fields;
};

exports.updateSelectedFields = async (id, fields) => {
  await pool.query(
    'UPDATE api_configs SET selected_fields = ?, updated_at = NOW() WHERE id = ?',
    [JSON.stringify(fields), id]
  );
  return fields;
};

exports.getDescTemplate = async (id) => {
  const config = await exports.getById(id);
  if (!config) return null;
  if (!config.desc_template_config) return null;
  return typeof config.desc_template_config === 'string'
    ? JSON.parse(config.desc_template_config)
    : config.desc_template_config;
};

exports.updateDescTemplate = async (id, templateConfig) => {
  await pool.query(
    'UPDATE api_configs SET desc_template_config = ?, updated_at = NOW() WHERE id = ?',
    [JSON.stringify(templateConfig), id]
  );
  return templateConfig;
};

exports.testConnection = async (id) => {
  const config = await exports.getById(id);
  if (!config) {
    throw Object.assign(new Error('Không tìm thấy cấu hình API'), { statusCode: 404 });
  }

  const authConfig = typeof config.auth_config === 'string' ? JSON.parse(config.auth_config) : config.auth_config;
  const isPersonnel = config.api_type === 'personnel';
  const token = isPersonnel
    ? (authConfig.admin_token || authConfig.token || authConfig.access_token || '')
    : (authConfig.token || authConfig.access_token || authConfig.admin_token || '');
  const testPath = isPersonnel ? '/api/personnel/profile/gets' : '/api/customer/contact/gets';

  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const url = `${config.base_url}${testPath}?access_token=${token}&limit=1`;
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeout);
    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      return {
        status: 'failed',
        response_time: responseTime,
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }

    const result = await response.json();
    if (result.error) {
      return {
        status: 'failed',
        response_time: responseTime,
        error: result.message || 'Token không hợp lệ'
      };
    }
    return {
      status: 'connected',
      response_time: responseTime,
      data: { total: result.total_item || 0 }
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      status: 'failed',
      response_time: responseTime,
      error: error.name === 'AbortError' ? 'Request timeout (30s)' : error.message
    };
  }
};
