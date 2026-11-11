const pool = require('../utils/db');
const { isDeepStrictEqual } = require('node:util');

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const idOf = (value, label = 'Mã bản ghi') => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw fail(`${label} không hợp lệ`);
  return id;
};
const quantityOf = (value, label = 'Số lượng') => {
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw fail(`${label} phải là số nguyên dương`);
  return quantity;
};
const text = (value) => String(value ?? '').trim();
const parseJson = (value) => {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
};
const normalizeRequestId = (value) => {
  const requestId = text(value);
  if (!/^[\w.:-]{1,100}$/.test(requestId)) {
    throw fail('request_id bắt buộc, tối đa 100 ký tự chữ, số hoặc . : - _', 400);
  }
  return requestId;
};
const jsonEqual = (left, right) => isDeepStrictEqual(left, right);
const normalizedRows = (items, idField, label) => {
  if (!Array.isArray(items) || items.length === 0) throw fail(`${label} là bắt buộc`);
  const map = new Map();
  for (const row of items) {
    const id = idOf(row?.[idField], idField);
    const quantity = quantityOf(row?.quantity);
    map.set(id, (map.get(id) || 0) + quantity);
  }
  return [...map.entries()].sort(([a], [b]) => a - b).map(([id, quantity]) => ({ [idField]: id, quantity }));
};
const normalizeShipmentRows = (rows) => {
  if (!Array.isArray(rows) || !rows.length) throw fail('Danh sách trụ xuất là bắt buộc');
  const grouped = new Map();
  for (const row of rows) {
    const poleId = idOf(row?.pole_id, 'Loại trụ');
    const supplierId = idOf(row?.supplier_id, 'Nhà cung cấp');
    const key = `${poleId}:${supplierId}`;
    const current = grouped.get(key) || { pole_id: poleId, supplier_id: supplierId, quantity: 0 };
    current.quantity += quantityOf(row.quantity);
    if (!Number.isSafeInteger(current.quantity)) throw fail('Số lượng xuất quá lớn');
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((a, b) => a.pole_id - b.pole_id || a.supplier_id - b.supplier_id);
};

const allocateShipmentRows = (rows, commitments, exported) => {
  const remaining = new Map(commitments.map((row) => [
    Number(row.id), Math.max(0, Number(row.quantity) - (exported.get(Number(row.id)) || 0))
  ]));
  const result = [];
  for (const row of rows) {
    let needed = row.quantity;
    for (const commitment of commitments) {
      if (Number(commitment.pole_id) !== row.pole_id || !needed) continue;
      const quantity = Math.min(needed, remaining.get(Number(commitment.id)));
      if (!quantity) continue;
      result.push({ commitment_id: Number(commitment.id), supplier_id: row.supplier_id, quantity });
      remaining.set(Number(commitment.id), remaining.get(Number(commitment.id)) - quantity);
      needed -= quantity;
    }
    if (needed) throw fail(`Số lượng xuất vượt số trụ còn lại của loại trụ #${row.pole_id}`, 409);
  }
  return result;
};
const actorContext = (user, ctx = {}) => ({
  ...ctx,
  actorId: ctx.actorId || user?.id || null,
  actorRole: ctx.actorRole || user?.role || null
});

const loadActor = async (user, executor = pool) => {
  if (user?.id && user?.role) return user;
  const userId = idOf(user?.id || user?.userId, 'Tài khoản');
  const [rows] = await executor.query('SELECT id, role, status, custom_data FROM users WHERE id = ?', [userId]);
  if (!rows.length) throw fail('Không tìm thấy tài khoản', 403);
  return rows[0];
};

const assertOperationsAccess = async (stationId, user, executor = pool) => {
  const actor = await loadActor(user, executor);
  const access = require('./chargingStationAccessService');
  await access.assertBackOffice(actor);
  await access.assertView(stationId, actor);
  return actor;
};

const readCommitmentLines = async (connection, stationId) => {
  const [rows] = await connection.query(
    `SELECT cs.id, p.chot_so_luong_tru,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.mo_hinh_dau_tu')) AS mo_hinh_dau_tu
       FROM charging_stations cs
       JOIN station_proposals p ON p.id = cs.proposal_id
      WHERE cs.id = ?`,
    [stationId]
  );
  if (!rows.length) throw fail('Không tìm thấy ON trạm', 404);
  const raw = parseJson(rows[0].chot_so_luong_tru);
  if (!Array.isArray(raw) || raw.length === 0) {
    throw fail('Không có bảng số lượng trụ chốt hợp lệ; cần đối soát thủ công', 409);
  }

  const commitments = [];
  for (let index = 0; index < raw.length; index += 1) {
    const row = raw[index] || {};
    const model = text(row.model || row.mo_hinh || row.mo_hinh_dau_tu || rows[0].mo_hinh_dau_tu).toUpperCase();
    const quantity = Number(row.quantity ?? row.so_luong);
    if (!['NQ', 'TDT', 'LK', 'NQ_LK'].includes(model)
      || (rows[0].mo_hinh_dau_tu === 'NQ_LK' && !text(row.model || row.mo_hinh || row.mo_hinh_dau_tu))
      || !Number.isSafeInteger(quantity) || quantity <= 0) {
      throw fail(`Dòng trụ chốt ${index + 1} thiếu mô hình hoặc số lượng hợp lệ; cần đối soát thủ công`, 409);
    }

    let poleId = Number(row.pole_id || row.charging_pole_id) || null;
    const poleName = text(row.pole_name || row.loai_tru);
    let poles;
    if (poleId) {
      [poles] = await connection.query('SELECT id, name FROM charging_poles WHERE id = ?', [poleId]);
    } else if (poleName) {
      [poles] = await connection.query(
        'SELECT id, name FROM charging_poles WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) ORDER BY id LIMIT 2',
        [poleName]
      );
    } else {
      throw fail(`Dòng trụ chốt ${index + 1} chưa có mã hoặc tên trụ; cần đối soát thủ công`, 409);
    }
    if (poles.length !== 1) throw fail(`Không xác định duy nhất được loại trụ ở dòng ${index + 1}; cần đối soát thủ công`, 409);
    poleId = Number(poles[0].id);

    const sourceKey = text(row.source_key || row.id) || `line:${index + 1}`;
    if (sourceKey.length > 100) throw fail(`Mã dòng chốt ${index + 1} quá dài`, 409);
    if (commitments.some((item) => item.source_key === sourceKey)) {
      throw fail(`Mã dòng chốt bị trùng: ${sourceKey}`, 409);
    }
    commitments.push({
      model,
      supplier_id: null,
      pole_id: poleId,
      quantity,
      source_key: sourceKey
    });
  }
  return commitments;
};

const ensureCommitments = async (connection, stationId) => {
  stationId = idOf(stationId, 'Mã ON trạm');
  const [stationRows] = await connection.query(
    'SELECT id, fulfillment_review_required FROM charging_stations WHERE id = ? FOR UPDATE',
    [stationId]
  );
  if (!stationRows.length) throw fail('Không tìm thấy ON trạm', 404);

  const [existing] = await connection.query(
    'SELECT id, model, supplier_id, pole_id, quantity, source_key FROM charging_station_commitments WHERE charging_station_id = ? ORDER BY id FOR UPDATE',
    [stationId]
  );
  const expected = await readCommitmentLines(connection, stationId);
  if (!existing.length) {
    await connection.query(
      `INSERT INTO charging_station_commitments
        (charging_station_id, model, supplier_id, pole_id, quantity, source_key)
       VALUES ?`,
      [expected.map((item) => [
        stationId, item.model, item.supplier_id, item.pole_id, item.quantity, item.source_key
      ])]
    );
  } else {
    const snapshotByKey = new Map(expected.map((item) => [item.source_key, item]));
    const matchesSnapshot = existing.length === expected.length && existing.every((item) => {
      const snapshot = snapshotByKey.get(item.source_key);
      return snapshot
        && item.model === snapshot.model
        && Number(item.pole_id) === snapshot.pole_id
        && Number(item.quantity) === snapshot.quantity;
    });
    if (!matchesSnapshot) {
      await connection.query('UPDATE charging_stations SET fulfillment_review_required = 1 WHERE id = ?', [stationId]);
      throw fail('Snapshot trụ chốt cũ không khớp đầy đủ; cần đối soát thủ công', 409);
    }
  }

  const [unmapped] = await connection.query(
    `SELECT COUNT(*) AS count
       FROM warehouse_exports we
       JOIN warehouse_export_items wei ON wei.export_id = we.id
      WHERE we.charging_station_id = ? AND we.destination_type = 'STATION'
        AND wei.commitment_id IS NULL`,
    [stationId]
  );
  if (Number(unmapped[0]?.count || 0) > 0) {
    await connection.query('UPDATE charging_stations SET fulfillment_review_required = 1 WHERE id = ?', [stationId]);
    throw fail('Có phiếu xuất cũ chưa gắn được duy nhất với số lượng trụ chốt; cần đối soát thủ công', 409);
  }
  await connection.query('UPDATE charging_stations SET fulfillment_review_required = 0 WHERE id = ?', [stationId]);
  const [rows] = await connection.query(
    'SELECT id, model, supplier_id, pole_id, quantity, source_key FROM charging_station_commitments WHERE charging_station_id = ? ORDER BY id',
    [stationId]
  );
  return rows;
};

const eventForRequest = async (connection, stationId, requestId, operation, payload) => {
  const [events] = await connection.query(
    `SELECT operation, payload, result
       FROM charging_station_fulfillment_events
      WHERE charging_station_id = ? AND request_id = ?`,
    [stationId, requestId]
  );
  if (!events.length) return null;
  const event = events[0];
  if (event.operation !== operation || !jsonEqual(parseJson(event.payload), payload)) {
    throw fail('request_id đã được sử dụng cho nội dung khác', 409);
  }
  return parseJson(event.result);
};

const saveEvent = async (connection, stationId, requestId, operation, actor, payload, result) => {
  await connection.query(
    `INSERT INTO charging_station_fulfillment_events
      (charging_station_id, request_id, operation, actor_id, payload, result)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [stationId, requestId, operation, actor?.id || null, JSON.stringify(payload), JSON.stringify(result)]
  );
};

const logActivity = async (connection, station, action, actor, ctx, extra = {}, reason = null) => {
  const service = require('./chargingStationService');
  await service.writeActivity(connection, {
    chargingStationId: station.id,
    action,
    fromStatus: station.status,
    toStatus: station.status,
    changedFields: extra,
    reason,
    actorId: actor?.id || ctx.actorId,
    actorRole: actor?.role || ctx.actorRole,
    source: 'user',
    ip: ctx.ip
  });
};

const getShipment = async (connection, exportId) => {
  const [headers] = await connection.query('SELECT * FROM warehouse_exports WHERE id = ?', [exportId]);
  if (!headers.length) throw fail('Không tìm thấy phiếu xuất kho', 404);
  const [items] = await connection.query(
    `SELECT wei.id, wei.export_id, wei.commitment_id, wei.supplier_id, wei.pole_id,
            wei.quantity, wei.received_quantity, wei.return_pending_quantity, wei.returned_quantity,
            cp.name, s.name AS supplier_name, cp.charging_type, cp.power_kw
       FROM warehouse_export_items wei
       JOIN charging_poles cp ON cp.id = wei.pole_id
       LEFT JOIN suppliers s ON s.id = wei.supplier_id
      WHERE wei.export_id = ? ORDER BY wei.id`,
    [exportId]
  );
  return { ...headers[0], items };
};

const writeStationExport = async (connection, stationId, body, actor, ctx = {}) => {
  const requestId = normalizeRequestId(body.request_id);
  const supplierSelection = Array.isArray(body.items) && body.items.some((row) => row?.pole_id !== undefined);
  const requestedItems = supplierSelection
    ? normalizeShipmentRows(body.items)
    : normalizedRows(body.items, 'commitment_id', 'Danh sách trụ xuất');
  const payload = {
    items: requestedItems,
    carrier: text(body.carrier) || null,
    transport_code: text(body.transport_code) || null,
    reason: text(body.reason) || null,
    total_amount: body.total_amount === null || body.total_amount === undefined || body.total_amount === ''
      ? null
      : Number(body.total_amount)
  };
  if (payload.total_amount !== null && (!Number.isFinite(payload.total_amount) || payload.total_amount < 0)) {
    throw fail('Tổng số tiền vận chuyển phải là số không âm');
  }
  const existing = await eventForRequest(connection, stationId, requestId, 'SHIPPING_CREATE_EXPORT', payload);
  if (existing) return existing;

  await ensureCommitments(connection, stationId);
  const [lockedCommitments] = await connection.query(
    `SELECT id, model, supplier_id, pole_id, quantity
       FROM charging_station_commitments
      WHERE charging_station_id = ?
      ORDER BY id FOR UPDATE`,
    [stationId]
  );
  const commitmentIds = lockedCommitments.map((item) => Number(item.id));
  if (!commitmentIds.length) throw fail('Không có số lượng trụ chốt để xuất', 409);
  const [exported] = await connection.query(
    `SELECT commitment_id, COALESCE(SUM(quantity - returned_quantity), 0) AS net_exported
       FROM warehouse_export_items
      WHERE commitment_id IN (${commitmentIds.map(() => '?').join(',')})
      GROUP BY commitment_id`,
    commitmentIds
  );
  const exportedByCommitment = new Map(exported.map((row) => [Number(row.commitment_id), Number(row.net_exported)]));
  const byId = new Map(lockedCommitments.map((item) => [Number(item.id), item]));
  const items = supplierSelection
    ? allocateShipmentRows(requestedItems, lockedCommitments, exportedByCommitment)
    : requestedItems.map((item) => ({
      ...item, supplier_id: idOf(byId.get(item.commitment_id)?.supplier_id, 'Nhà cung cấp: vui lòng chọn lại trên form xuất trụ')
    }));
  for (const item of items) {
    if (!byId.has(item.commitment_id)) throw fail(`Dòng chốt #${item.commitment_id} không thuộc trạm này`, 409);
  }

  const inventoryKeys = [...new Set(items.map((item) => {
    const commitment = byId.get(item.commitment_id);
    return `${item.supplier_id}:${commitment.pole_id}`;
  }))].sort((a, b) => {
    const [as, ap] = a.split(':').map(Number);
    const [bs, bp] = b.split(':').map(Number);
    return as - bs || ap - bp;
  });
  const stockClauses = inventoryKeys.map(() => '(supplier_id = ? AND charging_pole_id = ?)').join(' OR ');
  const stockParams = inventoryKeys.flatMap((key) => key.split(':').map(Number));
  const [stockRows] = await connection.query(
    `SELECT supplier_id, charging_pole_id, quantity
       FROM supplier_charging_poles
      WHERE ${stockClauses}
      ORDER BY supplier_id, charging_pole_id FOR UPDATE`,
    stockParams
  );
  const stock = new Map(stockRows.map((row) => [`${row.supplier_id}:${row.charging_pole_id}`, Number(row.quantity)]));
  const sumsByInventory = new Map();
  const sumsByCommitment = new Map();
  for (const item of items) {
    const commitment = byId.get(item.commitment_id);
    const key = `${item.supplier_id}:${commitment.pole_id}`;
    if (!stock.has(key)) throw fail(`Không tìm thấy tồn kho cho nhà cung cấp #${item.supplier_id}, trụ #${commitment.pole_id}`, 409);
    const next = (exportedByCommitment.get(item.commitment_id) || 0) + item.quantity;
    if (next > Number(commitment.quantity)) {
      const remainder = Math.max(0, Number(commitment.quantity) - (exportedByCommitment.get(item.commitment_id) || 0));
      throw fail(`Số lượng xuất vượt số trụ còn lại của dòng chốt #${item.commitment_id}: ${remainder}`, 409);
    }
    sumsByCommitment.set(item.commitment_id, (sumsByCommitment.get(item.commitment_id) || 0) + item.quantity);
    sumsByInventory.set(key, (sumsByInventory.get(key) || 0) + item.quantity);
    exportedByCommitment.set(item.commitment_id, next);
  }
  for (const [key, quantity] of sumsByInventory) {
    if (quantity > stock.get(key)) throw fail(`Số lượng xuất vượt tồn kho nhà cung cấp cho trụ ${key}`, 409);
  }

  const exportDate = new Date();
  const [header] = await connection.query(
    `INSERT INTO warehouse_exports
      (exporter_user_id, export_date, reason, charging_station_id, destination_type, carrier, transport_code, transport_status, total_amount)
     VALUES (?, ?, ?, ?, 'STATION', ?, ?, 'SHIPPING', ?)`,
    [actor.id, exportDate, text(body.reason) || null, stationId, payload.carrier, payload.transport_code, payload.total_amount]
  );
  const exportId = Number(header.insertId);
  await connection.query(
    `INSERT INTO warehouse_export_items (export_id, supplier_id, pole_id, commitment_id, quantity)
     VALUES ?`,
    [items.map((item) => {
      const commitment = byId.get(item.commitment_id);
      return [exportId, item.supplier_id, commitment.pole_id, commitment.id, item.quantity];
    })]
  );
  for (const [key, quantity] of sumsByInventory) {
    const [supplierId, poleId] = key.split(':').map(Number);
    await connection.query(
      'UPDATE supplier_charging_poles SET quantity = quantity - ? WHERE supplier_id = ? AND charging_pole_id = ?',
      [quantity, supplierId, poleId]
    );
    await connection.query(
      `UPDATE charging_poles
          SET quantity = (SELECT COALESCE(SUM(quantity), 0) FROM supplier_charging_poles WHERE charging_pole_id = ?)
        WHERE id = ?`,
      [poleId, poleId]
    );
  }
  const [stations] = await connection.query('SELECT * FROM charging_stations WHERE id = ?', [stationId]);
  const shipment = await getShipment(connection, exportId);
  await logActivity(connection, stations[0], 'shipment_created', actor, ctx, {
    export_id: exportId,
    items: items.map((item) => ({ commitment_id: item.commitment_id, quantity: item.quantity }))
  });
  await saveEvent(connection, stationId, requestId, 'SHIPPING_CREATE_EXPORT', actor, payload, shipment);
  return shipment;
};

const createExport = async (stationId, body = {}, user, ctx = {}) => {
  stationId = idOf(stationId, 'Mã ON trạm');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const actor = await assertOperationsAccess(stationId, user, connection);
    const [stations] = await connection.query('SELECT * FROM charging_stations WHERE id = ? FOR UPDATE', [stationId]);
    if (!stations.length) throw fail('Không tìm thấy ON trạm', 404);
    const shipment = await writeStationExport(connection, stationId, body, actor, actorContext(actor, ctx));
    await connection.commit();
    return shipment;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const createExportWithinTransaction = async (connection, stationId, body = {}, user, ctx = {}) => {
  stationId = idOf(stationId, 'Mã ON trạm');
  const actor = await assertOperationsAccess(stationId, user, connection);
  const [stations] = await connection.query('SELECT * FROM charging_stations WHERE id = ? FOR UPDATE', [stationId]);
  if (!stations.length) throw fail('Không tìm thấy ON trạm', 404);
  return writeStationExport(connection, stationId, body, actor, actorContext(actor, ctx));
};

const lockShipmentItems = async (connection, stationId, exportId, items) => {
  const ids = items.map((item) => item.item_id);
  const [rows] = await connection.query(
    `SELECT wei.*, we.transport_status, we.charging_station_id, we.destination_type
       FROM warehouse_export_items wei
       JOIN warehouse_exports we ON we.id = wei.export_id
      WHERE wei.id IN (${ids.map(() => '?').join(',')})
      ORDER BY wei.id FOR UPDATE`,
    ids
  );
  const byId = new Map(rows.map((row) => [Number(row.id), row]));
  for (const item of items) {
    const row = byId.get(item.item_id);
    if (!row || Number(row.export_id) !== exportId || Number(row.charging_station_id) !== stationId
      || row.destination_type !== 'STATION') {
      throw fail(`Dòng xuất #${item.item_id} không thuộc phiếu của trạm này`, 404);
    }
    if (!row.commitment_id) {
      throw fail(`Dòng xuất #${item.item_id} chưa được đối soát với số lượng trụ chốt`, 409);
    }
  }
  return byId;
};

const receive = async (stationId, exportId, body = {}, user, ctx = {}) => {
  stationId = idOf(stationId, 'Mã ON trạm');
  exportId = idOf(exportId, 'Mã phiếu xuất');
  const requestId = normalizeRequestId(body.request_id);
  const items = normalizedRows(body.items, 'item_id', 'Danh sách trụ nhận');
  const payload = { export_id: exportId, items };
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const actor = await assertOperationsAccess(stationId, user, connection);
    const [stations] = await connection.query('SELECT * FROM charging_stations WHERE id = ? FOR UPDATE', [stationId]);
    if (!stations.length) throw fail('Không tìm thấy ON trạm', 404);
    const previous = await eventForRequest(connection, stationId, requestId, 'SHIPPING_RECEIVE', payload);
    if (previous) {
      await connection.commit();
      return previous;
    }
    const itemMap = await lockShipmentItems(connection, stationId, exportId, items);
    for (const item of items) {
      const row = itemMap.get(item.item_id);
      if (!['PENDING', 'SHIPPING'].includes(row.transport_status)) {
        throw fail('Phiếu xuất không ở trạng thái có thể tiếp nhận', 409);
      }
      const remaining = Number(row.quantity) - Number(row.received_quantity)
        - Number(row.returned_quantity) - Number(row.return_pending_quantity);
      if (item.quantity > remaining) throw fail(`Số lượng nhận vượt lượng còn trên phiếu #${row.id}`, 409);
    }

    for (const item of items) {
      const row = itemMap.get(item.item_id);
      await connection.query(
        'UPDATE warehouse_export_items SET received_quantity = received_quantity + ? WHERE id = ?',
        [item.quantity, item.item_id]
      );
      await connection.query(
        `INSERT INTO charging_station_deployments
          (charging_station_id, export_item_id, quantity, stage, sub_status)
         VALUES (?, ?, ?, 'INSTALLING', 'NOT_INSTALLED')`,
        [stationId, item.item_id, item.quantity]
      );
      await logActivity(connection, stations[0], 'shipment_received', actor, ctx, {
        export_id: exportId,
        item_id: item.item_id,
        quantity: item.quantity
      });
    }
    const [remainingRows] = await connection.query(
      `SELECT COALESCE(SUM(quantity - received_quantity - returned_quantity), 0) AS remaining
         FROM warehouse_export_items WHERE export_id = ?`,
      [exportId]
    );
    if (Number(remainingRows[0]?.remaining || 0) === 0) {
      await connection.query("UPDATE warehouse_exports SET transport_status = 'DELIVERED' WHERE id = ?", [exportId]);
    } else {
      await connection.query("UPDATE warehouse_exports SET transport_status = 'SHIPPING' WHERE id = ?", [exportId]);
    }
    const deployment = require('./chargingStationDeploymentService');
    await deployment.refreshStationProgress(connection, stationId, actorContext(actor, ctx));
    await deployment.notifySetupOperations(
      connection,
      stations[0],
      actorContext(actor, ctx),
      'Đã tiếp nhận một phần hoặc toàn bộ trụ — cần lắp đặt'
    );
    const shipment = await getShipment(connection, exportId);
    await saveEvent(connection, stationId, requestId, 'SHIPPING_RECEIVE', actor, payload, shipment);
    await connection.commit();
    return shipment;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const requestReturn = async (stationId, exportId, body = {}, user, ctx = {}) => {
  stationId = idOf(stationId, 'Mã ON trạm');
  exportId = idOf(exportId, 'Mã phiếu xuất');
  const requestId = normalizeRequestId(body.request_id);
  const items = normalizedRows(body.items, 'item_id', 'Danh sách trụ yêu cầu trả');
  const payload = { export_id: exportId, items, reason: text(body.reason) || null };
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const actor = await assertOperationsAccess(stationId, user, connection);
    const [stations] = await connection.query('SELECT * FROM charging_stations WHERE id = ? FOR UPDATE', [stationId]);
    if (!stations.length) throw fail('Không tìm thấy ON trạm', 404);
    const previous = await eventForRequest(connection, stationId, requestId, 'SHIPPING_REQUEST_RETURN', payload);
    if (previous) {
      await connection.commit();
      return previous;
    }
    if (!payload.reason) throw fail('Bắt buộc nhập lý do yêu cầu trả trụ');
    const itemMap = await lockShipmentItems(connection, stationId, exportId, items);
    for (const item of items) {
      const row = itemMap.get(item.item_id);
      if (!['PENDING', 'SHIPPING', 'FAILED'].includes(row.transport_status)) {
        throw fail(`Chỉ có thể trả phần chưa nhận của phiếu đang giao hoặc giao thất bại (#${row.id})`, 409);
      }
      const undelivered = Number(row.quantity) - Number(row.received_quantity)
        - Number(row.returned_quantity) - Number(row.return_pending_quantity);
      if (item.quantity > undelivered) {
        throw fail(`Chỉ có thể yêu cầu trả số lượng chưa nhận ở dòng #${row.id}`, 409);
      }
    }
    for (const item of items) {
      await connection.query(
        'UPDATE warehouse_export_items SET return_pending_quantity = return_pending_quantity + ? WHERE id = ?',
        [item.quantity, item.item_id]
      );
      await logActivity(connection, stations[0], 'shipment_return_requested', actor, ctx, {
        export_id: exportId,
        item_id: item.item_id,
        quantity: item.quantity
      }, payload.reason);
    }
    const shipment = await getShipment(connection, exportId);
    await saveEvent(connection, stationId, requestId, 'SHIPPING_REQUEST_RETURN', actor, payload, shipment);
    await connection.commit();
    return shipment;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const confirmReturn = async (stationId, exportId, body = {}, user, ctx = {}) => {
  stationId = idOf(stationId, 'Mã ON trạm');
  exportId = idOf(exportId, 'Mã phiếu xuất');
  const requestId = normalizeRequestId(body.request_id);
  const items = normalizedRows(body.items, 'item_id', 'Danh sách trụ xác nhận trả');
  const payload = { export_id: exportId, items };
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const actor = await assertOperationsAccess(stationId, user, connection);
    const [stations] = await connection.query('SELECT * FROM charging_stations WHERE id = ? FOR UPDATE', [stationId]);
    if (!stations.length) throw fail('Không tìm thấy ON trạm', 404);
    const previous = await eventForRequest(connection, stationId, requestId, 'SHIPPING_CONFIRM_RETURN', payload);
    if (previous) {
      await connection.commit();
      return previous;
    }
    const itemMap = await lockShipmentItems(connection, stationId, exportId, items);
    const inventoryMap = new Map();
    for (const item of items) {
      const row = itemMap.get(item.item_id);
      if (item.quantity > Number(row.return_pending_quantity)) {
        throw fail(`Số lượng xác nhận vượt yêu cầu trả đang chờ ở dòng #${row.id}`, 409);
      }
      const undelivered = Number(row.quantity) - Number(row.received_quantity)
        - Number(row.returned_quantity);
      if (item.quantity > undelivered) {
        throw fail(`Không thể trả phần trụ đã nhận ở dòng #${row.id}`, 409);
      }
      const key = `${row.supplier_id}:${row.pole_id}`;
      inventoryMap.set(key, (inventoryMap.get(key) || 0) + item.quantity);
    }
    const inventoryKeys = [...inventoryMap.keys()].sort((a, b) => {
      const [as, ap] = a.split(':').map(Number);
      const [bs, bp] = b.split(':').map(Number);
      return as - bs || ap - bp;
    });
    const clauses = inventoryKeys.map(() => '(supplier_id = ? AND charging_pole_id = ?)').join(' OR ');
    const params = inventoryKeys.flatMap((key) => key.split(':').map(Number));
    const [stockRows] = await connection.query(
      `SELECT supplier_id, charging_pole_id FROM supplier_charging_poles
        WHERE ${clauses} ORDER BY supplier_id, charging_pole_id FOR UPDATE`,
      params
    );
    const existingStock = new Set(stockRows.map((row) => `${row.supplier_id}:${row.charging_pole_id}`));
    for (const key of inventoryKeys) {
      if (!existingStock.has(key)) throw fail(`Không tìm thấy kho nhà cung cấp cho trụ ${key}`, 409);
    }
    for (const item of items) {
      await connection.query(
        `UPDATE warehouse_export_items
            SET return_pending_quantity = return_pending_quantity - ?,
                returned_quantity = returned_quantity + ?
          WHERE id = ?`,
        [item.quantity, item.quantity, item.item_id]
      );
      await logActivity(connection, stations[0], 'shipment_return_confirmed', actor, ctx, {
        export_id: exportId,
        item_id: item.item_id,
        quantity: item.quantity
      });
    }
    for (const [key, quantity] of inventoryMap) {
      const [supplierId, poleId] = key.split(':').map(Number);
      await connection.query(
        'UPDATE supplier_charging_poles SET quantity = quantity + ? WHERE supplier_id = ? AND charging_pole_id = ?',
        [quantity, supplierId, poleId]
      );
      await connection.query(
        `UPDATE charging_poles
            SET quantity = (SELECT COALESCE(SUM(quantity), 0) FROM supplier_charging_poles WHERE charging_pole_id = ?)
          WHERE id = ?`,
        [poleId, poleId]
      );
    }
    const [remainingRows] = await connection.query(
      `SELECT COALESCE(SUM(quantity - received_quantity - returned_quantity), 0) AS remaining,
              COALESCE(SUM(received_quantity), 0) AS received
         FROM warehouse_export_items WHERE export_id = ?`,
      [exportId]
    );
    if (Number(remainingRows[0]?.remaining || 0) === 0) {
      const terminalStatus = Number(remainingRows[0]?.received || 0) > 0 ? 'DELIVERED' : 'RETURNED';
      await connection.query('UPDATE warehouse_exports SET transport_status = ? WHERE id = ?', [terminalStatus, exportId]);
    }
    const shipment = await getShipment(connection, exportId);
    await saveEvent(connection, stationId, requestId, 'SHIPPING_CONFIRM_RETURN', actor, payload, shipment);
    await connection.commit();
    return shipment;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const markFailed = async (stationId, exportId, body = {}, user, ctx = {}) => {
  stationId = idOf(stationId, 'Mã ON trạm');
  exportId = idOf(exportId, 'Mã phiếu xuất');
  const requestId = normalizeRequestId(body.request_id);
  const reason = text(body.reason);
  if (!reason) throw fail('Bắt buộc nhập lý do đánh dấu giao hàng thất bại');
  const payload = { export_id: exportId, reason };
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const actor = await assertOperationsAccess(stationId, user, connection);
    const [stations] = await connection.query('SELECT * FROM charging_stations WHERE id = ? FOR UPDATE', [stationId]);
    if (!stations.length) throw fail('Không tìm thấy ON trạm', 404);
    const previous = await eventForRequest(connection, stationId, requestId, 'SHIPPING_MARK_FAILED', payload);
    if (previous) {
      await connection.commit();
      return previous;
    }
    const [exports] = await connection.query(
      `SELECT * FROM warehouse_exports
        WHERE id = ? AND charging_station_id = ? AND destination_type = 'STATION'
        FOR UPDATE`,
      [exportId, stationId]
    );
    if (!exports.length) throw fail('Không tìm thấy phiếu xuất của trạm', 404);
    if (['DELIVERED', 'RETURNED'].includes(exports[0].transport_status)) {
      throw fail('Không thể đánh dấu thất bại phiếu đã giao hoặc đã hoàn trả', 409);
    }
    await connection.query("UPDATE warehouse_exports SET transport_status = 'FAILED' WHERE id = ?", [exportId]);
    await logActivity(connection, stations[0], 'shipment_failed', actor, ctx, { export_id: exportId }, reason);
    const shipment = await getShipment(connection, exportId);
    await saveEvent(connection, stationId, requestId, 'SHIPPING_MARK_FAILED', actor, payload, shipment);
    await connection.commit();
    return shipment;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const getSummary = async (stationId, executor = pool) => {
  stationId = idOf(stationId, 'Mã ON trạm');
  const [stations] = await executor.query(
    `SELECT cs.id, cs.fulfillment_review_required, p.chot_so_luong_tru,
            JSON_LENGTH(p.chot_so_luong_tru) AS snapshot_count
       FROM charging_stations cs
       JOIN station_proposals p ON p.id = cs.proposal_id
      WHERE cs.id = ?`,
    [stationId]
  );
  if (!stations.length) throw fail('Không tìm thấy ON trạm', 404);
  const [items] = await executor.query(
    `SELECT c.id AS commitment_id, c.model, c.supplier_id, s.name AS supplier_name,
            c.pole_id, cp.name, cp.charging_type, cp.power_kw, c.quantity AS committed_quantity,
            COALESCE(shipped.exported_quantity, 0) AS exported_quantity,
            COALESCE(shipped.received_quantity, 0) AS received_quantity,
            COALESCE(shipped.returned_quantity, 0) AS returned_quantity,
            COALESCE(shipped.in_transit_quantity, 0) AS in_transit_quantity,
            COALESCE(shipped.return_pending_quantity, 0) AS return_pending_quantity,
            COALESCE(shipped.net_exported_quantity, 0) AS net_exported_quantity,
            COALESCE(stock.quantity, 0) AS stock_quantity,
            COALESCE(operating.quantity, 0) AS operating_quantity
       FROM charging_station_commitments c
       JOIN charging_poles cp ON cp.id = c.pole_id
       LEFT JOIN suppliers s ON s.id = c.supplier_id
       LEFT JOIN supplier_charging_poles stock ON stock.supplier_id = c.supplier_id AND stock.charging_pole_id = c.pole_id
       LEFT JOIN (
         SELECT commitment_id,
                SUM(quantity) AS exported_quantity,
                SUM(received_quantity) AS received_quantity,
                SUM(returned_quantity) AS returned_quantity,
                SUM(quantity - received_quantity - returned_quantity) AS in_transit_quantity,
                SUM(return_pending_quantity) AS return_pending_quantity,
                SUM(quantity - returned_quantity) AS net_exported_quantity
           FROM warehouse_export_items
          WHERE commitment_id IS NOT NULL
          GROUP BY commitment_id
       ) shipped ON shipped.commitment_id = c.id
       LEFT JOIN (
         SELECT wei.commitment_id, SUM(d.quantity) AS quantity
           FROM warehouse_export_items wei
           JOIN charging_station_deployments d ON d.export_item_id = wei.id AND d.stage = 'OPERATING'
          WHERE wei.commitment_id IS NOT NULL
          GROUP BY wei.commitment_id
       ) operating ON operating.commitment_id = c.id
      WHERE c.charging_station_id = ?
      ORDER BY c.id`,
    [stationId]
  );
  const [shipments] = await executor.query(
    `SELECT we.id, we.exporter_user_id, we.export_date, we.reason, we.charging_station_id,
            we.destination_type, we.destination_name, we.destination_address, we.destination_note,
            we.carrier, we.transport_code, we.transport_status, we.total_amount, we.created_at,
            u.full_name AS exporter_name
       FROM warehouse_exports we
       LEFT JOIN users u ON u.id = we.exporter_user_id
      WHERE we.charging_station_id = ? AND we.destination_type = 'STATION'
      ORDER BY we.id DESC`,
    [stationId]
  );
  if (shipments.length) {
    const [shipmentItems] = await executor.query(
      `SELECT wei.id, wei.export_id, wei.commitment_id, wei.supplier_id, wei.pole_id, wei.quantity,
              wei.received_quantity, wei.return_pending_quantity, wei.returned_quantity,
              cp.name, s.name AS supplier_name, cp.charging_type, cp.power_kw
         FROM warehouse_export_items wei
         JOIN warehouse_exports we ON we.id = wei.export_id
         JOIN charging_poles cp ON cp.id = wei.pole_id
         LEFT JOIN suppliers s ON s.id = wei.supplier_id
        WHERE we.charging_station_id = ? AND we.destination_type = 'STATION'
        ORDER BY wei.id`,
      [stationId]
    );
    const byExport = new Map();
    for (const item of shipmentItems) {
      if (!byExport.has(Number(item.export_id))) byExport.set(Number(item.export_id), []);
      byExport.get(Number(item.export_id)).push(item);
    }
    for (const shipment of shipments) shipment.items = byExport.get(Number(shipment.id)) || [];
  }
  const [unmapped] = await executor.query(
    `SELECT COUNT(*) AS count
       FROM warehouse_exports we JOIN warehouse_export_items wei ON wei.export_id = we.id
      WHERE we.charging_station_id = ? AND we.destination_type = 'STATION' AND wei.commitment_id IS NULL`,
    [stationId]
  );
  const total = {
    committed: 0, exported: 0, received: 0, returned: 0, in_transit: 0, remaining: 0, operating: 0
  };
  for (const item of items) {
    item.committed_quantity = Number(item.committed_quantity);
    item.exported_quantity = Number(item.exported_quantity);
    item.received_quantity = Number(item.received_quantity);
    item.returned_quantity = Number(item.returned_quantity);
    item.in_transit_quantity = Math.max(0, Number(item.in_transit_quantity));
    item.return_pending_quantity = Number(item.return_pending_quantity);
    item.stock_quantity = Number(item.stock_quantity);
    item.operating_quantity = Number(item.operating_quantity);
    item.remaining_quantity = Math.max(0, item.committed_quantity - Number(item.net_exported_quantity));
    delete item.net_exported_quantity;
    total.committed += item.committed_quantity;
    total.exported += item.exported_quantity;
    total.received += item.received_quantity;
    total.returned += item.returned_quantity;
    total.in_transit += item.in_transit_quantity;
    total.remaining += item.remaining_quantity;
    total.operating += item.operating_quantity;
  }
  const committedSnapshot = parseJson(stations[0].chot_so_luong_tru);
  if (!items.length && Array.isArray(committedSnapshot) && committedSnapshot.length) {
    if (executor === pool) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await ensureCommitments(connection, stationId);
        const summary = await getSummary(stationId, connection);
        await connection.commit();
        return summary;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    }
    await ensureCommitments(executor, stationId);
    return getSummary(stationId, executor);
  }
  const grouped = new Map();
  for (const item of items) {
    const poleId = Number(item.pole_id);
    const group = grouped.get(poleId) || {
      pole_id: poleId, name: item.name, charging_type: item.charging_type, power_kw: item.power_kw,
      committed_quantity: 0, remaining_quantity: 0,
      exported_quantity: 0, received_quantity: 0, returned_quantity: 0,
      in_transit_quantity: 0, operating_quantity: 0, stock_quantity: 0
    };
    group.committed_quantity += item.committed_quantity;
    group.remaining_quantity += item.remaining_quantity;
    for (const key of ['exported_quantity', 'received_quantity', 'returned_quantity', 'in_transit_quantity', 'operating_quantity']) {
      group[key] += Number(item[key]);
    }
    grouped.set(poleId, group);
  }
  const [inventory] = await executor.query(
    `SELECT scp.supplier_id, scp.charging_pole_id AS pole_id,
            scp.quantity AS stock_quantity, s.name AS supplier_name
       FROM supplier_charging_poles scp
       JOIN suppliers s ON s.id = scp.supplier_id
      WHERE scp.quantity > 0
        AND scp.charging_pole_id IN (
          SELECT pole_id FROM charging_station_commitments WHERE charging_station_id = ?
        )
      ORDER BY scp.charging_pole_id, scp.supplier_id`,
    [stationId]
  );
  for (const row of inventory) {
    const group = grouped.get(Number(row.pole_id));
    if (group) group.stock_quantity += Number(row.stock_quantity);
  }
  const shippingOptions = inventory.filter((row) => grouped.get(Number(row.pole_id))?.remaining_quantity > 0)
    .map((row) => ({
      ...grouped.get(Number(row.pole_id)), ...row,
      id: `${row.pole_id}:${row.supplier_id}`, stock_quantity: Number(row.stock_quantity)
    }));
  return {
    items,
    pole_requirements: [...grouped.values()],
    shipping_options: shippingOptions,
    totals: total,
    shipments,
    needs_review: Boolean(Number(stations[0].fulfillment_review_required)
      || Number(unmapped[0]?.count || 0)
      || !Array.isArray(committedSnapshot)
      || items.length !== Number(stations[0].snapshot_count || 0))
  };
};

module.exports = {
  normalizeShipmentRows,
  allocateShipmentRows,
  ensureCommitments,
  getSummary,
  createExport,
  createExportWithinTransaction,
  receive,
  requestReturn,
  confirmReturn,
  markFailed
};
