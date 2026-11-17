const test = require('node:test');
const assert = require('node:assert/strict');
const { capture, fingerprint, save } = require('../src/services/historicalOnImportSnapshot');

test('snapshot includes proposal, station, fulfillment and financial rows under locks', async () => {
  const calls = [];
  const connection = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('FROM station_proposals')) return [[{ id: 5, owner_name: 'fixture' }]];
    if (sql.includes('FROM charging_stations')) return [[{ id: 7, proposal_id: 5 }]];
    if (sql.includes('FROM warehouse_exports')) return [[{ id: 9, historical_import: 0 }]];
    if (sql.includes('FROM warehouse_export_items')) return [[{ id: 11, export_id: 9 }]];
    if (sql.includes('FROM charging_station_invoices')) return [[{ id: 13, amount: '100.00' }]];
    if (sql.includes('FROM charging_station_deployments')) return [[{ id: 14, charging_station_id: 7 }]];
    if (sql.includes('FROM charging_station_acceptance_documents')) return [[{ id: 15, deployment_id: 14, file_id: 20 }]];
    if (sql.includes('FROM charging_station_acceptance_images')) return [[{ id: 16, acceptance_document_id: 15, file_id: 21 }]];
    return [[]];
  } };
  const snapshot = await capture(connection, 5, { lock: true });
  assert.equal(snapshot.export_items[0].id, 11);
  assert.equal(snapshot.invoices[0].id, 13);
  assert.equal(snapshot.acceptance_documents[0].file_id, 20);
  assert.equal(snapshot.acceptance_images[0].file_id, 21);
  assert.notEqual(fingerprint(snapshot), fingerprint({
    ...snapshot, acceptance_images: [{ ...snapshot.acceptance_images[0], file_id: 22 }]
  }));
  assert.ok(calls.every(call => call.sql.includes('FOR UPDATE')));
  const insert = [];
  connection.query = async (sql, params) => { insert.push({ sql, params }); return [{ insertId: 21 }]; };
  assert.equal(await save(connection, {
    batchKey: 'batch-1', rowNumber: 2, actorId: 3, snapshot, expectedFingerprint: fingerprint(snapshot)
  }), 21);
  assert.deepEqual(JSON.parse(insert[0].params[6]), snapshot);
});

test('snapshot refuses stale preview before writing and handles a proposal without ON station', async () => {
  let writes = 0;
  const connection = { query: async sql => {
    if (sql.startsWith('INSERT')) { writes++; return [{ insertId: 1 }]; }
    return sql.includes('station_proposals') ? [[{ id: 5 }]] : [[]];
  } };
  const before = await capture(connection, 5);
  assert.equal(before.station, null);
  const changed = { ...before, proposal: { id: 5, status: 'ACTIVE' } };
  await assert.rejects(save(connection, {
    batchKey: 'batch-1', rowNumber: 2, actorId: 3, snapshot: changed, expectedFingerprint: fingerprint(before)
  }), { statusCode: 409 });
  assert.equal(writes, 0);
});
