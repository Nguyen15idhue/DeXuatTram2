const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPortions } = require('../src/services/historicalOnImport/historicalOnImportProgress');

test('preserves independent partial ON and acceptance counts', () => {
  const portions = buildPortions({ received: 5, installed: 4, accepted: 2, on: 2, accepted_on: 1 });
  assert.equal(portions.reduce((sum, item) => sum + item.quantity, 0), 5);
  assert.equal(portions.filter(item => item.installation_status === 'DONE').reduce((sum, item) => sum + item.quantity, 0), 4);
  assert.equal(portions.filter(item => item.acceptance_status === 'PASSED').reduce((sum, item) => sum + item.quantity, 0), 2);
  assert.equal(portions.reduce((sum, item) => sum + item.on_quantity, 0), 2);
  assert.equal(portions.find(item => item.stage === 'OPERATING' && item.acceptance_status === 'NOT').quantity, 1);
  assert.ok(portions.filter(item => item.installation_status === 'DONE' && !item.on_quantity)
    .every(item => item.stage === 'CONFIGURING' && item.sub_status === 'NOT_CONFIGURED'));
  assert.ok(portions.filter(item => item.on_quantity).every(item => item.sub_status === 'ACTIVE'));
  assert.ok(portions.filter(item => item.installation_status === 'NOT')
    .every(item => item.stage === 'INSTALLING' && item.sub_status === 'NOT_INSTALLED'));
});

test('rejects impossible overlap and missing or negative counts', () => {
  assert.throws(() => buildPortions({ received: 4, installed: 4, accepted: 3, on: 3, accepted_on: 1 }), /không phù hợp/);
  assert.throws(() => buildPortions({ received: 1, installed: 1, accepted: 0, on: -1, accepted_on: 0 }), /không hợp lệ/);
  assert.throws(() => buildPortions({ received: 1, installed: 1, accepted: 0, on: 0 }), /không hợp lệ/);
});
