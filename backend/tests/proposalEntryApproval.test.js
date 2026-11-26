const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../src/services/proposalEntryApproval');
const pool = require('../src/utils/db');

const user = (id, role, parent_id = null, title = '', status = 'ACTIVE') => ({
  id, role, parent_id, status, custom_data: { chuc_vu: title, department: 'Trung tâm KD miền Bắc' }
});
const users = [
  user(1, 'SUPER_ADMIN'), user(2, 'ADMIN'), user(3, 'SALES', null, 'Giám đốc Trung tâm Kinh doanh'),
  user(4, 'SALES', 3, 'Giám đốc Khu vực'), user(5, 'NPP', 4), user(6, 'CTV', 5),
  user(7, 'SALES', null, 'Giám đốc Khu vực'), user(8, 'CTV')
];

test('one manager in the actual ancestor chain or SUPER_ADMIN can approve', () => {
  for (const id of [1, 3, 4]) assert.equal(policy.canApprove(6, { id }, users), true);
  for (const id of [2, 5, 6, 7, 8]) assert.equal(policy.canApprove(6, { id }, users), false);
  assert.equal(policy.canApprove(5, { id: 4 }, users), true);
});

test('ADMIN fallback applies only when no active qualifying manager exists', () => {
  assert.equal(policy.canApprove(8, { id: 2 }, users), true);
  const locked = users.map((u) => [3, 4].includes(u.id) ? { ...u, status: 'LOCKED' } : u);
  assert.equal(policy.canApprove(6, { id: 2 }, locked), true);
  assert.equal(policy.canApprove(6, { id: 3 }, locked), false);
  assert.equal(policy.canApprove(6, { id: 4 }, locked), false);
});

test('a cycle and an inactive account cannot grant approval', () => {
  const cyclic = [user(10, 'CTV', 11), user(11, 'NPP', 10), user(12, 'ADMIN')];
  assert.deepEqual(policy.eligibleManagerIds(10, cyclic), []);
  assert.equal(policy.canApprove(10, { id: 12 }, cyclic), true);
});

test.after(async () => pool.end());
