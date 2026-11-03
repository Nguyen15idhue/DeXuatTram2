const pool = require('../utils/db');

const err = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const toInt = (value, label) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw err(`${label} không hợp lệ`, 400);
  return n;
};

const toNullableInt = (value, label) => {
  if (value === null || value === undefined || value === '') return null;
  return toInt(value, label);
};

const normalizeDate = (value, label) => {
  if (!value) throw err(`${label} là bắt buộc`, 400);
  const text = String(value).trim().replace(' ', 'T');
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw err(`${label} không hợp lệ`, 400);
  return date.toISOString().slice(0, 19).replace('T', ' ');
};

const normalizeItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) throw err('Danh sách trụ sạc là bắt buộc', 400);
  const map = new Map();
  items.forEach((item) => {
    const poleId = toInt(item.pole_id || item.id, 'Trụ sạc');
    const supplierId = toInt(item.supplier_id, 'Nhà cung cấp');
    const quantity = toInt(item.quantity, 'Số lượng');
    const key = `${supplierId}:${poleId}`;
    const current = map.get(key) || { pole_id: poleId, supplier_id: supplierId, quantity: 0 };
    current.quantity += quantity;
    map.set(key, current);
  });
  return [...map.values()];
};

const listPoles = async ({ search = '', page = 1, limit = 20 } = {}) => {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 20));
  const offset = (safePage - 1) * safeLimit;

  const where = [];
  const params = [];
  if (search) {
    const like = `%${String(search).trim()}%`;
    where.push('(cp.name LIKE ? OR s.name LIKE ?)');
    params.push(like, like);
  }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [[countRow]] = await pool.query(
    `SELECT COUNT(DISTINCT cp.id) AS total
     FROM charging_poles cp
     LEFT JOIN supplier_charging_poles scp ON scp.charging_pole_id = cp.id
     LEFT JOIN suppliers s ON s.id = scp.supplier_id
     ${whereClause}`,
    params
  );
  const [rows] = await pool.query(
    `SELECT cp.id, cp.name, cp.charging_type, cp.power_kw, cp.quantity, cp.note, cp.created_at, cp.updated_at,
            GROUP_CONCAT(DISTINCT s.name ORDER BY s.name SEPARATOR ', ') AS suppliers
     FROM charging_poles cp
     LEFT JOIN supplier_charging_poles scp ON scp.charging_pole_id = cp.id
     LEFT JOIN suppliers s ON s.id = scp.supplier_id
     ${whereClause}
     GROUP BY cp.id
     ORDER BY cp.id DESC LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );

  return {
    items: rows,
    pagination: { page: safePage, limit: safeLimit, total: Number(countRow.total || 0), totalPages: Math.ceil(Number(countRow.total || 0) / safeLimit) }
  };
};

const createPole = async (data = {}) => {
  const name = String(data.name || '').trim();
  if (!name) throw err('Tên trụ sạc là bắt buộc', 400);
  const chargingType = String(data.charging_type || '').trim().toUpperCase();
  if (!['AC', 'DC'].includes(chargingType)) throw err('Loại sạc chỉ được AC hoặc DC', 400);
  const powerKw = Number(data.power_kw);
  if (!Number.isFinite(powerKw) || powerKw <= 0) throw err('Công suất phải lớn hơn 0', 400);
  const note = data.note ? String(data.note).trim() : null;

  const [existing] = await pool.query(
    'SELECT * FROM charging_poles WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND charging_type = ? AND power_kw = ? LIMIT 1',
    [name, chargingType, powerKw]
  );
  if (existing.length > 0) {
    if (note && !existing[0].note) {
      await pool.query('UPDATE charging_poles SET note = ? WHERE id = ?', [note, existing[0].id]);
    }
    const [rows] = await pool.query('SELECT * FROM charging_poles WHERE id = ?', [existing[0].id]);
    return { ...rows[0], created: false };
  }

  const [result] = await pool.query(
    'INSERT INTO charging_poles (name, charging_type, power_kw, quantity, note) VALUES (?, ?, ?, 0, ?)',
    [name, chargingType, powerKw, note]
  );
  const [rows] = await pool.query('SELECT * FROM charging_poles WHERE id = ?', [result.insertId]);
  return { ...rows[0], created: true };
};

const updatePole = async (id, data = {}) => {
  const poleId = toInt(id, 'Trụ sạc');
  const [rows] = await pool.query('SELECT * FROM charging_poles WHERE id = ?', [poleId]);
  if (rows.length === 0) throw err('Không tìm thấy trụ sạc', 404);
  const current = rows[0];

  const patch = {};
  if (data.name !== undefined) {
    const name = String(data.name || '').trim();
    if (!name) throw err('Tên trụ sạc là bắt buộc', 400);
    patch.name = name;
  }
  if (data.charging_type !== undefined) {
    const chargingType = String(data.charging_type || '').trim().toUpperCase();
    if (!['AC', 'DC'].includes(chargingType)) throw err('Loại sạc chỉ được AC hoặc DC', 400);
    patch.charging_type = chargingType;
  }
  if (data.power_kw !== undefined) {
    const powerKw = Number(data.power_kw);
    if (!Number.isFinite(powerKw) || powerKw <= 0) throw err('Công suất phải lớn hơn 0', 400);
    patch.power_kw = powerKw;
  }
  if (data.supplier !== undefined) {
    patch.supplier = data.supplier ? String(data.supplier).trim() : null;
  }
  if (data.note !== undefined) {
    patch.note = data.note ? String(data.note).trim() : null;
  }

  if (Object.keys(patch).length === 0) throw err('Không có dữ liệu cập nhật', 400);
  const keys = Object.keys(patch);
  await pool.query(
    `UPDATE charging_poles SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
    [...keys.map((key) => patch[key]), poleId]
  );
  const [updated] = await pool.query('SELECT * FROM charging_poles WHERE id = ?', [poleId]);
  return updated[0];
};

const deletePole = async (id) => {
  const poleId = toInt(id, 'Trụ sạc');
  const [usage] = await pool.query(
    `SELECT
      (SELECT COUNT(*) FROM warehouse_import_items WHERE pole_id = ?) AS imported,
      (SELECT COUNT(*) FROM warehouse_export_items WHERE pole_id = ?) AS exported`,
    [poleId, poleId]
  );
  if (Number(usage[0].imported) > 0 || Number(usage[0].exported) > 0) {
    throw err('Trụ sạc đã phát sinh nhập/xuất kho, không thể xóa', 400);
  }
  const [result] = await pool.query('DELETE FROM charging_poles WHERE id = ?', [poleId]);
  if (result.affectedRows === 0) throw err('Không tìm thấy trụ sạc', 404);
  return true;
};

const listImports = async ({ page = 1, limit = 20, search = '', supplier_id = '', date_from = '', date_to = '' } = {}) => {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 20));
  const offset = (safePage - 1) * safeLimit;

  const where = [];
  const params = [];
  if (search) { where.push('(wi.id = ? OR p.ma_de_xuat_gen LIKE ? OR cs.ma_tram LIKE ? OR u.full_name LIKE ?)'); params.push(Number(search) || 0, `%${search}%`, `%${search}%`, `%${search}%`); }
  if (supplier_id) { where.push('wii_filter.supplier_id = ?'); params.push(Number(supplier_id)); }
  if (date_from) { where.push('wi.import_date >= ?'); params.push(`${date_from} 00:00:00`); }
  if (date_to) { where.push('wi.import_date <= ?'); params.push(`${date_to} 23:59:59`); }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const joinFilter = supplier_id ? 'JOIN warehouse_import_items wii_filter ON wii_filter.import_id = wi.id' : '';
  const [[countRow]] = await pool.query(`SELECT COUNT(DISTINCT wi.id) AS total FROM warehouse_imports wi LEFT JOIN users u ON u.id=wi.importer_user_id LEFT JOIN charging_stations cs ON cs.id=wi.charging_station_id LEFT JOIN station_proposals p ON p.id=cs.proposal_id ${joinFilter} ${whereClause}`, params);
  const [rows] = await pool.query(
    `SELECT wi.id, wi.importer_user_id, wi.import_date, wi.charging_station_id, wi.note, wi.created_at,
            u.full_name AS importer_name,
            p.ma_de_xuat_gen AS ma_de_xuat, cs.ma_tram
     FROM warehouse_imports wi
     LEFT JOIN users u ON u.id = wi.importer_user_id
     LEFT JOIN charging_stations cs ON cs.id = wi.charging_station_id
     LEFT JOIN station_proposals p ON p.id = cs.proposal_id ${joinFilter} ${whereClause}
     ORDER BY wi.id DESC LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );

  if (rows.length === 0) {
    return { items: [], pagination: { page: safePage, limit: safeLimit, total: 0, totalPages: 0 } };
  }

  const ids = rows.map((row) => row.id);
  const [items] = await pool.query(
    `SELECT wii.import_id, wii.id, wii.supplier_id, wii.pole_id, wii.quantity, cp.name, s.name AS supplier_name, cp.charging_type, cp.power_kw
     FROM warehouse_import_items wii
     JOIN charging_poles cp ON cp.id = wii.pole_id
     LEFT JOIN suppliers s ON s.id = wii.supplier_id
     WHERE wii.import_id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  const itemMap = new Map();
  items.forEach((item) => {
    if (!itemMap.has(item.import_id)) itemMap.set(item.import_id, []);
    itemMap.get(item.import_id).push(item);
  });
  const [evidence] = await pool.query(
    `SELECT wif.import_id, f.id, f.original_name, f.mime_type, f.size
     FROM warehouse_import_files wif
     JOIN files f ON f.id = wif.file_id
     WHERE wif.import_id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  const evidenceMap = new Map();
  evidence.forEach((file) => {
    if (!evidenceMap.has(file.import_id)) evidenceMap.set(file.import_id, []);
    evidenceMap.get(file.import_id).push(file);
  });
  rows.forEach((row) => {
    row.items = itemMap.get(row.id) || [];
    row.evidence_files = evidenceMap.get(row.id) || [];
  });

  return {
    items: rows,
    pagination: { page: safePage, limit: safeLimit, total: Number(countRow.total || 0), totalPages: Math.ceil(Number(countRow.total || 0) / safeLimit) }
  };
};

const getImport = async (id) => {
  const importId = toInt(id, 'Phiếu nhập');
  const [rows] = await pool.query(
    `SELECT wi.*, u.full_name AS importer_name
     FROM warehouse_imports wi
     LEFT JOIN users u ON u.id = wi.importer_user_id
     WHERE wi.id = ?`,
    [importId]
  );
  if (rows.length === 0) throw err('Không tìm thấy phiếu nhập', 404);
  const [items] = await pool.query(
    `SELECT wii.id, wii.pole_id, wii.quantity, cp.name, cp.charging_type, cp.power_kw
     FROM warehouse_import_items wii
     JOIN charging_poles cp ON cp.id = wii.pole_id
     WHERE wii.import_id = ?`,
    [importId]
  );
  const [evidence] = await pool.query(
    `SELECT f.id, f.original_name, f.mime_type, f.size
     FROM warehouse_import_files wif
     JOIN files f ON f.id = wif.file_id
     WHERE wif.import_id = ?
     ORDER BY wif.sort_order, wif.id`,
    [importId]
  );
  return { ...rows[0], items, evidence_files: evidence };
};

const createImport = async (data = {}, ctx = {}) => {
  const importerUserId = ctx.userId || toInt(data.importer_user_id, 'Người nhập kho');
  const importDate = normalizeDate(data.import_date || new Date().toISOString(), 'Ngày nhập kho');
  const chargingStationId = toNullableInt(data.charging_station_id, 'Trạm sạc');
  const note = data.note ? String(data.note).trim() : null;
  const items = normalizeItems(data.items);
  const evidenceFileIds = [...new Set((Array.isArray(data.evidence_file_ids) ? data.evidence_file_ids : [])
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0))];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const relationParams = [];
    const relationClauses = items.map((item) => {
      relationParams.push(item.supplier_id, item.pole_id);
      return '(supplier_id = ? AND charging_pole_id = ?)';
    });
    const [relations] = await conn.query(
      `SELECT supplier_id, charging_pole_id FROM supplier_charging_poles WHERE ${relationClauses.join(' OR ')}`,
      relationParams
    );
    const relationSet = new Set(relations.map((row) => `${row.supplier_id}:${row.charging_pole_id}`));
    for (const item of items) {
      if (!relationSet.has(`${item.supplier_id}:${item.pole_id}`)) {
        throw err('Loại trụ chưa được gán cho nhà cung cấp đã chọn', 400);
      }
    }
    const [headerResult] = await conn.query(
      `INSERT INTO warehouse_imports (importer_user_id, import_date, charging_station_id, note)
       VALUES (?, ?, ?, ?)`,
      [importerUserId, importDate, chargingStationId, note]
    );
    const importId = headerResult.insertId;
    await conn.query(
      `INSERT INTO warehouse_import_items (import_id, supplier_id, pole_id, quantity) VALUES ?`,
      [items.map((item) => [importId, item.supplier_id, item.pole_id, item.quantity])]
    );
    for (const item of items) {
      await conn.query(
        `INSERT INTO supplier_charging_poles (supplier_id, charging_pole_id, quantity)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
        [item.supplier_id, item.pole_id, item.quantity]
      );
      await conn.query(
        `UPDATE charging_poles
         SET quantity = (SELECT COALESCE(SUM(quantity),0) FROM supplier_charging_poles WHERE charging_pole_id = ?)
         WHERE id = ?`,
        [item.pole_id, item.pole_id]
      );
    }
    if (evidenceFileIds.length > 0) {
      const [fileRows] = await conn.query(
        `SELECT id, mime_type, status FROM files WHERE id IN (${evidenceFileIds.map(() => '?').join(',')}) AND status <> 'deleted'`,
        evidenceFileIds
      );
      if (fileRows.length !== evidenceFileIds.length) throw err('Có file minh chứng không tồn tại', 400);
      for (const file of fileRows) {
        const mime = String(file.mime_type || '').toLowerCase();
        if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'].includes(mime)) {
          throw err('Minh chứng chỉ chấp nhận ảnh JPG/PNG/GIF/WEBP hoặc PDF', 400);
        }
      }
      await conn.query(
        `INSERT IGNORE INTO warehouse_import_files (import_id, file_id, sort_order) VALUES ?`,
        [evidenceFileIds.map((fileId, index) => [importId, fileId, index])]
      );
    }
    await conn.commit();
    return getImport(importId);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

const listExports = async ({ page = 1, limit = 20, search = '', supplier_id = '', destination_type = '', date_from = '', date_to = '' } = {}) => {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 20));
  const offset = (safePage - 1) * safeLimit;

  const where = [];
  const params = [];
  if (search) { where.push('(we.id = ? OR we.destination_name LIKE ? OR cs.ma_tram LIKE ? OR u.full_name LIKE ?)'); params.push(Number(search) || 0, `%${search}%`, `%${search}%`, `%${search}%`); }
  if (supplier_id) { where.push('wei_filter.supplier_id = ?'); params.push(Number(supplier_id)); }
  if (destination_type) { where.push('we.destination_type = ?'); params.push(destination_type); }
  if (date_from) { where.push('we.export_date >= ?'); params.push(`${date_from} 00:00:00`); }
  if (date_to) { where.push('we.export_date <= ?'); params.push(`${date_to} 23:59:59`); }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const joinFilter = supplier_id ? 'JOIN warehouse_export_items wei_filter ON wei_filter.export_id = we.id' : '';
  const [[countRow]] = await pool.query(`SELECT COUNT(DISTINCT we.id) AS total FROM warehouse_exports we LEFT JOIN users u ON u.id=we.exporter_user_id LEFT JOIN charging_stations cs ON cs.id=we.charging_station_id ${joinFilter} ${whereClause}`, params);
  const [rows] = await pool.query(
    `SELECT we.id, we.exporter_user_id, we.export_date, we.reason, we.charging_station_id, we.created_at,
            u.full_name AS exporter_name,
            cs.ma_tram, p.ma_de_xuat_gen AS ma_de_xuat
     FROM warehouse_exports we
     LEFT JOIN users u ON u.id = we.exporter_user_id
     LEFT JOIN charging_stations cs ON cs.id = we.charging_station_id
     LEFT JOIN station_proposals p ON p.id = cs.proposal_id ${joinFilter} ${whereClause}
     ORDER BY we.id DESC LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );

  if (rows.length === 0) {
    return { items: [], pagination: { page: safePage, limit: safeLimit, total: 0, totalPages: 0 } };
  }

  const ids = rows.map((row) => row.id);
  const [items] = await pool.query(
    `SELECT wei.export_id, wei.id, wei.supplier_id, wei.pole_id, wei.quantity, cp.name, s.name AS supplier_name, cp.charging_type, cp.power_kw
     FROM warehouse_export_items wei
     JOIN charging_poles cp ON cp.id = wei.pole_id
     LEFT JOIN suppliers s ON s.id = wei.supplier_id
     WHERE wei.export_id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  const itemMap = new Map();
  items.forEach((item) => {
    if (!itemMap.has(item.export_id)) itemMap.set(item.export_id, []);
    itemMap.get(item.export_id).push(item);
  });
  rows.forEach((row) => { row.items = itemMap.get(row.id) || []; });

  return {
    items: rows,
    pagination: { page: safePage, limit: safeLimit, total: Number(countRow.total || 0), totalPages: Math.ceil(Number(countRow.total || 0) / safeLimit) }
  };
};

const getExport = async (id) => {
  const exportId = toInt(id, 'Phiếu xuất');
  const [rows] = await pool.query(
    `SELECT we.*, u.full_name AS exporter_name
     FROM warehouse_exports we
     LEFT JOIN users u ON u.id = we.exporter_user_id
     WHERE we.id = ?`,
    [exportId]
  );
  if (rows.length === 0) throw err('Không tìm thấy phiếu xuất', 404);
  const [items] = await pool.query(
    `SELECT wei.id, wei.pole_id, wei.quantity, cp.name, cp.charging_type, cp.power_kw
     FROM warehouse_export_items wei
     JOIN charging_poles cp ON cp.id = wei.pole_id
     WHERE wei.export_id = ?`,
    [exportId]
  );
  return { ...rows[0], items };
};

const createExportWithinTransaction = async (conn, data = {}, ctx = {}) => {
  const exporterUserId = ctx.userId || toInt(data.exporter_user_id, 'Người xuất kho');
  const exportDate = normalizeDate(data.export_date || new Date().toISOString(), 'Ngày xuất kho');
  const destinationType = String(data.destination_type || 'STATION').trim().toUpperCase();
  if (!['STATION', 'WAREHOUSE', 'PROJECT', 'OTHER'].includes(destinationType)) throw err('Loại nơi nhận không hợp lệ', 400);
  const chargingStationId = destinationType === 'STATION' ? toInt(data.charging_station_id, 'Trạm sạc') : null;
  const destinationName = data.destination_name ? String(data.destination_name).trim() : null;
  const destinationAddress = data.destination_address ? String(data.destination_address).trim() : null;
  const destinationNote = data.destination_note ? String(data.destination_note).trim() : null;
  if (destinationType !== 'STATION' && !destinationName) throw err('Tên nơi nhận là bắt buộc', 400);
  const reason = data.reason ? String(data.reason).trim() : null;
  const carrier = data.carrier ? String(data.carrier).trim() : null;
  const transportCode = data.transport_code ? String(data.transport_code).trim() : null;
  const transportStatus = String(data.transport_status || 'PENDING').trim().toUpperCase();
  const totalAmount = data.total_amount === null || data.total_amount === undefined || data.total_amount === ''
    ? null
    : Number(data.total_amount);
  const items = normalizeItems(data.items);
  if (!['PENDING', 'SHIPPING', 'DELIVERED', 'FAILED', 'RETURNED'].includes(transportStatus)) {
    throw err('Trạng thái vận chuyển không hợp lệ', 400);
  }
  if (totalAmount !== null && (!Number.isFinite(totalAmount) || totalAmount < 0)) {
    throw err('Tổng số tiền vận chuyển phải là số không âm', 400);
  }

  const [stationRows] = await conn.query(
    `SELECT cs.id, p.chot_so_luong_tru
     FROM charging_stations cs
     JOIN station_proposals p ON p.id = cs.proposal_id
     WHERE cs.id = ?`,
    [chargingStationId]
  );
  if (stationRows.length === 0) throw err('Không tìm thấy trạm sạc', 404);

  const committedRows = (() => {
    const value = stationRows[0].chot_so_luong_tru;
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try { return JSON.parse(value); } catch { return []; }
  })();
  if (!Array.isArray(committedRows) || committedRows.length === 0) {
    throw err('Trạm chưa có số lượng trụ chốt để xuất kho', 409);
  }

  const committedMap = new Map();
  for (const row of committedRows) {
    const poleName = String(row?.loai_tru || '').trim().toLowerCase();
    const quantity = Number(row?.so_luong);
    if (!poleName || !Number.isInteger(quantity) || quantity <= 0) continue;
    const supplierId = row?.supplier_id ? Number(row.supplier_id) : null;
    if (!Number.isInteger(supplierId) || supplierId <= 0 || !String(row?.supplier_name || '').trim()) {
      throw err('Số lượng trụ chốt chưa có nhà cung cấp, không thể xuất kho', 409);
    }
    const [poleRows] = await conn.query(
      'SELECT id FROM charging_poles WHERE LOWER(TRIM(name)) = ? LIMIT 2',
      [poleName]
    );
    if (poleRows.length === 1) {
      const key = supplierId ? `${supplierId}:${poleRows[0].id}` : `any:${poleRows[0].id}`;
      committedMap.set(key, (committedMap.get(key) || 0) + quantity);
    }
  }

  const stockParams = [];
  const stockClauses = items.map((item) => {
    stockParams.push(item.supplier_id, item.pole_id);
    return '(supplier_id = ? AND charging_pole_id = ?)';
  });
  const [stockRows] = await conn.query(
    `SELECT supplier_id, charging_pole_id, quantity FROM supplier_charging_poles
     WHERE ${stockClauses.join(' OR ')} FOR UPDATE`,
    stockParams
  );
  const stockMap = new Map(stockRows.map((row) => [`${row.supplier_id}:${row.charging_pole_id}`, row.quantity]));
  for (const item of items) {
    const stockKey = `${item.supplier_id}:${item.pole_id}`;
    if (!stockMap.has(stockKey)) throw err(`Không tìm thấy tồn kho của nhà cung cấp cho trụ #${item.pole_id}`, 404);
    const committedKey = committedMap.has(`${item.supplier_id}:${item.pole_id}`)
      ? `${item.supplier_id}:${item.pole_id}`
      : `any:${item.pole_id}`;
    const committedQty = committedMap.get(committedKey);
    if (!committedQty) {
      throw err(`Trụ sạc #${item.pole_id} không thuộc số lượng đã chốt của trạm`, 400);
    }
    const maxAllowed = Math.min(committedQty, stockMap.get(stockKey));
    if (item.quantity > maxAllowed) {
      throw err(`Số lượng xuất vượt quá số lượng cho phép. Số lượng tối đa có thể xuất là ${maxAllowed} trụ. Vui lòng kiểm tra lại.`, 400);
    }
  }

  const [headerResult] = await conn.query(
    `INSERT INTO warehouse_exports
      (exporter_user_id, export_date, reason, charging_station_id, destination_type, destination_name, destination_address, destination_note, carrier, transport_code, transport_status, total_amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [exporterUserId, exportDate, reason, chargingStationId, destinationType, destinationName, destinationAddress, destinationNote, carrier, transportCode, transportStatus, totalAmount]
  );
  const exportId = headerResult.insertId;
  await conn.query(
    'INSERT INTO warehouse_export_items (export_id, supplier_id, pole_id, quantity) VALUES ?',
    [items.map((item) => [exportId, item.supplier_id, item.pole_id, item.quantity])]
  );
  for (const item of items) {
    await conn.query(
      'UPDATE supplier_charging_poles SET quantity = quantity - ? WHERE supplier_id = ? AND charging_pole_id = ?',
      [item.quantity, item.supplier_id, item.pole_id]
    );
    await conn.query(
      `UPDATE charging_poles
       SET quantity = (SELECT COALESCE(SUM(quantity),0) FROM supplier_charging_poles WHERE charging_pole_id = ?)
       WHERE id = ?`,
      [item.pole_id, item.pole_id]
    );
  }
  return exportId;
};

const createExport = async (data = {}, ctx = {}) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const exportId = await createExportWithinTransaction(conn, data, ctx);
    await conn.commit();
    return getExport(exportId);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

const getStock = async ({ search = '' } = {}) => {
  const where = [];
  const params = [];
  if (search) {
    const like = `%${String(search).trim()}%`;
    where.push('(name LIKE ? OR supplier LIKE ?)');
    params.push(like, like);
  }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT id, name, charging_type, power_kw, quantity, supplier, updated_at
     FROM charging_poles ${whereClause}
     ORDER BY name ASC, id ASC`,
    params
  );
  return rows;
};

exports.listPoles = listPoles;
exports.createPole = createPole;
exports.updatePole = updatePole;
exports.deletePole = deletePole;
exports.listImports = listImports;
exports.getImport = getImport;
exports.createImport = createImport;
exports.listExports = listExports;
exports.getExport = getExport;
exports.createExport = createExport;
exports.createExportWithinTransaction = createExportWithinTransaction;
exports.getStock = getStock;
