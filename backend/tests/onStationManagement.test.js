const test = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const pool = require('../src/utils/db');
const station = require('../src/services/chargingStationService');
const override = require('../src/services/chargingStationOverrideService');
const deployment = require('../src/services/chargingStationDeploymentService');
const carriers = require('../src/services/shippingCarrierService');
const shipping = require('../src/services/chargingStationShippingService');
const work = require('../src/services/chargingStationWorkService');
const superUser = { id: 1, role: 'SUPER_ADMIN' };
const ctx = { actorId: 1, actorRole: 'SUPER_ADMIN' };
test.after(() => pool.end());

test('new shipments enforce readiness but idempotent retries remain valid', async t => {
  const access = require('../src/services/chargingStationAccessService');
  t.mock.method(access, 'assertBackOffice', async () => {});
  t.mock.method(access, 'assertView', async () => {});
  const request = {
    request_id: 'delivery-1', carrier_id: 1, export_date: '2026-11-12',
    items: [{ commitment_id: 3, quantity: 1 }]
  };
  const payload = {
    items: request.items, carrier_id: 1, export_date: '2026-11-12',
    transport_code: null, reason: null, total_amount: null
  };
  let event = null;
  const queries = [];
  const connection = { query: async sql => {
    queries.push(sql);
    if (sql.startsWith('SELECT * FROM charging_stations')) return [[{ id: 1 }]];
    if (sql.includes('FROM charging_station_fulfillment_events')) return [event ? [event] : []];
    if (sql.includes(' AS eligible')) return [[{ status: 'DELIVERING', eligible: 0, infra_delivery_legacy_exempt: 0 }]];
    throw new Error('Unexpected query');
  } };
  await assert.rejects(shipping.createExportWithinTransaction(connection, 1, request, superUser), { statusCode: 409 });
  assert.ok(queries.some(sql => sql.includes(' AS eligible')));
  event = { operation: 'SHIPPING_CREATE_EXPORT', payload: JSON.stringify(payload), result: JSON.stringify({ id: 9 }) };
  queries.length = 0;
  assert.deepEqual(await shipping.createExportWithinTransaction(connection, 1, request, superUser), { id: 9 });
  assert.equal(queries.some(sql => sql.includes(' AS eligible')), false);
});

test('installation aggregation uses all committed poles, and explicit overrides stay distinct', () => {
  const items = [{ commitment_id: 1, committed_quantity: 2 }];
  const portions = [{ commitment_id: 1, quantity: 1, installation_status: 'DONE' }];
  assert.equal(deployment.installationSummary({}, items, portions, false), 'DOING');
  assert.equal(deployment.installationSummary({}, items, [...portions, ...portions], false), 'DONE');
  assert.equal(deployment.installationSummary({}, items, [...portions, ...portions], true), 'DOING');
  assert.equal(deployment.installationSummary({}, items, [], false), 'NOT');
  assert.equal(deployment.installationSummary({ workflow_override: { completed: true } }, items, [], true), 'DONE');
});

test('overview rejects unauthorized edits and invalid dates before writes', async () => {
  await assert.rejects(override.update(1, {}, { actorRole: 'ADMIN' }), { statusCode: 403 });
  assert.throws(() => override.dateOf('2026-02-30'), { statusCode: 400 });
  assert.throws(() => override.dateOf('2026-11-13T10:00'), { statusCode: 400 });
  await assert.rejects(override.update(1, { reason: 'Reason', id: 2 }, ctx), /Không được sửa trường id/);
});

const deliveryFixture = (t, values = {}) => {
  const record = { id: 1, status: 'DELIVERING', sub_status: 'NOT_DELIVERED',
    workflow_override: { existing_flag: true }, ...values };
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push(['begin']),
    commit: async () => calls.push(['commit']),
    rollback: async () => calls.push(['rollback']),
    release: () => {},
    query: async (sql, params) => {
      calls.push([sql, params]);
      if (sql.startsWith('SELECT * FROM charging_stations')) return [[{ ...record }]];
      if (sql.startsWith('UPDATE charging_stations SET workflow_override=')) {
        record.workflow_override = JSON.parse(params[0]);
      }
      return [[]];
    }
  };
  t.mock.method(pool, 'getConnection', async () => connection);
  t.mock.method(station, 'getChargingStationDetail', async () => ({ ...record }));
  t.mock.method(shipping, 'completeDeliveryWithoutStock', async () => ({ station: { ...record }, export_id: null, received: [] }));
  return { record, calls, connection };
};

test('direct delivery delegates receipts, preserves existing JSON and advanced progress, and is repeat-safe', async t => {
  const { record, calls, connection } = deliveryFixture(t, {
    status: 'OPERATING', sub_status: 'ACTIVE', cms_station_code: null, on_date: null,
    workflow_override: JSON.stringify({ existing_flag: true })
  });
  const request = { delivery_completed: true, reason: 'Confirm delivery',
    expected_token: await override.getEditToken(1, connection) };
  const result = await override.update(1, request, ctx);
  assert.deepEqual(result.workflow_override, { existing_flag: true, delivery_completed: true });
  assert.equal(result.status, 'OPERATING');
  assert.equal(result.sub_status, 'ACTIVE');
  assert.equal(result.cms_station_code, null);
  assert.equal(result.on_date, null);
  const writes = calls.filter(([sql]) => /^(UPDATE|INSERT|DELETE)/.test(sql));
  assert.equal(writes.length, 2);
  assert.match(writes[0][0], /^UPDATE charging_stations SET workflow_override=\? WHERE id=\?$/);
  assert.equal(writes[1][1][1], 'delivery_completed_manually');
  assert.match(writes[1][0], /'admin_override'/);
  assert.equal(writes[1][1][5], request.reason);
  const oldToken = request.expected_token;
  await override.update(1, { ...request, expected_token: await override.getEditToken(1, connection) }, ctx);
  assert.equal(calls.filter(([sql]) => /^(UPDATE|INSERT|DELETE)/.test(sql)).length, 2);
  await assert.rejects(override.update(1, { ...request, expected_token: oldToken }, ctx), { statusCode: 409 });
  assert.ok(calls.some(([sql]) => sql === 'rollback'));
  assert.equal(record.workflow_override.completed, undefined);
});

test('delivery override rejects cancelled stations, invalid values, forged JSON and blank reasons without writes', async t => {
  const { calls, connection } = deliveryFixture(t, { status: 'CANCELLED' });
  const request = { delivery_completed: true, reason: 'Confirm delivery',
    expected_token: await override.getEditToken(1, connection) };
  await assert.rejects(override.update(1, request, ctx), { statusCode: 409 });
  for (const delivery_completed of [false, null, 1, 'true', {}]) {
    await assert.rejects(override.update(1, { ...request, delivery_completed }, ctx), { statusCode: 400 });
  }
  await assert.rejects(override.update(1, { ...request, workflow_override: { completed: true } }, ctx), { statusCode: 400 });
  await assert.rejects(override.update(1, { ...request, reason: ' ' }, ctx), { statusCode: 400 });
  await assert.rejects(override.update(1, { ...request, expected_token: undefined }, ctx), { statusCode: 409 });
  for (const actorRole of ['ADMIN', 'SALES', 'CTV', 'NPP', 'MKT']) {
    await assert.rejects(override.update(1, request, { actorId: 1, actorRole }), { statusCode: 403 });
  }
  assert.equal(calls.some(([sql]) => /^(UPDATE|INSERT|DELETE)/.test(sql)), false);
});

test('delivery completion is rolled back when its audit cannot be saved', async t => {
  const { calls, connection } = deliveryFixture(t);
  const query = connection.query;
  connection.query = async (sql, params) => {
    if (sql.startsWith('INSERT INTO charging_station_activity_logs')) throw new Error('Audit unavailable');
    return query(sql, params);
  };
  await assert.rejects(override.update(1, {
    delivery_completed: true, reason: 'Confirm delivery', expected_token: await override.getEditToken(1, connection)
  }, ctx), /Audit unavailable/);
  assert.ok(calls.some(([sql]) => sql === 'rollback'));
  assert.equal(calls.some(([sql]) => sql === 'commit'), false);
});

test('HTTP delivery override uses the existing SUPER_ADMIN-only update route', async t => {
  let role = 'SUPER_ADMIN';
  const updates = [];
  t.mock.method(pool, 'query', async sql => {
    assert.match(sql, /SELECT id, email, role, status, token_version/);
    return [[{ id: 1, email: 'fixture@example.invalid', role, status: 'ACTIVE', token_version: 0 }]];
  });
  t.mock.method(station, 'updateChargingStation', async (id, body, actor) => {
    updates.push({ id, body, actor });
    return { id: Number(id), workflow_override: { delivery_completed: true } };
  });
  process.env.JWT_SECRET ||= 'delivery-test-only-secret';
  const app = require('express')();
  app.use(require('express').json());
  app.use('/api/admin/charging-stations', require('../src/routes/chargingStations'));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const token = require('jsonwebtoken').sign({ id: 1, tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '1m' });
    const body = { delivery_completed: true, expected_token: 'fixture-token', reason: 'Confirm delivery' };
    for (role of ['SUPER_ADMIN', 'ADMIN', 'SALES', 'CTV', 'NPP', 'MKT']) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/charging-stations/1`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      assert.equal(response.status, role === 'SUPER_ADMIN' ? 200 : 403, role);
      assert.equal((await response.json()).success, role === 'SUPER_ADMIN');
    }
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].body, body);
    assert.equal(updates[0].actor.actorRole, 'SUPER_ADMIN');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

const rollbackFixture = t => {
  const access = require('../src/services/chargingStationAccessService');
  const calls = [];
  const portion = { id: 1, stage: 'OPERATING', sub_status: 'ACTIVE', installation_status: 'DONE',
    installation_note: 'Original installation', installation_version: 2,
    acceptance_status: 'PASSED', acceptance_date: '2026-11-12', workflow_version: 5, quantity: 1 };
  const connection = {
    beginTransaction: async () => {},
    commit: async () => calls.push(['commit']),
    rollback: async () => calls.push(['rollback']),
    release: () => {},
    query: async (sql, params) => {
      calls.push([sql, params]);
      if (sql.includes('SELECT * FROM charging_stations')) return [[{ id: 1, status: 'OPERATING', sub_status: 'ACTIVE' }]];
      if (sql.includes('FROM charging_station_deployments') && sql.includes('FOR UPDATE')) return [[portion]];
      if (sql.includes('SELECT we.transport_status')) return [[{ transport_status: 'DELIVERED', return_pending_quantity: 0 }]];
      if (sql.includes('SELECT d.id')) return [[portion]];
      return [[]];
    }
  };
  t.mock.method(pool, 'getConnection', async () => connection);
  t.mock.method(access, 'assertSetup', async () => {});
  t.mock.method(access, 'assertView', async () => {});
  return { calls, portion, connection };
};

test('Setup ADMIN rolls back installed portions without changing ON or previous notes', async t => {
  const { calls } = rollbackFixture(t);
  await deployment.updateInstallation(1, { request_id: 'setup-rollback',
    items: [{ id: 1, status: 'NOT', note: 'Do not replace', expected_version: 2 }] },
  { id: 2, role: 'ADMIN' });
  const update = calls.find(([sql]) => sql.includes('SET installation_status'));
  assert.deepEqual(update[1], ['NOT', 'Original installation', 'OPERATING', 'ACTIVE', 1]);
  assert.equal(calls.some(([sql]) => sql.includes('UPDATE charging_stations')), false);
  assert.ok(calls.some(([sql]) => sql === 'commit'));
});

test('Setup resets passed acceptance while keeping reports, date, ON and installation', async t => {
  const { calls } = rollbackFixture(t);
  await deployment.updatePortion(1, 1, {
    action: 'acceptance-reset', reason: 'Recheck', expected_version: 5, request_id: 'acceptance-rollback'
  }, { id: 2, role: 'ADMIN' });
  const update = calls.find(([sql]) => sql.includes('SET acceptance_status'));
  assert.deepEqual(update[1], ['NOT', true, true, true, 2, 1]);
  assert.doesNotMatch(update[0], /SET stage|stage=|installation_status=/);
  assert.equal(calls.some(([sql]) => sql.includes('DELETE FROM charging_station_acceptance')), false);
  assert.equal(calls.some(([sql]) => sql.includes('UPDATE charging_stations')), false);
});

test('stale acceptance rollback is rejected without writes', async t => {
  const { calls } = rollbackFixture(t);
  await assert.rejects(deployment.updatePortion(1, 1, {
    action: 'acceptance-reset', reason: 'Recheck', expected_version: 4, request_id: 'stale-rollback'
  }, superUser), { statusCode: 409 });
  assert.equal(calls.some(([sql]) => sql.startsWith('UPDATE')), false);
  assert.ok(calls.some(([sql]) => sql === 'rollback'));
});

test('real SQL: overview override, tasks, separate installation, shipment and carrier invariants', {
  skip: process.env.RUN_ON_MANAGEMENT_SQL_TEST !== '1'
}, async t => {
  const admin = await pool.getConnection();
  const [[original]] = await admin.query('SELECT DATABASE() AS name');
  const database = `test_on_management_${Date.now()}`;
  let fixture;
  try {
    await admin.query(`CREATE DATABASE \`${database}\``);
    for (const table of [
      'users', 'station_proposals', 'charging_stations', 'files', 'charging_station_contract_files',
      'charging_station_images', 'charging_station_activity_logs', 'warehouse_exports', 'warehouse_export_items',
      'shipping_carriers', 'charging_station_commitments', 'charging_station_deployments',
      'charging_station_fulfillment_events', 'charging_poles', 'suppliers', 'supplier_charging_poles', 'charging_station_invoices',
      'charging_station_acceptance_documents', 'charging_station_acceptance_images', 'notifications',
      'leads', 'proposal_requests'
    ]) await admin.query(`CREATE TABLE \`${database}\`.\`${table}\` LIKE \`${original.name}\`.\`${table}\``);
    fixture = mysql.createPool({
      host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER,
      password: process.env.DB_PASSWORD, database, charset: 'utf8mb4', connectionLimit: 4
    });
    t.mock.method(pool, 'query', (...args) => fixture.query(...args));
    t.mock.method(pool, 'getConnection', () => fixture.getConnection());
    t.mock.method(require('../src/services/adminProposalService'), 'getProposalWithUser', async () => ({ id: 1 }));
    t.mock.method(require('../src/services/journeySyncService'), 'onStationStatus', async () => {});
    const lifecycle = require('../src/services/proposalLifecycle');
    t.mock.method(lifecycle, 'transitionOnStation', async (connection, id, status) => {
      await connection.query('UPDATE station_proposals SET status=? WHERE id=?', [status, id]);
      return null;
    });
    t.mock.method(lifecycle, 'completeOnStationTransition', async () => {});
    await fixture.query("INSERT INTO users(id,full_name,email,password,role) VALUES(1,'Fixture','fixture@example.invalid','not-a-login','SUPER_ADMIN')");
    await fixture.query("INSERT INTO users(id,full_name,email,password,role,custom_data) VALUES(2,'Setup fixture','setup@example.invalid','not-a-login','SALES',?)",
      [JSON.stringify({ department: 'Phòng Setup và Vận hành' })]);
    await fixture.query("INSERT INTO users(id,full_name,email,password,role,custom_data) VALUES(3,'Back Office fixture','bo@example.invalid','not-a-login','SALES',?)",
      [JSON.stringify({ department: 'Back Office' })]);
    const backOfficeUser = { id: 3, role: 'SALES' };
    await fixture.query(`INSERT INTO station_proposals(id,user_id,latitude,longitude,owner_name,owner_phone,status,custom_data,chot_so_luong_tru)
      VALUES(1,1,10,106,'Fixture','0000000000','DEPLOYING',?,?)`,
    [JSON.stringify({ mo_hinh_dau_tu: 'LK' }), JSON.stringify([{ mo_hinh: 'LK', so_luong: 2, pole_id: 1, loai_tru: 'Fixture DC60' }])]);
    await fixture.query(`INSERT INTO charging_stations(id,proposal_id,ma_tram,status,sub_status,payment_status,deposit_status,fulfillment_review_required)
      VALUES(1,1,'FIXTURE-1','INSTALLING','NOT_INSTALLED','DOING','RECEIVED',1)`);
    await fixture.query("INSERT INTO charging_poles(id,name,charging_type,power_kw,quantity) VALUES(1,'Fixture DC60','DC',60,5)");
    await fixture.query("INSERT INTO suppliers(id,name) VALUES(1,'Fixture supplier')");
    await fixture.query('INSERT INTO supplier_charging_poles(supplier_id,charging_pole_id,quantity) VALUES(1,1,5)');
    await fixture.query("INSERT INTO charging_station_commitments(id,charging_station_id,model,pole_id,quantity,source_key) VALUES(1,1,'LK',1,2,'line:1')");
    await fixture.query("INSERT INTO warehouse_exports(id,exporter_user_id,export_date,charging_station_id,destination_type,transport_status) VALUES(1,1,NOW(),1,'STATION','DELIVERED')");
    await fixture.query('INSERT INTO warehouse_export_items(id,export_id,pole_id,supplier_id,commitment_id,quantity,received_quantity) VALUES(1,1,1,1,1,1,1)');
    await fixture.query("INSERT INTO charging_station_deployments(id,charging_station_id,export_item_id,quantity,stage,sub_status) VALUES(1,1,1,1,'INSTALLING','NOT_INSTALLED')");
    await t.test('overview SQL orders workflow groups before pagination without changing other tabs or scopes', async t => {
      const proposals = require('../src/services/adminProposalService');
      t.mock.method(require('../src/services/dynamicUtils'), 'getFieldDefinitionsByEntity', async () => []);
      const statuses = ['PENDING', 'GRADING', 'DESIGNING', 'APPROVED',
        'CANCELLED', 'ARCHIVED', 'PAUSED', 'REJECTED', 'CONTRACT_FAILED'];
      for (let index = 0; index < statuses.length; index++) {
        const id = index + 11;
        const created = index < 4 ? `2026-01-0${index === 2 ? 2 : index + 1}` : `2026-02-0${index - 3}`;
        await fixture.query(`INSERT INTO station_proposals
          (id,user_id,latitude,longitude,owner_name,owner_phone,status,custom_data,created_at)
          VALUES(?,?,10,106,?,'0000000000',?,JSON_OBJECT(),?)`,
        [id, index === 3 ? 3 : 1, `SORT-${id}`, statuses[index], `${created} 00:00:00`]);
        const cancelled = [11, 19].includes(id);
        const updated = { 11: 9, 12: 2, 13: 2, 14: 1, 15: 5, 16: 6, 17: 7, 18: 8, 19: 10 }[id];
        await fixture.query(`INSERT INTO charging_stations
          (id,proposal_id,ma_tram,status,sub_status,updated_at)
          VALUES(?,?,?,?,?,?)`, [id, id, `SORT-${id}`,
          cancelled ? 'CANCELLED' : id === 14 ? 'OPERATING' : 'ONBOARDING',
          id === 14 ? 'ACTIVE' : null, `2026-03-${String(updated).padStart(2, '0')} 00:00:00`]);
      }
      const proposalList = (page, extra = {}, scope = {}) => proposals.getAllProposals(
        '', 'SORT-', page, 3, scope, '', null, extra);
      const proposalPages = [];
      for (let page = 1; page <= 3; page++) {
        const result = await proposalList(page, { prioritizeWorkflow: true });
        assert.deepEqual(result.pagination, { page, limit: 3, total: 9, totalPages: 3 });
        proposalPages.push(result.proposals.map(row => row.id));
      }
      assert.deepEqual(proposalPages, [[14, 13, 12], [11, 19, 18], [17, 16, 15]]);
      assert.equal(new Set(proposalPages.flat()).size, 9);
      assert.deepEqual((await proposalList(1)).proposals.map(row => row.id), [19, 18, 17]);
      assert.deepEqual((await proposalList(1, { prioritizeWorkflow: true }, { role: 'CTV', userId: 1 }))
        .proposals.map(row => row.id), [13, 12, 11]);
      assert.deepEqual((await proposalList(1, { prioritizeWorkflow: true, statuses: ['CANCELLED', 'ARCHIVED'] }))
        .proposals.map(row => row.id), [16, 15]);
      const list = (page, options = {}) => station.listChargingStations({
        stage: 'thong-tin-chung', tab: 'all', search: 'SORT-', page, limit: 3, user: superUser, ...options
      });
      const stationPages = [];
      for (let page = 1; page <= 3; page++) {
        const result = await list(page);
        assert.deepEqual(result.pagination, { page, limit: 3, total: 9, totalPages: 3 });
        stationPages.push(result.items.map(row => row.id));
      }
      assert.deepEqual(stationPages, [[18, 17, 16], [15, 13, 12], [14, 19, 11]]);
      assert.equal(new Set(stationPages.flat()).size, 9);
      assert.deepEqual((await list(1, { stage: '' })).items.map(row => row.id), [18, 17, 16]);
      assert.deepEqual((await list(1, { tab: 'need' })).items.map(row => row.id), [18, 17, 16]);
      assert.deepEqual((await list(1, { tab: 'completed' })).items.map(row => row.id), [14]);
      assert.deepEqual((await list(1, { stage: 'giao-tru' })).items.map(row => row.id), [19, 11, 18]);
      const own = await list(1, { user: { id: 1, role: 'CTV' } });
      assert.deepEqual(own.items.map(row => row.id), [18, 17, 16]);
      assert.equal(own.pagination.total, 8);
      await fixture.query('DELETE FROM charging_stations WHERE id BETWEEN 11 AND 19');
      await fixture.query('DELETE FROM station_proposals WHERE id BETWEEN 11 AND 19');
    });
    const unchangedTables = ['supplier_charging_poles', 'charging_poles', 'charging_station_invoices',
      'charging_station_commitments', 'station_proposals'];
    const snapshot = async () => Promise.all(unchangedTables.map(async table =>
      (await fixture.query(`SELECT * FROM ${table} ORDER BY ${table === 'supplier_charging_poles' ? 'supplier_id,charging_pole_id' : 'id'}`))[0]));
    const originalData = await snapshot();
    const otherTasks = async () => {
      const keys = ['khoi-tao-hop-dong', 'xay-dung-ha-tang', 'lap-tru', 'nghiem-thu', 'on-tram', 'tai-chinh'];
      return (await fixture.query(`SELECT ${keys.map((key, index) =>
        `${work.stageFilters[key].need} AS task_${index}`).join(',')}
        FROM charging_stations cs JOIN station_proposals p ON p.id=cs.proposal_id WHERE cs.id=1`))[0];
    };
    const beforeTasks = await otherTasks();
    const [[oldExport]] = await fixture.query('SELECT * FROM warehouse_exports WHERE id=1');
    const [[oldItem]] = await fixture.query('SELECT * FROM warehouse_export_items WHERE id=1');
    const [[oldPortion]] = await fixture.query('SELECT * FROM charging_station_deployments WHERE id=1');
    await override.update(1, { delivery_completed: true, reason: 'Manual delivery only',
      expected_token: await override.getEditToken(1) }, ctx);
    const [[deliveryDone]] = await fixture.query('SELECT * FROM charging_stations WHERE id=1');
    assert.equal(deliveryDone.workflow_override.delivery_completed, true);
    assert.equal(deliveryDone.status, 'INSTALLING');
    assert.equal(deliveryDone.fulfillment_review_required, 0);
    assert.deepEqual((await fixture.query('SELECT * FROM warehouse_exports WHERE id=1'))[0][0], oldExport);
    assert.deepEqual((await fixture.query('SELECT * FROM warehouse_export_items WHERE id=1'))[0][0], oldItem);
    assert.deepEqual((await fixture.query('SELECT * FROM charging_station_deployments WHERE id=1'))[0][0], oldPortion);
    const [[directHeader]] = await fixture.query('SELECT * FROM warehouse_exports WHERE id<>1');
    assert.equal(directHeader.transport_status, 'DELIVERED');
    assert.equal(directHeader.historical_import, 0);
    const directPortions = (await deployment.getDeployments(1)).filter(row => row.id !== 1);
    assert.equal(directPortions.length, 1);
    assert.equal(directPortions[0].quantity, 1, 'only the missing quantity is added');
    assert.equal(directPortions[0].installation_status, 'NOT');
    assert.deepEqual(await snapshot(), originalData);
    assert.deepEqual(await otherTasks(), beforeTasks);
    const [[countsBeforeRepeat]] = await fixture.query('SELECT COUNT(*) AS n FROM charging_station_deployments WHERE charging_station_id=1');
    await override.update(1, { delivery_completed: true, reason: 'Repeat confirmed delivery',
      expected_token: await override.getEditToken(1) }, ctx);
    assert.equal((await fixture.query('SELECT COUNT(*) AS n FROM charging_station_deployments WHERE charging_station_id=1'))[0][0].n, countsBeforeRepeat.n);
    for (const status of ['ONBOARDING', 'DELIVERING', 'INSTALLING']) {
      await fixture.query('UPDATE charging_stations SET status=? WHERE id=1', [status]);
      const { expressions, params } = await work.actionable(superUser);
      const [[tasks]] = await fixture.query(`SELECT ${expressions.delivery} AS badge,
        ${work.stageFilters['giao-tru'].need} AS needed, ${work.stageFilters['giao-tru'].completed} AS completed
        FROM charging_stations cs JOIN station_proposals p ON p.id=cs.proposal_id WHERE cs.id=1`, params);
      assert.equal(Number(tasks.badge), 0, status);
      assert.equal(Number(tasks.needed), 0, status);
      assert.equal(Number(tasks.completed), 1, status);
    }
    await station.changeStatus(1, { to_status: 'ONBOARDING', reason: 'Preserve delivery flag',
      expected_token: await override.getEditToken(1) }, ctx);
    assert.equal((await fixture.query('SELECT workflow_override FROM charging_stations WHERE id=1'))[0][0].workflow_override.delivery_completed, true);
    await fixture.query('DELETE FROM charging_station_deployments WHERE export_item_id IN (SELECT id FROM warehouse_export_items WHERE export_id=?)', [directHeader.id]);
    await fixture.query('DELETE FROM warehouse_export_items WHERE export_id=?', [directHeader.id]);
    await fixture.query('DELETE FROM warehouse_exports WHERE id=?', [directHeader.id]);
    await fixture.query("DELETE FROM charging_station_fulfillment_events WHERE request_id=?", [`direct-delivery:${directHeader.id}`]);
    await fixture.query("UPDATE charging_stations SET status='INSTALLING',fulfillment_review_required=1 WHERE id=1");

    await t.test('early delivery enters Back Office and SUPER_ADMIN queues; direct receipt opens installation and return preserves inventory', async () => {
      await fixture.query(`INSERT INTO station_proposals(id,user_id,latitude,longitude,owner_name,owner_phone,status,custom_data,chot_so_luong_tru)
        SELECT 2,user_id,latitude,longitude,owner_name,owner_phone,status,custom_data,chot_so_luong_tru FROM station_proposals WHERE id=1`);
      await fixture.query(`INSERT INTO charging_stations(id,proposal_id,ma_tram,status,workflow_override)
        VALUES(2,2,'FIXTURE-2','ONBOARDING',JSON_OBJECT('delivery_completed',true))`);
      const task = async (viewer = backOfficeUser) => {
        const { expressions, params } = await work.actionable(viewer);
        const filter = await work.getFilter('giao-tru', 'need', viewer);
        const [[visible]] = await fixture.query(`SELECT COUNT(*) AS n FROM charging_stations cs
          JOIN station_proposals p ON p.id=cs.proposal_id WHERE cs.id=2 AND (${filter.sql})`, filter.params);
        const { expressions: setupExpressions, params: setupParams } = await work.actionable(superUser);
        assert.deepEqual(setupParams, []);
        const [[row]] = await fixture.query(`SELECT ${expressions.delivery} AS delivery,${setupExpressions.installation} AS installation
          FROM charging_stations cs JOIN station_proposals p ON p.id=cs.proposal_id WHERE cs.id=2`, params);
        assert.equal(Number(visible.n), Number(row.delivery), 'need tab and badge use the same criteria');
        return row;
      };
      const early = { desired_delivery_date: '2027-01-15', reason: 'Ship before infrastructure', accept_missing: true };
      await fixture.query(`UPDATE station_proposals SET custom_data=JSON_SET(custom_data,'$.nguoi_phu_trach',JSON_OBJECT('id',2)) WHERE id=2`);
      const assignee = { id: 2, role: 'SALES' };
      const assignedActor = { ...ctx, actorId: 2, actorRole: 'SALES' };
      assert.equal(Number((await task()).delivery), 0);
      await assert.rejects(station.requestEarlyDelivery(2, early, assignee, assignedActor), { statusCode: 409 });
      await fixture.query("UPDATE charging_stations SET contract_status='DONE',infra_power_status='DONE',payment_status='DOING',deposit_status='RECEIVED' WHERE id=2");
      assert.equal(Number((await task()).delivery), 1, 'ready workflow counts even before parent stage synchronizes');
      assert.equal(Number((await task(superUser)).delivery), 1);
      await fixture.query("UPDATE charging_stations SET status='DELIVERING',infra_power_status='NOT' WHERE id=2");
      assert.equal(Number((await task()).delivery), 0, 'parent status is not evidence of early delivery');
      assert.equal(Number((await task(superUser)).delivery), 0);
      await fixture.query("UPDATE charging_stations SET status='ONBOARDING' WHERE id=2");
      await assert.rejects(station.requestEarlyDelivery(2, early, backOfficeUser, { ...ctx, actorId: 3, actorRole: 'SALES' }), { statusCode: 403 });
      await station.requestEarlyDelivery(2, early, assignee, assignedActor);
      await assert.rejects(station.requestEarlyDelivery(2, early, assignee, assignedActor), { statusCode: 409 });
      assert.equal(Number((await task()).delivery), 1, 'saved early request counts despite missing prerequisites and old override marker');
      assert.equal(Number((await task(assignee)).delivery), 0);
      assert.equal(Number((await task(superUser)).delivery), 1);
      await override.update(2, { delivery_completed: true, reason: 'Upgrade old delivery marker',
        expected_token: await override.getEditToken(2) }, ctx);
      assert.deepEqual(Object.fromEntries(Object.entries(await task()).map(([key, value]) => [key, Number(value)])),
        { delivery: 0, installation: 1 });
      let portions = await deployment.getDeployments(2);
      assert.equal(portions.length, 1);
      assert.equal(portions[0].quantity, 2);
      const exportId = portions[0].export_id;
      await shipping.updateShipmentStatus(2, exportId, { request_id: 'direct-return-request', status: 'RETURN_PENDING',
        expected_status: 'DELIVERED', reason: 'Return uninstalled direct receipt' }, superUser);
      await shipping.updateShipmentStatus(2, exportId, { request_id: 'direct-return-confirm', status: 'RETURNED',
        expected_status: 'RETURN_PENDING', reason: 'Return uninstalled direct receipt' }, superUser);
      assert.equal((await fixture.query('SELECT quantity FROM supplier_charging_poles'))[0][0].quantity, 5);
      assert.equal((await fixture.query('SELECT quantity FROM charging_poles'))[0][0].quantity, 5);
      assert.equal(Number((await task()).delivery), 1, 'return reopens delivery despite source marker');
      await override.update(2, { delivery_completed: true, reason: 'Deliver again without changing stock',
        expected_token: await override.getEditToken(2) }, ctx);
      portions = await deployment.getDeployments(2);
      assert.equal(portions.length, 1);
      await deployment.updateInstallation(2, { request_id: 'direct-installation-start',
        items: [{ id: portions[0].id, status: 'DOING', expected_version: 0, note: 'Start direct receipt installation' }] }, superUser);
      portions = await deployment.getDeployments(2);
      assert.equal(portions[0].installation_status, 'DOING');
      await deployment.updateInstallation(2, { request_id: 'direct-installation-complete',
        items: [{ id: portions[0].id, status: 'DONE', expected_version: 1, note: 'Installed direct receipt' }] }, superUser);
      assert.equal(Number((await task()).installation), 0);
      assert.equal((await fixture.query('SELECT quantity FROM supplier_charging_poles'))[0][0].quantity, 5);
      assert.equal((await fixture.query('SELECT quantity FROM charging_poles'))[0][0].quantity, 5);
      assert.equal((await fixture.query('SELECT COUNT(*) AS n FROM charging_station_invoices'))[0][0].n, 0);
    });

    const token = await override.getEditToken(1);
    const before = (await fixture.query('SELECT * FROM warehouse_export_items'))[0];
    await station.changeStatus(1, { to_status: 'OPERATING', cms_station_code: 'CMS-1', on_date: '2026-11-13',
      reason: 'Fixture override', expected_token: token }, ctx);
    const [[activated]] = await fixture.query('SELECT * FROM charging_stations WHERE id=1');
    assert.equal(activated.workflow_override.completed, true);
    assert.equal(activated.workflow_override.delivery_completed, true);
    assert.equal(activated.contract_status, 'DONE');
    assert.equal(activated.infra_power_status, 'DONE');
    assert.equal(activated.infra_site_status, 'DONE');
    assert.equal(activated.payment_status, 'DOING');
    assert.equal(activated.deposit_status, 'RECEIVED');
    assert.equal(activated.fulfillment_review_required, 1);
    await fixture.query("UPDATE charging_stations SET workflow_override=JSON_OBJECT('delivery_completed',true) WHERE id=1");
    await station.changeStatus(1, { to_status: 'OPERATING', cms_station_code: 'CMS-1', on_date: '2026-11-13',
      reason: 'Finish ON after delivery-only override', expected_token: await override.getEditToken(1) }, ctx);
    assert.equal((await fixture.query('SELECT workflow_override FROM charging_stations WHERE id=1'))[0][0].workflow_override.completed, true);
    assert.deepEqual((await fixture.query('SELECT * FROM warehouse_export_items'))[0], before);
    assert.equal((await fixture.query('SELECT quantity FROM supplier_charging_poles'))[0][0].quantity, 5);
    for (const stage of ['giao-tru', 'lap-tru', 'nghiem-thu', 'on-tram']) {
      const [[row]] = await fixture.query(`SELECT ${work.stageFilters[stage].need} AS needed,
        ${work.stageFilters[stage].completed} AS completed FROM charging_stations cs JOIN station_proposals p ON p.id=cs.proposal_id WHERE cs.id=1`);
      assert.equal(Number(row.needed), 0, stage);
      assert.equal(Number(row.completed), 1, stage);
    }
    const [[finance]] = await fixture.query(`SELECT ${work.stageFilters['tai-chinh'].need} AS needed FROM charging_stations cs WHERE id=1`);
    assert.equal(Number(finance.needed), 1);
    await assert.rejects(override.update(1, { expected_token: token, reason: 'Stale update', note: 'Wrong' }, ctx), { statusCode: 409 });
    await override.update(1, { expected_token: await override.getEditToken(1), reason: 'Finance correction',
      payment_status: 'DONE', deposit_status: 'REFUNDED', note: 'Edited' }, ctx);
    assert.equal((await fixture.query('SELECT COUNT(*) AS n FROM charging_station_invoices'))[0][0].n, 0);

    await fixture.query("UPDATE charging_stations SET workflow_override=NULL,fulfillment_review_required=0,status='INSTALLING',sub_status='NOT_INSTALLED' WHERE id=1");
    const setupUser = { id: 2, role: 'SALES', custom_data: { department: 'Phòng Setup và Vận hành' } };
    await assert.rejects(deployment.updateInstallation(1, { request_id: 'invalid-install',
      items: [{ id: 1, status: 'INVALID', note: '', expected_version: 0 }] }, setupUser), { statusCode: 400 });
    const request = { request_id: 'install-1', items: [{ id: 1, status: 'DONE', note: 'Installed', expected_version: 0 }] };
    await deployment.updateInstallation(1, request, superUser);
    await deployment.updateInstallation(1, request, superUser);
    assert.equal((await fixture.query("SELECT COUNT(*) AS n FROM charging_station_activity_logs WHERE charging_station_id=1 AND action='installation_updated'"))[0][0].n, 1);
    const [[partial]] = await fixture.query(`SELECT ${work.stageFilters['lap-tru'].completed} AS completed FROM charging_stations cs JOIN station_proposals p ON p.id=cs.proposal_id WHERE cs.id=1`);
    assert.equal(Number(partial.completed), 0, 'not complete until all committed quantity installed');
    await fixture.query("UPDATE charging_station_deployments SET stage='OPERATING',sub_status='ACTIVE',on_date='2026-11-13',acceptance_date='2026-11-12' WHERE id=1");
    await deployment.updateInstallation(1, { request_id: 'install-back', items: [{ id: 1, status: 'NOT', note: 'Adjustment', expected_version: 1 }] }, superUser);
    const [[preserved]] = await fixture.query('SELECT * FROM charging_station_deployments WHERE id=1');
    assert.equal(preserved.stage, 'OPERATING');
    assert.equal(preserved.sub_status, 'ACTIVE');
    assert.ok(preserved.acceptance_date);
    assert.ok(preserved.on_date);
    assert.equal(preserved.installation_status, 'NOT');
    await assert.rejects(deployment.updateInstallation(1, { request_id: 'invalid-again',
      items: [{ id: 1, status: 'INVALID', note: '', expected_version: 2 }] }, setupUser), { statusCode: 400 });
    await assert.rejects(deployment.updateInstallation(1, { request_id: 'admin-install',
      items: [{ id: 1, status: 'DOING', note: '', expected_version: 2 }] }, { id: 1, role: 'ADMIN' }), { statusCode: 403 });
    await assert.rejects(deployment.updateInstallation(1, { request_id: 'stale-install',
      items: [{ id: 1, status: 'DONE', note: '', expected_version: 1 }] }, superUser), { statusCode: 409 });
    await assert.rejects(deployment.updateInstallation(1, { request_id: 'atomic-install', items: [
      { id: 1, status: 'DOING', note: '', expected_version: 2 },
      { id: 999, status: 'DOING', note: '', expected_version: 0 }
    ] }, superUser), { statusCode: 409 });
    assert.equal((await fixture.query('SELECT installation_status FROM charging_station_deployments WHERE id=1'))[0][0].installation_status, 'NOT');

    const carrier = await carriers.save(null, { name: 'Fixture carrier', note: '', active: true }, superUser);
    const requestShipment = { carrier_id: carrier.id, export_date: '2027-01-01', request_id: 'shipment-1',
      items: [{ pole_id: 1, supplier_id: 1, quantity: 1 }] };
    const first = await shipping.createExport(1, requestShipment, superUser);
    const second = await shipping.createExport(1, requestShipment, superUser);
    assert.equal(first.id, second.id);
    assert.equal(first.carrier, 'Fixture carrier');
    assert.equal(new Date(first.export_date).getFullYear(), 2027);
    assert.equal((await fixture.query('SELECT quantity FROM supplier_charging_poles'))[0][0].quantity, 4);
    await carriers.save(carrier.id, { name: 'Renamed', note: '', active: false }, superUser);
    assert.equal((await fixture.query('SELECT carrier FROM warehouse_exports WHERE id=?', [first.id]))[0][0].carrier, 'Fixture carrier');
    assert.equal((await carriers.list(superUser, true)).length, 0);
    await assert.rejects(carriers.save(null, { name: 'Denied', active: true }, { role: 'ADMIN' }), { statusCode: 403 });
    await fixture.query('ALTER TABLE warehouse_exports ADD CONSTRAINT fk_fixture_carrier FOREIGN KEY(carrier_id) REFERENCES shipping_carriers(id)');
    await assert.rejects(carriers.remove(carrier.id, superUser), { statusCode: 409 });
    const unused = await carriers.save(null, { name: 'Unused carrier', note: '', active: true }, superUser);
    await carriers.remove(unused.id, superUser);
    await station.changeStatus(1, { to_status: 'ONBOARDING', reason: 'Back to onboarding',
      expected_token: await override.getEditToken(1) }, ctx);
    assert.equal((await fixture.query('SELECT stage FROM charging_station_deployments WHERE id=1'))[0][0].stage, 'OPERATING');
    await station.changeStatus(1, { to_status: 'CANCELLED', reason: 'Cancel fixture',
      expected_token: await override.getEditToken(1) }, ctx);
    assert.equal((await fixture.query('SELECT status FROM station_proposals WHERE id=1'))[0][0].status, 'ARCHIVED');
    await station.restoreOnStation(1, superUser, ctx);
    assert.equal((await fixture.query('SELECT status FROM charging_stations WHERE id=1'))[0][0].status, 'ONBOARDING');
  } finally {
    t.mock.restoreAll();
    if (fixture) await fixture.end();
    await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    admin.release();
  }
});
