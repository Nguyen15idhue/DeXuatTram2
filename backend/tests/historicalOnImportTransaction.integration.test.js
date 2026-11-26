const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const pool = require('../src/utils/db');
const { createTemplate, FIELDS, POLE_FIELDS } = require('../src/services/historicalOnImport/historicalOnImportSheet');
const preview = require('../src/services/historicalOnImport/historicalOnImportPreview');
const { createProof } = require('../src/services/historicalOnImport/historicalOnImportProof');
const { executeConfirmation } = require('../src/services/historicalOnImport/historicalOnImportTransaction');
const managedShipments = require('../src/services/historicalOnImport/historicalOnImportManagedShipments');
const historicalWriter = require('../src/services/historicalOnImport/historicalOnImportWriter');

test.after(() => pool.end());

test('confirmation saves snapshots atomically, rejects stale previews and is idempotent', {
  skip: process.env.RUN_HISTORICAL_IMPORT_TRANSACTION_TEST !== '1'
}, async () => {
  const admin = await pool.getConnection();
  const [[original]] = await admin.query('SELECT DATABASE() AS name');
  const database = `test_historical_tx_${Date.now()}`;
  let fixture;
  let created = false;
  try {
    await admin.query(`CREATE DATABASE \`${database}\``);
    created = true;
    for (const table of [
      'users', 'charging_poles', 'suppliers', 'station_proposals', 'charging_stations',
      'charging_station_commitments', 'warehouse_exports', 'warehouse_export_items',
      'charging_station_deployments', 'charging_station_invoices', 'charging_station_contract_files',
      'charging_station_acceptance_documents', 'charging_station_acceptance_images', 'charging_station_activity_logs',
      'proposal_activity_logs', 'proposal_sequences', 'data_lists', 'data_list_rows', 'stations'
    ]) await admin.query(`CREATE TABLE \`${database}\`.\`${table}\` LIKE \`${original.name}\`.\`${table}\``);
    fixture = mysql.createPool({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER, password: process.env.DB_PASSWORD, database, charset: 'utf8mb4', multipleStatements: true });
    for (const migration of ['242-historical-on-import-snapshots.sql', '243-historical-on-import-batches.sql',
      '244-historical-on-managed-shipments.sql', '245-historical-on-contract-and-dates.sql']) {
      const sql = fs.readFileSync(path.join(__dirname, '../../database', migration), 'utf8');
      await fixture.query(sql);
      await fixture.query(sql);
    }
    await fixture.query(fs.readFileSync(path.join(__dirname, '../../database/244-historical-on-managed-shipments.sql'), 'utf8'));
    await fixture.query("INSERT INTO users (id,full_name,email,password,role,status) VALUES (1,'Fixture','fixture@example.test','fixture','SUPER_ADMIN','ACTIVE')");
    await fixture.query("INSERT INTO charging_poles (id,name,charging_type,power_kw) VALUES (1,'AC 22kW','AC',22)");
    await fixture.query("INSERT INTO suppliers (id,name) VALUES (1,'Meter')");
    await fixture.query("INSERT INTO data_lists (id,name,columns_config) VALUES (1,'dm_tinh',JSON_ARRAY())");
    await fixture.query("INSERT INTO data_list_rows (list_id,data) VALUES (1,JSON_OBJECT('ten_tinh','Hà Nội','ma_tinh','HNO','vung_mien','Bắc'))");
    await fixture.query(`INSERT INTO station_proposals
      (id,user_id,latitude,longitude,owner_name,owner_phone,status,custom_data)
      VALUES (1,1,10,106,'Before','0123456789','DEPLOYING',JSON_OBJECT('historical_bcdx_code','OLD-1')),
             (2,1,10,106,'Before','0123456789','DEPLOYING',JSON_OBJECT('historical_bcdx_code','OLD-2'))`);
    const workbook = await createTemplate([{ id: 1, name: 'AC 22kW' }]);
    const sheet = workbook.worksheets[0];
    for (const [index, code] of ['OLD-1', 'OLD-2'].entries()) {
      const data = { legacy_code: code, owner_name: `After ${index}` };
      for (const [key, label] of FIELDS) {
        if (data[key]) sheet.getCell(index + 2, sheet.getRow(1).values.indexOf(label)).value = data[key];
      }
    }
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const actor = { id: 1, tokenVersion: 0, role: 'SUPER_ADMIN' };
    const checked = await preview.preview(buffer, actor, fixture);
    assert.ok(checked.every(row => row.errors.length === 0));
    const proof = createProof(buffer, actor, checked);
    let writes = 0;
    const writeRow = async (connection, row, item) => {
      writes++;
      await connection.query('UPDATE station_proposals SET owner_name = ? WHERE id = ?', [row.owner_name, item.proposal_id]);
      if (writes === 2) throw new Error('forced failure');
      return { row: item.row, proposal_id: item.proposal_id };
    };
    await assert.rejects(executeConfirmation({ buffer, proof, actor, database: fixture, writeRow }), /forced failure/);
    assert.equal((await fixture.query('SELECT COUNT(*) AS n FROM historical_on_import_snapshots'))[0][0].n, 0);
    assert.equal((await fixture.query('SELECT COUNT(*) AS n FROM historical_on_import_batches'))[0][0].n, 0);
    assert.equal((await fixture.query('SELECT owner_name FROM station_proposals WHERE id=1'))[0][0].owner_name, 'Before');

    await fixture.query("UPDATE station_proposals SET owner_name='Changed' WHERE id=1");
    await assert.rejects(executeConfirmation({ buffer, proof, actor, database: fixture, writeRow }), { statusCode: 409 });
    assert.equal((await fixture.query('SELECT COUNT(*) AS n FROM historical_on_import_snapshots'))[0][0].n, 0);

    const fresh = createProof(buffer, actor, await preview.preview(buffer, actor, fixture));
    writes = 0;
    const successfulWriter = async (connection, row, item) => {
      writes++;
      await connection.query('UPDATE station_proposals SET owner_name = ? WHERE id = ?', [row.owner_name, item.proposal_id]);
      return { row: item.row, proposal_id: item.proposal_id };
    };
    const first = await executeConfirmation({ buffer, proof: fresh, actor, database: fixture, writeRow: successfulWriter });
    const repeated = await executeConfirmation({ buffer, proof: fresh, actor, database: fixture, writeRow: successfulWriter });
    assert.deepEqual(repeated, first);
    assert.equal(writes, 2);
    assert.equal((await fixture.query('SELECT COUNT(*) AS n FROM historical_on_import_snapshots'))[0][0].n, 2);

    const parallelProof = createProof(buffer, actor, await preview.preview(buffer, actor, fixture));
    writes = 0;
    const [parallelA, parallelB] = await Promise.all([
      executeConfirmation({ buffer, proof: parallelProof, actor, database: fixture, writeRow: successfulWriter }),
      executeConfirmation({ buffer, proof: parallelProof, actor, database: fixture, writeRow: successfulWriter })
    ]);
    assert.deepEqual(parallelA, parallelB);
    assert.equal(writes, 2);
    assert.equal((await fixture.query('SELECT COUNT(*) AS n FROM historical_on_import_snapshots'))[0][0].n, 4);

    await fixture.query("INSERT INTO charging_stations (id,proposal_id,status) VALUES (1,1,'OPERATING')");
    await fixture.query(`INSERT INTO charging_station_commitments
      (id,charging_station_id,model,supplier_id,pole_id,quantity,source_key)
      VALUES (1,1,'NQ',1,1,3,'fixture')`);
    await fixture.query(`INSERT INTO warehouse_exports
      (id,exporter_user_id,export_date,charging_station_id,destination_type,historical_import)
      VALUES (1,1,NOW(),1,'STATION',0)`);
    await fixture.query(`INSERT INTO warehouse_export_items
      (id,export_id,pole_id,supplier_id,commitment_id,quantity,received_quantity)
      VALUES (1,1,1,1,1,3,3)`);
    await fixture.query(`INSERT INTO charging_station_deployments
      (charging_station_id,export_item_id,quantity,installation_status,acceptance_status,on_quantity)
      VALUES (1,1,2,'DONE','PASSED',1),(1,1,1,'NOT','NOT',0)`);
    const progressWorkbook = await createTemplate([{ id: 1, name: 'AC 22kW' }]);
    const progressSheet = progressWorkbook.worksheets[0];
    const progress = { model: 'NQ', name: 'AC 22kW', committed: 4, shipped: 4, received: 4,
      installed: 3, accepted: 2, on: 2, accepted_on: 2 };
    progressSheet.getCell(2, progressSheet.getRow(1).values.indexOf(FIELDS.find(([key]) => key === 'legacy_code')[1])).value = 'OLD-1';
    for (const [key, label] of POLE_FIELDS) {
      if (progress[key] !== undefined) {
        progressSheet.getCell(2, progressSheet.getRow(1).values.indexOf(`Trụ 1 - ${label}`)).value = progress[key];
      }
    }
    const invalidProgress = Buffer.from(await progressWorkbook.xlsx.writeBuffer());
    const [invalid] = await preview.preview(invalidProgress, actor, fixture);
    assert.match(invalid.errors.join(' '), /không thể phân bổ/);
    assert.throws(() => createProof(invalidProgress, actor, [invalid]), /chưa được kiểm tra hợp lệ/);

    progressSheet.getCell(2, progressSheet.getRow(1).values.indexOf('Trụ 1 - SL vừa nghiệm thu đạt vừa ON')).value = 1;
    const validProgress = Buffer.from(await progressWorkbook.xlsx.writeBuffer());
    const validRows = await preview.preview(validProgress, actor, fixture);
    assert.deepEqual(validRows[0].errors, []);
    const progressProof = createProof(validProgress, actor, validRows);
    await executeConfirmation({ buffer: validProgress, proof: progressProof, actor, database: fixture,
      writeRow: async (_connection, row, item) => ({ row: row.row, proposal_id: item.proposal_id }) });
    const [shipments] = await fixture.query('SELECT quantity,received_quantity FROM warehouse_export_items WHERE id=1');
    assert.equal(shipments[0].quantity, 3);
    assert.equal(shipments[0].received_quantity, 3);
    const [savedSnapshots] = await fixture.query('SELECT snapshot FROM historical_on_import_snapshots WHERE batch_key=?',
      [require('../src/services/historicalOnImport/historicalOnImportProof').verifyProof(progressProof, validProgress, actor).batch_key]);
    const stored = typeof savedSnapshots[0].snapshot === 'string'
      ? JSON.parse(savedSnapshots[0].snapshot) : savedSnapshots[0].snapshot;
    assert.equal(stored.deployments.length, 2);

    const batchKey = require('../src/services/historicalOnImport/historicalOnImportProof').verifyProof(progressProof, validProgress, actor).batch_key;
    await fixture.query(`INSERT INTO warehouse_exports
      (id,exporter_user_id,export_date,charging_station_id,destination_type,historical_import,historical_import_batch_key)
      VALUES (2,1,NOW(),1,'STATION',1,?),(3,1,NOW(),1,'STATION',1,?)`, [batchKey, batchKey]);
    await fixture.query(`INSERT INTO warehouse_export_items
      (id,export_id,pole_id,supplier_id,commitment_id,quantity,received_quantity)
      VALUES (2,2,1,1,1,1,1),(3,3,1,1,1,1,1)`);
    await fixture.query(`INSERT INTO charging_station_deployments
      (charging_station_id,export_item_id,quantity,installation_status,acceptance_status,on_quantity)
      VALUES (1,2,1,'DONE','NOT',0),(1,3,1,'DONE','NOT',0)`);
    const connection = await fixture.getConnection();
    try {
      await connection.beginTransaction();
      await assert.rejects(managedShipments.assertUntouched(connection, 1), /không có dấu vết import/);
      await assert.rejects(managedShipments.saveBaseline(connection, { exportId: 1, batchKey }), /không phải dữ liệu lịch sử/);
      await assert.rejects(managedShipments.saveBaseline(connection, { exportId: 2, batchKey: 'other' }), /không thuộc lần import/);
      await managedShipments.saveBaseline(connection, { exportId: 2, batchKey });
      await managedShipments.saveBaseline(connection, { exportId: 3, batchKey });
      await connection.commit();
      await connection.beginTransaction();
      assert.equal((await managedShipments.assertUntouched(connection, 2)).items.length, 1);
      await connection.query("UPDATE warehouse_exports SET reason='Manual change' WHERE id=2");
      await assert.rejects(managedShipments.assertUntouched(connection, 2), /đã phát sinh thay đổi/);
      await connection.rollback();
      await connection.beginTransaction();
      await connection.query(`INSERT INTO charging_station_activity_logs
        (charging_station_id,action,actor_id,actor_role,source)
        VALUES (1,'shipment_received',1,'SUPER_ADMIN','user')`);
      await assert.rejects(managedShipments.assertUntouched(connection, 3), /đã phát sinh thay đổi/);
      await connection.rollback();
      await connection.beginTransaction();
      await connection.query(`INSERT INTO charging_station_acceptance_documents (deployment_id,kind,file_id)
        SELECT id,'EQUIPMENT',1 FROM charging_station_deployments WHERE export_item_id=2`);
      await assert.rejects(managedShipments.assertUntouched(connection, 2), /đã phát sinh thay đổi/);
      await connection.rollback();
    } finally { connection.release(); }

    const createWorkbook = await createTemplate([{ id: 1, name: 'AC 22kW' }]);
    const createSheet = createWorkbook.worksheets[0];
    const input = {
      legacy_code: 'OLD-NEW', cms_code: 'CMS-NEW', owner_name: 'Customer', owner_phone: '0123456789',
      address: 'Fixture address', province: 'Hà Nội', latitude: 21, longitude: 105,
      model: 'NQ', proposal_status: 'Hoạt động', on_status: 'Hoạt động',
      contract_status: 'Hoàn thành', contract_number: 'HD-01', contract_date: '2025-01-01',
      contract_amount: 1200000, on_date: '2025-02-01'
    };
    const inputPole = { model: 'NQ', name: 'AC 22kW', proposed: 3, committed: 3,
      shipped: 2, received: 2, installed: 1, accepted: 0, on: 1, accepted_on: 0 };
    for (const [key, label] of FIELDS) {
      if (input[key] !== undefined) createSheet.getCell(2, createSheet.getRow(1).values.indexOf(label)).value = input[key];
    }
    for (const [key, label] of POLE_FIELDS) {
      if (inputPole[key] !== undefined) createSheet.getCell(2, createSheet.getRow(1).values.indexOf(`Trụ 1 - ${label}`)).value = inputPole[key];
    }
    const createBuffer = Buffer.from(await createWorkbook.xlsx.writeBuffer());
    const createPreview = await preview.preview(createBuffer, actor, fixture);
    assert.deepEqual(createPreview[0].errors, []);
    const createProofToken = createProof(createBuffer, actor, createPreview);
    const createdResult = await executeConfirmation({ buffer: createBuffer, proof: createProofToken, actor,
      database: fixture, writeRow: historicalWriter.writeRow });
    const proposalId = createdResult.rows[0].proposal_id;
    const stationId = createdResult.rows[0].charging_station_id;
    const [createdProposals] = await fixture.query('SELECT * FROM station_proposals WHERE id=?', [proposalId]);
    assert.equal(createdProposals[0].status, 'ACTIVE');
    assert.equal(Number(createdProposals[0].tong_gia_tri_chot), 1200000);
    const [createdStations] = await fixture.query('SELECT * FROM charging_stations WHERE id=?', [stationId]);
    assert.equal(createdStations[0].contract_number, 'HD-01');
    assert.equal(createdStations[0].contract_deadline_at, null);
    const [createdExports] = await fixture.query('SELECT * FROM warehouse_exports WHERE charging_station_id=?', [stationId]);
    assert.equal(createdExports[0].export_date, null);
    assert.equal(createdExports[0].historical_import, 1);
    const [createdDeployments] = await fixture.query('SELECT * FROM charging_station_deployments WHERE charging_station_id=?', [stationId]);
    assert.equal(createdDeployments.reduce((sum, part) => sum + part.quantity, 0), 2);
    assert.equal(createdDeployments.reduce((sum, part) => sum + part.on_quantity, 0), 1);
    assert.equal(createdDeployments.filter(part => part.acceptance_status === 'PASSED').length, 0);
    assert.deepEqual(await executeConfirmation({ buffer: createBuffer, proof: createProofToken, actor,
      database: fixture, writeRow: historicalWriter.writeRow }), createdResult);

    const storedCustom = typeof createdProposals[0].custom_data === 'string'
      ? JSON.parse(createdProposals[0].custom_data) : createdProposals[0].custom_data;
    storedCustom.loai_tru_nq = JSON.stringify(storedCustom.loai_tru_nq);
    await fixture.query('UPDATE station_proposals SET custom_data=? WHERE id=?', [JSON.stringify(storedCustom), proposalId]);
    const updatePreview = await preview.preview(createBuffer, actor, fixture);
    assert.deepEqual(updatePreview[0].errors, []);
    assert.equal(updatePreview[0].action, 'update');
    await executeConfirmation({ buffer: createBuffer, proof: createProof(createBuffer, actor, updatePreview), actor,
      database: fixture, writeRow: historicalWriter.writeRow });
    const [updatedProposal] = await fixture.query('SELECT custom_data FROM station_proposals WHERE id=?', [proposalId]);
    const updatedCustom = typeof updatedProposal[0].custom_data === 'string'
      ? JSON.parse(updatedProposal[0].custom_data) : updatedProposal[0].custom_data;
    assert.ok(Array.isArray(updatedCustom.loai_tru_nq));
    const verifyBaseline = await fixture.getConnection();
    try { await verifyBaseline.beginTransaction(); await managedShipments.assertUntouched(verifyBaseline, createdExports[0].id); await verifyBaseline.rollback(); }
    finally { verifyBaseline.release(); }
    createSheet.getCell(2, createSheet.getRow(1).values.indexOf(`Trụ 1 - ${POLE_FIELDS.find(([key]) => key === 'shipped')[1]}`)).value = 1;
    createSheet.getCell(2, createSheet.getRow(1).values.indexOf(`Trụ 1 - ${POLE_FIELDS.find(([key]) => key === 'received')[1]}`)).value = 1;
    const reducedBuffer = Buffer.from(await createWorkbook.xlsx.writeBuffer());
    const reducedPreview = await preview.preview(reducedBuffer, actor, fixture);
    assert.deepEqual(reducedPreview[0].errors, []);
    await executeConfirmation({ buffer: reducedBuffer, proof: createProof(reducedBuffer, actor, reducedPreview), actor,
      database: fixture, writeRow: historicalWriter.writeRow });
    const [remainingExports] = await fixture.query('SELECT id FROM warehouse_exports WHERE charging_station_id=?', [stationId]);
    assert.equal(remainingExports.length, 1);
    assert.notEqual(remainingExports[0].id, createdExports[0].id);
    const [stocks] = await fixture.query('SELECT quantity FROM charging_poles WHERE id=1');
    assert.equal(stocks[0].quantity, 0);

    await fixture.query(
      "INSERT INTO charging_station_activity_logs (charging_station_id,action,source) VALUES (?,'real_work','user')",
      [stationId]
    );
    const touchedPreview = await preview.preview(reducedBuffer, actor, fixture);
    const [snapshotsBefore] = await fixture.query('SELECT COUNT(*) AS count FROM historical_on_import_snapshots');
    await assert.rejects(executeConfirmation({ buffer: reducedBuffer, proof: createProof(reducedBuffer, actor, touchedPreview),
      actor, database: fixture, writeRow: historicalWriter.writeRow }), /đã phát sinh thay đổi/);
    const [snapshotsAfter] = await fixture.query('SELECT COUNT(*) AS count FROM historical_on_import_snapshots');
    assert.equal(snapshotsAfter[0].count, snapshotsBefore[0].count);

    const rollbackWorkbook = await createTemplate([{ id: 1, name: 'AC 22kW' }]);
    const rollbackSheet = rollbackWorkbook.worksheets[0];
    for (const [key, label] of FIELDS) {
      if (input[key] !== undefined) rollbackSheet.getCell(2, rollbackSheet.getRow(1).values.indexOf(label)).value = input[key];
    }
    for (const [key, label] of POLE_FIELDS) {
      if (inputPole[key] !== undefined) rollbackSheet.getCell(2, rollbackSheet.getRow(1).values.indexOf(`Trụ 1 - ${label}`)).value = inputPole[key];
    }
    rollbackSheet.getRow(3).values = rollbackSheet.getRow(2).values;
    rollbackSheet.getCell(2, rollbackSheet.getRow(1).values.indexOf(FIELDS.find(([key]) => key === 'legacy_code')[1])).value = 'ROLLBACK-1';
    rollbackSheet.getCell(3, rollbackSheet.getRow(1).values.indexOf(FIELDS.find(([key]) => key === 'legacy_code')[1])).value = 'ROLLBACK-2';
    rollbackSheet.getCell(2, rollbackSheet.getRow(1).values.indexOf(FIELDS.find(([key]) => key === 'cms_code')[1])).value = 'CMS-ROLLBACK-1';
    rollbackSheet.getCell(3, rollbackSheet.getRow(1).values.indexOf(FIELDS.find(([key]) => key === 'cms_code')[1])).value = 'CMS-ROLLBACK-2';
    const rollbackBuffer = Buffer.from(await rollbackWorkbook.xlsx.writeBuffer());
    const rollbackPreview = await preview.preview(rollbackBuffer, actor, fixture);
    assert.deepEqual(rollbackPreview.map(row => row.errors), [[], []]);
    const staleCatalogProof = createProof(rollbackBuffer, actor, rollbackPreview);
    await fixture.query("UPDATE charging_poles SET name='Old AC' WHERE id=1");
    await fixture.query("INSERT INTO charging_poles (id,name,charging_type,power_kw) VALUES (2,'AC 22kW','AC',22)");
    await assert.rejects(executeConfirmation({ buffer: rollbackBuffer, proof: staleCatalogProof, actor, database: fixture,
      writeRow: historicalWriter.writeRow }), /đã thay đổi hoặc không còn hợp lệ/);
    await fixture.query('DELETE FROM charging_poles WHERE id=2');
    await fixture.query("UPDATE charging_poles SET name='AC 22kW' WHERE id=1");
    await assert.rejects(executeConfirmation({ buffer: rollbackBuffer, proof: createProof(rollbackBuffer, actor, rollbackPreview),
      actor, database: fixture, writeRow: async (...args) => {
        const result = await historicalWriter.writeRow(...args);
        if (result.row === 3) throw new Error('forced rollback');
        return result;
      } }), /forced rollback/);
    const [rolledBack] = await fixture.query(
      "SELECT id FROM station_proposals WHERE JSON_UNQUOTE(JSON_EXTRACT(custom_data,'$.historical_bcdx_code')) IN ('ROLLBACK-1','ROLLBACK-2')"
    );
    assert.equal(rolledBack.length, 0);

    const inconsistentWorkbook = await createTemplate([{ id: 1, name: 'AC 22kW' }]);
    const inconsistentSheet = inconsistentWorkbook.worksheets[0];
    for (const [key, label] of FIELDS) {
      if (input[key] !== undefined) inconsistentSheet.getCell(2, inconsistentSheet.getRow(1).values.indexOf(label)).value = input[key];
    }
    for (const [key, label] of POLE_FIELDS) {
      if (inputPole[key] !== undefined) inconsistentSheet.getCell(2, inconsistentSheet.getRow(1).values.indexOf(`Trụ 1 - ${label}`)).value = inputPole[key];
    }
    const fieldCell = key => inconsistentSheet.getCell(2, inconsistentSheet.getRow(1).values.indexOf(FIELDS.find(([name]) => name === key)[1]));
    fieldCell('legacy_code').value = 'STATUS-TEST';
    fieldCell('cms_code').value = 'CMS-STATUS-TEST';
    fieldCell('proposal_status').value = 'Đang triển khai';
    fieldCell('on_status').value = 'Lắp trụ';
    const inconsistentBuffer = Buffer.from(await inconsistentWorkbook.xlsx.writeBuffer());
    const inconsistentPreview = await preview.preview(inconsistentBuffer, actor, fixture);
    await assert.rejects(executeConfirmation({ buffer: inconsistentBuffer, proof: createProof(inconsistentBuffer, actor, inconsistentPreview),
      actor, database: fixture, writeRow: historicalWriter.writeRow }), /Có trụ đã ON/);
    const [notCreated] = await fixture.query(
      "SELECT id FROM station_proposals WHERE JSON_UNQUOTE(JSON_EXTRACT(custom_data,'$.historical_bcdx_code'))='STATUS-TEST'"
    );
    assert.equal(notCreated.length, 0);
    fieldCell('proposal_status').value = null;
    fieldCell('on_status').value = null;
    fieldCell('on_date').value = null;
    inconsistentSheet.getCell(2, inconsistentSheet.getRow(1).values.indexOf(`Trụ 1 - ${POLE_FIELDS.find(([key]) => key === 'on')[1]}`)).value = 0;
    fieldCell('proposal_status').value = 'Đã duyệt BCĐX';
    fieldCell('on_status').value = 'Hoạt động';
    const mismatchedBuffer = Buffer.from(await inconsistentWorkbook.xlsx.writeBuffer());
    const mismatchedPreview = await preview.preview(mismatchedBuffer, actor, fixture);
    await assert.rejects(executeConfirmation({ buffer: mismatchedBuffer,
      proof: createProof(mismatchedBuffer, actor, mismatchedPreview), actor, database: fixture,
      writeRow: historicalWriter.writeRow }), /Trạng thái hoạt động.*không khớp/);
    fieldCell('proposal_status').value = null;
    fieldCell('on_status').value = null;
    const installingBuffer = Buffer.from(await inconsistentWorkbook.xlsx.writeBuffer());
    const installingPreview = await preview.preview(installingBuffer, actor, fixture);
    const installingResult = await executeConfirmation({ buffer: installingBuffer,
      proof: createProof(installingBuffer, actor, installingPreview), actor, database: fixture, writeRow: historicalWriter.writeRow });
    const [[installing]] = await fixture.query('SELECT status FROM charging_stations WHERE id=?', [installingResult.rows[0].charging_station_id]);
    assert.equal(installing.status, 'INSTALLING');

    const Module = require('node:module');
    const nativeLoad = Module._load;
    Module._load = function (request, parent, isMain) {
      if (parent?.filename.endsWith('historicalOnImport.js')) {
        if (request === '../middlewares/auth') return {
          requireAuth: (req, res, next) => { req.user = actor; next(); },
          requireSuperAdmin: (req, res, next) => next()
        };
        if (request === '../middlewares/rateLimits') return { excelLimiter: (req, res, next) => next() };
        if (request === '../services/historicalOnImportPreview') return {
          ...preview, preview: (file, user) => preview.preview(file, user, fixture)
        };
        if (request === '../services/historicalOnImportTransaction') return {
          executeConfirmation: options => executeConfirmation({ ...options, database: fixture })
        };
      }
      return nativeLoad.call(this, request, parent, isMain);
    };
    let router;
    try { router = require('../src/routes/historicalOnImport'); } finally { Module._load = nativeLoad; }
    const express = require('express');
    const app = express();
    app.use('/import', router);
    const server = await new Promise(resolve => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    try {
      const url = `http://127.0.0.1:${server.address().port}/import`;
      const upload = proofToken => {
        const form = new FormData();
        form.append('file', new Blob([rollbackBuffer]), 'import.xlsx');
        if (proofToken) form.append('proof', proofToken);
        return form;
      };
      const httpPreview = await fetch(`${url}/preview`, { method: 'POST', body: upload() });
      assert.equal(httpPreview.status, 200);
      const httpProof = (await httpPreview.json()).data.proof;
      assert.ok(httpProof);
      const httpConfirm = await fetch(`${url}/confirm`, { method: 'POST', body: upload(httpProof) });
      assert.equal(httpConfirm.status, 200);
      const httpResult = (await httpConfirm.json()).data;
      assert.equal(httpResult.rows.length, 2);
      const retry = await fetch(`${url}/confirm`, { method: 'POST', body: upload(httpProof) });
      assert.deepEqual((await retry.json()).data, httpResult);
      const update = await fetch(`${url}/preview`, { method: 'POST', body: upload() });
      const updateProof = (await update.json()).data.proof;
      assert.ok(updateProof);
      const updateResult = await fetch(`${url}/confirm`, { method: 'POST', body: upload(updateProof) });
      assert.equal(updateResult.status, 200);
      const [snapshots] = await fixture.query('SELECT COUNT(*) AS count FROM historical_on_import_snapshots WHERE batch_key=?',
        [(await updateResult.json()).data.batch_key]);
      assert.equal(snapshots[0].count, 2);
    } finally { await new Promise(resolve => server.close(resolve)); }
  } finally {
    if (fixture) await fixture.end();
    if (created) await admin.query(`DROP DATABASE \`${database}\``);
    admin.release();
  }
});
