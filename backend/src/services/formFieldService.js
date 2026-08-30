const pool = require('../utils/db');

exports.getFieldsByFormId = async (formId) => {
  const [rows] = await pool.query(
    `SELECT ff.*, fd.entity, fd.\`key\`, fd.label, fd.type, fd.source_type, fd.required, fd.validation, fd.options, fd.placeholder, fd.help_text
     FROM form_fields ff
     JOIN field_definitions fd ON ff.field_id = fd.id
     WHERE ff.form_id = ?
     ORDER BY ff.order_index`,
    [formId]
  );
  return rows;
};

exports.getFormFieldById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM form_fields WHERE id = ?', [id]);
  return rows.length > 0 ? rows[0] : null;
};

exports.addFieldToForm = async (formId, data) => {
  const { field_id, order_index, visible, config } = data;

  const [maxResult] = await pool.query(
    'SELECT COALESCE(MAX(order_index), 0) + 1 as next_order FROM form_fields WHERE form_id = ?',
    [formId]
  );
  const finalOrder = order_index !== undefined ? order_index : maxResult[0].next_order;

  const [result] = await pool.query(
    'INSERT INTO form_fields (form_id, field_id, order_index, visible, config) VALUES (?, ?, ?, ?, ?)',
    [
      formId,
      field_id,
      finalOrder,
      visible !== undefined ? (visible ? 1 : 0) : 1,
      config ? JSON.stringify(config) : null
    ]
  );
  const [rows] = await pool.query('SELECT * FROM form_fields WHERE id = ?', [result.insertId]);
  return rows[0];
};

exports.updateFormField = async (id, data) => {
  const { order_index, visible, config } = data;
  await pool.query(
    'UPDATE form_fields SET order_index = ?, visible = ?, config = ? WHERE id = ?',
    [
      order_index,
      visible !== undefined ? (visible ? 1 : 0) : 1,
      config ? JSON.stringify(config) : null,
      id
    ]
  );
  const [rows] = await pool.query('SELECT * FROM form_fields WHERE id = ?', [id]);
  return rows[0];
};

exports.deleteFormField = async (id) => {
  await pool.query('DELETE FROM form_fields WHERE id = ?', [id]);
};

exports.reorderFields = async (formId, fieldOrders) => {
  for (const item of fieldOrders) {
    await pool.query(
      'UPDATE form_fields SET order_index = ? WHERE id = ? AND form_id = ?',
      [item.order_index, item.id, formId]
    );
  }
  return await exports.getFieldsByFormId(formId);
};
