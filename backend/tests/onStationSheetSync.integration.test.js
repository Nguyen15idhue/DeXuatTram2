const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/utils/db');
const service = require('../src/services/onStationSheetSyncService');

test('snapshot deletion and concurrent queue versions survive reconciliation', {
  skip: process.env.ON_SHEET_SYNC_INTEGRATION !== '1'
}, async () => {
  const connection = await pool.getConnection();
  const originalQuery = pool.query;
  const code = `TEST_SHEET_${Date.now()}`;
  let id;
  try {
    await connection.beginTransaction();
    pool.query = connection.query.bind(connection);
    const [insert] = await connection.query(
      `INSERT INTO station_proposals (latitude,longitude,address,owner_name,owner_phone,status,custom_data)
       VALUES (21,105,'Temporary sheet test','Sheet test','0900000000','ACTIVE',?)`,
      [JSON.stringify({ ma_de_xuat: code })]
    );
    id = insert.insertId;
    const proposals = await service.loadProposals([id]);
    assert.equal(proposals.length, 1);
    const keys = await service.loadProposalKeys([id]);
    assert.equal(keys.get(id).code, code);
    await connection.query(
      "UPDATE on_station_sheet_sync_queue SET requested_version=2, status='PROCESSING', attempt_count=8 WHERE proposal_id=?",
      [id]
    );
    const sheet = { spreadsheets: { values: {
      get: async () => ({ data: { values: [service.HEADER_ROW, service.buildRow(proposals[0], 1)] } }),
      batchUpdate: async request => {
        assert.equal(request.requestBody.data[1].values[0][1], null);
      }
    } } };
    const proposalMap = new Map([[id, proposals[0]]]);
    const config = { spreadsheetId: 'mock-only', tabName: 'ON' };
    await service.writeSheetRows(sheet, config,
      [{ proposal_id: id, operation: 'UPSERT', requested_version: 1 }], proposalMap, keys);
    const [pending] = await connection.query(
      'SELECT status,synced_version,attempt_count FROM on_station_sheet_sync_queue WHERE proposal_id=?', [id]
    );
    assert.equal(pending[0].status, 'PENDING');
    assert.equal(Number(pending[0].synced_version), 1);
    assert.equal(Number(pending[0].attempt_count), 0);
    await service.writeSheetRows(sheet, config,
      [{ proposal_id: id, operation: 'UPSERT', requested_version: 2 }], proposalMap, keys);
    const [done] = await connection.query(
      'SELECT status,synced_version FROM on_station_sheet_sync_queue WHERE proposal_id=?', [id]
    );
    assert.equal(done[0].status, 'DONE');
    assert.equal(Number(done[0].synced_version), 2);
    await connection.query('DELETE FROM station_proposals WHERE id=?', [id]);
    const deletedKeys = await service.loadProposalKeys([id]);
    assert.equal(deletedKeys.get(id).code, code);
    const [deleted] = await connection.query(
      'SELECT operation,sheet_proposal_code FROM on_station_sheet_sync_queue WHERE proposal_id=?', [id]
    );
    assert.equal(deleted[0].operation, 'DELETE');
    assert.equal(deleted[0].sheet_proposal_code, code);
  } finally {
    pool.query = originalQuery;
    await connection.rollback();
    connection.release();
  }
  const [leaked] = await pool.query('SELECT id FROM station_proposals WHERE id=?', [id]);
  assert.equal(leaked.length, 0);
});

test.after(async () => { await pool.end(); });
