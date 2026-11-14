const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/utils/db');
const users = require('../src/services/adminUserService');
const admin = require('../src/services/adminProposalService');
const dynamic = require('../src/services/dynamicUtils');
const access = require('../src/services/proposalAccessService');
const review = require('../src/services/proposalReviewService');
const reports = require('../src/services/proposalReportService');
const layouts = require('../src/services/proposalDesignService');
const approvals = require('../src/services/proposalApprovalService');
const signatures = require('../src/services/proposalSignatureService');
const requests = require('../src/services/proposalRequestService');
const grading = require('../src/services/proposalGradingService');
const controller = require('../src/controllers/adminProposalController');

const profile = (id, role, department, chuc_vu = '') => ({
  id, role, full_name: `Fixture ${id}`, status: 'ACTIVE',
  custom_data: { department, chuc_vu }
});
const profiles = [
  profile(1, 'SUPER_ADMIN', ''),
  profile(2, 'ADMIN', 'Phòng Setup và Vận hành', 'Trưởng phòng'),
  profile(3, 'ADMIN', 'Phòng Chiến lược KD', 'Chuyên viên Chiến lược Kinh doanh'),
  profile(4, 'ADMIN', 'Trung tâm KD miền Bắc', 'Giám đốc Trung tâm Kinh doanh'),
  profile(5, 'SALES', 'Trung tâm KD miền Bắc', 'Giám đốc Trung tâm Kinh doanh'),
  profile(6, 'ADMIN', 'Back Office'),
  profile(7, 'ADMIN', 'Ban Tổng giám đốc', 'Tổng giám đốc'),
  profile(8, 'CTV', ''),
  profile(9, 'NPP', ''),
  profile(10, 'ADMIN', 'Phòng Công nghệ và Quy hoạch')
];
let proposal;
let queries = [];
let mutations = 0;
const originals = {
  query: pool.query, branch: admin.getBranchUserIds, ancestors: users.getAncestorIds,
  fields: dynamic.getFieldDefinitionsByEntity, progress: require('../src/services/proposalProgressService').getProgress,
  byId: admin.getProposalById
};

test.before(() => {
  admin.getBranchUserIds = async (id) => [Number(id), 20];
  users.getAncestorIds = async (id) => Number(id) === 20 ? [2, 9] : [];
  dynamic.getFieldDefinitionsByEntity = async () => [];
  require('../src/services/proposalProgressService').getProgress = async () => ({});
  admin.getProposalById = async () => proposal;
  pool.query = async (sql, params = []) => {
    queries.push({ sql, params });
    if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) {
      mutations++;
      throw new Error('Tests must not mutate a database');
    }
    if (/FROM users WHERE id\s*=\s*\?/i.test(sql)) {
      return [profiles.filter((user) => user.id === Number(params[0]))];
    }
    if (/FROM users WHERE status/i.test(sql)) return [profiles];
    if (/COUNT\(\*\) AS total/i.test(sql)) return [[{ total: 0 }]];
    if (/FROM station_proposals.*WHERE.*id\s*=\s*\?/is.test(sql) && !/LIMIT \? OFFSET \?/.test(sql)) {
      return [[{ ...proposal }]];
    }
    return [[]];
  };
});

test.beforeEach(() => {
  queries = [];
  mutations = 0;
  proposal = {
    id: 101, user_id: 99, status: 'GDTTKD_EVALUATING', review_level: 1,
    custom_data: { vung_mien: 'Bac' }, quy_hoach_score: 1, phap_ly_score: 2
  };
});

test.after(async () => {
  pool.query = originals.query;
  admin.getBranchUserIds = originals.branch;
  users.getAncestorIds = originals.ancestors;
  dynamic.getFieldDefinitionsByEntity = originals.fields;
  admin.getProposalById = originals.byId;
  require('../src/services/proposalProgressService').getProgress = originals.progress;
  await pool.end();
});

test('ADMIN professional roles come from the department/title, not the administrator label', () => {
  for (const [id, expected] of [[2, null], [3, 'PL'], [4, 'GDTTKD'], [6, null], [7, 'TGD'], [10, 'QH']]) {
    const user = profiles.find((item) => item.id === id);
    assert.equal(review.resolveRoleKey({ role: user.role, department: user.custom_data.department, chucVu: user.custom_data.chuc_vu }), expected);
  }
});

test('unrelated Setup/Strategy ADMIN cannot request regrade, submit to TGD, cancel at review or write another report', async () => {
  for (const user of profiles.filter((item) => [2, 3].includes(item.id))) {
    for (const method of ['requestRegrade', 'toTgd', 'cancelAtGdttkd']) {
      await assert.rejects(() => review[method]({ user, id: 101, reason: 'Fixture' }), { statusCode: 403 });
    }
    const scope = await reports.resolveScope(user);
    assert.equal(await reports.canUploadReport(scope, proposal), false);
    await assert.rejects(() => reports.requestRevision({ user, id: 101, description: 'Fixture' }), { statusCode: 403 });
    assert.equal(mutations, 0);
  }
});

test('report owner, assignee and ancestors retain upload permission without ADMIN bypass', async () => {
  const user = profiles[1];
  const scope = await reports.resolveScope(user);
  for (const row of [
    { ...proposal, user_id: user.id },
    { ...proposal, user_id: 20 },
    { ...proposal, custom_data: { nguoi_phu_trach: { id: user.id } } },
    { ...proposal, custom_data: { sales_quan_ly: { id: 20 } } }
  ]) assert.equal(await reports.canUploadReport(scope, row), true);
  assert.equal(await access.canActAsProposalOwner(profiles[8], { ...proposal, user_id: 20 }), true);
  assert.equal(await access.canActAsProposalOwner(profiles[7], { ...proposal, user_id: 20 }), false);
});

test('GĐTTKD must explicitly select scored departments and provide a nonblank reason', async () => {
  const user = profiles.find((item) => item.id === 5);
  for (const departments of [undefined, null, [], 'QH', [''], ['OTHER']]) {
    await assert.rejects(() => review.requestRegrade({ user, id: 101, reason: 'Chấm lại', departments }), { statusCode: 400 });
  }
  for (const reason of [undefined, '', '   ']) {
    await assert.rejects(() => review.requestRegrade({ user, id: 101, reason, departments: ['QH'] }), { statusCode: 400 });
  }
  proposal.phap_ly_score = null;
  await assert.rejects(() => review.requestRegrade({ user, id: 101, reason: 'Chấm lại', departments: ['PL'] }), { statusCode: 400 });
  assert.equal(mutations, 0);
});

test('explicit regrade selection creates requests only for chosen departments', async (t) => {
  const lifecycle = require('../src/services/proposalLifecycle');
  const originalQuery = pool.query;
  const created = [];
  t.mock.method(pool, 'query', async (sql, params) => {
    if (sql.startsWith('UPDATE station_proposals')) return [{ affectedRows: 1 }];
    if (sql.includes('MAX(round_no)')) return [[{ n: 0 }]];
    return originalQuery(sql, params);
  });
  t.mock.method(lifecycle, 'transition', async () => ({ status: 'RE_GRADING' }));
  t.mock.method(lifecycle, 'logActivity', async () => {});
  t.mock.method(lifecycle, 'notifyStepReceivers', async () => {});
  t.mock.method(requests, 'closeRequests', async () => {});
  t.mock.method(requests, 'createRequest', async (input) => { created.push(input); return { id: created.length }; });
  for (const departments of [['QH'], ['PL'], ['QH', 'PL']]) {
    created.length = 0;
    await review.requestRegrade({ user: profiles.find((item) => item.id === 5), id: 101, reason: '  Cần chấm lại  ', departments });
    assert.deepEqual(created.map((item) => item.targetDepartment), departments);
    assert.ok(created.every((item) => item.description === 'Cần chấm lại'));
  }
});

test('ADMIN and SALES GDT T handle all same-region reports, never another region even as owner', async () => {
  for (const user of profiles.filter((item) => [4, 5].includes(item.id))) {
    const scope = await reports.resolveScope(user);
    assert.equal(await reports.canUploadReport(scope, proposal), true);
    assert.equal(await reports.canUploadReport(scope, { ...proposal, user_id: user.id, custom_data: { vung_mien: 'Nam' } }), false);
    const taskScope = await access.buildReportTaskScopeSql(user);
    assert.match(taskScope.sql, /vung_mien/);
    assert.deepEqual(taskScope.params, ['%bac%']);
    proposal.custom_data.vung_mien = 'Nam';
    await assert.rejects(() => review.requestRegrade({ user, id: 101, reason: 'Fixture' }), { statusCode: 403 });
    proposal.custom_data.vung_mien = 'Bac';
  }
  assert.equal(mutations, 0);
});

test('review detail permissions keep ADMIN read-all while restricting actions to the responsible region', async () => {
  for (const id of [2, 3, 4]) {
    const user = profiles.find((item) => item.id === id);
    const detail = await review.getReviewDetail(101, user);
    assert.equal(detail.permissions.canRequestRegrade, id === 4);
  }
  proposal.custom_data.vung_mien = 'Nam';
  const detail = await review.getReviewDetail(101, profiles[3]);
  assert.equal(detail.proposal.id, 101);
  assert.equal(detail.permissions.canRequestRegrade, false);
});

test('specialist notifications target only professional handlers or legitimate report owners', async () => {
  const recipients = require('../src/services/proposalStepRecipients');
  assert.deepEqual(await recipients.resolveStepRecipients('DESIGNING', proposal), [1, 10]);
  assert.deepEqual(await recipients.resolveStepRecipients('PROPOSAL_REPORT_REVIEWING', proposal), [1, 6]);
  const reportRecipients = await recipients.resolveStepRecipients('PROPOSAL_REPORT_CREATING', proposal);
  assert.equal(reportRecipients.includes(2), false);
  assert.equal(reportRecipients.includes(3), false);
  assert.equal(reportRecipients.includes(4), true);
  assert.equal(reportRecipients.includes(5), true);
  proposal.user_id = 20;
  const ownerRecipients = await recipients.resolveStepRecipients('PROPOSAL_REPORT_CREATING', proposal);
  assert.equal(ownerRecipients.includes(2), true);
});

test('layout and signature mutations deny unrelated ADMIN before changing data', async () => {
  for (const user of profiles.filter((item) => [2, 3].includes(item.id))) {
    await assert.rejects(() => layouts.cancelProposal({ user, id: 101, reason: 'Fixture' }), { statusCode: 403 });
    for (const method of ['reject', 'requestRework', 'uploadSignedFile']) {
      await assert.rejects(() => signatures[method]({ user, id: 101, reason: 'Fixture' }), { statusCode: 403 });
    }
  }
  assert.equal(mutations, 0);
});

test('ADMIN read-all lists remain accessible while pending lists exclude unrelated specialist tasks before pagination', async () => {
  const user = profiles[1];
  for (const [service, method] of [[review, 'listReviews'], [layouts, 'listProposals'], [approvals, 'listProposals']]) {
    queries = [];
    await service[method]({ user, tab: 'pending' });
    const count = queries.find((entry) => /COUNT\(\*\) AS total/.test(entry.sql));
    assert.ok(count);
    assert.match(count.sql, /1\s*=\s*0/);
    queries = [];
    await service[method]({ user, tab: 'all' });
    assert.doesNotMatch(queries.find((entry) => /COUNT\(\*\) AS total/.test(entry.sql)).sql, /1\s*=\s*0/);
  }
});

test('general tasks include only owner-level supplements in own/descendant/assignee scope', async () => {
  await requests.listRequests({ scope: { role: 'ADMIN', userId: 2, branchIds: [2, 20] } });
  const count = queries.find((entry) => /COUNT\(\*\) AS total/.test(entry.sql));
  assert.match(count.sql, /r\.request_type IN \('UPDATE_INFO', 'SUPPLEMENT', 'LAYOUT_SUPPLEMENT'\)/);
  assert.match(count.sql, /r\.target_user_id = p\.user_id/);
  assert.match(count.sql, /r\.current_status IS NULL/);
  assert.match(count.sql, /nguoi_phu_trach\.id/);
  assert.ok(count.params.includes(2) && count.params.includes(20));
  queries = [];
  await requests.listRequests({ workScope: 'subordinates', scope: { role: 'ADMIN', userId: 2, branchIds: [2, 20] } });
  const subordinateCount = queries.find((entry) => /COUNT\(\*\) AS total/.test(entry.sql));
  assert.deepEqual(subordinateCount.params.slice(0, 3), ['OPEN', 20, 2]);
});

test('request update route cannot grant Back Office another owner report-upload privileges', async () => {
  assert.equal(await requests.canUpdateProposalForRequest(profiles[5], {
    request_type: 'REVISE_BCDX', target_department: 'Back Office',
    owner_id: 99, proposal_custom_data: { vung_mien: 'Bac' }
  }), false);
});

test('signed-document upload tasks appear only for SUPER_ADMIN/Back Office, not every ADMIN', async () => {
  for (const id of [1, 2, 6]) {
    queries = [];
    await signatures.listProposals({ user: profiles.find((item) => item.id === id), tab: 'pending' });
    const count = queries.find((entry) => /COUNT\(\*\) AS total/.test(entry.sql));
    assert.equal(count.sql.includes('p.signed_file_id IS NULL'), id !== 2);
  }
});

test('grading pending denies non-graders', async () => {
  await grading.listProposals({ tab: 'pending', scope: { all: true, role: 'ADMIN', gradeRole: null } });
  const count = queries.find((entry) => /COUNT\(\*\) AS total/.test(entry.sql));
  assert.match(count.sql, /1\s*=\s*0/);
});

test('review pending excludes submitted regrading for every role while retaining review tasks', async () => {
  for (const id of [1, 3, 5, 7, 10]) {
    queries = [];
    await review.listReviews({ user: profiles.find((item) => item.id === id), tab: 'pending' });
    const count = queries.find((entry) => /COUNT\(\*\) AS total/.test(entry.sql));
    assert.ok(!count.params.includes('RE_GRADING'), `role ${id} must not list submitted regrades`);
    if ([3, 10].includes(id)) assert.match(count.sql, /1\s*=\s*0/);
    if ([1, 5].includes(id)) assert.ok(count.params.includes('GDTTKD_EVALUATING'));
    if ([1, 7].includes(id)) assert.ok(count.params.includes('TGD_REVIEW'));
  }
});

test('grading pending includes open regrading tasks for the grader department', async () => {
  for (const [gradeRole, alias, department] of [['QH', 'rq', 'QH'], ['PL', 'rp', 'PL']]) {
    queries = [];
    await grading.listProposals({ tab: 'pending', scope: { all: true, role: 'ADMIN', gradeRole } });
    const count = queries.find((entry) => /COUNT\(\*\) AS total/.test(entry.sql));
    assert.doesNotMatch(count.sql, /p\.status <> 'RE_GRADING'/);
    assert.ok(count.params.includes('RE_GRADING'));
    assert.match(count.sql, new RegExp(`${alias}\\.status = 'OPEN'`));
    assert.match(count.sql, new RegExp(`${alias}\\.target_department = '${department}'`));
    assert.match(count.sql, /request_type = 'SUPPLEMENT' AND rs\.status = 'OPEN'/);
  }
});

test('generic API denies unrelated owner writes and workflow-state shortcuts', async () => {
  const response = () => ({
    code: 200, body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  });
  for (const [method, body] of [
    ['updateStatus', { status: 'CANCELLED', reason: 'Fixture' }],
    ['update', { owner_name: 'Fixture' }],
    ['delete', {}], ['confirmInfo', {}], ['extendDeadline', { days: 1, reason: 'Fixture' }]
  ]) {
    const res = response();
    await controller[method]({ params: { id: 101 }, user: profiles[1], body }, res);
    assert.equal(res.code, 403, method);
  }
  const res = response();
  await controller.updateStatus({
    params: { id: 101 }, user: profiles[0], body: { status: 'DESIGNING', reason: 'Fixture' }
  }, res);
  assert.equal(res.code, 403);
  assert.equal(mutations, 0);
});
