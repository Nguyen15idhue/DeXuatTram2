const pool = require('../utils/db');

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const idOf = (value) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw fail('ID đơn vị vận chuyển không hợp lệ');
  return id;
};
const assertManager = (user) => {
  if (user?.role !== 'SUPER_ADMIN') throw fail('Chỉ SUPER_ADMIN được quản lý đơn vị vận chuyển', 403);
};

const list = async (user, options = false) => {
  if (options) {
    if (!(await require('./chargingStationAccessService').permissions(user)).back_office) {
      throw fail('Không có quyền chọn đơn vị vận chuyển', 403);
    }
  } else assertManager(user);
  const [rows] = await pool.query(`SELECT c.*,
    EXISTS(SELECT 1 FROM warehouse_exports we WHERE we.carrier_id=c.id) AS used
    FROM shipping_carriers c ${options ? 'WHERE c.active=1' : ''} ORDER BY c.name, c.id`);
  return rows;
};

const save = async (id, body, user) => {
  assertManager(user);
  const name = String(body.name || '').trim();
  const note = String(body.note || '').trim();
  if (!name || name.length > 255) throw fail('Tên đơn vị vận chuyển bắt buộc, tối đa 255 ký tự');
  if (note.length > 5000) throw fail('Ghi chú tối đa 5000 ký tự');
  if (typeof body.active !== 'boolean') throw fail('Trạng thái hoạt động không hợp lệ');
  try {
    if (id !== null) {
      const [result] = await pool.query('UPDATE shipping_carriers SET name=?, note=?, active=? WHERE id=?',
        [name, note || null, body.active ? 1 : 0, idOf(id)]);
      if (!result.affectedRows) throw fail('Không tìm thấy đơn vị vận chuyển', 404);
      return { id: idOf(id) };
    }
    const [result] = await pool.query('INSERT INTO shipping_carriers(name,note,active) VALUES(?,?,?)',
      [name, note || null, body.active ? 1 : 0]);
    return { id: result.insertId };
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw fail('Tên đơn vị vận chuyển đã tồn tại', 409);
    throw error;
  }
};

const remove = async (id, user) => {
  assertManager(user);
  try {
    const [result] = await pool.query('DELETE FROM shipping_carriers WHERE id=?', [idOf(id)]);
    if (!result.affectedRows) throw fail('Không tìm thấy đơn vị vận chuyển', 404);
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2') throw fail('Đơn vị đã có phiếu xuất; hãy ngừng hoạt động thay vì xóa', 409);
    throw error;
  }
};

const resolve = async (executor, id) => {
  const [rows] = await executor.query('SELECT id,name,active FROM shipping_carriers WHERE id=? FOR SHARE', [idOf(id)]);
  if (!rows.length || !rows[0].active) throw fail('Đơn vị vận chuyển không tồn tại hoặc đã ngừng hoạt động');
  return rows[0];
};

module.exports = { list, save, remove, resolve };
