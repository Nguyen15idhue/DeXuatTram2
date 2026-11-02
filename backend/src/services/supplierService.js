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

const assignPole = async (supplierId, poleId, quantity = 0) => {
  const sid = toInt(supplierId, 'Nhà cung cấp');
  const pid = toInt(poleId, 'Loại trụ');
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 0) throw err('Số lượng không hợp lệ', 400);
  const [suppliers] = await pool.query('SELECT id FROM suppliers WHERE id = ?', [sid]);
  if (suppliers.length === 0) throw err('Không tìm thấy nhà cung cấp', 404);
  const [poles] = await pool.query('SELECT id FROM charging_poles WHERE id = ?', [pid]);
  if (poles.length === 0) throw err('Không tìm thấy loại trụ', 404);

  await pool.query(
    `INSERT INTO supplier_charging_poles (supplier_id, charging_pole_id, quantity)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
    [sid, pid, qty]
  );
  return true;
};

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
     ORDER BY cp.name ASC`,
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
exports.syncPoleSuppliers = syncPoleSuppliers;
exports.listPolesBySupplier = listPolesBySupplier;
exports.listSuppliersByPole = listSuppliersByPole;
