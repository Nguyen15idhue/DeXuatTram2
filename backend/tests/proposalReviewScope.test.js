const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/utils/db');
const scopeService = require('../src/services/proposal/proposalReviewScope.js');
const reviews = require('../src/services/proposal/proposalReviewService.js');
const department = 'Trung tâm KD miền Bắc';
const profile = (department, chuc_vu = '') => ({ department, chuc_vu });
const users = [
  { id: 1, role: 'SALES', custom_data: profile(department, 'Giám đốc Trung tâm Kinh doanh') },
  { id: 2, parent_id: 1, role: 'SALES', custom_data: profile('Khác') },
  { id: 3, parent_id: 2, role: 'CTV', custom_data: profile('Khác') },
  { id: 4, role: 'CTV', custom_data: profile(department) },
  { id: 5, role: 'CTV', custom_data: profile('Trung tâm KD miền Trung') },
  { id: 6, role: 'SALES', custom_data: profile('Trung tâm KD miền Trung', 'Giám đốc Trung tâm Kinh doanh') }
];
const proposal = (id, owner, custom = {}) => ({
  id, user_id: owner, status: 'RE_GDTTKD_EVALUATING', review_level: 2,
  custom_data: { vung_mien: 'Trung', ...custom }
});
const proposals = [
  proposal(1, 3), proposal(2, 4), proposal(3, 5),
  proposal(4, 5, { nguoi_phu_trach: { id: 2 } }),
  proposal(5, 5, { sales_quan_ly: { id: 1 } }),
  proposal(6, null, { nguoi_phu_trach: { id: 4 } }),
  proposal(7, null, { vung_mien: 'Bắc' }),
  proposal(8, 999, { vung_mien: 'Bắc', nguoi_phu_trach: { id: 998 } }),
  proposal(9, 5, { vung_mien: 'Bắc' }),
  proposal(10, null, { vung_mien: 'Bắc', nguoi_phu_trach: { id: 5 } }),
  proposal(11, 1)
];

test('review scope uses current recursive branch, department, explicit manager and restricted regional fallback', async () => {
  const scope = await scopeService.build({ id: 1, department, region: 'Bac' }, users);
  assert.deepEqual(proposals.filter(p => scopeService.matches(scope, p)).map(p => p.id), [1, 2, 4, 5, 6, 7, 8, 11]);
  const moved = users.map(u => u.id === 3 ? { ...u, parent_id: 6 } : u.id === 4
    ? { ...u, custom_data: profile('Trung tâm KD miền Trung') } : u);
  const current = await scopeService.build({ id: 1, department, region: 'Bac' }, moved);
  assert.equal(scopeService.matches(current, proposals[0]), false);
  assert.equal(scopeService.matches(current, proposals[1]), false);
  const blank = await scopeService.build({ id: 99, department: '', region: null }, [
    { id: 98, custom_data: {} }, { id: 99, custom_data: {} }
  ]);
  assert.equal(scopeService.matches(blank, proposal(12, 98)), false);
});

test('review detail preserves history after clearing the level without opening actions or bypassing scope', async t => {
  let row = { ...proposals[4], status: 'DESIGNING', review_level: null };
  let requests = [{ id: 1, request_type: 'RE_GRADE', status: 'DONE' }];
  let activity = [];
  t.mock.method(pool, 'query', async (sql, params) => {
    if (sql.includes('SELECT custom_data FROM users')) {
      return [[{ custom_data: users.find(user => user.id === Number(params[0]))?.custom_data || {} }]];
    }
    if (sql.includes('SELECT id, parent_id, custom_data FROM users')) return [users];
    if (sql.includes('FROM station_proposals')) {
      return [row && Number(params[0]) === row.id
        && !(sql.includes('p.review_level IS NOT NULL') && row.review_level === null) ? [row] : []];
    }
    if (sql.includes('FROM proposal_requests r')) return [requests];
    throw new Error(`Unexpected query: ${sql}`);
  });
  t.mock.method(require('../src/services/dynamicUtils'), 'getFieldDefinitionsByEntity', async () => []);
  t.mock.method(require('../src/services/dynamicUtils'), 'mergeData', value => value);
  t.mock.method(require('../src/services/proposal/proposalProgressService.js'), 'getProgress', async () => ({ requests, activity }));
  const user = { id: 1, role: 'SALES' };
  for (const status of ['DESIGNING', 'PROPOSAL_REPORT_CREATING', 'CANCELLED', 'APPROVED']) {
    row = { ...row, status };
    const detail = await reviews.getReviewDetail(row.id, user);
    assert.equal(detail.proposal.review_level, null);
    assert.equal(detail.requests[0].status, 'DONE');
    assert.ok(Object.values(detail.permissions).every(value => value === false));
    await assert.rejects(reviews.requestRegrade({ user, id: row.id, reason: 'test', departments: ['QH'] }),
      { statusCode: 400 });
  }
  requests = [];
  activity = [{ from_status: 'GDTTKD_EVALUATING', to_status: 'DESIGNING' }];
  const history = await reviews.getReviewDetail(row.id, user);
  assert.equal(history.progress.activity.length, 1);
  assert.equal(history.proposal.review_level, null);
  row = { ...proposals[8], status: 'DESIGNING', review_level: null };
  await assert.rejects(reviews.getReviewDetail(row.id, user), { statusCode: 403 });
  await assert.rejects(reviews.getReviewDetail(row.id, { id: 3, role: 'CTV' }), { statusCode: 403 });
  row = { ...proposals[4], status: 'PENDING', review_level: null };
  activity = [];
  await assert.rejects(reviews.getReviewDetail(row.id, user), { statusCode: 403 });
  const adminDetail = await reviews.getReviewDetail(row.id, { id: 99, role: 'ADMIN' });
  assert.equal(adminDetail.proposal.review_level, null);
  assert.ok(Object.values(adminDetail.permissions).every(value => value === false));
  row = null;
  await assert.rejects(reviews.getReviewDetail(9999, user), { statusCode: 404 });
});

test('real SQL review lists, permissions, denied actions and notifications share organizational scope',
  { skip: process.env.RUN_SIGNATURE_SQL_TEST !== '1' }, async t => {
    const connection = await pool.getConnection();
    const [[original]] = await connection.query('SELECT DATABASE() AS name');
    const database = `test_review_scope_${Date.now()}`;
    t.mock.method(pool, 'query', (sql, params) => connection.query(sql, params));
    t.mock.method(require('../src/services/dynamicUtils'), 'getFieldDefinitionsByEntity', async () => []);
    t.mock.method(require('../src/services/dynamicUtils'), 'mergeData', row => row);
    try {
      await connection.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await connection.query(`USE \`${database}\``);
      await connection.query(`CREATE TABLE users (id INT PRIMARY KEY, parent_id INT, role VARCHAR(30),
        status VARCHAR(20), custom_data JSON, full_name VARCHAR(50), email VARCHAR(50))`);
      await connection.query(`CREATE TABLE station_proposals (id INT PRIMARY KEY, user_id INT, status VARCHAR(60),
        review_level INT, custom_data JSON, ma_de_xuat_gen VARCHAR(50), owner_name VARCHAR(50),
        owner_phone VARCHAR(30), address VARCHAR(100), quy_hoach_score INT, phap_ly_score INT,
        updated_at DATETIME, created_at DATETIME)`);
      await connection.query(`CREATE TABLE proposal_requests (id INT, proposal_id INT, request_type VARCHAR(30),
        description TEXT, requested_by INT, previous_status VARCHAR(60), current_status VARCHAR(60),
        target_department VARCHAR(100), target_title VARCHAR(100), target_user_id INT,
        round_no INT, note TEXT, status VARCHAR(30), created_at DATETIME, resolved_at DATETIME, resolved_by INT)`);
      t.mock.method(require('../src/services/proposal/proposalProgressService.js'), 'getProgress', async () => ({}));
      for (const u of users) await connection.query(
        'INSERT INTO users (id,parent_id,role,status,custom_data) VALUES (?,?,?,?,?)',
        [u.id, u.parent_id || null, u.role, 'ACTIVE', JSON.stringify(u.custom_data)]);
      for (const p of proposals) await connection.query(
        'INSERT INTO station_proposals (id,user_id,status,review_level,custom_data) VALUES (?,?,?,?,?)',
        [p.id, p.user_id, p.status, p.review_level, JSON.stringify(p.custom_data)]);
      const user = { id: 1, role: 'SALES' };
      for (const tab of ['all', 'pending', 'completed']) {
        const result = await reviews.listReviews({ user, tab, limit: 100 });
        assert.deepEqual(result.proposals.map(p => p.id).sort((a,b) => a-b), [1, 2, 4, 5, 6, 7, 8, 11]);
        assert.equal(result.pagination.total, 8);
        assert.ok(result.proposals.every(p => p.permissions.canSubmitToTgd));
      }
      const filtered = await reviews.listReviews({ user, tab: 'all', filters: { region: 'Trung' } });
      assert.deepEqual(filtered.proposals.map(p => p.id), [1, 2, 4, 5, 6, 11]);
      await assert.rejects(reviews.getReviewDetail(9, user), { statusCode: 403 });
      const detail = await reviews.getReviewDetail(5, user);
      assert.equal(detail.permissions.canSubmitToTgd, true);
      await assert.rejects(reviews.toTgd({ user, id: 9, reason: 'test' }), { statusCode: 403 });
      const recipients = require('../src/services/proposal/proposalStepRecipients.js');
      const ids = await recipients.resolveStepRecipients('RE_GDTTKD_EVALUATING', proposals[0]);
      assert.ok(ids.includes(1));
      assert.ok(!ids.includes(6));
      for (const p of proposals) {
        const recipientsForProposal = await recipients.resolveStepRecipients('RE_GDTTKD_EVALUATING', p);
        assert.equal(recipientsForProposal.includes(1), [1, 2, 4, 5, 6, 7, 8, 11].includes(p.id),
          `notification ${p.id}`);
      }
      const access = require('../src/services/proposal/proposalAccessService.js');
      assert.equal(await access.canViewProposal(user, proposals[4]), true);
      assert.equal(await access.canViewProposal(user, proposals[8]), false);
      const requests = require('../src/services/proposal/proposalRequestService.js');
      for (const p of proposals) {
        const request = { request_type: 'RE_GRADE', target_title: 'Giám đốc Trung tâm Kinh doanh',
          target_department: 'Trung tâm KD miền Trung', owner_id: p.user_id, proposal_custom_data: p.custom_data };
        assert.equal(await requests.canActOnRequest(user, request),
          [1, 2, 4, 5, 6, 7, 8, 11].includes(p.id), `task ${p.id}`);
      }
      const scoped = await reviews.resolveReviewer(user);
      for (const p of proposals) {
        const params = [];
        const predicate = scopeService.sql(scoped.managementScope, params);
        const [[row]] = await connection.query(
          `SELECT (${predicate}) AS allowed FROM station_proposals p WHERE p.id = ?`, [...params, p.id]);
        assert.equal(Boolean(row.allowed), scopeService.matches(scoped.managementScope, p), `proposal ${p.id}`);
      }
      for (const [index, raw] of [2, '2', '{"id":2}', { id: '2' }, true, '2abc', '2e0', { id: false }].entries()) {
        const p = proposal(100 + index, 5, { nguoi_phu_trach: raw });
        await connection.query('INSERT INTO station_proposals (id,user_id,custom_data) VALUES (?,?,?)',
          [p.id, p.user_id, JSON.stringify(p.custom_data)]);
        const params = [];
        const predicate = scopeService.sql(scoped.managementScope, params);
        const [[row]] = await connection.query(`SELECT (${predicate}) AS allowed
          FROM station_proposals p WHERE p.id = ?`, [...params, p.id]);
        assert.equal(Boolean(row.allowed), index < 4, `legacy input ${JSON.stringify(raw)}`);
        assert.equal(Boolean(row.allowed), scopeService.matches(scoped.managementScope, p));
      }
      await connection.query('UPDATE users SET parent_id = 6 WHERE id = 3');
      const afterMove = await reviews.listReviews({ user, tab: 'all', filters: { ownerUserId: 3 } });
      assert.equal(afterMove.pagination.total, 0);
      const lifecycle = require('../src/services/proposal/proposalLifecycle.js');
      t.mock.method(lifecycle, 'transition', async (id, status) => ({ id, status }));
      t.mock.method(lifecycle, 'logActivity', async () => {});
      t.mock.method(requests, 'closeRequests', async () => {});
      t.mock.method(requests, 'createRequest', async () => ({ id: 1 }));
      const submitted = await reviews.toTgd({ user, id: 5, reason: 'Đúng người quản lý' });
      assert.equal(submitted.status, 'TGD_REVIEW');
      await connection.query(`UPDATE station_proposals SET status = 'GDTTKD_EVALUATING',
        review_level = 1, quy_hoach_score = 1, phap_ly_score = 2 WHERE id IN (5,9)`);
      await assert.rejects(reviews.requestRegrade({ user, id: 9, reason: 'test', departments: ['QH'] }),
        { statusCode: 403 });
      await assert.rejects(reviews.cancelAtGdttkd({ user, id: 9, reason: 'test' }), { statusCode: 403 });
      const regraded = await reviews.requestRegrade({ user, id: 5, reason: 'Chấm lại', departments: ['QH'] });
      assert.equal(regraded.status, 'RE_GRADING');
      await connection.query('UPDATE station_proposals SET review_level = 1 WHERE id = 5');
      const cancelled = await reviews.cancelAtGdttkd({ user, id: 5, reason: 'Đúng người quản lý' });
      assert.equal(cancelled.status, 'CANCELLED');
      await connection.query('UPDATE station_proposals SET review_level = NULL, status = ? WHERE id = 5', ['DESIGNING']);
      await connection.query(`INSERT INTO proposal_requests (id,proposal_id,request_type,status)
        VALUES (101,5,'RE_GRADE','DONE')`);
      const completedDetail = await reviews.getReviewDetail(5, user);
      assert.equal(completedDetail.proposal.review_level, null);
      assert.equal(completedDetail.requests[0].status, 'DONE');
      assert.ok(Object.values(completedDetail.permissions).every(value => value === false));
      await connection.query('UPDATE station_proposals SET review_level = NULL, status = ? WHERE id = 9', ['DESIGNING']);
      await assert.rejects(reviews.getReviewDetail(9, user), { statusCode: 403 });
      await assert.rejects(reviews.getReviewDetail(9999, user), { statusCode: 404 });
    } finally {
      await connection.query(`USE \`${original.name}\``);
      await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
      t.mock.restoreAll();
      connection.release();
      await pool.end();
    }
  });
