const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const pool = require('../src/utils/db');
const shipping = require('../src/services/chargingStation/chargingStationShippingService.js');
const deployment = require('../src/services/chargingStation/chargingStationDeploymentService.js');
const completion = require('../src/services/chargingStation/chargingStationCompletionService.js');
const work = require('../src/services/chargingStation/chargingStationWorkService.js');
const access = require('../src/services/chargingStation/chargingStationAccessService.js');
const stations = require('../src/services/chargingStation/chargingStationService.js');

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
      'charging_station_acceptance_documents', 'charging_station_acceptance_images',
      'charging_station_contract_files', 'charging_station_images', 'charging_station_invoices'
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
      const [[column]] = await connection.query(`SELECT COUNT(*) AS n FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='charging_station_deployments' AND COLUMN_NAME='on_quantity'`);
      if (column.n) {
        const [[constraint]] = await connection.query(`SELECT COUNT(*) AS n FROM information_schema.TABLE_CONSTRAINTS
          WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='charging_station_deployments' AND CONSTRAINT_NAME='chk_deployment_on_quantity'`);
        if (constraint.n) await connection.query('ALTER TABLE charging_station_deployments DROP CHECK chk_deployment_on_quantity');
        await connection.query('ALTER TABLE charging_station_deployments DROP COLUMN on_quantity');
      }
      await connection.query(`INSERT INTO charging_station_deployments(id,charging_station_id,export_item_id,quantity,stage,on_date)
        VALUES(900,900,900,3,'OPERATING','2026-11-10')`);
      const numericMigration = fs.readFileSync(path.join(__dirname, '../../database/240-on-station-numeric-on-quantity.sql'), 'utf8');
      const applyNumericMigration = async () => {
        for (const sql of numericMigration.split(';').map(value => value.trim()).filter(Boolean)) await connection.query(sql);
      };
      await applyNumericMigration();
      assert.equal((await connection.query('SELECT on_quantity FROM charging_station_deployments WHERE id=900'))[0][0].on_quantity, 3);
      await connection.query('UPDATE charging_station_deployments SET on_quantity=0 WHERE id=900');
      await applyNumericMigration();
      assert.equal((await connection.query('SELECT on_quantity FROM charging_station_deployments WHERE id=900'))[0][0].on_quantity, 0,
        'reapplying migration does not refill a corrected OPERATING portion');
      await connection.query('DELETE FROM charging_station_deployments WHERE id=900');
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

    await t.test('numeric ON is atomic, cumulative, preserves first dates and reopens tasks on corrections', async () => {
      await fixture.query(`INSERT INTO station_proposals(id,user_id,latitude,longitude,owner_name,owner_phone,status,custom_data,chot_so_luong_tru)
        VALUES(2,5,10,106,'Numeric fixture','0000000000','APPROVED',?,?)`,
      [JSON.stringify({ mo_hinh_dau_tu: 'LK', nguoi_phu_trach: { id: 10 }, sales_quan_ly: { id: 11 } }),
        JSON.stringify([{ mo_hinh: 'LK', so_luong: 6, pole_id: 1, loai_tru: 'Fixture DC60' }])]);
      await fixture.query(`INSERT INTO charging_stations(id,proposal_id,ma_tram,status,sub_status,contract_status,
        infra_power_status,infra_site_status,payment_status,deposit_status)
        VALUES(2,2,'NUMERIC-2','CONFIGURING','NOT_CONFIGURED','DONE','DONE','DONE','DOING','RECEIVED')`);
      await fixture.query(`INSERT INTO charging_station_commitments(id,charging_station_id,model,pole_id,quantity,source_key)
        VALUES(3,2,'LK',1,6,'line:1')`);
      await fixture.query(`INSERT INTO warehouse_exports(id,exporter_user_id,export_date,charging_station_id,destination_type,transport_status)
        VALUES(4,3,NOW(),2,'STATION','DELIVERED'),(5,3,NOW(),2,'STATION','SHIPPING')`);
      await fixture.query(`INSERT INTO warehouse_export_items(id,export_id,pole_id,supplier_id,commitment_id,quantity,received_quantity)
        VALUES(6,4,1,1,3,4,4),(7,5,1,1,3,2,0)`);
      const [{ insertId: firstId }] = await fixture.query(`INSERT INTO charging_station_deployments(charging_station_id,export_item_id,quantity,stage,sub_status,installation_status)
        VALUES(2,6,4,'CONFIGURING','NOT_CONFIGURED','DONE')`);
      const transitions = [];
      t.mock.method(require('../src/services/proposal/proposalLifecycle.js'), 'transitionOnStationWithinTransaction', async (connection, id, status) => {
        transitions.push(status);
        await connection.query('UPDATE station_proposals SET status=? WHERE id=?', [status, id]);
      });
      const requestFor = async (quantity, date, requestId, reason = null) => ({
        request_id: requestId, cms_station_code: 'CMS-NUMERIC', reason,
        items: [{ id: firstId, expected_version: (await deployment.getDeployments(2))[0].workflow_version,
          on_quantity: quantity, on_date: date }]
      });
      const needed = async () => {
        const [[row]] = await fixture.query(`SELECT ${work.stageFilters['on-tram'].need} AS needed,
          ${work.allOperating} AS completed FROM charging_stations cs JOIN station_proposals p ON p.id=cs.proposal_id WHERE cs.id=2`);
        return { needed: Number(row.needed), completed: Number(row.completed) };
      };
      const first = await requestFor(1, '2026-11-14', 'numeric-first');
      await assert.rejects(completion.updateOn(2, first, { id: 4, role: 'ADMIN' }), { statusCode: 403 });
      for (const quantity of [-1, 1.5, 5]) {
        await assert.rejects(completion.updateOn(2, { ...first, request_id: `bad-${quantity}`,
          items: [{ ...first.items[0], on_quantity: quantity }] }, setup), { statusCode: 400 });
      }
      await assert.rejects(completion.updateOn(2, { ...first, request_id: 'numeric-invalid-date',
        items: [{ ...first.items[0], on_date: '2026-02-30' }] }, setup), { statusCode: 400 });
      await assert.rejects(completion.updateOn(2, { ...first, request_id: 'numeric-stale',
        items: [{ ...first.items[0], expected_version: 999 }] }, setup), { statusCode: 409 });
      assert.equal((await deployment.getDeployments(2))[0].on_quantity, 0);
      await Promise.all([completion.updateOn(2, first, setup), completion.updateOn(2, first, setup)]);
      assert.deepEqual(transitions, ['DEPLOYING', 'ACTIVE']);
      assert.equal((await deployment.getDeployments(2))[0].on_quantity, 1);
      assert.deepEqual(await needed(), { needed: 1, completed: 0 });
      const second = await requestFor(3, '2026-11-15', 'numeric-second');
      await completion.updateOn(2, second, setup);
      assert.equal((await deployment.getDeployments(2))[0].on_date, '2026-11-14');
      assert.equal((await shipping.getSummary(2)).totals.operating, 3);
      await assert.rejects(completion.updateOn(2, await requestFor(0, '2026-11-16', 'numeric-no-reason'), setup), { statusCode: 400 });
      await completion.updateOn(2, await requestFor(0, '2026-11-16', 'numeric-correction', 'Correct duplicate count'), setup);
      const [corrected] = await deployment.getDeployments(2);
      assert.equal(corrected.on_quantity, 0);
      assert.equal(corrected.on_date, '2026-11-14');
      const [[station]] = await fixture.query("SELECT status,DATE_FORMAT(on_date,'%Y-%m-%d') AS on_date FROM charging_stations WHERE id=2");
      assert.deepEqual(station, { status: 'OPERATING', on_date: '2026-11-14' });
      assert.equal((await fixture.query('SELECT status FROM station_proposals WHERE id=2'))[0][0].status, 'ACTIVE');
      assert.deepEqual(await needed(), { needed: 1, completed: 0 });
      assert.equal((await shipping.getSummary(2)).totals.operating, 0);
      await completion.updateOn(2, await requestFor(4, '2026-11-17', 'numeric-all-received'), setup);
      assert.deepEqual(await needed(), { needed: 1, completed: 0 }, 'unreceived committed poles keep ON task open');
      const [{ insertId: secondId }] = await fixture.query(`INSERT INTO charging_station_deployments(charging_station_id,export_item_id,quantity,stage,sub_status,installation_status)
        VALUES(2,7,2,'INSTALLING','NOT_INSTALLED','NOT')`);
      const next = (await deployment.getDeployments(2)).find(row => Number(row.id) === secondId);
      await assert.rejects(completion.updateOn(2, { request_id: 'numeric-not-installed', cms_station_code: 'CMS-NUMERIC',
        items: [{ id: secondId, expected_version: next.workflow_version, on_quantity: 1, on_date: '2026-11-18' }] }, setup), { statusCode: 409 });
      await fixture.query("UPDATE charging_station_deployments SET installation_status='DONE' WHERE id=?", [secondId]);
      await fixture.query("UPDATE warehouse_exports SET transport_status='DELIVERED' WHERE id=5");
      await fixture.query('UPDATE warehouse_export_items SET received_quantity=2 WHERE id=7');
      await assert.rejects(completion.updateOn(2, { request_id: 'numeric-atomic', cms_station_code: 'CMS-NUMERIC', reason: 'Reconcile',
        items: [{ id: firstId, expected_version: corrected.workflow_version + 1, on_quantity: 3, on_date: '2026-11-18' },
          { id: secondId, expected_version: 999, on_quantity: 2, on_date: '2026-11-18' }] }, setup), { statusCode: 409 });
      assert.deepEqual((await deployment.getDeployments(2)).map(row => row.on_quantity), [4, 0]);
      await completion.updateOn(2, { request_id: 'numeric-legacy-all', cms_station_code: 'CMS-NUMERIC',
        items: [{ id: secondId, expected_version: next.workflow_version, on_date: '2026-11-18' }] }, setup);
      assert.deepEqual(await needed(), { needed: 0, completed: 1 });
      const history = await stations.getChargingStationActivity(2, setup, { step: 'on-tram', limit: 2 });
      assert.equal(history.pagination.total, 5, 'concurrent retry creates only one log');
      assert.equal(history.items.length, 2);
      const correction = (await stations.getChargingStationActivity(2, setup, { step: 'on-tram' })).items
        .find(row => row.changed_fields.on_event_kind === 'CORRECTION');
      assert.deepEqual(correction.changed_fields.on_quantity, { old: 3, new: 0 });
      assert.equal(correction.changed_fields.on_event_date, '2026-11-16');
      assert.equal(correction.changed_fields.on_date.new, '2026-11-14');
      assert.equal(correction.actor_name, 'Fixture 2');
      await assert.rejects(stations.getChargingStationActivity(2, setup, { step: 'toString' }), { statusCode: 400 });
      await assert.rejects(stations.getChargingStationActivity(2, setup, { step: 'on-tram', limit: 51 }), { statusCode: 400 });
      assert.equal((await stations.getChargingStationActivity(2, setup, { step: 'nghiem-thu' })).items.length, 0);
    });

    await t.test('infrastructure ownership follows proposer, responsible user, recursive ancestors and explicit manager', async () => {
      for (const [id, role, parent] of [[5, 'CTV', 6], [6, 'SALES', null], [7, 'NPP', 6],
        [9, 'CTV', null], [10, 'CTV', 7], [11, 'SALES', null]]) {
        await fixture.query('INSERT INTO users(id,full_name,email,password,role,parent_id,custom_data) VALUES(?,?,?,?,?,?,?)',
          [id, `Owner ${id}`, `owner${id}@example.invalid`, 'not-a-login', role, parent, JSON.stringify({ department: 'Other' })]);
      }
      await fixture.query("UPDATE charging_stations SET infra_power_status='DOING' WHERE id=2");
      for (const user of [{ id: 5, role: 'CTV' }, { id: 10, role: 'CTV' }, { id: 6, role: 'SALES' },
        { id: 7, role: 'NPP' }, { id: 11, role: 'SALES' }]) {
        const permission = await access.recordPermissions(2, user);
        assert.equal(permission.infrastructure_task, true, `owner task for ${user.id}`);
        await access.assertInfrastructure(2, user);
        await access.assertView(2, user);
        const filter = await work.getFilter('xay-dung-ha-tang', 'need', user);
        const [[row]] = await fixture.query(`SELECT (${filter.sql}) AS needed FROM charging_stations cs
          JOIN station_proposals p ON p.id=cs.proposal_id WHERE cs.id=2`, filter.params);
        assert.equal(Number(row.needed), 1);
      }
      for (const user of [bo, setup]) {
        const permission = await access.recordPermissions(2, user);
        assert.equal(permission.infrastructure, true);
        assert.equal(permission.infrastructure_task, false);
        const filter = await work.getFilter('xay-dung-ha-tang', 'need', user);
        const [[row]] = await fixture.query(`SELECT (${filter.sql}) AS needed FROM charging_stations cs
          JOIN station_proposals p ON p.id=cs.proposal_id WHERE cs.id=2`, filter.params);
        assert.equal(Number(row.needed), 0, 'department-only access is not an owner task');
      }
      for (const user of [{ id: 9, role: 'CTV' }, { id: 4, role: 'ADMIN' }]) {
        await assert.rejects(access.assertInfrastructure(2, user), { statusCode: 403 });
      }
      await assert.rejects(stations.getChargingStationActivity(2, { id: 9, role: 'CTV' }, { step: 'on-tram' }), { statusCode: 403 });
      t.mock.method(require('../src/services/admin/adminProposalService.js'), 'getProposalWithUser', async () => ({ id: 2 }));
      await stations.updateInfrastructureStatus(2, 'power', {
        status: 'NOT', expected_status: 'DOING', date: '2026-11-16', note: 'Owner infrastructure correction'
      }, { id: 10, role: 'CTV' }, { actorId: 10, actorRole: 'CTV' });
      const history = await stations.getChargingStationActivity(2, { id: 10, role: 'CTV' }, { step: 'xay-dung-ha-tang' });
      assert.equal(history.items[0].reject_reason, 'Owner infrastructure correction');
      assert.equal(history.items[0].changed_fields.infra_power_status.new, 'NOT');
      const express = require('express');
      const app = express();
      app.use(express.json());
      app.use('/api/admin/charging-stations', require('../src/routes/chargingStation/chargingStations.js'));
      const server = await new Promise(resolve => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
      });
      const token = require('jsonwebtoken').sign({ id: 10, tokenVersion: 0 },
        require('../src/middlewares/auth').JWT_SECRET, { expiresIn: '1m' });
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const base = `http://127.0.0.1:${server.address().port}/api/admin/charging-stations/2`;
      try {
        const updated = await fetch(`${base}/infrastructure/power/status`, {
          method: 'POST', headers, body: JSON.stringify({ status: 'DONE', expected_status: 'NOT',
            date: '2026-11-16', note: 'CTV assigned via HTTP' })
        });
        assert.equal(updated.status, 200);
        assert.equal((await updated.json()).data.permissions.infrastructure, true);
        const response = await fetch(`${base}/activity?step=xay-dung-ha-tang&limit=1&page=1`, { headers });
        assert.equal(response.status, 200);
        const activity = await response.json();
        assert.equal(activity.data.length, 1);
        assert.equal(activity.pagination.total, 2);
        assert.equal(activity.data[0].actor_name, 'Owner 10');
      } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
      }
    });

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
