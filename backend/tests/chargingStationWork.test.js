const test = require('node:test');
const assert = require('node:assert/strict');
const access = require('../src/services/chargingStationAccessService');
const work = require('../src/services/chargingStationWorkService');
const pool = require('../src/utils/db');

test.after(async () => pool.end());

test('ADMIN can perform only the workflow steps assigned to their department', async (t) => {
  let department;
  t.mock.method(access, 'buildInfrastructureOwnerScope', async () => ({ sql: 'p.user_id=?', params: [1] }));
  t.mock.method(pool, 'query', async () => [[{ custom_data: { department } }]]);
  for (const [name, backOffice, setup] of [
    ['Back Office', true, false],
    ['Phòng Setup và Vận hành', false, true],
    ['Phòng Tài chính', false, false],
    ['Phòng khác', false, false]
  ]) {
    department = name;
    const user = { id: 1, role: 'ADMIN' };
    assert.deepEqual(await access.permissions(user), {
      back_office: backOffice, setup, finance: false, request_early: false
    });
    const { expressions } = await work.actionable(user);
    assert.equal(expressions.contract !== '0', backOffice, `${name}: contract`);
    assert.match(expressions.infrastructure, /p.user_id=\?/, `${name}: infrastructure follows owner, not department`);
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

test('setup ADMIN receives installation notifications but not finance notifications', async () => {
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
  assert.deepEqual(inserted, [1, 3]);
  inserted.length = 0;
  await deployments.notifyProgress(connection, { id: 1 }, {}, 'Test', 'Test', true);
  assert.deepEqual(inserted, [3]);
});

test('SUPER_ADMIN can perform each department step', async () => {
  assert.deepEqual(await access.permissions({ id: 1, role: 'SUPER_ADMIN' }), {
    back_office: true, setup: true, finance: true, request_early: true
  });
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
