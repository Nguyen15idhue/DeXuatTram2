const test = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET ||= 'test-historical-proof-secret';
const jwt = require('jsonwebtoken');
const { createProof, verifyProof } = require('../src/services/historicalOnImport/historicalOnImportProof');

test('proof is bound to the exact file, actor, session version and preview targets', () => {
  const file = Buffer.from('file');
  const actor = { id: 7, tokenVersion: 3, role: 'SUPER_ADMIN' };
  const rows = [{ row: 2, action: 'update', proposal_id: 8, snapshot_fingerprint: 'a'.repeat(64), owner: null, errors: [] }];
  const token = createProof(file, actor, rows);
  const claims = verifyProof(token, file, actor);
  assert.equal(claims.targets[0].proposal_id, 8);
  assert.throws(() => verifyProof(token, Buffer.from('different'), actor), /khác với lần xem trước/);
  assert.throws(() => verifyProof(token, file, { ...actor, id: 8 }), /khác với lần xem trước/);
  assert.throws(() => verifyProof(token, file, { ...actor, tokenVersion: 4 }), /khác với lần xem trước/);
  assert.throws(() => verifyProof(token, file, { ...actor, role: 'ADMIN' }), /khác với lần xem trước/);
  assert.throws(() => verifyProof(`${token}x`, file, actor), /không hợp lệ/);
  assert.throws(() => jwt.verify(token, process.env.JWT_SECRET), /invalid signature/);
  assert.throws(() => createProof(file, actor, [{ ...rows[0], errors: ['Lỗi'] }]), /chưa được kiểm tra hợp lệ/);
  assert.throws(() => createProof(file, actor, [{ ...rows[0], snapshot_fingerprint: null }]), /xem trước không hợp lệ/);
  assert.throws(() => createProof(file, actor, [rows[0], rows[0]]), /xem trước không hợp lệ/);
});
