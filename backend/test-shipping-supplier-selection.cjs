const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeShipmentRows, allocateShipmentRows } = require('./src/services/chargingStationShippingService');

const commitments = [
  { id: 1, model: 'NQ', pole_id: 60, quantity: 1 },
  { id: 2, model: 'LK', pole_id: 60, quantity: 1 },
  { id: 3, model: 'LK', pole_id: 30, quantity: 1 }
];

test('same pole and supplier combine; different pole or supplier remain separate', () => {
  assert.deepEqual(normalizeShipmentRows([
    { pole_id: 60, supplier_id: 1, quantity: 1 },
    { pole_id: 60, supplier_id: 1, quantity: 1 },
    { pole_id: 60, supplier_id: 2, quantity: 1 },
    { pole_id: 30, supplier_id: 1, quantity: 1 }
  ]), [
    { pole_id: 30, supplier_id: 1, quantity: 1 },
    { pole_id: 60, supplier_id: 1, quantity: 2 },
    { pole_id: 60, supplier_id: 2, quantity: 1 }
  ]);
});

test('mixed NQ and LK are allocated invisibly without duplicating demand per supplier', () => {
  const rows = [
    { pole_id: 60, supplier_id: 8, quantity: 1 },
    { pole_id: 60, supplier_id: 9, quantity: 1 },
    { pole_id: 30, supplier_id: 9, quantity: 1 }
  ];
  assert.deepEqual(allocateShipmentRows(rows, commitments, new Map()), [
    { commitment_id: 1, supplier_id: 8, quantity: 1 },
    { commitment_id: 2, supplier_id: 9, quantity: 1 },
    { commitment_id: 3, supplier_id: 9, quantity: 1 }
  ]);
  assert.throws(() => allocateShipmentRows([...rows, rows[0]], commitments, new Map()), { statusCode: 409 });
});

test('partial export and confirmed returns use the net exported remainder', () => {
  const rows = [{ pole_id: 60, supplier_id: 8, quantity: 2 }];
  assert.throws(() => allocateShipmentRows(rows, commitments, new Map([[1, 1]])), { statusCode: 409 });
  assert.equal(allocateShipmentRows(rows, commitments, new Map([[1, 0]])).length, 2);
});

test('reject invalid identifiers and quantities', () => {
  for (const row of [
    null,
    undefined,
    { pole_id: 60, supplier_id: null, quantity: 1 },
    { pole_id: 0, supplier_id: 1, quantity: 1 },
    { pole_id: 60, supplier_id: 1, quantity: -1 },
    { pole_id: 60, supplier_id: 1, quantity: 0.5 }
  ]) assert.throws(() => normalizeShipmentRows([row]), { statusCode: 400 });
});
