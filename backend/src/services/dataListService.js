const pool = require('../utils/db');

const parseJsonField = (val) => {
  if (!val) return val;
  if (typeof val === 'string') { try { return JSON.parse(val); } catch { return val; } }
  return val;
};

exports.getAll = async (page = 1, limit = 50) => {
  const offset = (page - 1) * limit;
  const [lists] = await pool.query(
    `SELECT dl.*,
      (SELECT COUNT(*) FROM data_list_rows WHERE list_id = dl.id) as row_count
     FROM data_lists dl ORDER BY dl.id DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  const [countResult] = await pool.query('SELECT COUNT(*) as total FROM data_lists');
  const parsed = lists.map(l => ({ ...l, columns_config: parseJsonField(l.columns_config) }));
  return { data: parsed, pagination: { page, limit, total: countResult[0].total, totalPages: Math.ceil(countResult[0].total / limit) } };
};

exports.getById = async (id, rowPage, rowLimit) => {
  const [lists] = await pool.query('SELECT * FROM data_lists WHERE id = ?', [id]);
  if (lists.length === 0) return null;
  const list = { ...lists[0], columns_config: parseJsonField(lists[0].columns_config) };

  if (rowPage && rowLimit) {
    const offset = (rowPage - 1) * rowLimit;
    const [countResult] = await pool.query('SELECT COUNT(*) as total FROM data_list_rows WHERE list_id = ?', [id]);
    const [rows] = await pool.query(
      'SELECT * FROM data_list_rows WHERE list_id = ? ORDER BY sort_order, id LIMIT ? OFFSET ?',
      [id, rowLimit, offset]
    );
    const parsedRows = rows.map(r => ({ ...r, data: parseJsonField(r.data) }));
    const total = countResult[0].total;
    return { ...list, rows: parsedRows, rowPagination: { page: rowPage, limit: rowLimit, total, totalPages: Math.ceil(total / rowLimit) } };
  }

  const [rows] = await pool.query(
    'SELECT * FROM data_list_rows WHERE list_id = ? ORDER BY sort_order, id',
    [id]
  );
  const parsedRows = rows.map(r => ({ ...r, data: parseJsonField(r.data) }));
  return { ...list, rows: parsedRows };
};

exports.create = async (data) => {
  const { name, description, columns_config } = data;
  const [result] = await pool.query(
    'INSERT INTO data_lists (name, description, columns_config) VALUES (?, ?, ?)',
    [name, description || null, JSON.stringify(columns_config)]
  );
  return exports.getById(result.insertId);
};

exports.update = async (id, data) => {
  const { name, description, columns_config } = data;
  const fields = [];
  const values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (description !== undefined) { fields.push('description = ?'); values.push(description); }
  if (columns_config !== undefined) { fields.push('columns_config = ?'); values.push(JSON.stringify(columns_config)); }
  if (fields.length === 0) return exports.getById(id);
  values.push(id);
  await pool.query(`UPDATE data_lists SET ${fields.join(', ')} WHERE id = ?`, values);
  return exports.getById(id);
};

exports.remove = async (id) => {
  await pool.query('DELETE FROM data_lists WHERE id = ?', [id]);
};

exports.addRows = async (listId, rows) => {
  if (!rows || rows.length === 0) return [];
  const values = rows.map((r, i) => [
    listId,
    JSON.stringify(r.data),
    r.parent_row_id || null,
    r.sort_order !== undefined ? r.sort_order : i
  ]);
  await pool.query(
    'INSERT INTO data_list_rows (list_id, data, parent_row_id, sort_order) VALUES ?',
    [values]
  );
  const [rowsResult] = await pool.query(
    'SELECT * FROM data_list_rows WHERE list_id = ? ORDER BY sort_order, id',
    [listId]
  );
  return rowsResult;
};

exports.updateRow = async (listId, rowId, data) => {
  await pool.query(
    'UPDATE data_list_rows SET data = ? WHERE id = ? AND list_id = ?',
    [JSON.stringify(data), rowId, listId]
  );
  const [rows] = await pool.query('SELECT * FROM data_list_rows WHERE id = ? AND list_id = ?', [rowId, listId]);
  return rows[0] || null;
};

exports.deleteRow = async (listId, rowId) => {
  await pool.query('UPDATE data_list_rows SET parent_row_id = NULL WHERE parent_row_id = ? AND list_id = ?', [rowId, listId]);
  await pool.query('DELETE FROM data_list_rows WHERE id = ? AND list_id = ?', [rowId, listId]);
};

exports.deleteAllRows = async (listId) => {
  await pool.query('DELETE FROM data_list_rows WHERE list_id = ?', [listId]);
};
