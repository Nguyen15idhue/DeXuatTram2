const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const helpers = import(pathToFileURL(path.resolve(__dirname, '../../frontend/src/utils/chargingFulfillment.js')));

test('one shipment/type row combines received portions, keeps first ON date and allocates only installed quantities', async () => {
  const { buildOnRows, onRowPayload } = await helpers;
  const portions = [
    { id: 1, export_id: 10, export_item_id: 11, pole_id: 2, supplier_id: 3, quantity: 3, on_quantity: 2,
      installation_status: 'DONE', on_date: '2026-11-12', on_first_at: '2026-11-14T01:00:00Z', workflow_version: 1 },
    { id: 2, export_id: 10, export_item_id: 11, pole_id: 2, supplier_id: 3, quantity: 2, on_quantity: 1,
      installation_status: 'DONE', on_date: '2026-11-10', on_first_at: '2026-11-15T01:00:00Z', workflow_version: 2 },
    { id: 3, export_id: 10, export_item_id: 11, pole_id: 2, supplier_id: 3, quantity: 2, on_quantity: 0,
      installation_status: 'NOT', workflow_version: 3 }
  ];
  const summary = { shipments: [{ id: 10, transport_status: 'DELIVERED',
    items: [{ id: 11, pole_id: 2, supplier_id: 3, quantity: 8, name: 'DC120' }] }] };
  const [row] = buildOnRows(summary, portions);
  assert.equal(row.quantity, 8);
  assert.equal(row.initialQuantity, 3);
  assert.equal(row.maximum, 5);
  assert.equal(row.firstDate, '2026-11-12', 'first recorded event wins over a later backdated event');
  assert.deepEqual(onRowPayload({ ...row, value: 5, date: '2026-11-16' }), [
    { id: 1, expected_version: 1, on_quantity: 3, on_date: '2026-11-16', note: null },
    { id: 2, expected_version: 2, on_quantity: 2, on_date: '2026-11-16', note: null }
  ]);
  assert.deepEqual(onRowPayload({ ...row, value: 1, date: '2026-11-17' }).map(item => [item.id, item.on_quantity]), [[2, 0], [1, 1]]);
  for (const value of ['', -1, 1.5, 6]) assert.throws(() => onRowPayload({ ...row, value, date: '2026-11-16' }));
  assert.throws(() => onRowPayload({ ...row, value: 4, date: '' }), /ngày/);
});

test('pending returns cannot change quantities and operating stage does not imply numeric completion', async () => {
  const { buildOnRows, onStationStatus } = await helpers;
  const portions = [{ id: 1, export_id: 1, export_item_id: 1, commitment_id: 1, quantity: 3, on_quantity: 0,
    stage: 'OPERATING', installation_status: 'DONE', shipment_status: 'RETURN_PENDING' }];
  const [row] = buildOnRows({}, portions);
  assert.equal(row.minimum, 0);
  assert.equal(row.maximum, 0);
  assert.equal(onStationStatus({ status: 'OPERATING', deployments: portions,
    fulfillment: { items: [{ commitment_id: 1, committed_quantity: 3 }] } }), 'NOT');
});

test('ON rows show older received shipments first and keep unreceived shipments at the bottom', async () => {
  const { buildOnRows } = await helpers;
  const shipments = [
    { id: 8, transport_status: 'SHIPPING' },
    { id: 7, transport_status: 'DELIVERED' },
    { id: 3, transport_status: 'SHIPPING' },
    { id: 1, transport_status: 'SHIPPING' },
    { id: 5, transport_status: 'DELIVERED' }
  ].map(shipment => ({ ...shipment, items: [{ id: shipment.id, pole_id: 1, quantity: 2 }] }));
  const portions = [{ id: 1, export_id: 3, export_item_id: 3, pole_id: 1, quantity: 1,
    installation_status: 'NOT', shipment_status: 'SHIPPING' }];
  const rows = buildOnRows({ shipments }, portions);
  assert.deepEqual(rows.map(row => row.export_id), [3, 5, 7, 1, 8]);
  assert.deepEqual(shipments.map(row => row.id), [8, 7, 3, 1, 5]);
});
