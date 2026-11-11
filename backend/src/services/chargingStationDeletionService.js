const crypto = require('node:crypto');
const pool = require('../utils/db');
const proposalLifecycle = require('./proposalLifecycle');

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const toId = (value, label) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw fail(`${label} không hợp lệ`);
  return id;
};

const calculateRestockItems = (items = []) => {
  const grouped = new Map();
  for (const item of items) {
    const quantity = Number(item.quantity);
    const returnedQuantity = Number(item.returned_quantity || 0);
    if (!Number.isSafeInteger(quantity) || quantity < 0
      || !Number.isSafeInteger(returnedQuantity) || returnedQuantity < 0
      || returnedQuantity > quantity) {
      throw fail(`Dữ liệu số lượng xuất/hoàn trả ở dòng #${item.id} không hợp lệ; không thể xóa an toàn`, 409);
    }

    const restockQuantity = quantity - returnedQuantity;
    if (restockQuantity === 0) continue;

    const supplierId = Number(item.supplier_id);
    const poleId = Number(item.pole_id);
    if (!Number.isSafeInteger(supplierId) || supplierId < 1
      || !Number.isSafeInteger(poleId) || poleId < 1) {
      throw fail(`Không xác định được nhà cung cấp hoặc loại trụ ở dòng xuất #${item.id}; cần đối soát thủ công`, 409);
    }

    const key = `${supplierId}:${poleId}`;
    const current = grouped.get(key) || { supplier_id: supplierId, pole_id: poleId, quantity: 0 };
    current.quantity += restockQuantity;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((a, b) => a.supplier_id - b.supplier_id || a.pole_id - b.pole_id);
};

const summarizeInvoices = (invoices = []) => {
  const summary = {
    count: invoices.length,
    DEPOSIT: { count: 0, amount: 0 },
    PAYMENT: { count: 0, amount: 0 },
    REFUND: { count: 0, amount: 0 }
  };
  const cents = { DEPOSIT: 0, PAYMENT: 0, REFUND: 0 };
  for (const invoice of invoices) {
    if (!Object.hasOwn(cents, invoice.invoice_type)) {
      throw fail(`Loại hóa đơn #${invoice.id} không hợp lệ; không thể xóa an toàn`, 409);
    }
    const amount = Number(invoice.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw fail(`Số tiền hóa đơn #${invoice.id} không hợp lệ; không thể xóa an toàn`, 409);
    }
    cents[invoice.invoice_type] += Math.round(amount * 100);
    summary[invoice.invoice_type].count += 1;
  }
  for (const type of Object.keys(cents)) summary[type].amount = cents[type] / 100;
  return summary;
};

const makePreviewToken = (snapshot) => crypto.createHash('sha256')
  .update(JSON.stringify({
    station: {
      id: snapshot.station.id,
      ma_tram: snapshot.station.ma_tram,
      proposal_id: snapshot.station.proposal_id,
      proposal_code: snapshot.station.proposal_code,
      status: snapshot.station.status,
      sub_status: snapshot.station.sub_status,
      proposal_status: snapshot.station.proposal_status
    },
    exports: snapshot.exports.map((row) => [Number(row.id), row.destination_type]),
    items: snapshot.items.map((row) => [
      Number(row.id), Number(row.export_id), row.supplier_id === null ? null : Number(row.supplier_id),
      Number(row.pole_id), Number(row.quantity), Number(row.returned_quantity || 0)
    ]),
    invoices: snapshot.invoices.map((row) => [Number(row.id), row.invoice_type, String(row.amount)]),
    imports: snapshot.imports.map((row) => Number(row.id)),
    deployments: snapshot.deployments.map((row) => [
      Number(row.id), Number(row.export_item_id), Number(row.quantity), row.stage, row.sub_status
    ]),
    images: snapshot.images.map((row) => Number(row.id)),
    careLogs: snapshot.careLogs.map((row) => Number(row.id)),
    activityLogs: snapshot.activityLogs.map((row) => Number(row.id))
  }))
  .digest('hex');

const loadSnapshot = async (connection, stationId, lock = false) => {
  const lockClause = lock ? ' FOR UPDATE' : '';
  const [stationRows] = await connection.query(
    `SELECT cs.id, cs.ma_tram, cs.proposal_id, cs.status, cs.sub_status,
            p.ma_de_xuat_gen AS proposal_code, p.status AS proposal_status
       FROM charging_stations cs
       JOIN station_proposals p ON p.id = cs.proposal_id
      WHERE cs.id = ?${lockClause}`,
    [stationId]
  );
  if (!stationRows.length) throw fail('Không tìm thấy ON trạm', 404);
  const station = stationRows[0];

  const [exports] = await connection.query(
    `SELECT id, destination_type
       FROM warehouse_exports
      WHERE charging_station_id = ?
      ORDER BY id${lockClause}`,
    [stationId]
  );
  let items = [];
  if (exports.length) {
    const exportIds = exports.map((row) => Number(row.id));
    [items] = await connection.query(
      `SELECT id, export_id, supplier_id, pole_id, quantity, returned_quantity
         FROM warehouse_export_items
        WHERE export_id IN (${exportIds.map(() => '?').join(',')})
        ORDER BY id${lockClause}`,
      exportIds
    );
  }

  const [invoices] = await connection.query(
    `SELECT id, invoice_type, amount
       FROM charging_station_invoices
      WHERE charging_station_id = ?
      ORDER BY id${lockClause}`,
    [stationId]
  );
  const [imports] = await connection.query(
    `SELECT id
       FROM warehouse_imports
      WHERE charging_station_id = ?
      ORDER BY id${lockClause}`,
    [stationId]
  );
  const [deployments] = await connection.query(
    `SELECT id, export_item_id, quantity, stage, sub_status
       FROM charging_station_deployments
      WHERE charging_station_id = ?
      ORDER BY id${lockClause}`,
    [stationId]
  );
  const [images] = await connection.query(
    `SELECT id
       FROM charging_station_images
      WHERE charging_station_id = ?
      ORDER BY id${lockClause}`,
    [stationId]
  );
  const [careLogs] = await connection.query(
    `SELECT id
       FROM charging_station_care_logs
      WHERE charging_station_id = ?
      ORDER BY id${lockClause}`,
    [stationId]
  );
  const [activityLogs] = await connection.query(
    `SELECT id
       FROM charging_station_activity_logs
      WHERE charging_station_id = ?
      ORDER BY id${lockClause}`,
    [stationId]
  );
  const restockItems = calculateRestockItems(items);
  const invoiceSummary = summarizeInvoices(invoices);
  const stockRows = new Map();

  if (restockItems.length) {
    const stockConditions = restockItems.map(() => '(scp.supplier_id = ? AND scp.charging_pole_id = ?)').join(' OR ');
    const stockParams = restockItems.flatMap((item) => [item.supplier_id, item.pole_id]);
    const [rows] = await connection.query(
      `SELECT scp.supplier_id, scp.charging_pole_id AS pole_id, scp.quantity AS stock_quantity,
              s.name AS supplier_name, cp.name AS pole_name, cp.power_kw
         FROM supplier_charging_poles scp
         JOIN suppliers s ON s.id = scp.supplier_id
         JOIN charging_poles cp ON cp.id = scp.charging_pole_id
        WHERE ${stockConditions}
        ORDER BY scp.supplier_id, scp.charging_pole_id${lockClause}`,
      stockParams
    );
    for (const row of rows) stockRows.set(`${row.supplier_id}:${row.pole_id}`, row);
    for (const item of restockItems) {
      if (!stockRows.has(`${item.supplier_id}:${item.pole_id}`)) {
        throw fail(`Không tìm thấy tồn kho nhà cung cấp #${item.supplier_id}, loại trụ #${item.pole_id}; không thể rollback an toàn`, 409);
      }
    }
  }

  const restock = restockItems.map((item) => {
    const stock = stockRows.get(`${item.supplier_id}:${item.pole_id}`);
    return {
      ...item,
      supplier_name: stock.supplier_name,
      pole_name: stock.pole_name,
      power_kw: Number(stock.power_kw)
    };
  });
  const snapshot = {
    station, exports, items, invoices, imports, deployments, images, careLogs, activityLogs, restock, invoiceSummary
  };
  snapshot.previewToken = makePreviewToken(snapshot);
  return snapshot;
};

const toImpact = (snapshot) => ({
  charging_station_id: Number(snapshot.station.id),
  ma_tram: snapshot.station.ma_tram,
  proposal_id: Number(snapshot.station.proposal_id),
  proposal_code: snapshot.station.proposal_code,
  charging_station_status: snapshot.station.status,
  proposal_status: snapshot.station.proposal_status,
  export_count: snapshot.exports.length,
  export_item_count: snapshot.items.length,
  invoice_summary: snapshot.invoiceSummary,
  warehouse_import_count: snapshot.imports.length,
  deployment_count: snapshot.deployments.length,
  acceptance_image_count: snapshot.images.length,
  care_log_count: snapshot.careLogs.length,
  activity_log_count: snapshot.activityLogs.length,
  restock_items: snapshot.restock,
  preview_token: snapshot.previewToken
});

const getDeletePreview = async (id) => {
  const stationId = toId(id, 'Mã ON trạm');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const snapshot = await loadSnapshot(connection, stationId);
    await connection.commit();
    return toImpact(snapshot);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const deleteChargingStation = async (id, { reason, preview_token: previewToken } = {}, user, ctx = {}) => {
  if (user?.role !== 'SUPER_ADMIN') throw fail('Chỉ SUPER_ADMIN được xóa ON trạm', 403);
  const stationId = toId(id, 'Mã ON trạm');
  const cleanReason = String(reason || '').trim();
  if (cleanReason.length < 3 || cleanReason.length > 5000) {
    throw fail('Vui lòng nhập lý do xóa ON trạm (3–5000 ký tự)', 400);
  }
  if (!/^[a-f0-9]{64}$/i.test(String(previewToken || ''))) {
    throw fail('Vui lòng tải lại thông tin xóa trước khi xác nhận', 400);
  }

  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const snapshot = await loadSnapshot(connection, stationId, true);
    if (snapshot.previewToken !== previewToken) {
      throw fail('Dữ liệu ON trạm đã thay đổi sau khi xem trước. Hãy tải lại thông tin trước khi xóa', 409);
    }

    const [otherDeployments] = await connection.query(
      `SELECT d.id
         FROM charging_station_deployments d
         JOIN warehouse_export_items wei ON wei.id = d.export_item_id
         JOIN warehouse_exports we ON we.id = wei.export_id
        WHERE we.charging_station_id = ? AND d.charging_station_id <> ?
        LIMIT 1`,
      [stationId, stationId]
    );
    if (otherDeployments.length) {
      throw fail('Có tiến độ triển khai từ ON trạm khác đang dùng phiếu xuất liên quan; cần đối soát thủ công', 409);
    }

    for (const item of snapshot.restock) {
      const [result] = await connection.query(
        `UPDATE supplier_charging_poles
            SET quantity = quantity + ?
          WHERE supplier_id = ? AND charging_pole_id = ?`,
        [item.quantity, item.supplier_id, item.pole_id]
      );
      if (result.affectedRows !== 1) {
        throw fail(`Không thể cộng lại tồn kho nhà cung cấp #${item.supplier_id}, loại trụ #${item.pole_id}`, 409);
      }
      await connection.query(
        `UPDATE charging_poles
            SET quantity = (
              SELECT COALESCE(SUM(quantity), 0)
                FROM supplier_charging_poles
               WHERE charging_pole_id = ?
            )
          WHERE id = ?`,
        [item.pole_id, item.pole_id]
      );
    }

    await connection.query('DELETE FROM charging_station_deployments WHERE charging_station_id = ?', [stationId]);
    await connection.query('DELETE FROM charging_station_invoices WHERE charging_station_id = ?', [stationId]);
    if (snapshot.exports.length) {
      const exportIds = snapshot.exports.map((row) => Number(row.id));
      await connection.query(
        `DELETE FROM warehouse_export_items WHERE export_id IN (${exportIds.map(() => '?').join(',')})`,
        exportIds
      );
    }
    await connection.query('DELETE FROM warehouse_exports WHERE charging_station_id = ?', [stationId]);
    await connection.query('DELETE FROM charging_station_commitments WHERE charging_station_id = ?', [stationId]);

    await proposalLifecycle.logActivity({
      proposalId: snapshot.station.proposal_id,
      action: 'on_station_deleted',
      fromStatus: snapshot.station.proposal_status,
      toStatus: snapshot.station.proposal_status,
      changedFields: {
        charging_station: {
          label: 'ON trạm',
          old: snapshot.station.ma_tram || `#${stationId}`,
          new: 'Đã xóa'
        },
        warehouse_exports: {
          label: 'Phiếu xuất kho đã xóa',
          old: snapshot.exports.map((row) => Number(row.id)).join(', ') || 'Không có',
          new: `${snapshot.exports.length} phiếu`
        },
        warehouse_restock: {
          label: 'Trụ đã cộng lại kho',
          old: 'Trừ phần đã hoàn trả',
          new: snapshot.restock.map((item) => `${item.supplier_name} · ${item.pole_name}: ${item.quantity}`).join('; ') || 'Không có'
        },
        charging_station_invoices: {
          label: 'Phiếu tài chính đã xóa',
          old: `Cọc ${snapshot.invoiceSummary.DEPOSIT.count}; thanh toán ${snapshot.invoiceSummary.PAYMENT.count}; hoàn cọc ${snapshot.invoiceSummary.REFUND.count}`,
          new: `Tổng ${snapshot.invoiceSummary.count} phiếu`
        },
        warehouse_imports: {
          label: 'Phiếu nhập kho được giữ lại',
          old: snapshot.imports.map((row) => Number(row.id)).join(', ') || 'Không có',
          new: 'Giữ phiếu; bỏ liên kết ON trạm'
        },
        operational_records: {
          label: 'Dữ liệu vận hành ON trạm đã xóa',
          old: `Đợt triển khai ${snapshot.deployments.length}; ảnh nghiệm thu ${snapshot.images.length}; nhật ký chăm sóc ${snapshot.careLogs.length}; nhật ký ON trạm ${snapshot.activityLogs.length}`,
          new: 'Đã xóa cùng ON trạm'
        }
      },
      reason: cleanReason,
      actorId: user.id,
      actorRole: user.role,
      source: 'user',
      ip: ctx.ip,
      connection
    });

    const [deleteResult] = await connection.query(
      'DELETE FROM charging_stations WHERE id = ?',
      [stationId]
    );
    if (deleteResult.affectedRows !== 1) throw fail('ON trạm vừa được thay đổi; hãy tải lại danh sách', 409);

    await connection.commit();
    transactionStarted = false;
    return {
      ...toImpact(snapshot),
      deleted: true,
      reason: cleanReason
    };
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  calculateRestockItems,
  summarizeInvoices,
  getDeletePreview,
  deleteChargingStation
};
