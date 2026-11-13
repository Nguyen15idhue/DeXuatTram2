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
      'charging_station_fulfillment_events', 'charging_poles', 'suppliers', 'supplier_charging_poles', 'charging_station_invoices'
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
    const token = await override.getEditToken(1);
    const before = (await fixture.query('SELECT * FROM warehouse_export_items'))[0];
    await station.changeStatus(1, { to_status: 'OPERATING', cms_station_code: 'CMS-1', on_date: '2026-11-13',
      reason: 'Fixture override', expected_token: token }, ctx);
    const [[activated]] = await fixture.query('SELECT * FROM charging_stations WHERE id=1');
    assert.equal(activated.workflow_override.completed, true);
    assert.equal(activated.contract_status, 'DONE');
    assert.equal(activated.infra_power_status, 'DONE');
    assert.equal(activated.infra_site_status, 'DONE');
    assert.equal(activated.payment_status, 'DOING');
    assert.equal(activated.deposit_status, 'RECEIVED');
    assert.equal(activated.fulfillment_review_required, 1);
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
    await assert.rejects(deployment.updateInstallation(1, { request_id: 'skip-install',
      items: [{ id: 1, status: 'DONE', note: '', expected_version: 0 }] }, setupUser), { statusCode: 403 });
    const request = { request_id: 'install-1', items: [{ id: 1, status: 'DONE', note: 'Installed', expected_version: 0 }] };
    await deployment.updateInstallation(1, request, superUser);
    await deployment.updateInstallation(1, request, superUser);
    assert.equal((await fixture.query("SELECT COUNT(*) AS n FROM charging_station_activity_logs WHERE action='installation_updated'"))[0][0].n, 1);
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
    await assert.rejects(deployment.updateInstallation(1, { request_id: 'skip-again',
      items: [{ id: 1, status: 'DONE', note: '', expected_version: 2 }] }, setupUser), { statusCode: 403 });
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
