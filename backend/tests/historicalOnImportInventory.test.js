const test = require('node:test');
const assert = require('node:assert/strict');
const { stockAffectingItems } = require('../src/services/historicalOnImportInventory');
const { calculateRestockItems } = require('../src/services/chargingStationDeletionService');

test('historical shipment rows are excluded from stock-affecting items', () => {
  const items = [
    { id: 1, historical_import: 1, supplier_id: 1, pole_id: 2, quantity: 5, returned_quantity: 0 },
    { id: 2, historical_import: 0, supplier_id: 1, pole_id: 2, quantity: 4, returned_quantity: 1 }
  ];
  assert.deepEqual(stockAffectingItems(items).map(item => item.id), [2]);
  assert.deepEqual(stockAffectingItems(items.slice(0, 1)), []);
  assert.throws(() => stockAffectingItems([{ id: 3 }]), /Không xác định được nguồn phiếu xuất/);
});

test('deleting an ON station restores only real shipment stock', () => {
  const items = [
    { id: 1, historical_import: 1, supplier_id: 1, pole_id: 2, quantity: 7, returned_quantity: 0 },
    { id: 2, historical_import: 0, supplier_id: 1, pole_id: 2, quantity: 4, returned_quantity: 1 }
  ];
  assert.deepEqual(calculateRestockItems(items), [{ supplier_id: 1, pole_id: 2, quantity: 3 }]);
  assert.throws(() => calculateRestockItems([{ ...items[0], historical_import: null }]), /Không xác định/);
});

test('direct receipts are excluded from return and deletion stock while ordinary exports still restore stock', () => {
  const items = [
    { id: 1, historical_import: 0, stock_exempt: 1, supplier_id: null, pole_id: 2, quantity: 7, returned_quantity: 0 },
    { id: 2, historical_import: 0, stock_exempt: 0, supplier_id: 1, pole_id: 2, quantity: 4, returned_quantity: 1 },
    { id: 3, historical_import: 1, stock_exempt: 0, supplier_id: 1, pole_id: 2, quantity: 2, returned_quantity: 0 }
  ];
  assert.deepEqual(stockAffectingItems(items).map(item => item.id), [2]);
  assert.deepEqual(calculateRestockItems(items), [{ supplier_id: 1, pole_id: 2, quantity: 3 }]);
  assert.throws(() => stockAffectingItems([{ ...items[0], stock_exempt: 'unknown' }]), /cơ chế tồn kho/);
});
