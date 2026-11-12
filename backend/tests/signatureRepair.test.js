const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');

const harness = async (overrides = {}) => {
  const config = {
    id: 21, user_id: 7, proposal_id: 501, document_id: 11, current_document_id: 11,
    is_current: 1, status: 'SIGNED', signature_id: 99, signed_at: '2026-01-02 03:04:05',
    proposal_status: 'SIGNATURE_PENDING', ...overrides
  };
  let snapshot = overrides.snapshot || null;
  const logs = [];
  const events = [];
  let before;
  const query = async (sql, args) => {
    events.push(sql);
    if (sql.includes('FROM proposal_signature_configs')) {
      return [Number(args[0]) === config.id && Number(args[1]) === config.proposal_id ? [{ ...config }] : []];
    }
    if (sql.includes('FROM users')) return [[{ id: 7 }]];
    if (sql.includes('FROM signatures WHERE id')) return [overrides.oldExists ? [{ file_path: 'old.png' }] : []];
    if (sql.includes('FROM signatures WHERE user_id')) {
      assert.deepEqual(args, [7]);
      return [overrides.noCurrent ? [] : [{ id: 100 }]];
    }
    if (sql.includes('FROM proposal_activity_logs')) return [logs.length ? [{ created_at: '2026-11-12 07:00:00' }] : []];
    throw new Error(sql);
  };
  const executor = { query };
  const connection = {
    query, beginTransaction: async () => { before = snapshot; },
    commit: async () => events.push('commit'),
    rollback: async () => { snapshot = before; logs.length = 0; events.push('rollback'); }
  };
  const snapshots = {
    read: async () => {
      if (overrides.corrupt) throw Object.assign(new Error('Corrupt snapshot'), { statusCode: 409 });
      return snapshot;
    },
    save: async (id, bytes, passed) => {
      assert.equal(id, 21); assert.equal(passed, connection);
      if (snapshot) throw new Error('Duplicate snapshot');
      snapshot = bytes;
    }
  };
  const mocks = {
    '../utils/db': executor,
    'fs/promises': { access: async () => {} },
    './signatureSnapshotService': snapshots,
    './signedDocumentService': { validateSignature: async id => {
      assert.equal(id, 100);
      if (overrides.invalidCurrent) throw Object.assign(new Error('Invalid image'), { statusCode: 400 });
      return { bytes: Buffer.from('new image') };
    } },
    './proposalSignatureService': { _internals: { withSignatureMutationLock: async (id, fn) => fn(connection) } },
    './proposalLifecycle': { logActivity: async log => {
      assert.equal(log.connection, connection);
      if (overrides.auditFails) throw new Error('Audit unavailable');
      logs.push(log);
    } }
  };
  const filename = path.resolve(__dirname, '../src/services/signatureRepairService.js');
  const module = { exports: {} };
  const source = await fs.readFile(filename, 'utf8');
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(
    id => { if (!Object.hasOwn(mocks, id)) throw new Error(id); return mocks[id]; }, module, module.exports
  );
  const args = { user: { id: 1, role: 'SUPER_ADMIN' }, id: 501, configId: 21, reason: 'Approved recovery', ip: '127.0.0.1' };
  return { service: module.exports, args, config, logs, events, snapshot: () => snapshot };
};

test('repair/status enforce SUPER_ADMIN and validate IDs and reason', async () => {
  const h = await harness();
  for (const role of ['ADMIN', 'SALES', 'CTV', 'NPP', 'MKT']) {
    const args = { ...h.args, user: { id: 1, role } };
    await assert.rejects(h.service.repair(args), { statusCode: 403 });
    await assert.rejects(h.service.getStatus(args), { statusCode: 403 });
  }
  for (const reason of ['', ' ', {}, 'x'.repeat(2001)]) {
    await assert.rejects(h.service.repair({ ...h.args, reason }), { statusCode: 400 });
  }
  await assert.rejects(h.service.repair({ ...h.args, configId: -1 }), { statusCode: 400 });
  assert.equal(h.events.length, 0);
});

test('recovers only the selected lost image from the same signer, with atomic audit and unchanged original signature', async () => {
  const h = await harness();
  const original = { ...h.config };
  assert.equal((await h.service.getStatus(h.args)).can_repair, true);
  const result = await h.service.repair(h.args);
  assert.deepEqual(result, { config_id: 21, source_signature_id: 100 });
  assert.deepEqual(h.config, original);
  assert.equal(h.snapshot().toString(), 'new image');
  assert.equal(h.logs.length, 1);
  assert.equal(h.logs[0].action, 'signature_image_repaired');
  assert.equal(h.logs[0].actorId, 1);
  assert.equal(h.logs[0].changedFields.signature_source.old, 99);
  assert.equal(h.logs[0].changedFields.signature_source.new, 100);
  assert.equal(h.logs[0].changedFields.signed_at.new, original.signed_at);
  assert.deepEqual(await h.service.getStatus(h.args), { can_repair: false, repaired_at: '2026-11-12 07:00:00' });
  await assert.rejects(h.service.repair(h.args), { statusCode: 409 });
});

test('rejects intact images, existing/corrupt snapshots, unsigned/override boxes, archived and final documents', async () => {
  for (const overrides of [
    { oldExists: true }, { snapshot: Buffer.from('old') }, { corrupt: true },
    { status: 'PENDING' }, { signature_id: null }, { signed_at: null },
    { proposal_status: 'APPROVED' }, { proposal_signed_file_id: 5 },
    { document_signed_file_id: 6 }, { is_current: 0 }, { current_document_id: null }
  ]) {
    const h = await harness(overrides);
    await assert.rejects(h.service.repair(h.args), { statusCode: 409 });
    assert.equal(h.logs.length, 0);
    assert.equal(h.events.includes('commit'), false);
  }
});

test('rejects wrong proposal and missing/invalid current images; audit failure rolls back snapshot', async () => {
  const h = await harness();
  await assert.rejects(h.service.repair({ ...h.args, id: 999 }), { statusCode: 404 });
  for (const overrides of [{ noCurrent: true }, { invalidCurrent: true }, { auditFails: true }]) {
    const current = await harness(overrides);
    await assert.rejects(current.service.repair(current.args));
    assert.equal(current.snapshot(), null);
    assert.equal(current.events.includes('commit'), false);
    assert.equal(current.events.includes('rollback'), true);
  }
});
