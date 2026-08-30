const pool = require('../utils/db');

exports.getAllViews = async (entity, status, page, limit) => {
  const offset = (page - 1) * limit;
  let where = [];
  let params = [];

  if (entity) {
    where.push('v.entity = ?');
    params.push(entity);
  }

  if (status) {
    where.push('v.status = ?');
    params.push(status);
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

  const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM views v ${whereClause}`, params);
  const total = countResult[0].total;

  const [rows] = await pool.query(
    `SELECT v.*, COUNT(vf.id) as field_count
     FROM views v
     LEFT JOIN view_fields vf ON v.id = vf.view_id
     ${whereClause}
     GROUP BY v.id
     ORDER BY v.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    views: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
};

exports.getViewById = async (id) => {
  const [views] = await pool.query('SELECT * FROM views WHERE id = ?', [id]);
  if (views.length === 0) return null;

  const view = views[0];

  const [fields] = await pool.query(
    `SELECT vf.*, fd.entity, fd.\`key\`, fd.label, fd.type, fd.source_type, fd.required, fd.options
     FROM view_fields vf
     JOIN field_definitions fd ON vf.field_id = fd.id
     WHERE vf.view_id = ?
     ORDER BY vf.order_index`,
    [id]
  );

  return { ...view, fields };
};

exports.createView = async (data) => {
  const { entity, name, description, status } = data;
  const [result] = await pool.query(
    'INSERT INTO views (entity, name, description, status) VALUES (?, ?, ?, ?)',
    [entity, name, description || null, status || 'active']
  );
  const [rows] = await pool.query('SELECT * FROM views WHERE id = ?', [result.insertId]);
  return rows[0];
};

exports.updateView = async (id, data) => {
  const { entity, name, description, status } = data;
  await pool.query(
    'UPDATE views SET entity = ?, name = ?, description = ?, status = ?, updated_at = NOW() WHERE id = ?',
    [entity, name, description || null, status || 'active', id]
  );
  const [rows] = await pool.query('SELECT * FROM views WHERE id = ?', [id]);
  return rows[0];
};

exports.deleteView = async (id) => {
  await pool.query('DELETE FROM views WHERE id = ?', [id]);
};
