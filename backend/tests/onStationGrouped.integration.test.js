const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const pool = require('../src/utils/db');
const shipping = require('../src/services/chargingStationShippingService');
const deployment = require('../src/services/chargingStationDeploymentService');
const completion = require('../src/services/chargingStationCompletionService');
const work = require('../src/services/chargingStationWorkService');

test.after(() => pool.end());
test('real SQL: whole received-shipment returns and atomic shared acceptance preserve stock and history', {
  skip: process.env.RUN_ON_GROUPED_SQL_TEST !== '1'
}, async t => {
  const admin = await pool.getConnection();
  const [[original]] = await admin.query('SELECT DATABASE() AS name');
  const database = `test_on_grouped_${Date.now()}`;
  let fixture;
  const bo = { id: 3, role: 'ADMIN' };
  const setup = { id: 2, role: 'ADMIN' };
  try {
    await admin.query(`CREATE DATABASE \`${database}\``);
    for (const table of [
      'users', 'station_proposals', 'charging_stations', 'files', 'notifications', 'proposal_document_recoveries',
      'charging_station_activity_logs', 'warehouse_exports', 'warehouse_export_items',
      'charging_station_commitments', 'charging_station_deployments', 'charging_station_fulfillment_events',
      'charging_poles', 'suppliers', 'supplier_charging_poles',
      'charging_station_acceptance_documents', 'charging_station_acceptance_images'
    ]) await admin.query(`CREATE TABLE \`${database}\`.\`${table}\` LIKE \`${original.name}\`.\`${table}\``);
    fixture = mysql.createPool({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER, password: process.env.DB_PASSWORD, database, charset: 'utf8mb4', connectionLimit: 5 });
    t.mock.method(pool, 'query', (...args) => fixture.query(...args));
    t.mock.method(pool, 'getConnection', () => fixture.getConnection());
    const connection = await fixture.getConnection();
    try {
      const migration = fs.readFileSync(path.join(__dirname, '../../database/239-on-station-whole-shipment-returns.sql'), 'utf8');
      for (let run = 0; run < 2; run++) {
        for (const sql of migration.split(';').map(value => value.trim()).filter(Boolean)) await connection.query(sql);
      }
    } finally { connection.release(); }
    for (const [id, department] of [[1, ''], [2, 'Phòng Setup và Vận hành'], [3, 'Phòng Back Office'], [4, 'Phòng khác']]) {
      await fixture.query('INSERT INTO users(id,full_name,email,password,role,custom_data) VALUES(?,?,?,?,?,?)',
        [id, `Fixture ${id}`, `fixture${id}@example.invalid`, 'not-a-login', id === 1 ? 'SUPER_ADMIN' : 'ADMIN', JSON.stringify({ department })]);
    }
    await fixture.query(`INSERT INTO station_proposals(id,user_id,latitude,longitude,owner_name,owner_phone,status,custom_data,chot_so_luong_tru)
      VALUES(1,1,10,106,'Fixture','0000000000','DEPLOYING',?,?)`,
    [JSON.stringify({ mo_hinh_dau_tu: 'LK' }), JSON.stringify([
      { mo_hinh: 'LK', so_luong: 2, pole_id: 1, loai_tru: 'Fixture DC60' },
      { mo_hinh: 'LK', so_luong: 1, pole_id: 2, loai_tru: 'Fixture DC120' }
    ])]);
    await fixture.query(`INSERT INTO charging_stations(id,proposal_id,ma_tram,status,sub_status,contract_status,
      infra_power_status,infra_site_status,payment_status,deposit_status)
      VALUES(1,1,'GROUPED-1','DELIVERING','NOT_DELIVERED','DONE','DONE','DONE','DOING','RECEIVED')`);
    await fixture.query("INSERT INTO charging_poles(id,name,charging_type,power_kw,quantity) VALUES(1,'Fixture DC60','DC',60,3),(2,'Fixture DC120','DC',120,4)");
    await fixture.query("INSERT INTO suppliers(id,name) VALUES(1,'Fixture supplier')");
    await fixture.query('INSERT INTO supplier_charging_poles(supplier_id,charging_pole_id,quantity) VALUES(1,1,3),(1,2,4)');
    await fixture.query(`INSERT INTO charging_station_commitments(id,charging_station_id,model,pole_id,quantity,source_key)
      VALUES(1,1,'LK',1,2,'line:1'),(2,1,'LK',2,1,'line:2')`);
    await fixture.query(`INSERT INTO warehouse_exports(id,exporter_user_id,export_date,charging_station_id,destination_type,transport_status)
      VALUES(1,3,NOW(),1,'STATION','SHIPPING'),(2,3,NOW(),1,'STATION','SHIPPING')`);
    await fixture.query(`INSERT INTO warehouse_export_items(id,export_id,pole_id,supplier_id,commitment_id,quantity)
      VALUES(1,1,1,1,1,1),(2,1,2,1,2,1),(3,2,1,1,1,1)`);
    const receive = { status: 'DELIVERED', expected_status: 'SHIPPING', request_id: 'receive-all' };
    await shipping.updateShipmentStatus(1, 1, receive, bo);
    await shipping.updateShipmentStatus(1, 1, receive, bo);
    assert.equal((await deployment.getDeployments(1)).length, 2, 'retry does not create duplicate deployments');
    let active = await deployment.getDeployments(1);
    await shipping.updateShipmentStatus(1, 1, { status: 'RETURN_PENDING', expected_status: 'DELIVERED', reason: 'Wrong order', request_id: 'return-all' }, bo);
    const [[pendingTasks]] = await fixture.query(`SELECT ${work.stageFilters['lap-tru'].need} AS needed
      FROM charging_stations cs JOIN station_proposals p ON p.id=cs.proposal_id WHERE cs.id=1`);
    assert.equal(Number(pendingTasks.needed), 0, 'pending returns cannot create actionable installation tasks');
    await assert.rejects(deployment.updateInstallation(1, { request_id: 'blocked-install',
      items: [{ id: Number(active[0].id), status: 'DOING', expected_version: active[0].installation_version }] }, setup), { statusCode: 409 });
    const confirm = { status: 'RETURNED', expected_status: 'RETURN_PENDING', reason: 'Stock received', request_id: 'confirm-all' };
    await Promise.all([shipping.updateShipmentStatus(1, 1, confirm, bo), shipping.updateShipmentStatus(1, 1, confirm, bo)]);
    const [stock] = await fixture.query('SELECT quantity FROM supplier_charging_poles ORDER BY charging_pole_id');
    assert.deepEqual(stock.map(row => row.quantity), [4, 5], 'concurrent retry credits each supplier/pole once');
    const [[returned]] = await fixture.query('SELECT COUNT(*) AS n FROM charging_station_deployments WHERE returned_at IS NOT NULL');
    assert.equal(returned.n, 2, 'returned portions remain in history');
    assert.equal((await deployment.getDeployments(1)).length, 0);
    const summary = await shipping.getSummary(1);
    assert.equal(summary.totals.received, 0);
    assert.equal(summary.totals.remaining, 2);
    const [[tasks]] = await fixture.query(`SELECT ${work.stageFilters['giao-tru'].need} AS delivery,
      ${work.stageFilters['lap-tru'].need} AS installation FROM charging_stations cs JOIN station_proposals p ON p.id=cs.proposal_id WHERE cs.id=1`);
    assert.equal(Number(tasks.delivery), 1);
    assert.equal(Number(tasks.installation), 0);
    await assert.rejects(shipping.updateShipmentStatus(1, 1, { ...receive, request_id: 'cannot-receive-return' }, bo), { statusCode: 409 });
    await shipping.updateShipmentStatus(1, 2, { ...receive, request_id: 'receive-second' }, bo);
    await fixture.query(`INSERT INTO warehouse_exports(id,exporter_user_id,export_date,charging_station_id,destination_type,transport_status)
      VALUES(3,3,NOW(),1,'STATION','SHIPPING')`);
    await fixture.query(`INSERT INTO warehouse_export_items(id,export_id,pole_id,supplier_id,commitment_id,quantity)
      VALUES(4,3,1,1,1,1),(5,3,2,1,2,1)`);
    await fixture.query('UPDATE supplier_charging_poles SET quantity=quantity-1 WHERE supplier_id=1');
    await fixture.query('UPDATE charging_poles SET quantity=quantity-1');
    await shipping.updateShipmentStatus(1, 3, { ...receive, request_id: 'receive-replacement' }, bo);
    active = await deployment.getDeployments(1);
    await deployment.updateInstallation(1, { request_id: 'install-group',
      items: active.map(row => ({ id: Number(row.id), expected_version: row.installation_version, status: 'DONE' })) }, setup);
    active = await deployment.getDeployments(1);
    for (let id = 1; id <= 6; id++) {
      await fixture.query(`INSERT INTO files(id,original_name,storage_key,mime_type,size,uploaded_by,status)
        VALUES(?,?,?,?,1024,2,'active')`, [id, `fixture${id}`, `fixture-grouped-${id}`, [1, 4].includes(id) ? 'application/pdf' : 'image/png']);
    }
    const payload = { action: 'acceptance-passed', request_id: 'shared-acceptance', reason: 'All checked',
      items: active.map(row => ({ id: Number(row.id), expected_version: row.workflow_version })),
      equipment: { file_id: 1, image_ids: [2, 3] }, infrastructure: { file_id: 4, image_ids: [5, 6] } };
    const stale = { ...payload, request_id: 'stale-group', items: payload.items.map((row, i) => ({ ...row, expected_version: i === 1 ? 999 : row.expected_version })) };
    await assert.rejects(completion.updateAcceptanceBatch(1, stale, setup), { statusCode: 409 });
    assert.ok((await deployment.getDeployments(1)).every(row => row.acceptance_status === 'NOT'));
    await assert.rejects(completion.updateAcceptanceBatch(1, payload, { id: 4, role: 'ADMIN' }), { statusCode: 403 });
    await completion.updateAcceptanceBatch(1, payload, setup);
    await completion.updateAcceptanceBatch(1, payload, setup);
    const [[logs]] = await fixture.query("SELECT COUNT(*) AS n FROM charging_station_activity_logs WHERE action='portion_acceptance_passed' AND actor_id=2 AND reject_reason='All checked'");
    assert.equal(logs.n, 3, 'one historical log per portion, without duplicate retry logs');
    active = await deployment.getDeployments(1);
    assert.ok(active.every(row => row.acceptance_status === 'PASSED' && row.acceptance_reports.EQUIPMENT.file.id === 1
      && row.acceptance_reports.INFRASTRUCTURE.images.length === 2));
    const reset = { action: 'acceptance-reset', reason: 'Recheck', request_id: 'reset-group',
      items: active.map(row => ({ id: Number(row.id), expected_version: row.workflow_version })) };
    await completion.updateAcceptanceBatch(1, reset, setup);
    assert.ok((await deployment.getDeployments(1)).every(row => row.acceptance_status === 'NOT'
      && row.acceptance_reports.EQUIPMENT.file.id === 1), 'reset keeps shared documents');
    await deployment.updateInstallation(1, { request_id: 'rollback-install',
      items: active.map(row => ({ id: Number(row.id), expected_version: row.installation_version, status: 'NOT' })) }, setup);
    await assert.rejects(shipping.updateShipmentStatus(1, 2, { status: 'RETURN_PENDING', expected_status: 'DELIVERED',
      request_id: 'cannot-return-installed', reason: 'Not allowed' }, bo), { statusCode: 409 });
  } finally {
    t.mock.restoreAll();
    if (fixture) await fixture.end();
    await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    admin.release();
  }
});
