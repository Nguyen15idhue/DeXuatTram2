const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/utils/db');
const grading = require('../src/services/proposal/proposalGradingService.js');
const lifecycle = require('../src/services/proposal/proposalLifecycle.js');
const requests = require('../src/services/proposal/proposalRequestService.js');
const reportGeneration = require('../src/services/proposal/proposalReportGenerationService.js');

test('2+2 advances like scores of at least five, without bypassing open regrading or review permissions', async t => {
  let proposal;
  let openRequests;
  t.mock.method(pool, 'query', async (sql, params = []) => {
    if (sql.includes('FROM station_proposals WHERE id = ?') && sql.includes('SELECT id,')) return [[{ ...proposal }]];
    if (sql.includes("request_type = 'SUPPLEMENT'")) return [[{ n: 0 }]];
    if (sql.includes('SELECT id, target_department, target_title, description')) return [[...openRequests]];
    if (sql.includes("SELECT COUNT(*) AS n FROM proposal_requests")) return [[{ n: openRequests.length }]];
    if (sql.includes("UPDATE proposal_requests SET status = 'DONE'")) {
      const resolved = new Set(params.slice(1).map(Number));
      openRequests = openRequests.filter(request => !resolved.has(request.id));
      return [{ affectedRows: resolved.size }];
    }
    if (sql.includes('SELECT id FROM proposal_requests')) return [[]];
    if (sql.includes('UPDATE station_proposals')) {
      if (sql.includes('SET status = ?')) proposal.status = params[0];
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected query: ${sql}`);
  });

  t.mock.method(lifecycle, 'getDeadlineDates', async () => ({ supplement: null, transition: null, calendarId: null }));
  t.mock.method(lifecycle, 'notifyStepReceivers', async () => {});
  t.mock.method(lifecycle, 'logActivity', async () => {});
  t.mock.method(grading, 'clearGradingNote', async () => {});
  t.mock.method(requests, 'closeRequests', async () => {});
  t.mock.method(requests, 'createRequest', async () => ({ id: 1 }));
  t.mock.method(reportGeneration, 'generate', async () => {});

  const normal = { legal_document: [1], dkkd_cccd_hkd: [2] };
  const direct = { mo_hinh_dau_tu: 'NQ', chinh_sach_nq: 'Trả thẳng' };
  const setup = (status, qh, pl, custom = normal, pending = []) => {
    proposal = { id: 42, status, quy_hoach_score: qh, phap_ly_score: pl,
      review_level: status === 'RE_GRADING' ? 2 : 1, custom_data: custom };
    openRequests = pending;
  };
  const update = payload => grading.updateGrading({ id: 42, userId: 1, userRole: 'SUPER_ADMIN', payload });

  for (const [status, custom, expected] of [
    ['GRADING', normal, 'DESIGNING'],
    ['GRADING', direct, 'PROPOSAL_REPORT_CREATING'],
    ['GDTTKD_EVALUATING', normal, 'DESIGNING'],
    ['GDTTKD_EVALUATING', direct, 'PROPOSAL_REPORT_CREATING'],
    ['RE_GRADING', normal, 'DESIGNING'],
    ['RE_GRADING', direct, 'PROPOSAL_REPORT_CREATING']
  ]) {
    const pending = status === 'RE_GRADING' ? [{ id: 10, target_department: 'PL', target_title: 'Pháp lý' }] : [];
    setup(status, 2, status === 'GRADING' ? null : 1, custom, pending);
    const result = await update({ phap_ly_score: 2 });
    assert.equal(result.status, expected, `${status} ${expected}: ${result.transitionError}`);
    assert.equal(result.transitionError, null);
    assert.equal(result.review_level, null);
  }

  setup('RE_GRADING', 2, 2, normal, [
    { id: 10, target_department: 'PL', target_title: 'Pháp lý' },
    { id: 11, target_department: 'QH', target_title: 'Quy hoạch' }
  ]);
  assert.equal((await update({ phap_ly_score: 2 })).status, 'RE_GRADING');

  setup('GRADING', 1, 3);
  assert.equal((await update({ phap_ly_score: 3 })).status, 'GDTTKD_EVALUATING');
  setup('GRADING', 3, 1);
  assert.equal((await update({ phap_ly_score: 1 })).status, 'GDTTKD_EVALUATING');
  setup('GRADING', null, null);
  assert.equal((await update({ quy_hoach_score: 2 })).status, 'GRADING');
  setup('GRADING', 2, 3);
  assert.equal((await update({ phap_ly_score: 3 })).status, 'DESIGNING');
  setup('GRADING', 0, 2);
  assert.equal((await update({ phap_ly_score: 2 })).status, 'CANCELLED');

  setup('GDTTKD_EVALUATING', 2, 2, direct);
  await assert.rejects(lifecycle.transition(42, 'PROPOSAL_REPORT_CREATING', { source: 'user' }), { statusCode: 400 });
  setup('GDTTKD_EVALUATING', 2, 2, normal);
  await assert.rejects(lifecycle.transition(42, 'PROPOSAL_REPORT_CREATING', { source: 'system_auto' }), { statusCode: 400 });
});

test('grading API reports the direct transition to report creation', async t => {
  const controller = require('../src/controllers/proposal/proposalGradingController.js');
  t.mock.method(grading, 'updateGrading', async () => ({ transition: { status: 'PROPOSAL_REPORT_CREATING' } }));
  let response;
  await controller.update(
    { params: { id: 42 }, user: { id: 1, role: 'SUPER_ADMIN' }, body: {} },
    { json: value => { response = value; } }
  );
  assert.equal(response.success, true);
  assert.match(response.message, /chuyển sang Lập tờ trình BCĐX/);
});
