const pool = require('../utils/db');
const preview = require('./historicalOnImportPreview');
const snapshotService = require('./historicalOnImportSnapshot');
const { verifyProof, catalogHash } = require('./historicalOnImportProof');

const conflict = message => Object.assign(new Error(message), { statusCode: 409 });

const executeConfirmation = async ({ buffer, proof, actor, writeRow, database = pool }) => {
  if (typeof writeRow !== 'function') throw new TypeError('Historical import writer is required');
  const claims = verifyProof(proof, buffer, actor);
  const rows = await preview.readWorkbook(buffer);
  const connection = await database.getConnection();
  let started = false;
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    await connection.beginTransaction();
    started = true;
    await connection.query(
      `INSERT INTO historical_on_import_batches (batch_key, actor_id, file_hash)
       VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE batch_key = batch_key`,
      [claims.batch_key, actor.id, claims.file_hash]
    );
    const [batches] = await connection.query(
      'SELECT actor_id, file_hash, result FROM historical_on_import_batches WHERE batch_key = ? FOR UPDATE',
      [claims.batch_key]
    );
    const batch = batches[0];
    if (!batch || Number(batch.actor_id) !== Number(actor.id) || batch.file_hash !== claims.file_hash) {
      throw conflict('Lần import không khớp với file hoặc tài khoản');
    }
    if (batch.result !== null) {
      const result = typeof batch.result === 'string' ? JSON.parse(batch.result) : batch.result;
      await connection.commit();
      started = false;
      return result;
    }

    const checked = await preview.inspectDatabaseRows(rows, actor, connection);
    if (checked.length !== claims.targets.length) throw conflict('File đã thay đổi; hãy kiểm tra lại');
    const expected = new Map(claims.targets.map(target => [target.row, target]));
    for (const item of checked) {
      const target = expected.get(item.row);
      if (!target || item.errors.length || item.action !== target.action
        || Number(item.proposal_id || 0) !== Number(target.proposal_id || 0)
        || Number(item.owner?.id || 0) !== Number(target.owner_id || 0)
        || catalogHash(item) !== target.catalog_fingerprint
        || (item.snapshot_fingerprint || null) !== target.snapshot_fingerprint) {
        throw conflict(`Dòng ${item.row} đã thay đổi hoặc không còn hợp lệ; hãy kiểm tra lại file`);
      }
    }
    const snapshots = new Map();
    for (const item of checked.filter(row => row.action === 'update').sort((a, b) => a.proposal_id - b.proposal_id)) {
      const target = expected.get(item.row);
      const snapshot = await snapshotService.capture(connection, item.proposal_id, { lock: true });
      await snapshotService.save(connection, {
        batchKey: claims.batch_key, rowNumber: item.row, actorId: actor.id,
        snapshot, expectedFingerprint: target.snapshot_fingerprint
      });
      snapshots.set(item.row, snapshot);
    }
    const result = [];
    for (const item of checked) {
      const row = rows.find(source => source.row === item.row);
      result.push(await writeRow(connection, row, item, snapshots.get(item.row) || null, actor, { batchKey: claims.batch_key }));
    }
    const output = { batch_key: claims.batch_key, rows: result };
    await connection.query('UPDATE historical_on_import_batches SET result = ? WHERE batch_key = ?',
      [JSON.stringify(output), claims.batch_key]);
    await connection.commit();
    started = false;
    return output;
  } catch (error) {
    if (started) await connection.rollback();
    if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) {
      throw conflict('Dữ liệu đang được cập nhật; vui lòng kiểm tra lại file rồi thử lại');
    }
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = { executeConfirmation };
