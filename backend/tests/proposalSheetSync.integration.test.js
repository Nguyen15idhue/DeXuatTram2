const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

test('status timestamps and related ON/user changes enqueue proposals transactionally', {
  skip: process.env.RUN_PROPOSAL_SHEET_INTEGRATION_TESTS !== '1', timeout: 90000
}, () => {
  const database = `proposal_sheet_test_${process.pid}_${Date.now()}`;
  const mysql = (sql) => {
    const result = spawnSync('docker', [
      'exec', '-i', process.env.MYSQL_CONTAINER || 'station-mysql', 'sh', '-c',
      'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -u root --default-character-set=utf8mb4 --batch --skip-column-names'
    ], { input: sql, encoding: 'utf8' });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim().split(/\r?\n/).filter(Boolean);
  };
  const run = (sql) => mysql(`USE \`${database}\`;\n${sql}`);
  const runBackfill = (apply) => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts',
      'backfill-proposal-status-changed-at.js')).toString('base64');
    const script = `
      const Module = require('module');
      const filename = '/app/scripts/backfill-proposal-status-changed-at.js';
      const m = new Module(filename, module);
      m.filename = filename;
      m.paths = Module._nodeModulePaths('/app/scripts');
      m._compile(Buffer.from('${source}', 'base64').toString('utf8'), filename);
      const mysql = require('/app/node_modules/mysql2/promise');
      (async () => {
        const c = await mysql.createConnection({
          host: process.env.DB_HOST, port: process.env.DB_PORT || 3306,
          user: process.env.DB_USER, password: process.env.DB_PASSWORD,
          database: process.env.SHEET_FIXTURE_DB
        });
        try { console.log(JSON.stringify(await m.exports.backfill(c, ${apply}))); }
        finally { await c.end(); await require('/app/src/utils/db').end(); }
      })().catch(e => { console.error(e.message); process.exitCode = 1; });
    `;
    const result = spawnSync('docker', [
      'exec', '-i', '-e', `SHEET_FIXTURE_DB=${database}`, 'station-backend', 'node', '-'
    ], { input: script, encoding: 'utf8' });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  };
  const loadProposals = (ids, tabName) => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'services',
      'proposalSheetSyncService.js')).toString('base64');
    const script = `
      const Module = require('module');
      const filename = '/app/src/services/proposalSheetSyncService.js';
      const m = new Module(filename, module);
      m.filename = filename;
      m.paths = Module._nodeModulePaths('/app/src/services');
      m._compile(Buffer.from('${source}', 'base64').toString('utf8') +
        '\\nexports.__formatStatusChangeTime = formatStatusChangeTime;', filename);
      (async () => {
        try {
          const rows = await m.exports.loadProposals(${JSON.stringify(ids)}, ${JSON.stringify(tabName)});
          console.log(JSON.stringify(rows.map(r => ({ id: r.id, status_changed_at: r.status_changed_at,
            status_log_id: r.status_log_id, formatted: m.exports.__formatStatusChangeTime(r.status_changed_at),
            on_station_id: r.on_station_id, contract_status: r.contract_status,
            deposit_total: r.deposit_total, payment_total: r.payment_total, refund_total: r.refund_total }))));
        } finally { await require('/app/src/utils/db').end(); }
      })().catch(e => { console.error(e.message); process.exitCode = 1; });
    `;
    const result = spawnSync('docker', [
      'exec', '-i', '-e', `DB_NAME=${database}`, 'station-backend', 'node', '-'
    ], { input: script, encoding: 'utf8' });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  };
  const finishJob = (success, version) => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'services',
      'proposalSheetSyncService.js')).toString('base64');
    const script = `
      const Module = require('module');
      const filename = '/app/src/services/proposalSheetSyncService.js';
      const m = new Module(filename, module);
      m.filename = filename;
      m.paths = Module._nodeModulePaths('/app/src/services');
      m._compile(Buffer.from('${source}', 'base64').toString('utf8') +
        '\\nexports.__finish = ${success ? 'updateSuccessfulJob' : 'updateFailedJob'};', filename);
      (async () => {
        try { await m.exports.__finish({ proposal_id: 10, requested_version: ${version}, attempt_number: 8 }, new Error('test failure')); }
        finally { await require('/app/src/utils/db').end(); }
      })().catch(e => { console.error(e.message); process.exitCode = 1; });
    `;
    const result = spawnSync('docker', [
      'exec', '-i', '-e', `DB_NAME=${database}`, 'station-backend', 'node', '-'
    ], { input: script, encoding: 'utf8' });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr);
  };
  let created = false;
  try {
    mysql(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    created = true;
    run(`
      CREATE TABLE users (id INT PRIMARY KEY, full_name VARCHAR(100), parent_id INT NULL, custom_data JSON);
      CREATE TABLE station_proposals (id INT PRIMARY KEY, user_id INT NULL, status VARCHAR(30),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP);
      CREATE TABLE charging_stations (id INT PRIMARY KEY, proposal_id INT NOT NULL, on_date DATE NULL,
        contract_status VARCHAR(20), infra_power_status VARCHAR(20), infra_site_status VARCHAR(20),
        deposit_status VARCHAR(20), payment_status VARCHAR(20), deposit_refund_required BOOLEAN);
      CREATE TABLE charging_station_invoices (id INT PRIMARY KEY, charging_station_id INT,
        invoice_type VARCHAR(20), amount DECIMAL(12,2));
      CREATE TABLE proposal_activity_logs (id INT PRIMARY KEY, proposal_id INT, action VARCHAR(50),
        from_status VARCHAR(30), to_status VARCHAR(30), created_at TIMESTAMP);
      CREATE TABLE proposal_sheet_sync_queue (proposal_id INT PRIMARY KEY, operation VARCHAR(10),
        requested_version BIGINT, synced_version BIGINT, status VARCHAR(20), attempt_count INT,
        next_attempt_at DATETIME NULL, last_error TEXT NULL, last_synced_at DATETIME NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO users VALUES (1,'GDKV',NULL,'{"department":"North","chuc_vu":"GDKV"}'),
        (2,'CTV',1,'{}'),(3,'Other',NULL,'{}');
      INSERT INTO station_proposals (id,user_id,status) VALUES (10,2,'PENDING'),(11,3,'PENDING');
      INSERT INTO proposal_activity_logs VALUES (1,10,'created',NULL,'PENDING','2020-01-02 03:04:05');
    `);
    const migration = fs.readFileSync(path.join(__dirname, '..', '..', 'database',
      '247-proposal-sheet-status-and-on-date.sql'), 'utf8');
    run(migration);
    run(migration);
    assert.deepEqual(runBackfill(false),
      { eligible: 1, missing: 1, mismatch: 0, updated: 0, concurrent: 0 });
    assert.deepEqual(runBackfill(true),
      { eligible: 1, missing: 1, mismatch: 0, updated: 1, concurrent: 0 });
    assert.deepEqual(run("SELECT DATE_FORMAT(changed_at,'%Y-%m-%d %H:%i:%s') FROM proposal_status_change_times WHERE proposal_id=10;"),
      ['2020-01-02 03:04:05']);
    assert.deepEqual(runBackfill(true),
      { eligible: 0, missing: 1, mismatch: 0, updated: 0, concurrent: 0 });
    run('DELETE FROM proposal_status_change_times WHERE proposal_id=10; DELETE FROM proposal_sheet_sync_queue;');
    assert.deepEqual(run(`
      SELECT COUNT(*) FROM proposal_status_change_times WHERE proposal_id=10;
      INSERT INTO station_proposals (id,user_id,status) VALUES (12,3,'PENDING');
      SELECT changed_at IS NOT NULL FROM proposal_status_change_times WHERE proposal_id=12;
      INSERT INTO station_proposals (id,user_id,status) VALUES (13,NULL,NULL);
      SELECT status IS NULL FROM proposal_status_change_times WHERE proposal_id=13;
      INSERT INTO proposal_status_change_times VALUES (10,'PENDING','2020-01-01 00:00:00');
      UPDATE station_proposals SET user_id=2 WHERE id=10;
      SELECT changed_at='2020-01-01 00:00:00' FROM proposal_status_change_times WHERE proposal_id=10;
      UPDATE station_proposals SET status='ACTIVE' WHERE id=10;
      SELECT changed_at>'2020-01-01 00:00:00' FROM proposal_status_change_times WHERE proposal_id=10;
    `), ['0', '1', '1', '1', '1']);
    assert.deepEqual(run(`
      UPDATE users SET custom_data='{"department":"South","chuc_vu":"GDKV"}' WHERE id=1;
      SELECT GROUP_CONCAT(proposal_id ORDER BY proposal_id) FROM proposal_sheet_sync_queue;
      SELECT requested_version FROM proposal_sheet_sync_queue WHERE proposal_id=10;
      UPDATE users SET custom_data='{"department":"South","chuc_vu":"GDKV"}' WHERE id=1;
      SELECT requested_version FROM proposal_sheet_sync_queue WHERE proposal_id=10;
      INSERT INTO charging_stations (id,proposal_id,on_date) VALUES (1,10,'2026-01-01');
      SELECT requested_version FROM proposal_sheet_sync_queue WHERE proposal_id=10;
      UPDATE charging_stations SET on_date='2026-01-02' WHERE id=1;
      SELECT requested_version FROM proposal_sheet_sync_queue WHERE proposal_id=10;
      DELETE FROM charging_stations WHERE id=1;
      SELECT requested_version FROM proposal_sheet_sync_queue WHERE proposal_id=10;
    `), ['10', '1', '1', '2', '3', '4']);
    run(`
      START TRANSACTION;
      UPDATE users SET full_name='Changed' WHERE id=1;
      ROLLBACK;
    `);
    assert.deepEqual(run('SELECT requested_version FROM proposal_sheet_sync_queue WHERE proposal_id=10;'), ['4']);
    assert.deepEqual(run(`
      UPDATE users SET parent_id=3 WHERE parent_id=1;
      SELECT requested_version FROM proposal_sheet_sync_queue WHERE proposal_id=10;
      DELETE FROM users WHERE id=3;
      SELECT GROUP_CONCAT(proposal_id ORDER BY proposal_id) FROM proposal_sheet_sync_queue;
    `), ['5', '10,11,12']);
    run(`CREATE TABLE proposal_requests (proposal_id INT, request_type VARCHAR(30),
      status VARCHAR(30), target_department VARCHAR(20));`);
    const statusLogMigration = fs.readFileSync(path.join(__dirname, '..', '..', 'database',
      '251-proposal-sheet-status-log-sync.sql'), 'utf8');
    run(statusLogMigration);
    run(statusLogMigration);
    run(`
      DELETE FROM proposal_sheet_sync_queue;
      UPDATE proposal_status_change_times SET changed_at='2024-01-01 10:00:00' WHERE proposal_id=10;
      INSERT INTO proposal_activity_logs VALUES
        (2,10,'status_change','PENDING','REVIEWING','2025-01-01 01:00:00'),
        (3,10,'status_change','REVIEWING','APPROVED','2025-01-01 01:00:00'),
        (4,10,'status_change_denied','APPROVED','CANCELLED','2026-01-01 01:00:00'),
        (5,10,'status_change','APPROVED','APPROVED','2026-02-01 01:00:00');
    `);
    const dataQt1 = loadProposals([10, 11, 12], 'Data_QT1');
    const testDataQt1 = loadProposals([10, 11, 12], 'TEST_Data_QT1');
    const legacy = loadProposals([10, 11, 12], 'Đề xuất');
    assert.deepEqual(testDataQt1, dataQt1);
    const qt1Record = dataQt1.find(row => row.id === 10);
    const legacyRecord = legacy.find(row => row.id === 10);
    assert.equal(qt1Record.status_log_id, 3);
    assert.equal(qt1Record.formatted, '01/01/2025 01:00');
    assert.equal(legacyRecord.formatted, '01/01/2024 10:00');
    assert.notEqual(qt1Record.status_changed_at, legacyRecord.status_changed_at);
    assert.equal(dataQt1.find(row => row.id === 11).status_log_id, null);
    assert.equal(dataQt1.find(row => row.id === 11).status_changed_at, null);
    assert.ok(dataQt1.find(row => row.id === 12).status_changed_at);
    assert.equal(dataQt1.find(row => row.id === 12).status_changed_at,
      legacy.find(row => row.id === 12).status_changed_at);
    assert.deepEqual(run(`
      SELECT requested_version FROM proposal_sheet_sync_queue WHERE proposal_id=10;
      UPDATE proposal_sheet_sync_queue SET status='PROCESSING' WHERE proposal_id=10;
      INSERT INTO proposal_activity_logs VALUES (6,10,'status_change','APPROVED','ACTIVE','2026-03-01 01:00:00');
      SELECT CONCAT(status,':',requested_version) FROM proposal_sheet_sync_queue WHERE proposal_id=10;
      START TRANSACTION;
      INSERT INTO proposal_activity_logs VALUES (7,10,'status_change','ACTIVE','CANCELLED','2026-04-01 01:00:00');
      ROLLBACK;
      SELECT CONCAT(status,':',requested_version) FROM proposal_sheet_sync_queue WHERE proposal_id=10;
    `), ['2', 'PROCESSING:3', 'PROCESSING:3']);
    assert.equal(loadProposals([10], 'Data_QT1')[0].status_log_id, 6);
    finishJob(true, 2);
    assert.deepEqual(run(`SELECT CONCAT(status,':',requested_version,':',synced_version)
      FROM proposal_sheet_sync_queue WHERE proposal_id=10;`), ['PENDING:3:2']);
    run(`UPDATE proposal_sheet_sync_queue SET status='PROCESSING', attempt_count=8 WHERE proposal_id=10;`);
    finishJob(false, 2);
    assert.deepEqual(run(`SELECT CONCAT(status,':',attempt_count,':',next_attempt_at IS NOT NULL)
      FROM proposal_sheet_sync_queue WHERE proposal_id=10;`), ['PENDING:0:1']);
    run(`UPDATE proposal_sheet_sync_queue SET status='PROCESSING', attempt_count=8 WHERE proposal_id=10;`);
    finishJob(false, 3);
    assert.deepEqual(run(`SELECT CONCAT(status,':',attempt_count,':',next_attempt_at IS NULL)
      FROM proposal_sheet_sync_queue WHERE proposal_id=10;`), ['FAILED:8:1']);
    run(`
      INSERT INTO charging_stations (id,proposal_id,contract_status,infra_power_status,infra_site_status,
        deposit_status,payment_status,deposit_refund_required) VALUES (2,10,'DONE','DONE','DOING','RECEIVED','DOING',0);
      INSERT INTO charging_station_invoices VALUES (1,2,'DEPOSIT',30), (2,2,'PAYMENT',65),
        (3,2,'REFUND',5), (4,2,'PAYMENT',10);
    `);
    const withInvoices = loadProposals([10, 11], 'Data_QT1');
    assert.equal(withInvoices.length, 2);
    const on = withInvoices.find(row => row.id === 10);
    assert.equal(on.on_station_id, 2);
    assert.equal(on.contract_status, 'DONE');
    assert.equal(Number(on.deposit_total), 30);
    assert.equal(Number(on.payment_total), 75);
    assert.equal(Number(on.refund_total), 5);
    assert.equal(withInvoices.find(row => row.id === 11).on_station_id, null);
  } finally {
    if (created) mysql(`DROP DATABASE \`${database}\`;`);
  }
});
