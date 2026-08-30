const pool = require('../utils/db');

exports.getAllForms = async (entity, status, page, limit) => {
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
  const { entity, name, description, status } = data;
  const [result] = await pool.query(
    'INSERT INTO forms (entity, name, description, status) VALUES (?, ?, ?, ?)',
    [entity, name, description || null, status || 'active']
  );
  const [rows] = await pool.query('SELECT * FROM forms WHERE id = ?', [result.insertId]);
  return rows[0];
};

exports.updateForm = async (id, data) => {
  const { entity, name, description, status } = data;
  await pool.query(
    'UPDATE forms SET entity = ?, name = ?, description = ?, status = ?, updated_at = NOW() WHERE id = ?',
    [entity, name, description || null, status || 'active', id]
  );
  const [rows] = await pool.query('SELECT * FROM forms WHERE id = ?', [id]);
  return rows[0];
};

exports.deleteForm = async (id) => {
  await pool.query('DELETE FROM forms WHERE id = ?', [id]);
};
