const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/utils/db');
const reports = require('../src/services/proposalReportService');
const approvals = require('../src/services/proposalApprovalService');
const access = require('../src/services/proposalAccessService');
const dynamic = require('../src/services/dynamicUtils');
const progress = require('../src/services/proposalProgressService');
const lifecycle = require('../src/services/proposalLifecycle');
const requests = require('../src/services/proposalRequestService');
const tgd = { id: 7, role: 'ADMIN' };
let proposal;
let queries;

test.beforeEach(t => {
  proposal = { id: 101, user_id: 99, status: 'PROPOSAL_REPORT_CREATING', custom_data: {}, signed_file_id: null };
  queries = [];
  t.mock.method(pool, 'query', async (sql, params = []) => {
    queries.push({ sql, params });
    if (sql.includes('FROM users WHERE id')) return [[{
      id: 7, custom_data: { department: 'Ban Tổng giám đốc', chuc_vu: 'Tổng giám đốc' }
    }]];
    if (/COUNT\(\*\) AS total/.test(sql)) return [[{ total: /1\s*=\s*0/.test(sql) ? 0 : 1 }]];
    if (/COUNT\(\*\) AS n/.test(sql)) return [[{ n: 0 }]];
    if (sql.includes('FROM station_proposals')) return [/1\s*=\s*0/.test(sql) ? [] : [{ ...proposal }]];
    return [[]];
  });
  t.mock.method(dynamic, 'getFieldDefinitionsByEntity', async () => []);
  t.mock.method(pool, 'getConnection', async () => ({
    query: async () => [[{ acquired: 1 }]], release: () => {}
  }));
  t.mock.method(dynamic, 'mergeData', row => row);
  t.mock.method(progress, 'getProgress', async () => ({ requests: [], activity: [] }));
});
test.after(() => pool.end());

test('TGĐ pending lists and sidebar count responses are empty; all lists remain readable', async () => {
  for (const service of [reports, approvals]) {
    proposal.status = service === reports ? 'PROPOSAL_REPORT_CREATING' : 'PROPOSAL_REPORT_REVIEWING';
    queries = [];
    const pending = await service.listProposals({ user: tgd, tab: 'pending', page: 1, limit: 1 });
    assert.equal(pending.pagination.total, 0);
    assert.deepEqual(pending.proposals, []);
    assert.match(queries.find(query => /COUNT\(\*\) AS total/.test(query.sql)).sql, /1\s*=\s*0/);
    const all = await service.listProposals({ user: tgd, tab: 'all' });
    assert.equal(all.pagination.total, 1);
    assert.equal(all.proposals.length, 1);
  }
});

test('TGĐ cannot upload reports even as owner/assignee; detail permissions deny upload', async () => {
  const scope = await reports.resolveScope(tgd);
  assert.equal(scope.roleKey, 'TGD');
  for (const row of [
    proposal, { ...proposal, user_id: tgd.id },
    { ...proposal, custom_data: { nguoi_phu_trach: { id: tgd.id } } }
  ]) assert.equal(await reports.canUploadReport(scope, row), false);
  const detail = await reports.getProposalDetail({ user: tgd, id: proposal.id });
  assert.equal(detail.permissions.canUpload, false);
  await assert.rejects(reports.uploadReport({ user: tgd, id: proposal.id, files: [{ id: 1 }] }), { statusCode: 403 });
  await assert.rejects(require('../src/services/proposalReportGenerationService').generate({
    user: tgd, proposalId: proposal.id
  }), { statusCode: 403 });
  assert.equal(queries.some(query => /^\s*(UPDATE|INSERT|DELETE)/.test(query.sql)), false);
});

test('TGĐ keeps approval rejection, but not configuration or update actions', async t => {
  proposal.status = 'PROPOSAL_REPORT_REVIEWING';
  const detail = await approvals.getProposal({ user: tgd, id: proposal.id });
  assert.equal(detail.permissions.canReject, true);
  assert.equal(detail.permissions.canConfigure, false);
  assert.equal(detail.permissions.canRequestUpdate, false);
  const transitions = [];
  t.mock.method(lifecycle, 'transition', async (id, to, options) => {
    transitions.push({ id, to, options });
    return { id, status: to };
  });
  t.mock.method(lifecycle, 'logActivity', async () => {});
  t.mock.method(requests, 'createRequest', async () => ({ id: 1 }));
  const result = await approvals.tgdReject({ user: tgd, id: proposal.id, reason: 'Cần xem lại BCĐX' });
  assert.equal(result.status, 'PROPOSAL_REPORT_UPDATING');
  assert.equal(transitions[0].options.actorId, tgd.id);
  await assert.rejects(approvals.requestUpdate({ user: tgd, id: proposal.id, description: 'Fixture' }), { statusCode: 403 });
});

test('SUPER_ADMIN override and Back Office approval tasks remain; other-step TGĐ owner helper unchanged', async t => {
  t.mock.method(reports, 'resolveScope', async user => ({
    userId: user.id, role: user.role, isAdmin: user.role === 'SUPER_ADMIN',
    isBackOffice: user.id === 6, roleKey: user.id === 7 ? 'TGD' : null
  }));
  assert.deepEqual(await access.buildReportTaskScopeSql(tgd), { sql: '1 = 0', params: [] });
  assert.deepEqual(await access.buildReportTaskScopeSql({ id: 1, role: 'SUPER_ADMIN' }), { sql: '1 = 1', params: [] });
  assert.equal(await reports.canUploadReport({ role: 'SUPER_ADMIN', roleKey: 'TGD' }, proposal), true);
  const backOffice = await approvals.listProposals({ user: { id: 6, role: 'SALES' }, tab: 'pending' });
  assert.equal(backOffice.pagination.total, 1);
  assert.equal(await access.canActAsProposalOwner(tgd, proposal), true);
});

test('report-upload task notifications do not target TGĐ even as owner or ancestor', async t => {
  t.mock.method(pool, 'query', async () => [[
    { id: 7, role: 'ADMIN', custom_data: { department: 'Ban Tổng giám đốc', chuc_vu: 'Tổng giám đốc' } },
    { id: 1, role: 'SUPER_ADMIN', custom_data: {} }
  ]]);
  t.mock.method(require('../src/services/adminUserService'), 'getAncestorIds', async () => [7]);
  const recipients = require('../src/services/proposalStepRecipients');
  for (const status of ['PROPOSAL_REPORT_CREATING', 'PROPOSAL_REPORT_RE_CREATING', 'PROPOSAL_REPORT_UPDATING']) {
    const ids = await recipients.resolveStepRecipients(status, { ...proposal, user_id: 7 });
    assert.equal(ids.includes(7), false);
    assert.equal(ids.includes(1), true);
  }
});
