const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/utils/db');
const care = require('../src/services/chargingStationCareService');
const access = require('../src/services/chargingStationAccessService');
const work = require('../src/services/chargingStationWorkService');
const station = require('../src/services/chargingStationService');
const value = { contact_time: '2026-11-13T02:03', content: ' Updated progress ' };
const superUser = { id: 1, role: 'SUPER_ADMIN' };
test.after(() => pool.end());

const setup = (t, { owner = 10, assignee = 20, ancestor = 30, department = '' } = {}) => {
  const calls = [];
  t.mock.method(access, 'assertView', async () => {});
  const query = async (sql, params) => {
    calls.push([sql, params]);
    if (sql.includes('AS assignee_id')) return [[{ user_id: owner, assignee_id: assignee }]];
    if (sql.includes('SELECT custom_data FROM users')) return [[{ custom_data: { department } }]];
    if (sql.includes('WITH RECURSIVE')) return [Number(params[1]) === ancestor ? [{ id: ancestor }] : []];
    if (sql.startsWith('SELECT charging_station_id,created_by')) return [[{ charging_station_id: 50, created_by: 10 }]];
    if (sql.startsWith('SELECT charging_station_id FROM')) return [[{ charging_station_id: 50 }]];
    if (sql.includes('SELECT * FROM charging_station_care_logs')) return [[{ id: 7, charging_station_id: 50, created_by: 10, employee_user_id: 20, ...value }]];
    if (sql.includes('SELECT id,full_name,role,custom_data')) return [[{
      id: 10, full_name: 'Updater', role: 'SALES', custom_data: { department: 'Team', chuc_vu: 'Director', private_field: 'do not expose' }
    }]];
    if (sql.includes('INSERT INTO charging_station_care_logs')) return [{ insertId: 7 }];
    return [[]];
  };
  t.mock.method(pool, 'query', query);
  const connection = { query, beginTransaction: async () => calls.push(['begin']),
    commit: async () => calls.push(['commit']), rollback: async () => calls.push(['rollback']), release: () => {} };
  t.mock.method(pool, 'getConnection', async () => connection);
  return { calls, connection };
};

for (const [label, user, options, allowed] of [
  ['sales owner', { id: 10, role: 'SALES' }, {}, true],
  ['CTV owner alone', { id: 10, role: 'CTV' }, {}, false],
  ['assigned user', { id: 20, role: 'CTV' }, {}, true],
  ['ancestor', { id: 30, role: 'SALES' }, {}, true],
  ['unrelated administrator', { id: 40, role: 'ADMIN' }, {}, false],
  ['unrelated sales director', { id: 40, role: 'SALES' }, {}, false],
  ['Back Office only', { id: 40, role: 'SALES' }, { department: 'Back Office' }, false],
  ['Setup department', { id: 40, role: 'SALES' }, { department: 'Phòng Setup và Vận hành' }, true],
  ['super administrator', superUser, {}, true]
]) {
  test(`progress create permission: ${label}`, async t => {
    setup(t, options);
    assert.deepEqual(await care.permissions(50, user), { create: allowed, manage: user.role === 'SUPER_ADMIN' });
    if (!allowed) await assert.rejects(care.createCareLog(50, value, user), { statusCode: 403 });
  });
}

test('all progress surfaces enforce station view scope', async t => {
  setup(t);
  t.mock.method(access, 'assertView', async () => { throw Object.assign(new Error('Outside scope'), { statusCode: 403 }); });
  for (const action of [
    () => care.listCareLogs(50, superUser), () => care.createCareLog(50, value, superUser),
    () => care.updateCareLog(7, value, superUser), () => care.deleteCareLog(7, superUser),
    () => care.getUpdater(7, superUser)
  ]) await assert.rejects(action(), { statusCode: 403 });
});

test('creation ignores forged author, keeps business wall time and audits atomically', async t => {
  const { calls } = setup(t);
  await care.createCareLog(50, { ...value, employee_user_id: 99, created_by: 99 }, superUser);
  const insert = calls.find(([sql]) => sql.includes('INSERT INTO charging_station_care_logs'));
  assert.deepEqual(insert[1], [50, 1, '2026-11-13 02:03:00', 'Updated progress', 1]);
  const audit = calls.find(([sql]) => sql.includes('INSERT INTO charging_station_activity_logs'));
  assert.equal(audit[1][1], 'progress_created');
  assert.ok(calls.indexOf(audit) < calls.findIndex(([sql]) => sql === 'commit'));
});

test('only super administrator can modify saved rows and author remains unchanged', async t => {
  const { calls } = setup(t);
  for (const role of ['SALES', 'ADMIN', 'CTV']) {
    await assert.rejects(care.updateCareLog(7, value, { id: 10, role }), { statusCode: 403 });
    await assert.rejects(care.deleteCareLog(7, { id: 10, role }), { statusCode: 403 });
  }
  await care.updateCareLog(7, { ...value, created_by: 99, employee_user_id: 99 }, superUser);
  const update = calls.find(([sql]) => sql.startsWith('UPDATE charging_station_care_logs'));
  assert.doesNotMatch(update[0], /created_by|employee_user_id/);
  await care.deleteCareLog(7, superUser);
  assert.ok(calls.some(([sql, params]) => sql.includes('INSERT INTO charging_station_activity_logs') && params[1] === 'progress_deleted'));
});

test('invalid wall clock time and blank content never start a transaction', async t => {
  const { calls } = setup(t);
  for (const changes of [{ content: '' }, { content: {} }, { contact_time: '' },
    { contact_time: '2026-02-30T12:00' }, { contact_time: '2026-11-13T25:00' }, { contact_time: '0999-01-01T12:00' }]) {
    await assert.rejects(care.createCareLog(50, { ...value, ...changes }, superUser), { statusCode: 400 });
  }
  await assert.rejects(care.createCareLog(50, null, superUser), { statusCode: 400 });
  assert.equal(calls.some(([sql]) => sql === 'begin'), false);
});

test('audit failure rolls back progress mutation', async t => {
  const { calls, connection } = setup(t);
  const query = connection.query;
  connection.query = async (sql, params) => {
    if (sql.includes('INSERT INTO charging_station_activity_logs')) throw new Error('Audit unavailable');
    return query(sql, params);
  };
  await assert.rejects(care.createCareLog(50, value, superUser), /Audit unavailable/);
  assert.ok(calls.some(([sql]) => sql === 'rollback'));
  assert.equal(calls.some(([sql]) => sql === 'commit'), false);
});

test('updater profile contains no contact or unrestricted dynamic fields', async t => {
  setup(t);
  assert.deepEqual(await care.getUpdater(7, superUser), {
    id: 10, full_name: 'Updater', role: 'SALES', department: 'Team', chuc_vu: 'Director'
  });
});

test('HTTP progress routes allow assigned CTV creation but reserve saved-row management for SUPER_ADMIN', async t => {
  setup(t);
  const query = pool.query;
  t.mock.method(pool, 'query', async (sql, params) => sql.includes('SELECT id, email, role, status, token_version')
    ? [[{ id: 20, email: 'fixture@example.invalid', role: 'CTV', status: 'ACTIVE', token_version: 0 }]]
    : query(sql, params));
  process.env.JWT_SECRET ||= 'progress-test-only-secret';
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/admin/charging-stations', require('../src/routes/chargingStationCare'));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const token = require('jsonwebtoken').sign({ id: 20, tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '1m' });
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const base = `http://127.0.0.1:${server.address().port}/api/admin/charging-stations`;
  try {
    const list = await fetch(`${base}/50/care-logs`, { headers });
    assert.equal(list.status, 200);
    assert.equal((await list.json()).permissions.create, true);
    const create = await fetch(`${base}/50/care-logs`, { method: 'POST', headers, body: JSON.stringify(value) });
    assert.equal(create.status, 201);
    for (const method of ['PUT', 'DELETE']) {
      const response = await fetch(`${base}/care-logs/7`, { method, headers, body: method === 'PUT' ? JSON.stringify(value) : undefined });
      assert.equal(response.status, 403);
    }
    const updater = await fetch(`${base}/care-logs/7/updater`, { headers });
    assert.equal(updater.status, 200);
    assert.equal((await updater.json()).data.department, 'Team');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('overview count shares completion predicate and view scope without changing parent total', async t => {
  t.mock.method(access, 'buildViewScope', async () => ({ sql: 'p.user_id=?', params: [123] }));
  t.mock.method(work, 'actionable', async () => ({
    expressions: { contract: '0' }, params: [], permissions: {}
  }));
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.ok(sql.includes(work.allOperating));
    assert.match(sql, /WHERE p.user_id=\?/);
    assert.deepEqual(params, [123]);
    return [[{ contract: 2, overview: 8 }]];
  });
  const counts = await station.getChargingStationTaskCounts(superUser);
  assert.equal(counts.counts.overview, 8);
  assert.equal(counts.total, 2);
});

test('real SQL overview splits partial/all operating and excludes cancellations, independent of paperwork', {
  skip: process.env.RUN_PROGRESS_SQL_TEST !== '1'
}, async () => {
  const connection = await pool.getConnection();
  const database = `test_on_progress_${Date.now()}`;
  const [[original]] = await connection.query('SELECT DATABASE() AS name');
  try {
    await connection.query(`CREATE DATABASE \`${database}\``);
    await connection.query(`USE \`${database}\``);
    await connection.query(`CREATE TABLE charging_stations (id INT PRIMARY KEY,status VARCHAR(30),
      fulfillment_review_required INT DEFAULT 0,contract_status VARCHAR(10) DEFAULT 'NOT',payment_status VARCHAR(10) DEFAULT 'NOT')`);
    await connection.query('CREATE TABLE charging_station_commitments (id INT PRIMARY KEY,charging_station_id INT,quantity INT)');
    await connection.query('CREATE TABLE warehouse_export_items (id INT PRIMARY KEY,commitment_id INT)');
    await connection.query('CREATE TABLE charging_station_deployments (id INT PRIMARY KEY,charging_station_id INT,export_item_id INT,quantity INT,stage VARCHAR(30))');
    await connection.query(`INSERT INTO charging_stations(id,status,fulfillment_review_required) VALUES
      (1,'ONBOARDING',0),(2,'OPERATING',0),(3,'OPERATING',0),(4,'OPERATING',0),(5,'CANCELLED',0),(6,'OPERATING',1)`);
    await connection.query('INSERT INTO charging_station_commitments VALUES (2,2,4),(3,3,4),(6,6,4)');
    await connection.query('INSERT INTO warehouse_export_items VALUES (2,2),(3,3),(6,6)');
    await connection.query(`INSERT INTO charging_station_deployments VALUES
      (2,2,2,2,'OPERATING'),(3,3,3,4,'OPERATING'),(6,6,6,4,'OPERATING')`);
    for (const [tab, expected] of [['need', [1, 2, 6]], ['completed', [3, 4]]]) {
      const filter = await work.getFilter('thong-tin-chung', tab, superUser);
      const [rows] = await connection.query(`SELECT cs.id FROM charging_stations cs WHERE ${filter.sql} ORDER BY cs.id`, filter.params);
      assert.deepEqual(rows.map(row => row.id), expected);
    }
    await connection.query('CREATE TABLE users (id INT PRIMARY KEY,parent_id INT)');
    await connection.query('INSERT INTO users VALUES (10,20),(20,30),(30,NULL),(40,NULL)');
    const [ancestors] = await connection.query(`WITH RECURSIVE ancestors AS (
      SELECT parent_id AS id FROM users WHERE id=10 AND parent_id IS NOT NULL
      UNION DISTINCT SELECT u.parent_id FROM users u JOIN ancestors a ON u.id=a.id WHERE u.parent_id IS NOT NULL
    ) SELECT id FROM ancestors ORDER BY id`);
    assert.deepEqual(ancestors.map(row => row.id), [20, 30]);
  } finally {
    await connection.query(`USE \`${original.name}\``);
    await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
    connection.release();
  }
});
