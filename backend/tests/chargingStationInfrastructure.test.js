const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/utils/db');
const service = require('../src/services/chargingStationService');
const access = require('../src/services/chargingStationAccessService');
const superUser = { id: 1, role: 'SUPER_ADMIN' };
const backOffice = { id: 2, role: 'SALES', custom_data: { department: 'Back Office' } };
const body = { status: 'DOING', expected_status: 'NOT', date: '2026-11-13', note: ' Started ' };
test.after(() => pool.end());

const setup = (t, overrides = {}) => {
  const record = { id: 1, proposal_id: 2, status: 'DELIVERING', infra_power_status: 'NOT', infra_site_status: 'NOT', ...overrides };
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push(['begin']),
    commit: async () => calls.push(['commit']),
    rollback: async () => calls.push(['rollback']),
    release: () => {},
    query: async (sql, params) => {
      calls.push([sql, params]);
      if (sql.includes('SELECT * FROM charging_stations')) return [[record]];
      if (sql.includes('SELECT p.status')) return [[{ status: 'ACTIVE' }]];
      return [[]];
    }
  };
  t.mock.method(pool, 'getConnection', async () => connection);
  t.mock.method(pool, 'query', async sql => sql.includes('SELECT cs.id') ? [[record]] : [[]]);
  t.mock.method(access, 'buildViewScope', async () => ({ sql: '1=1', params: [] }));
  t.mock.method(require('../src/services/proposalReportService'), 'resolveScope', async user => ({
    isBackOffice: user.id === backOffice.id, department: user.custom_data?.department || ''
  }));
  t.mock.method(require('../src/services/adminProposalService'), 'getProposalWithUser', async () => ({ id: 2 }));
  t.mock.method(require('../src/services/chargingStationShippingService'), 'getSummary', async () => ({}));
  t.mock.method(require('../src/services/chargingStationDeploymentService'), 'getDeployments', async () => []);
  t.mock.method(require('../src/services/chargingStationOverrideService'), 'getEditToken', async () => 'test-token');
  return { calls, record, connection };
};

for (const type of ['power', 'site']) {
  test(`${type} saves only its own status/date/note and audits before commit`, async t => {
    const { calls } = setup(t);
    await service.updateInfrastructureStatus(1, type, body, backOffice);
    const update = calls.find(([sql]) => sql.startsWith('UPDATE charging_stations SET infra_'));
    assert.match(update[0], new RegExp(`infra_${type}_date = \\?, infra_${type}_note = \\?`));
    assert.deepEqual(update[1], ['DOING', '2026-11-13', 'Started', 1]);
    const audit = calls.find(([sql]) => sql.includes('INSERT INTO charging_station_activity_logs'));
    const changes = JSON.parse(audit[1][4]);
    assert.equal(changes[`infra_${type}_status`].old, 'NOT');
    assert.equal(changes[`infra_${type}_date`].new, '2026-11-13');
    assert.equal(audit[1][8], 'user');
    assert.ok(calls.indexOf(audit) < calls.findIndex(([sql]) => sql === 'commit'));
  });
}

for (const [from, to] of [['NOT', 'DONE'], ['DOING', 'NOT'], ['DONE', 'DOING'], ['DOING', 'DOING']]) {
  test(`Back Office and SUPER_ADMIN can change ${from} to ${to} independently`, async t => {
    const { calls } = setup(t, { infra_power_status: from, infra_power_date: '2026-11-01', infra_power_note: 'History' });
    const request = { ...body, expected_status: from, status: to };
    await service.updateInfrastructureStatus(1, 'power', request, backOffice);
    const backwards = ['NOT', 'DOING', 'DONE'].indexOf(to) < ['NOT', 'DOING', 'DONE'].indexOf(from);
    assert.deepEqual(calls.find(([sql]) => sql.startsWith('UPDATE charging_stations SET infra_'))[1],
      [to, backwards ? '2026-11-01' : body.date, backwards ? 'History' : 'Started', 1]);
    assert.equal(calls.some(([sql]) => sql.includes('SET status =')), false);
    calls.length = 0;
    await service.updateInfrastructureStatus(1, 'power', request, superUser);
    const audit = calls.find(([sql]) => sql.includes('INSERT INTO charging_station_activity_logs'));
    assert.equal(audit[1][8], 'admin_override');
  });
}

test('Back Office can complete DOING to DONE', async t => {
  const { calls } = setup(t, { infra_site_status: 'DOING' });
  await service.updateInfrastructureStatus(1, 'site', { ...body, expected_status: 'DOING', status: 'DONE' }, backOffice);
  assert.ok(calls.some(([sql]) => sql === 'commit'));
});

test('stale status and cancelled station fail without updates', async t => {
  const { calls, record } = setup(t, { infra_power_status: 'DOING' });
  await assert.rejects(service.updateInfrastructureStatus(1, 'power', body, superUser), { statusCode: 409 });
  record.status = 'CANCELLED';
  await assert.rejects(service.updateInfrastructureStatus(1, 'power', { ...body, expected_status: 'DOING' }, superUser), { statusCode: 400 });
  assert.equal(calls.some(([sql]) => sql.startsWith('UPDATE')), false);
});

test('ADMIN and SALES outside Back Office cannot update infrastructure', async t => {
  t.mock.method(pool, 'query', async () => [[{ custom_data: { department: 'Phòng khác' } }]]);
  for (const role of ['ADMIN', 'SALES']) {
    await assert.rejects(service.updateInfrastructureStatus(1, 'power', body, { id: 9, role, custom_data: {} }), { statusCode: 403 });
  }
});

test('owner-level infrastructure permission applies to CTV/NPP/ancestors and departments without creating department-only tasks', async t => {
  const { calls } = setup(t);
  const owners = new Set([5, 6, 7]);
  const originalQuery = pool.query;
  t.mock.method(pool, 'query', async (sql, params) => sql.includes('AS owner_task')
    ? [[{ owner_task: owners.has(params[0]) ? 1 : 0 }]] : originalQuery(sql, params));
  t.mock.method(require('../src/services/adminProposalService'), 'getBranchUserIds', async id => [id]);
  t.mock.method(require('../src/services/proposalReportService'), 'resolveScope', async user => ({
    isBackOffice: user.id === 2, department: user.id === 8 ? 'Phòng Setup và Vận hành' : ''
  }));
  for (const user of [{ id: 5, role: 'CTV' }, { id: 6, role: 'NPP' }, { id: 7, role: 'SALES' }]) {
    const permission = await access.recordPermissions(1, user);
    assert.equal(permission.infrastructure, true);
    assert.equal(permission.infrastructure_task, true);
    await service.updateInfrastructureStatus(1, 'power', body, user);
  }
  for (const user of [{ id: 2, role: 'ADMIN' }, { id: 8, role: 'SALES' }]) {
    const permission = await access.recordPermissions(1, user);
    assert.equal(permission.infrastructure, true);
    assert.equal(permission.infrastructure_task, false);
    await service.updateInfrastructureStatus(1, 'power', body, user);
  }
  for (const role of ['CTV', 'NPP', 'SALES', 'ADMIN']) {
    await assert.rejects(service.updateInfrastructureStatus(1, 'power', body, { id: 9, role }), { statusCode: 403 });
  }
  assert.equal(calls.filter(([sql]) => sql === 'commit').length, 5);
});

test('Back Office ADMIN can update infrastructure', async t => {
  const { calls } = setup(t);
  await service.updateInfrastructureStatus(1, 'power', body, { ...backOffice, role: 'ADMIN' });
  assert.ok(calls.some(([sql]) => sql === 'commit'));
});

test('invalid status, date, expected status and note fail before transactions', async () => {
  for (const changes of [
    { status: 'BAD' }, { expected_status: null }, { date: '' },
    { date: '2026-02-30' }, { date: 'bad' }, { note: {} }
  ]) await assert.rejects(service.updateInfrastructureStatus(1, 'power', { ...body, ...changes }, superUser), { statusCode: 400 });
  await assert.rejects(service.updateInfrastructureStatus(1, 'invalid', body, superUser), { statusCode: 400 });
});

test('legacy start/complete keep sequential behavior and record current date', async t => {
  const { calls, record } = setup(t);
  await service.updateInfrastructureStatus(1, 'power', 'start', backOffice);
  const update = calls.find(([sql]) => sql.startsWith('UPDATE charging_stations SET infra_'));
  assert.match(update[1][1], /^\d{4}-\d{2}-\d{2}$/);
  await assert.rejects(service.updateInfrastructureStatus(1, 'power', 'complete', superUser), { statusCode: 400 });
  record.infra_power_status = 'DOING';
  await service.updateInfrastructureStatus(1, 'power', 'complete', backOffice);
});

test('audit failure rolls back infrastructure update', async t => {
  const { calls, connection } = setup(t);
  const query = connection.query;
  connection.query = async (sql, params) => {
    if (sql.includes('INSERT INTO charging_station_activity_logs')) throw new Error('Audit failure');
    return query(sql, params);
  };
  await assert.rejects(service.updateInfrastructureStatus(1, 'power', body, superUser), /Audit failure/);
  assert.ok(calls.some(([sql]) => sql === 'rollback'));
  assert.equal(calls.some(([sql]) => sql === 'commit'), false);
});
