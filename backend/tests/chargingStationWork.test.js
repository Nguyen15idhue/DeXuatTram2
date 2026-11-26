const test = require('node:test');
const assert = require('node:assert/strict');
const access = require('../src/services/chargingStationAccessService');
const work = require('../src/services/chargingStationWorkService');
const pool = require('../src/utils/db');

test.after(async () => pool.end());

test('ADMIN Back Office has ON workflow rights while other departments retain their scope', async (t) => {
  let department;
  t.mock.method(require('../src/services/proposalAccessService'), 'buildOwnerScopeSql',
    async () => ({ sql: 'p.user_id=?', params: [1] }));
  t.mock.method(pool, 'query', async () => [[{ custom_data: { department } }]]);
  for (const [name, backOffice, setup] of [
    ['Back Office', true, true],
    ['Phòng Setup và Vận hành', false, true],
    ['Phòng Tài chính', false, false],
    ['Phòng khác', false, false]
  ]) {
    department = name;
    const user = { id: 1, role: 'ADMIN' };
    assert.deepEqual(await access.permissions(user), {
      back_office: backOffice, setup, finance: false, request_early: backOffice
    });
    const { expressions } = await work.actionable(user);
    assert.equal(expressions.contract !== '0', backOffice, `${name}: contract`);
    assert.match(expressions.infrastructure, setup ? /AND \(1 = 1\)/ : /p.user_id=\?/,
      `${name}: infrastructure follows owner or Setup`);
    for (const key of ['installation', 'acceptance', 'on_station']) {
      assert.equal(expressions[key] !== '0', setup, `${name}: ${key}`);
    }
    assert.equal(expressions.finance, '0');
    if (backOffice) await access.assertBackOffice(user);
    else await assert.rejects(() => access.assertBackOffice(user), { statusCode: 403 });
    if (setup) await access.assertSetup(user);
    else await assert.rejects(() => access.assertSetup(user), { statusCode: 403 });
    await assert.rejects(() => access.assertFinance(user), { statusCode: 403 });
    await access.assertFinanceViewer(user);
  }
});

test('infrastructure worklist and badge use the same scope without duplicating Setup owners', async t => {
  const owner = { sql: 'p.user_id=?', params: [17] };
  t.mock.method(require('../src/services/proposalAccessService'), 'buildOwnerScopeSql', async () => owner);
  let setup;
  t.mock.method(access, 'permissions', async () => ({ setup, request_early: false }));
  t.mock.method(require('../src/services/proposalReportService'), 'resolveScope', async () => ({
    department: setup ? 'Phòng Setup và Vận hành' : 'Phòng khác'
  }));
  for (setup of [false, true]) {
    const user = { id: 17, role: 'SALES' };
    const filter = await work.getFilter('xay-dung-ha-tang', 'need', user);
    const tasks = await work.actionable(user);
    const need = work.stageFilters['xay-dung-ha-tang'].need;
    assert.equal(filter.sql.replace(`(${need})`, need),
      `cs.status<>'CANCELLED' AND ${tasks.expressions.infrastructure.slice(1, -1)}`);
    assert.deepEqual(filter.params, tasks.params);
    assert.deepEqual(filter.params, setup ? [] : [17]);
    assert.match(filter.sql, /infra_power_status.* OR .*infra_site_status/);
    assert.doesNotMatch(filter.sql, /UNION/);
  }
});

test('setup and Back Office ADMIN receive installation notifications but not finance notifications', async () => {
  const deployments = require('../src/services/chargingStationDeploymentService');
  const inserted = [];
  const connection = { query: async (sql, params) => {
    if (sql.startsWith('SELECT')) return [[
      { id: 1, role: 'ADMIN', custom_data: { department: 'Phòng Setup và Vận hành' } },
      { id: 2, role: 'ADMIN', custom_data: { department: 'Back Office' } },
      { id: 3, role: 'SUPER_ADMIN', custom_data: {} }
    ]];
    inserted.push(params[0]);
    return [{}];
  } };
  await deployments.notifyProgress(connection, { id: 1 }, {}, 'Test', 'Test');
  assert.deepEqual(inserted, [1, 2, 3]);
  inserted.length = 0;
  await deployments.notifyProgress(connection, { id: 1 }, {}, 'Test', 'Test', true);
  assert.deepEqual(inserted, [3]);
});

test('SUPER_ADMIN can perform each department step', async () => {
  assert.deepEqual(await access.permissions({ id: 1, role: 'SUPER_ADMIN' }), {
    back_office: true, setup: true, finance: true, request_early: true
  });
});

test('delivery worklist and badge include SUPER_ADMIN and Back Office, not unrelated roles', async t => {
    t.mock.method(access, 'permissions', async user => ({
      back_office: user.role === 'SUPER_ADMIN' || user.id === 2, setup: true
    }));
    for (const user of [{ id: 1, role: 'SUPER_ADMIN' }, { id: 2, role: 'SALES' }, { id: 3, role: 'ADMIN' }]) {
      const filter = await work.getFilter('giao-tru', 'need', user);
      const { expressions } = await work.actionable(user);
      if (user.id === 3) {
        assert.equal(filter.sql, '0');
        assert.equal(expressions.delivery, '0');
      } else {
        assert.equal(filter.sql, `cs.status<>'CANCELLED' AND (${expressions.delivery})`);
        assert.match(expressions.delivery, /early_delivery_requested/);
        assert.match(expressions.delivery, /received_quantity/);
      }
    }
});

test('receipt, installation, acceptance and operation filter separate progress', () => {
  assert.match(work.stageFilters['giao-tru'].completed, /received_quantity/);
  assert.match(work.stageFilters['lap-tru'].need, /installation_status='DONE'/);
  assert.match(work.stageFilters['nghiem-thu'].need, /acceptance_status<>'PASSED'/);
  assert.match(work.stageFilters['on-tram'].need, /on_quantity<d.quantity/);
  for (const stage of ['lap-tru', 'nghiem-thu', 'on-tram']) {
    assert.match(work.stageFilters[stage].need, /returned_at IS NULL/);
  }
  assert.match(work.stageFilters['xay-dung-ha-tang'].need, /infra_power_status/);
});

test('overview completion depends on all poles operating, not financial or contract paperwork', async () => {
  const completed = (await work.getFilter('thong-tin-chung', 'completed')).sql;
  assert.match(completed, /charging_station_commitments/);
  assert.match(completed, /SUM\(d.on_quantity\)/);
  assert.doesNotMatch(completed, /contract_status|infra_site_status|REFUND_PENDING|payment_status/);
  const pending = await work.getFilter('thong-tin-chung', 'need');
  assert.match(pending.sql, /NOT /);
  assert.match(pending.sql, /CANCELLED/);
  assert.deepEqual(pending.params, []);
});

test('unknown stages fail explicitly rather than returning a broader list', async () => {
  await assert.rejects(() => work.getFilter('unexpected', 'all'), { statusCode: 400 });
});

test('MySQL infrastructure worklist and badge require signed contracts and preserve scope and other tabs', {
  skip: process.env.RUN_INFRASTRUCTURE_INTEGRATION_TESTS !== '1'
}, async t => {
  t.mock.method(access, 'permissions', async user => ({ setup: user.id === 20, request_early: false }));
  t.mock.method(require('../src/services/proposalReportService'), 'resolveScope', async user => ({
    department: user.id === 20 ? 'Phòng Setup và Vận hành' : 'Phòng khác'
  }));
  t.mock.method(require('../src/services/proposalAccessService'), 'buildOwnerScopeSql', async user => ({
    sql: 'p.user_id=?', params: [user.id === 19 ? 17 : user.id]
  }));
  const fixtures = [
    [1, 'ONBOARDING', 'NOT', 'NOT', 'NOT', 17],
    [2, 'ONBOARDING', 'DOING', 'NOT', 'NOT', 17],
    [3, 'ONBOARDING', 'DONE', 'NOT', 'NOT', 17],
    [4, 'DELIVERING', 'DONE', 'DONE', 'NOT', 17],
    [5, 'DELIVERING', 'DONE', 'NOT', 'DONE', 17],
    [6, 'OPERATING', 'DONE', 'DONE', 'DONE', 17],
    [7, 'CANCELLED', 'DONE', 'NOT', 'NOT', 17],
    [8, 'ONBOARDING', 'DONE', null, null, 17],
    [9, 'ONBOARDING', 'DONE', 'DOING', 'DOING', 99],
    [10, 'ONBOARDING', 'CANCELLED', 'NOT', 'NOT', 17],
    [11, 'ONBOARDING', null, 'NOT', 'NOT', 17],
    [12, 'ONBOARDING', 'NOT', 'DONE', 'DONE', 17]
  ];
  const from = `FROM (${fixtures.map(() =>
    'SELECT ? AS id, ? AS status, ? AS contract_status, ? AS infra_power_status, ? AS infra_site_status'
  ).join(' UNION ALL ')}) cs
    JOIN (${fixtures.map(() => 'SELECT ? AS id, ? AS user_id').join(' UNION ALL ')}) p ON p.id=cs.id`;
  const values = [...fixtures.flatMap(row => row.slice(0, 5)), ...fixtures.flatMap(row => [row[0], row[5]])];
  for (const [id, expected] of [[17, [3, 4, 5, 8]], [18, []], [19, [3, 4, 5, 8]], [20, [3, 4, 5, 8, 9]]]) {
    const user = { id, role: 'SALES' };
    const filter = await work.getFilter('xay-dung-ha-tang', 'need', user);
    const tasks = await work.actionable(user);
    const [rows] = await pool.query(`SELECT cs.id ${from} WHERE ${filter.sql} ORDER BY cs.id`, [...values, ...filter.params]);
    assert.deepEqual(rows.map(row => row.id), expected, `worklist for user ${id}`);
    const [[count]] = await pool.query(
      `SELECT COUNT(CASE WHEN cs.status<>'CANCELLED' AND (${tasks.expressions.infrastructure}) THEN cs.id END) AS total ${from}`,
      [...tasks.params, ...values]
    );
    assert.equal(count.total, expected.length, `badge for user ${id}`);
  }
  for (const [tab, expected] of [['all', fixtures.map(row => row[0])], ['completed', [6, 12]]]) {
    const filter = await work.getFilter('xay-dung-ha-tang', tab, { id: 17, role: 'SALES' });
    const [rows] = await pool.query(`SELECT cs.id ${from} WHERE ${filter.sql} ORDER BY cs.id`, [...values, ...filter.params]);
    assert.deepEqual(rows.map(row => row.id), expected);
  }
});
