const crypto = require('node:crypto');

const conflict = message => Object.assign(new Error(message), { statusCode: 409 });
const idOf = value => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new TypeError('ID phiếu lịch sử không hợp lệ');
  return id;
};
const fingerprint = snapshot => crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');

const capture = async (connection, exportId) => {
  const [headers] = await connection.query('SELECT * FROM warehouse_exports WHERE id = ? FOR UPDATE', [idOf(exportId)]);
  const header = headers[0];
  if (!header || Number(header.historical_import) !== 1 || header.destination_type !== 'STATION'
    || !header.charging_station_id) {
    throw conflict('Phiếu không phải dữ liệu lịch sử được quản lý; cần đối soát');
  }
  const [items] = await connection.query(
    'SELECT * FROM warehouse_export_items WHERE export_id = ? ORDER BY id FOR UPDATE', [header.id]
  );
  const commitmentIds = [...new Set(items.map(item => Number(item.commitment_id)).filter(Boolean))];
  const [commitments] = commitmentIds.length
    ? await connection.query('SELECT * FROM charging_station_commitments WHERE id IN (?) ORDER BY id FOR UPDATE', [commitmentIds])
    : [[]];
  const itemIds = items.map(item => Number(item.id));
  const [deployments] = itemIds.length
    ? await connection.query('SELECT * FROM charging_station_deployments WHERE export_item_id IN (?) ORDER BY id FOR UPDATE', [itemIds])
    : [[]];
  const deploymentIds = deployments.map(item => Number(item.id));
  const [documents] = deploymentIds.length
    ? await connection.query('SELECT * FROM charging_station_acceptance_documents WHERE deployment_id IN (?) ORDER BY id FOR UPDATE', [deploymentIds])
    : [[]];
  const documentIds = documents.map(item => Number(item.id));
  const [images] = documentIds.length
    ? await connection.query('SELECT * FROM charging_station_acceptance_images WHERE acceptance_document_id IN (?) ORDER BY id FOR UPDATE', [documentIds])
    : [[]];
  const [activities] = await connection.query(
    'SELECT id FROM charging_station_activity_logs WHERE charging_station_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE',
    [header.charging_station_id]
  );
  return { header, items, commitments, deployments, documents, images, lastStationActivityId: Number(activities[0]?.id || 0) };
};

const validateBaseline = (snapshot, batchKey) => {
  if (snapshot.header.historical_import_batch_key !== batchKey) {
    throw conflict('Phiếu lịch sử không thuộc lần import này; cần đối soát');
  }
  const commitmentIds = new Set(snapshot.commitments
    .filter(item => Number(item.charging_station_id) === Number(snapshot.header.charging_station_id))
    .map(item => Number(item.id)));
  if (!snapshot.items.length || snapshot.items.some(item => !commitmentIds.has(Number(item.commitment_id)))
    || snapshot.deployments.some(item => Number(item.charging_station_id) !== Number(snapshot.header.charging_station_id))
    || snapshot.documents.length || snapshot.images.length
    || snapshot.items.some(item => Number(item.returned_quantity) || Number(item.return_pending_quantity))
    || snapshot.deployments.some(item => item.acceptance_file_id || item.acceptance_user_id || item.returned_at)) {
    throw conflict('Phiếu lịch sử có chứng từ hoặc đã phát sinh nghiệp vụ; không thể đăng ký thay thế');
  }
};

const saveBaseline = async (connection, { exportId, batchKey }) => {
  if (!/^[\w.:-]{1,100}$/.test(String(batchKey || ''))) throw new TypeError('Mã lần import không hợp lệ');
  const snapshot = await capture(connection, exportId);
  validateBaseline(snapshot, batchKey);
  await connection.query(
    `INSERT INTO historical_on_import_managed_shipments
       (export_id, batch_key, fingerprint, last_station_activity_id) VALUES (?, ?, ?, ?)`,
    [idOf(exportId), batchKey, fingerprint(snapshot), snapshot.lastStationActivityId]
  );
};

const assertUntouched = async (connection, exportId) => {
  const id = idOf(exportId);
  const [rows] = await connection.query(
    'SELECT fingerprint, last_station_activity_id FROM historical_on_import_managed_shipments WHERE export_id = ? FOR UPDATE', [id]
  );
  if (!rows.length) throw conflict('Phiếu lịch sử không có dấu vết import; cần đối soát');
  const snapshot = await capture(connection, id);
  if (Number(rows[0].last_station_activity_id) !== snapshot.lastStationActivityId
    || rows[0].fingerprint !== fingerprint(snapshot)) {
    throw conflict('Phiếu lịch sử đã phát sinh thay đổi hoặc nghiệp vụ; cần đối soát');
  }
  return snapshot;
};

const advanceBaseline = async (connection, previous) => {
  const snapshot = await capture(connection, previous.header.id);
  validateBaseline(snapshot, previous.header.historical_import_batch_key);
  const [result] = await connection.query(
    `UPDATE historical_on_import_managed_shipments SET fingerprint = ?, last_station_activity_id = ?
     WHERE export_id = ? AND fingerprint = ?`,
    [fingerprint(snapshot), snapshot.lastStationActivityId, snapshot.header.id, fingerprint(previous)]
  );
  if (result.affectedRows !== 1) throw conflict('Dấu vết phiếu lịch sử đã thay đổi; cần đối soát');
};

module.exports = { saveBaseline, assertUntouched, advanceBaseline };
