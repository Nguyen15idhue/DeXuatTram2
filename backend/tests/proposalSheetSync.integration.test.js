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
  try {
    mysql(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    run(`
      CREATE TABLE users (id INT PRIMARY KEY, full_name VARCHAR(100), parent_id INT NULL, custom_data JSON);
      CREATE TABLE station_proposals (id INT PRIMARY KEY, user_id INT NULL, status VARCHAR(30),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP);
      CREATE TABLE charging_stations (id INT PRIMARY KEY, proposal_id INT NOT NULL, on_date DATE NULL);
      CREATE TABLE proposal_activity_logs (id INT PRIMARY KEY, proposal_id INT, action VARCHAR(50),
        from_status VARCHAR(30), to_status VARCHAR(30), created_at TIMESTAMP);
      CREATE TABLE proposal_sheet_sync_queue (proposal_id INT PRIMARY KEY, operation VARCHAR(10),
        requested_version BIGINT, synced_version BIGINT, status VARCHAR(20), attempt_count INT,
        next_attempt_at DATETIME NULL, last_error TEXT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
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
      INSERT INTO charging_stations VALUES (1,10,'2026-01-01');
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
  } finally {
    mysql(`DROP DATABASE IF EXISTS \`${database}\`;`);
  }
});
