const pool = require('../utils/db');

const err = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const toInt = (value, label) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw err(`${label} không hợp lệ`, 400);
  return n;
};

const listSuppliers = async ({ search = '', page = 1, limit = 50 } = {}) => {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
  const offset = (safePage - 1) * safeLimit;

  const where = [];
  const params = [];
  if (search) {
    const like = `%${String(search).trim()}%`;
    where.push('(s.name LIKE ? OR s.note LIKE ?)');
    params.push(like, like);
  }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total FROM suppliers s ${whereClause}`, params);
  const [rows] = await pool.query(
    `SELECT s.id, s.name, s.logo, s.note, s.created_at, s.updated_at,
            COALESCE(SUM(scp.quantity), 0) AS total_quantity
     FROM suppliers s
     LEFT JOIN supplier_charging_poles scp ON scp.supplier_id = s.id
     ${whereClause}
     GROUP BY s.id
     ORDER BY s.name ASC, s.id ASC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );

  return {
    items: rows,
    pagination: { page: safePage, limit: safeLimit, total: Number(countRow.total || 0), totalPages: Math.ceil(Number(countRow.total || 0) / safeLimit) }
  };
};

const getSupplier = async (id) => {
  const supplierId = toInt(id, 'Nhà cung cấp');
  const [rows] = await pool.query('SELECT * FROM suppliers WHERE id = ?', [supplierId]);
  if (rows.length === 0) throw err('Không tìm thấy nhà cung cấp', 404);
  const [poles] = await pool.query(
    `SELECT scp.id, scp.charging_pole_id, scp.quantity, cp.name, cp.charging_type, cp.power_kw
     FROM supplier_charging_poles scp
     JOIN charging_poles cp ON cp.id = scp.charging_pole_id
     WHERE scp.supplier_id = ?
     ORDER BY cp.name ASC`,
    [supplierId]
  );
  return { ...rows[0], poles };
};

const createSupplier = async (data = {}) => {
  const name = String(data.name || '').trim();
  if (!name) throw err('Tên nhà cung cấp là bắt buộc', 400);
  const logo = data.logo ? String(data.logo).trim() : null;
  const note = data.note ? String(data.note).trim() : null;
  const [result] = await pool.query(
    'INSERT INTO suppliers (name, logo, note) VALUES (?, ?, ?)',
    [name, logo, note]
  );
  const [rows] = await pool.query('SELECT * FROM suppliers WHERE id = ?', [result.insertId]);
  return rows[0];
};

const updateSupplier = async (id, data = {}) => {
  const supplierId = toInt(id, 'Nhà cung cấp');
  const [rows] = await pool.query('SELECT * FROM suppliers WHERE id = ?', [supplierId]);
  if (rows.length === 0) throw err('Không tìm thấy nhà cung cấp', 404);

  const patch = {};
  if (data.name !== undefined) {
    const name = String(data.name || '').trim();
    if (!name) throw err('Tên nhà cung cấp là bắt buộc', 400);
    patch.name = name;
  }
  if (data.logo !== undefined) patch.logo = data.logo ? String(data.logo).trim() : null;
  if (data.note !== undefined) patch.note = data.note ? String(data.note).trim() : null;

  if (Object.keys(patch).length === 0) throw err('Không có dữ liệu cập nhật', 400);
  const keys = Object.keys(patch);
  await pool.query(
    `UPDATE suppliers SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
    [...keys.map((key) => patch[key]), supplierId]
  );
  const [updated] = await pool.query('SELECT * FROM suppliers WHERE id = ?', [supplierId]);
  return updated[0];
};

const stockQuantity = (value, label) => {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') {
    throw err(`${label} phải là số nguyên không âm`, 400);
  }
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 2147483647) {
    throw err(`${label} phải là số nguyên từ 0 đến 2147483647`, 400);
  }
  return quantity;
};

const writeStock = async (supplierId, poleId, data, user, assign = false) => {
  const sid = toInt(supplierId, 'Nhà cung cấp');
  const pid = toInt(poleId, 'Loại trụ');
  const canAdjust = ['SUPER_ADMIN', 'ADMIN'].includes(user?.role);
  if (!assign && !canAdjust) throw err('Chỉ quản trị viên được điều chỉnh tồn kho', 403);
  const quantity = assign && data.quantity === undefined ? undefined : stockQuantity(data.quantity, 'Số lượng tồn mới');
  const expected = data.expected_quantity === undefined && assign
    ? undefined : stockQuantity(data.expected_quantity, 'Số lượng tồn hiện tại');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (assign) {
      const [suppliers] = await conn.query('SELECT id FROM suppliers WHERE id = ?', [sid]);
      if (!suppliers.length) throw err('Không tìm thấy nhà cung cấp', 404);
      const [poles] = await conn.query('SELECT id FROM charging_poles WHERE id = ?', [pid]);
      if (!poles.length) throw err('Không tìm thấy loại trụ', 404);
      await conn.query(
        `INSERT INTO supplier_charging_poles (supplier_id, charging_pole_id, quantity)
         VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE id = id`,
        [sid, pid]
      );
    }
    const [rows] = await conn.query(
      `SELECT quantity FROM supplier_charging_poles
       WHERE supplier_id = ? AND charging_pole_id = ? FOR UPDATE`,
      [sid, pid]
    );
    if (!rows.length) throw err('Không tìm thấy tồn kho của nhà cung cấp cho loại trụ này', 404);
    const current = Number(rows[0].quantity);
    if (quantity !== undefined) {
      if (!canAdjust && quantity !== current) throw err('Chỉ quản trị viên được điều chỉnh tồn kho', 403);
      if (expected === undefined && quantity !== current) {
        throw err('Vui lòng dùng chức năng Sửa tồn kho hoặc gửi kèm số lượng tồn hiện tại', 400);
      }
      if (expected !== undefined && expected !== current) {
        throw err('Số lượng tồn đã thay đổi. Vui lòng tải lại dữ liệu trước khi chỉnh sửa.', 409);
      }
      if (quantity !== current) {
        await conn.query(
          'UPDATE supplier_charging_poles SET quantity = ? WHERE supplier_id = ? AND charging_pole_id = ?',
          [quantity, sid, pid]
        );
      }
      if (canAdjust) {
        await conn.query(
          `UPDATE charging_poles
           SET quantity = (SELECT COALESCE(SUM(quantity), 0) FROM supplier_charging_poles WHERE charging_pole_id = ?)
           WHERE id = ?`,
          [pid, pid]
        );
      }
    }
    await conn.commit();
    return { supplier_id: sid, pole_id: pid, quantity: quantity ?? current };
  } catch (error) {
    await conn.rollback();
    if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) {
      throw err('Tồn kho đang được cập nhật bởi thao tác khác. Vui lòng tải lại dữ liệu và thử lại.', 409);
    }
    throw error;
  } finally {
    conn.release();
  }
};

const assignPole = (supplierId, poleId, quantity, user, expectedQuantity) =>
  writeStock(supplierId, poleId, { quantity, expected_quantity: expectedQuantity }, user, true);

const adjustStock = (supplierId, poleId, data = {}, user) => writeStock(supplierId, poleId, data, user);

const syncPoleSuppliers = async (poleId, suppliers = []) => {
  const pid = toInt(poleId, 'Loại trụ');
  const [poles] = await pool.query('SELECT id FROM charging_poles WHERE id = ?', [pid]);
  if (poles.length === 0) throw err('Không tìm thấy loại trụ', 404);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const selected = new Map();
    suppliers.forEach((item) => {
      const sid = toInt(item.supplier_id, 'Nhà cung cấp');
      const qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty < 0) throw err('Số lượng không hợp lệ', 400);
      selected.set(sid, qty);
    });

    for (const sid of selected.keys()) {
      const [suppliers] = await conn.query('SELECT id FROM suppliers WHERE id = ?', [sid]);
      if (suppliers.length === 0) throw err('Không tìm thấy nhà cung cấp', 404);
      await conn.query(
        `INSERT INTO supplier_charging_poles (supplier_id, charging_pole_id, quantity)
         VALUES (?, ?, 0)
         ON DUPLICATE KEY UPDATE supplier_id = supplier_id`,
        [sid, pid]
      );
    }

    const [existing] = await conn.query(
      'SELECT supplier_id FROM supplier_charging_poles WHERE charging_pole_id = ?',
      [pid]
    );
    for (const row of existing) {
      if (!selected.has(row.supplier_id)) {
        const [used] = await conn.query(
          `SELECT
             (SELECT COUNT(*) FROM warehouse_import_items WHERE pole_id = ? AND supplier_id = ?) AS imported,
             (SELECT COUNT(*) FROM warehouse_export_items WHERE pole_id = ? AND supplier_id = ?) AS exported,
             (SELECT quantity FROM supplier_charging_poles WHERE charging_pole_id = ? AND supplier_id = ?) AS stock`,
          [pid, row.supplier_id, pid, row.supplier_id, pid, row.supplier_id]
        );
        if (Number(used[0].imported) === 0 && Number(used[0].exported) === 0 && Number(used[0].stock || 0) === 0) {
          await conn.query(
            'DELETE FROM supplier_charging_poles WHERE charging_pole_id = ? AND supplier_id = ?',
            [pid, row.supplier_id]
          );
        } else {
          throw err('Không thể bỏ nhà cung cấp đã phát sinh giao dịch hoặc còn tồn kho', 400);
        }
      }
    }

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
  return true;
};

const listPolesBySupplier = async (supplierId) => {
  const sid = toInt(supplierId, 'Nhà cung cấp');
  const [rows] = await pool.query(
    `SELECT scp.id, scp.supplier_id, scp.charging_pole_id, scp.quantity, cp.name, cp.charging_type, cp.power_kw
     FROM supplier_charging_poles scp
     JOIN charging_poles cp ON cp.id = scp.charging_pole_id
     WHERE scp.supplier_id = ?
     ORDER BY cp.power_kw ASC, cp.charging_type ASC, cp.name ASC, cp.id ASC`,
    [sid]
  );
  return rows;
};

const listSuppliersByPole = async (poleId) => {
  const pid = toInt(poleId, 'Loại trụ');
  const [rows] = await pool.query(
    `SELECT scp.id, scp.supplier_id, scp.quantity, s.name AS supplier_name, s.logo AS supplier_logo
     FROM supplier_charging_poles scp
     JOIN suppliers s ON s.id = scp.supplier_id
     WHERE scp.charging_pole_id = ?
     ORDER BY s.name ASC`,
    [pid]
  );
  return rows;
};

exports.listSuppliers = listSuppliers;
exports.getSupplier = getSupplier;
exports.createSupplier = createSupplier;
exports.updateSupplier = updateSupplier;
exports.assignPole = assignPole;
exports.adjustStock = adjustStock;
exports.syncPoleSuppliers = syncPoleSuppliers;
exports.listPolesBySupplier = listPolesBySupplier;
exports.listSuppliersByPole = listSuppliersByPole;
