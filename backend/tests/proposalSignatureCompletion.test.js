const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/utils/db');
const service = require('../src/services/proposalSignatureService');
const reports = require('../src/services/proposalReportService');
const dynamic = require('../src/services/dynamicUtils');
const notification = require('../src/services/notificationService');
const lifecycle = require('../src/services/proposalLifecycle');
const originals = {
  getConnection: pool.getConnection, query: pool.query, scope: reports.resolveScope,
  fields: dynamic.getFieldDefinitionsByEntity, merge: dynamic.mergeData, create: notification.create,
};
let proposal;
let configs;
let logs;
let notices;
let queries;
let failLog;
let committed;
let rolledBack;
let released;
let snapshot;
const superUser = { id: 1, role: 'SUPER_ADMIN' };

test.before(() => {
  reports.resolveScope = async (user) => ({ role: user.role, userId: user.id, isAdmin: true, isBackOffice: user.id === 8 });
  dynamic.getFieldDefinitionsByEntity = async () => [];
  dynamic.mergeData = (row) => row;
  notification.create = async (value) => notices.push(value);
  pool.query = async (sql, params = []) => {
    queries.push({ sql, params });
    if (sql.includes("FROM users WHERE status")) return [[superUser, { id: 8, role: 'SALES', custom_data: '{"department":"Phòng Tài chính và Kế toán"}' },
      { id: 9, role: 'SALES', custom_data: '{"department":"Back Office"}' }]];
    if (sql.includes('COUNT(*) AS total')) return [[{ total: 1 }]];
    if (sql.includes('SELECT p.*')) {
      return [[{ ...proposal, signer_total: configs.length, signer_signed: configs.filter((item) => item.status === 'SIGNED').length, signer_distinct_total: configs.length }]];
    }
    throw new Error(`Unexpected pool query: ${sql}`);
  };
  pool.getConnection = async () => ({
    beginTransaction: async () => { snapshot = { proposal: { ...proposal }, configs: configs.map((item) => ({ ...item })) }; },
    commit: async () => { committed++; },
    rollback: async () => { rolledBack++; proposal = snapshot.proposal; configs = snapshot.configs; logs = []; },
    release: () => { released++; },
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
      if (sql.includes('SELECT * FROM station_proposals')) return [proposal ? [{ ...proposal }] : []];
      if (sql.includes('UPDATE proposal_signature_configs')) {
        let changed = 0;
        configs.forEach((item) => { if (item.status === 'PENDING') { item.status = 'SIGNED'; changed++; } });
        return [{ affectedRows: changed }];
      }
      if (sql.includes('UPDATE station_proposals')) {
        proposal.signature_completed_at = '2026-11-10 15:00:00';
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('INSERT INTO proposal_activity_logs')) {
        if (failLog) throw new Error('Audit unavailable');
        logs.push(params);
        return [{ insertId: 1 }];
      }
      throw new Error(`Unexpected transactional query: ${sql}`);
    },
  });
});
test.beforeEach(() => {
  proposal = { id: 71, status: 'SIGNATURE_PENDING', signed_file_id: null, signature_completed_at: null };
  configs = []; logs = []; notices = []; queries = [];
  failLog = false; committed = 0; rolledBack = 0; released = 0;
});
test.after(() => {
  pool.getConnection = originals.getConnection; pool.query = originals.query;
  reports.resolveScope = originals.scope; dynamic.getFieldDefinitionsByEntity = originals.fields;
  dynamic.mergeData = originals.merge; notification.create = originals.create;
});

test('only SUPER_ADMIN may complete signing, including ADMIN Back Office', async () => {
  for (const role of ['ADMIN', 'SALES', 'NPP', 'CTV', 'MKT']) {
    await assert.rejects(service.completeSigning({ user: { id: 8, role }, id: 71, reason: 'Reason' }), { statusCode: 403 });
  }
  assert.equal(queries.length, 0);
});
test('validates reason and ID before acquiring locks', async () => {
  for (const reason of ['', ' ', {}, 'x'.repeat(2001)]) {
    await assert.rejects(service.completeSigning({ user: superUser, id: 71, reason }), { statusCode: 400 });
  }
  await assert.rejects(service.completeSigning({ user: superUser, id: 'invalid', reason: 'Reason' }), { statusCode: 400 });
  assert.equal(queries.length, 0);
});
test('completes without configuration, preserves workflow and notifies Finance instead of Back Office', async () => {
  const result = await service.completeSigning({ user: superUser, id: 71, reason: ' Signed offline ', ip: '127.0.0.1' });
  assert.equal(result.status, 'SIGNATURE_PENDING');
  assert.equal(result.sign_status, 'DONE');
  assert.equal(proposal.status, 'SIGNATURE_PENDING');
  assert.equal(proposal.signed_file_id, null);
  assert.ok(proposal.signature_completed_at);
  assert.equal(logs.length, 1);
  assert.equal(logs[0][1], 'signature_manually_completed');
  assert.equal(logs[0][5], 'Signed offline');
  assert.equal(logs[0][6], 1);
  assert.equal(logs[0][9], 1, 'Manual override audit is explicit');
  assert.ok(notices.some((notice) => notice.userId === 8));
  assert.equal(notices.some((notice) => notice.userId === 9), false);
  assert.equal(committed, 1);
  assert.equal(released, 1);
  const list = await service.listProposals({ user: superUser });
  assert.equal(list.proposals[0].sign_status, 'DONE', 'Zero signers still resolves DONE');
  for (const tab of ['pending', 'chairman', 'completed']) {
    await service.listProposals({ user: superUser, tab, signStatus: 'DONE' });
  }
  assert.ok(queries.some(({ sql }) => sql.includes('p.signature_completed_at IS NOT NULL')));
});
test('marks pending signers across files complete without impersonating a signature', async () => {
  configs = [
    { status: 'PENDING', signature_id: null, signed_at: null },
    { status: 'PENDING', signature_id: null, signed_at: null },
    { status: 'SIGNED', signature_id: 44, signed_at: 'original' },
    { status: 'CANCELLED', signature_id: null, signed_at: null },
  ];
  await service.completeSigning({ user: superUser, id: 71, reason: 'Offline approval verified' });
  assert.deepEqual(configs.map((item) => item.status), ['SIGNED', 'SIGNED', 'SIGNED', 'CANCELLED']);
  assert.equal(configs[0].signature_id, null);
  assert.equal(configs[0].signed_at, null);
  assert.equal(configs[2].signed_at, 'original');
  await service.completeSigning({ user: superUser, id: 71, reason: 'Retry' });
  assert.equal(logs.length, 1, 'Retries do not duplicate audit or notifications');
  assert.equal(notices.length, 2);
});
test('rejects missing proposals, other stages and final approvals', async () => {
  proposal = null;
  await assert.rejects(service.completeSigning({ user: superUser, id: 71, reason: 'Reason' }), { statusCode: 404 });
  proposal = { status: 'PROPOSAL_REPORT_REVIEWING' };
  await assert.rejects(service.completeSigning({ user: superUser, id: 71, reason: 'Reason' }), { statusCode: 400 });
  proposal = { status: 'SIGNATURE_PENDING', signed_file_id: 77 };
  await assert.rejects(service.completeSigning({ user: superUser, id: 71, reason: 'Reason' }), { statusCode: 400 });
});
test('audit failure rolls back marker and signer changes', async () => {
  configs = [{ status: 'PENDING' }];
  failLog = true;
  await assert.rejects(service.completeSigning({ user: superUser, id: 71, reason: 'Reason' }), /Audit unavailable/);
  assert.equal(proposal.signature_completed_at, null);
  assert.equal(configs[0].status, 'PENDING');
  assert.equal(committed, 0);
  assert.equal(rolledBack, 1);
  assert.equal(notices.length, 0);
  assert.equal(released, 1);
});
