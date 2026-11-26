const test = require('node:test');
const assert = require('node:assert/strict');
const { checkRealProgress, checkFeasibleProgress } = require('../src/services/historicalOnImport/historicalOnImportReconciliation');

const catalog = { poles: [{ id: 8, name: 'AC 22kW' }] };
const snapshot = {
  station: { id: 1 },
  commitments: [{ id: 2, model: 'NQ', pole_id: 8 }],
  exports: [{ id: 3, historical_import: 0, destination_type: 'STATION' },
    { id: 4, historical_import: 1, destination_type: 'STATION' }],
  export_items: [{ id: 5, export_id: 3, commitment_id: 2, quantity: 6, returned_quantity: 1, received_quantity: 4 },
    { id: 6, export_id: 4, commitment_id: 2, quantity: 20, returned_quantity: 0, received_quantity: 20 }],
  deployments: [{ export_item_id: 5, quantity: 3, installation_status: 'DONE', acceptance_status: 'PASSED', on_quantity: 2, returned_at: null },
    { export_item_id: 5, quantity: 1, installation_status: 'NOT', acceptance_status: 'NOT', on_quantity: 0, returned_at: null },
    { export_item_id: 5, quantity: 1, installation_status: 'DONE', acceptance_status: 'PASSED', on_quantity: 1, returned_at: '2026-01-01' }]
};
const row = { poles: [{ model: 'NQ', name: 'AC 22kW', committed: 5, shipped: 5, received: 4, installed: 3, accepted: 3, on: 2, accepted_on: 2 }] };

test('blocks totals lower than active real shipment and deployment records', () => {
  assert.deepEqual(checkRealProgress(row, snapshot, catalog), []);
  const pole = { ...row.poles[0], committed: 4, shipped: 4, received: 3, installed: 2, accepted: 2, on: 1, accepted_on: 1 };
  const errors = checkRealProgress({ poles: [pole] }, snapshot, catalog);
  assert.equal(errors.length, 7);
  assert.match(errors.join(' '), /thấp hơn chứng từ thực/);
});

test('leaves blank totals unchanged and requires reconciliation of unlinked real shipments', () => {
  assert.deepEqual(checkRealProgress({ poles: [{ ...row.poles[0], shipped: null, received: null }] }, snapshot, catalog), []);
  assert.match(checkRealProgress(row, { ...snapshot, export_items: [{ ...snapshot.export_items[0], commitment_id: null }] }, catalog)[0], /chưa đối soát/);
  assert.deepEqual(checkRealProgress({ poles: [] }, snapshot, catalog), []);
});

test('rejects totals whose remainder cannot preserve real acceptance and ON overlap', () => {
  const actual = {
    station: { id: 1 },
    commitments: [{ id: 2, model: 'NQ', pole_id: 8, quantity: 3 }],
    exports: [{ id: 3, historical_import: 0, destination_type: 'STATION' }],
    export_items: [{ id: 5, export_id: 3, commitment_id: 2, quantity: 3, returned_quantity: 0, received_quantity: 3 }],
    deployments: [
      { export_item_id: 5, quantity: 2, installation_status: 'DONE', acceptance_status: 'PASSED', on_quantity: 1, returned_at: null },
      { export_item_id: 5, quantity: 1, installation_status: 'NOT', acceptance_status: 'NOT', on_quantity: 0, returned_at: null }
    ]
  };
  const pole = { model: 'NQ', name: 'AC 22kW', committed: 4, shipped: 4, received: 4,
    installed: 3, accepted: 2, on: 2, accepted_on: 2 };
  assert.deepEqual(checkRealProgress({ poles: [pole] }, actual, catalog), []);
  assert.match(checkFeasibleProgress({ poles: [pole] }, actual, catalog)[0], /không thể phân bổ/);
  assert.deepEqual(checkFeasibleProgress({ poles: [{ ...pole, accepted_on: 1 }] }, actual, catalog), []);
});

test('uses existing totals for blank cells and checks new rows without inventing progress', () => {
  const actual = {
    station: { id: 1 },
    commitments: [{ id: 2, model: 'NQ', pole_id: 8, quantity: 3 }],
    exports: [{ id: 3, historical_import: 0, destination_type: 'STATION' }],
    export_items: [{ id: 5, export_id: 3, commitment_id: 2, quantity: 3, returned_quantity: 0, received_quantity: 2 }],
    deployments: [{ export_item_id: 5, quantity: 2, installation_status: 'DONE',
      acceptance_status: 'NOT', on_quantity: 1, returned_at: null }]
  };
  const blank = { model: 'NQ', name: 'AC 22kW', committed: null, shipped: null, received: null,
    installed: null, accepted: null, on: null, accepted_on: null };
  assert.deepEqual(checkFeasibleProgress({ poles: [blank] }, actual, catalog), []);
  assert.match(checkFeasibleProgress({ poles: [{ ...blank, shipped: 1 }] }, actual, catalog)[0], /không thể phân bổ/);
  const newPole = { ...blank, committed: 3, shipped: 2, received: 1, installed: 1, accepted: 0, on: 1, accepted_on: 0 };
  assert.deepEqual(checkFeasibleProgress({ poles: [newPole] }, null, catalog), []);
  assert.match(checkFeasibleProgress({ poles: [{ ...newPole, shipped: 0 }] }, null, catalog)[0], /không thể phân bổ/);
});

test('requires reconciliation of historical shipments without a commitment', () => {
  const actual = { ...snapshot, commitments: [{ ...snapshot.commitments[0], quantity: 30 }],
    export_items: [{ ...snapshot.export_items[1], commitment_id: null }] };
  assert.match(checkFeasibleProgress(row, actual, catalog)[0], /chưa đối soát/);
});

test('preserves unrelated proposal-only updates and rejects inconsistent shipment allocations', () => {
  const actual = {
    station: { id: 1 },
    commitments: [{ id: 2, model: 'NQ', pole_id: 8, quantity: 3 }],
    exports: [{ id: 3, historical_import: 0, destination_type: 'STATION' }],
    export_items: [{ id: 5, export_id: 3, commitment_id: 2, quantity: 3, returned_quantity: 0, received_quantity: 2 }],
    deployments: [{ export_item_id: 5, quantity: 1, installation_status: 'NOT', acceptance_status: 'NOT', on_quantity: 0 }]
  };
  const proposalOnly = { poles: [{ model: 'NQ', name: 'AC 22kW', proposed: 5 }] };
  assert.deepEqual(checkRealProgress(proposalOnly, actual, catalog), []);
  assert.deepEqual(checkFeasibleProgress(proposalOnly, actual, catalog), []);
  assert.throws(() => checkFeasibleProgress({ poles: [{ ...proposalOnly.poles[0], committed: 3 }] }, actual, catalog),
    /chưa khớp/);
});
