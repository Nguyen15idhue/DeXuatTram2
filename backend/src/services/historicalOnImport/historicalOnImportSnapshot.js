const crypto = require('node:crypto');

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const idOf = (value, label) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw fail(`${label} không hợp lệ`);
  return id;
};

const capture = async (connection, proposalId, { lock = false } = {}) => {
  const id = idOf(proposalId, 'ID đề xuất');
  const suffix = lock ? ' FOR UPDATE' : '';
  const [proposals] = await connection.query(`SELECT * FROM station_proposals WHERE id = ?${suffix}`, [id]);
  if (proposals.length !== 1) throw fail('Không tìm thấy đề xuất để đối soát', 409);
  const [stations] = await connection.query(
    `SELECT * FROM charging_stations WHERE proposal_id = ? ORDER BY id${suffix}`, [id]
  );
  if (stations.length > 1) throw fail('Đề xuất có nhiều hồ sơ ON trạm; cần đối soát', 409);
  const snapshot = { version: 1, proposal: proposals[0], station: stations[0] || null };
  if (!snapshot.station) return snapshot;

  const stationId = Number(snapshot.station.id);
  for (const [key, table] of [
    ['commitments', 'charging_station_commitments'],
    ['exports', 'warehouse_exports'],
    ['deployments', 'charging_station_deployments'],
    ['invoices', 'charging_station_invoices'],
    ['contract_files', 'charging_station_contract_files']
  ]) {
    const [rows] = await connection.query(
      `SELECT * FROM ${table} WHERE charging_station_id = ? ORDER BY id${suffix}`, [stationId]
    );
    snapshot[key] = rows;
  }
  const exportIds = snapshot.exports.map(row => Number(row.id));
  if (exportIds.length) {
    [snapshot.export_items] = await connection.query(
      `SELECT * FROM warehouse_export_items WHERE export_id IN (?) ORDER BY id${suffix}`, [exportIds]
    );
  } else {
    snapshot.export_items = [];
  }
  const deploymentIds = snapshot.deployments.map(row => Number(row.id));
  if (deploymentIds.length) {
    [snapshot.acceptance_documents] = await connection.query(
      `SELECT * FROM charging_station_acceptance_documents WHERE deployment_id IN (?) ORDER BY id${suffix}`, [deploymentIds]
    );
  } else {
    snapshot.acceptance_documents = [];
  }
  const documentIds = snapshot.acceptance_documents.map(row => Number(row.id));
  if (documentIds.length) {
    [snapshot.acceptance_images] = await connection.query(
      `SELECT * FROM charging_station_acceptance_images WHERE acceptance_document_id IN (?) ORDER BY id${suffix}`, [documentIds]
    );
  } else {
    snapshot.acceptance_images = [];
  }
  return snapshot;
};

const fingerprint = snapshot => crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');

const save = async (connection, { batchKey, rowNumber, actorId, snapshot, expectedFingerprint }) => {
  if (!/^[\w.:-]{1,100}$/.test(String(batchKey || ''))) throw fail('Mã lần import không hợp lệ');
  const row = idOf(rowNumber, 'Dòng import');
  const actor = idOf(actorId, 'Người import');
  if (!snapshot?.proposal) throw fail('Thiếu snapshot đề xuất');
  const hash = fingerprint(snapshot);
  if (!/^[a-f0-9]{64}$/.test(String(expectedFingerprint || '')) || hash !== expectedFingerprint) {
    throw fail('Hồ sơ đã thay đổi sau khi xem trước; hãy kiểm tra lại file', 409);
  }
  const [result] = await connection.query(
    `INSERT INTO historical_on_import_snapshots
      (batch_key, sheet_row, proposal_id, charging_station_id, actor_id, fingerprint, snapshot)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [batchKey, row, idOf(snapshot.proposal.id, 'ID đề xuất'),
      snapshot.station ? idOf(snapshot.station.id, 'ID ON trạm') : null, actor, hash, JSON.stringify(snapshot)]
  );
  return result.insertId;
};

module.exports = { capture, fingerprint, save };
