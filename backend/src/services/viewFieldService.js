const pool = require('../utils/db');

exports.getFieldsByViewId = async (viewId) => {
  const [rows] = await pool.query(
    `SELECT vf.*, fd.entity, fd.\`key\`, fd.label, fd.type, fd.source_type, fd.required, fd.options
     FROM view_fields vf
     JOIN field_definitions fd ON vf.field_id = fd.id
     WHERE vf.view_id = ?
     ORDER BY vf.order_index`,
    [viewId]
  );
  return rows;
};

exports.getViewFieldById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM view_fields WHERE id = ?', [id]);
  return rows.length > 0 ? rows[0] : null;
};

exports.addFieldToView = async (viewId, data) => {
  const { field_id, order_index, visible, width, sortable, filterable, config } = data;

  const [maxResult] = await pool.query(
    'SELECT COALESCE(MAX(order_index), 0) + 1 as next_order FROM view_fields WHERE view_id = ?',
    [viewId]
  );
  const finalOrder = order_index !== undefined ? order_index : maxResult[0].next_order;

  const [result] = await pool.query(
    'INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      viewId,
      field_id,
      finalOrder,
      visible !== undefined ? (visible ? 1 : 0) : 1,
      width || null,
      sortable !== undefined ? (sortable ? 1 : 0) : 1,
      filterable !== undefined ? (filterable ? 1 : 0) : 0,
      config ? JSON.stringify(config) : null
    ]
  );
  const [rows] = await pool.query('SELECT * FROM view_fields WHERE id = ?', [result.insertId]);
  return rows[0];
};

exports.updateViewField = async (id, data) => {
  const { order_index, visible, width, sortable, filterable, config } = data;
  await pool.query(
    'UPDATE view_fields SET order_index = ?, visible = ?, width = ?, sortable = ?, filterable = ?, config = ? WHERE id = ?',
    [
      order_index,
      visible !== undefined ? (visible ? 1 : 0) : 1,
      width || null,
      sortable !== undefined ? (sortable ? 1 : 0) : 1,
      filterable !== undefined ? (filterable ? 1 : 0) : 0,
      config ? JSON.stringify(config) : null,
      id
    ]
  );
  const [rows] = await pool.query('SELECT * FROM view_fields WHERE id = ?', [id]);
  return rows[0];
};

exports.deleteViewField = async (id) => {
  await pool.query('DELETE FROM view_fields WHERE id = ?', [id]);
};

exports.reorderFields = async (viewId, fieldOrders) => {
  for (const item of fieldOrders) {
    await pool.query(
      'UPDATE view_fields SET order_index = ? WHERE id = ? AND view_id = ?',
      [item.order_index, item.id, viewId]
    );
  }
  return await exports.getFieldsByViewId(viewId);
};
