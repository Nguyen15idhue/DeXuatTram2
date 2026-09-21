const pool = require('../utils/db');

exports.getAllForms = async (entity, status, purpose, page, limit) => {
  const offset = (page - 1) * limit;
  let where = [];
  let params = [];

  if (entity) {
    where.push('f.entity = ?');
    params.push(entity);
  }

  if (status) {
    where.push('f.status = ?');
    params.push(status);
  }

  if (purpose) {
    where.push('f.purpose = ?');
    params.push(purpose);
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

  const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM forms f ${whereClause}`, params);
  const total = countResult[0].total;

  const [rows] = await pool.query(
    `SELECT f.*, COUNT(ff.id) as field_count
     FROM forms f
     LEFT JOIN form_fields ff ON f.id = ff.form_id
     ${whereClause}
     GROUP BY f.id
     ORDER BY f.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    forms: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
};

exports.getFormById = async (id) => {
  const [forms] = await pool.query('SELECT * FROM forms WHERE id = ?', [id]);
  if (forms.length === 0) return null;

  const form = forms[0];

  const [fields] = await pool.query(
    `SELECT ff.*, fd.entity, fd.\`key\`, fd.label, fd.type, fd.source_type, fd.required, fd.validation, fd.options, fd.placeholder, fd.help_text
     FROM form_fields ff
     JOIN field_definitions fd ON ff.field_id = fd.id
     WHERE ff.form_id = ?
     ORDER BY ff.order_index`,
    [id]
  );

  return { ...form, fields };
};

exports.createForm = async (data) => {
  const { entity, name, description, status, layout_config, purpose, is_default } = data;
  const [result] = await pool.query(
    'INSERT INTO forms (entity, name, description, status, layout_config, purpose, is_default) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [entity, name, description || null, status || 'active', layout_config ? JSON.stringify(layout_config) : null, purpose || 'all', is_default ? 1 : 0]
  );
  const [rows] = await pool.query('SELECT * FROM forms WHERE id = ?', [result.insertId]);
  return rows[0];
};

exports.updateForm = async (id, data) => {
  const [existing] = await pool.query('SELECT * FROM forms WHERE id = ?', [id]);
  if (existing.length === 0) {
    throw Object.assign(new Error('Không tìm thấy form'), { statusCode: 404 });
  }
  const prev = existing[0];
  const toJsonOrKeep = (incoming, current) => {
    if (incoming === undefined) return typeof current === 'string' ? current : JSON.stringify(current);
    if (incoming === null) return null;
    return typeof incoming === 'string' ? incoming : JSON.stringify(incoming);
  };
  const next = {
    entity: data.entity !== undefined ? data.entity : prev.entity,
    name: data.name !== undefined ? data.name : prev.name,
    description: data.description !== undefined ? data.description : prev.description,
    status: data.status !== undefined ? data.status : prev.status,
    layout_config: toJsonOrKeep(data.layout_config, prev.layout_config),
    purpose: data.purpose !== undefined ? data.purpose : prev.purpose,
    is_default: data.is_default === undefined ? prev.is_default : (data.is_default ? 1 : 0)
  };
  await pool.query(
    'UPDATE forms SET entity = ?, name = ?, description = ?, status = ?, layout_config = ?, purpose = ?, is_default = ?, updated_at = NOW() WHERE id = ?',
    [next.entity, next.name, next.description, next.status, next.layout_config, next.purpose, next.is_default, id]
  );
  const [rows] = await pool.query('SELECT * FROM forms WHERE id = ?', [id]);
  return rows[0];
};

exports.deleteForm = async (id) => {
  const [rows] = await pool.query('SELECT is_locked FROM forms WHERE id = ?', [id]);
  if (rows.length > 0 && rows[0].is_locked) {
    throw Object.assign(new Error('Form hệ thống, không thể xóa'), { statusCode: 400 });
  }
  await pool.query('DELETE FROM forms WHERE id = ?', [id]);
};

exports.getFormByEntityAndPurpose = async (entity, purpose) => {
  const [rows] = await pool.query(
    'SELECT * FROM forms WHERE entity = ? AND purpose = ? AND status = ? ORDER BY is_default DESC, id ASC LIMIT 1',
    [entity, purpose, 'active']
  );
  return rows[0] || null;
};

exports.getQuickCreateForm = async (entity) => {
  const [rows] = await pool.query(
    `SELECT id, name, entity, purpose
     FROM forms
     WHERE entity = ? AND purpose = 'create' AND is_default = 0 AND status = 'active'
     ORDER BY id ASC LIMIT 1`,
    [entity]
  );
  return rows[0] || null;
};
