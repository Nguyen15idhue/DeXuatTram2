const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const pool = require('../src/utils/db');
const { capture, fingerprint, save } = require('../src/services/historicalOnImportSnapshot');

test.after(() => pool.end());

test('snapshot persists and rolls back with its transaction in an isolated database', {
  skip: process.env.RUN_HISTORICAL_SNAPSHOT_SQL_TEST !== '1'
}, async () => {
  const admin = await pool.getConnection();
  const [[original]] = await admin.query('SELECT DATABASE() AS name');
  const database = `test_historical_snapshot_${Date.now()}`;
  let fixture;
  let created = false;
  try {
    await admin.query(`CREATE DATABASE \`${database}\``);
    created = true;
    for (const table of [
      'station_proposals', 'charging_stations', 'charging_station_commitments', 'warehouse_exports',
      'warehouse_export_items', 'charging_station_deployments', 'charging_station_invoices',
      'charging_station_contract_files', 'charging_station_acceptance_documents',
      'charging_station_acceptance_images'
    ]) await admin.query(`CREATE TABLE \`${database}\`.\`${table}\` LIKE \`${original.name}\`.\`${table}\``);
    fixture = mysql.createPool({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER, password: process.env.DB_PASSWORD, database, charset: 'utf8mb4' });
    const migration = fs.readFileSync(path.join(__dirname, '../../database/242-historical-on-import-snapshots.sql'), 'utf8');
    await fixture.query(migration);
    await fixture.query(`INSERT INTO station_proposals
      (id,user_id,latitude,longitude,owner_name,owner_phone,status,custom_data)
      VALUES(1,1,10,106,'Fixture','0000000000','DEPLOYING','{}')`);
    await fixture.query(`INSERT INTO charging_stations (id,proposal_id,status)
      VALUES(1,1,'DELIVERING')`);
    await fixture.query(`INSERT INTO warehouse_exports
      (id,exporter_user_id,export_date,charging_station_id,historical_import)
      VALUES(1,1,NOW(),1,1)`);
    await fixture.query(`INSERT INTO warehouse_export_items (id,export_id,pole_id,quantity)
      VALUES(1,1,1,2)`);
    await fixture.query(`INSERT INTO charging_station_deployments (id,charging_station_id,export_item_id,quantity)
      VALUES(1,1,1,2)`);
    await fixture.query(`INSERT INTO charging_station_acceptance_documents (id,deployment_id,kind,file_id)
      VALUES(1,1,'EQUIPMENT',1)`);
    await fixture.query(`INSERT INTO charging_station_acceptance_images (id,acceptance_document_id,file_id)
      VALUES(1,1,2)`);
    const connection = await fixture.getConnection();
    try {
      const before = await capture(connection, 1);
      assert.equal(before.export_items.length, 1);
      assert.equal(before.acceptance_documents[0].file_id, 1);
      assert.equal(before.acceptance_images[0].file_id, 2);
      await connection.beginTransaction();
      const locked = await capture(connection, 1, { lock: true });
      await save(connection, { batchKey: 'fixture', rowNumber: 2, actorId: 1,
        snapshot: locked, expectedFingerprint: fingerprint(before) });
      await connection.query("UPDATE charging_stations SET status='OPERATING' WHERE id=1");
      await connection.rollback();
      assert.equal((await connection.query('SELECT COUNT(*) AS n FROM historical_on_import_snapshots'))[0][0].n, 0);
      assert.equal((await connection.query('SELECT status FROM charging_stations WHERE id=1'))[0][0].status, 'DELIVERING');
      await connection.beginTransaction();
      await save(connection, { batchKey: 'fixture', rowNumber: 2, actorId: 1,
        snapshot: await capture(connection, 1, { lock: true }), expectedFingerprint: fingerprint(before) });
      await connection.commit();
      assert.equal((await connection.query('SELECT COUNT(*) AS n FROM historical_on_import_snapshots'))[0][0].n, 1);
    } finally { connection.release(); }
  } finally {
    if (fixture) await fixture.end();
    if (created) await admin.query(`DROP DATABASE \`${database}\``);
    admin.release();
  }
});
