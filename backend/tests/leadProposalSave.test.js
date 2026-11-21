const { test } = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/utils/db');
const leads = require('../src/services/leadService');
const access = require('../src/services/leadAccessService');
const proposals = require('../src/services/proposalService');
const journey = require('../src/services/journeyActivityService');
const sync = require('../src/services/journeySyncService');
const requirement = require('../src/services/leadProposalRequirement');
const service = require('../src/services/leadProposalService');

const actor = { id: 8, role: 'SUPER_ADMIN' };
const lead = { id: 3, journey_id: 4, sales_outcome: null, assigned_user_id: 8 };
const payload = {
  lead: { sales_outcome: 'SUCCESS' },
  proposal: { latitude: 10, longitude: 106, owner_name: 'Khách', owner_phone: '0900000000' },
  edit_version: requirement.editVersion(lead),
};

function fixture(t, options = {}) {
  const calls = [];
  const conn = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
    query: async (sql) => {
      if (sql.startsWith('SELECT id FROM leads')) return [[{ id: lead.id }]];
      if (sql.includes('FROM lead_proposal_save_requests')) return [options.request ? [options.request] : []];
      if (sql.startsWith('SELECT id FROM station_proposals')) return [options.existing ? [{ id: 33 }] : []];
      if (sql.startsWith('UPDATE station_proposals')) { calls.push('link'); return [[]]; }
      if (sql.startsWith('INSERT INTO lead_proposal_save_requests')) { calls.push('idempotency'); return [[]]; }
      assert.fail(`Unexpected SQL: ${sql}`);
    },
  };
  t.mock.method(pool, 'getConnection', async () => conn);
  t.mock.method(leads, 'getLeadById', async () => lead);
  t.mock.method(access, 'permissions', async () => ({ can_consult: true }));
  t.mock.method(leads, 'applyLeadUpdate', async (_conn, _lead, _data, _actor, opts) => {
    assert.equal(opts.creatingProposal, true);
    calls.push('lead');
    return { ...lead, sales_outcome: 'SUCCESS', consultation_status: 'SUCCESS' };
  });
  t.mock.method(proposals, 'createProposal', async (_owner, _data, opts) => {
    assert.equal(opts.connection, conn);
    calls.push('proposal');
    if (options.failProposal) throw new Error('proposal failed');
    return { id: 22, initialStatus: 'PENDING', postResults: {} };
  });
  t.mock.method(proposals, 'finishProposalCreation', async () => calls.push('afterCommit'));
  t.mock.method(proposals, 'getProposalFullById', async (id) => ({ id }));
  t.mock.method(journey, 'log', async (_event, executor) => {
    assert.equal(executor, conn);
    calls.push('log');
  });
  t.mock.method(sync, 'recomputeStage', async (_id, executor) => {
    assert.equal(executor, conn);
    calls.push('journey');
  });
  return calls;
}

test('saves Lead and proposal before one commit and finalizes afterwards', async (t) => {
  const calls = fixture(t);
  const result = await service.saveLeadAndCreateProposal(3, payload, actor, { idempotencyKey: 'key-1' });
  assert.equal(result.proposal.id, 22);
  assert.deepEqual(calls, ['begin', 'lead', 'proposal', 'link', 'log', 'journey', 'idempotency', 'commit', 'release', 'afterCommit']);
});

test('rolls back Lead when creating the proposal fails', async (t) => {
  const calls = fixture(t, { failProposal: true });
  await assert.rejects(() => service.saveLeadAndCreateProposal(3, payload, actor, { idempotencyKey: 'key-1' }), /proposal failed/);
  assert.deepEqual(calls, ['begin', 'lead', 'proposal', 'rollback', 'release']);
});

test('rejects a stale Lead and an already linked proposal before writing', async (t) => {
  const calls = fixture(t, { existing: true });
  await assert.rejects(() => service.saveLeadAndCreateProposal(3, { ...payload, edit_version: 'stale' }, actor, { idempotencyKey: 'key-1' }), { statusCode: 409 });
  await assert.rejects(() => service.saveLeadAndCreateProposal(3, payload, actor, { idempotencyKey: 'key-2' }), { statusCode: 409 });
  assert.equal(calls.includes('lead'), false);
  assert.equal(calls.includes('proposal'), false);
});

test('deduplicates retries without creating another proposal', async (t) => {
  const hash = require('crypto').createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const calls = fixture(t, { request: { request_hash: hash, proposal_id: 22 } });
  const result = await service.saveLeadAndCreateProposal(3, payload, actor, { idempotencyKey: 'key-1' });
  assert.equal(result.deduped, true);
  assert.equal(result.proposal.id, 22);
  assert.deepEqual(calls, ['begin', 'commit', 'release']);
  await assert.rejects(() => service.saveLeadAndCreateProposal(3, { ...payload, proposal: {} }, actor, { idempotencyKey: 'key-1' }), { statusCode: 409 });
});

test('requires a linked proposal for SUCCESS but allows other outcomes and existing proposals', async () => {
  const missing = { query: async () => [[]] };
  const linked = { query: async () => [[{ id: 22 }]] };
  await assert.rejects(() => requirement.assertSatisfied(lead, 'SUCCESS', missing), { statusCode: 409 });
  await requirement.assertSatisfied(lead, 'FAILED', missing);
  await requirement.assertSatisfied(lead, 'SUCCESS', linked);
});

test('denies a combined save to a user without consultation permission', async (t) => {
  const calls = fixture(t);
  t.mock.method(access, 'permissions', async () => ({ can_consult: false }));
  await assert.rejects(() => service.saveLeadAndCreateProposal(3, payload, actor, { idempotencyKey: 'key-1' }), { statusCode: 403 });
  assert.deepEqual(calls, ['begin', 'rollback', 'release']);
});
