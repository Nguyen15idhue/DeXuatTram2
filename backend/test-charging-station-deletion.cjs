const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateRestockItems, summarizeInvoices } = require('./src/services/chargingStationDeletionService');

test('restock returns only the net exported quantity grouped by supplier and pole', () => {
  const result = calculateRestockItems([
    { id: 1, supplier_id: 3, pole_id: 10, quantity: 3, returned_quantity: 1 },
    { id: 2, supplier_id: 3, pole_id: 10, quantity: 2, returned_quantity: 0 },
    { id: 3, supplier_id: 4, pole_id: 10, quantity: 1, returned_quantity: 1 }
  ]);
  assert.deepEqual(result, [{ supplier_id: 3, pole_id: 10, quantity: 4 }]);
});

test('restock handles legacy missing returned quantity and skips fully returned lines', () => {
  assert.deepEqual(calculateRestockItems([
    { id: 1, supplier_id: 3, pole_id: 10, quantity: 1 },
    { id: 2, supplier_id: null, pole_id: 11, quantity: 2, returned_quantity: 2 }
  ]), [{ supplier_id: 3, pole_id: 10, quantity: 1 }]);
});

test('restock rejects invalid return totals or missing inventory identity', () => {
  assert.throws(
    () => calculateRestockItems([{ id: 1, supplier_id: 3, pole_id: 10, quantity: 2, returned_quantity: 3 }]),
    { statusCode: 409 }
  );
  assert.throws(
    () => calculateRestockItems([{ id: 2, supplier_id: null, pole_id: 10, quantity: 1, returned_quantity: 0 }]),
    { statusCode: 409 }
  );
});

test('invoice summary preserves counts and sums amounts to cents by invoice type', () => {
  assert.deepEqual(summarizeInvoices([
    { id: 1, invoice_type: 'DEPOSIT', amount: '100.10' },
    { id: 2, invoice_type: 'DEPOSIT', amount: '0.20' },
    { id: 3, invoice_type: 'PAYMENT', amount: '50.00' },
    { id: 4, invoice_type: 'REFUND', amount: '10.05' }
  ]), {
    count: 4,
    DEPOSIT: { count: 2, amount: 100.3 },
    PAYMENT: { count: 1, amount: 50 },
    REFUND: { count: 1, amount: 10.05 }
  });
});
