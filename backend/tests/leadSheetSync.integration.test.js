const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

test('Lead Sheet milestones use matching latest logs in an isolated database', {
  skip: process.env.RUN_LEAD_SHEET_INTEGRATION_TESTS !== '1', timeout: 90000
}, () => {
  const database = `lead_sheet_test_${process.pid}_${Date.now()}`;
  const mysql = (sql) => {
    const result = spawnSync('docker', [
      'exec', '-i', process.env.MYSQL_CONTAINER || 'station-mysql', 'sh', '-c',
      'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -u root --default-character-set=utf8mb4 --batch --skip-column-names'
    ], { input: sql, encoding: 'utf8' });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr);
  };
  let created = false;
  try {
    mysql(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    created = true;
    mysql(`USE \`${database}\`;
      CREATE TABLE users (id INT PRIMARY KEY, full_name VARCHAR(100), custom_data JSON);
      CREATE TABLE leads (id INT PRIMARY KEY, journey_id INT, lead_code VARCHAR(30),
        assigned_user_id INT, assigned_at DATETIME, first_contact_at DATETIME,
        sales_outcome VARCHAR(30), sales_outcome_at DATETIME, created_at DATETIME,
        updated_at DATETIME, custom_data JSON, deleted_at DATETIME);
      CREATE TABLE lead_sheet_sync_queue (id INT PRIMARY KEY, lead_code VARCHAR(30),
        version INT, attempt_count INT, status VARCHAR(20), next_attempt_at DATETIME);
      CREATE TABLE lead_assignments (lead_id INT, assignee_user_id INT, started_at DATETIME, ended_at DATETIME);
      CREATE TABLE journey_activity_logs (id INT PRIMARY KEY, journey_id INT, entity_type VARCHAR(30),
        entity_id INT, action VARCHAR(80), changed_fields JSON, created_at TIMESTAMP);
      INSERT INTO users VALUES
        (1,'Tester','{"chuc_vu":"Giám đốc Khu vực","department":"Trung tâm Kinh doanh miền Bắc"}'),
        (2,'Tester','{"chuc_vu":"Giám đốc Trung tâm Kinh doanh","department":"Trung tâm Kinh doanh miền Bắc"}');
      INSERT INTO leads (id,journey_id,lead_code,assigned_user_id,assigned_at,first_contact_at,
        sales_outcome,sales_outcome_at,created_at,updated_at,custom_data) VALUES
        (10,10,'LD-000010',1,NULL,'2026-11-18 10:00:00','SUCCESS',NULL,'2026-11-01 08:00:00','2026-11-20 08:00:00','{}'),
        (11,11,'LD-000011',1,NULL,NULL,'FAILED',NULL,'2026-11-01 08:00:00','2026-11-20 08:00:00','{}'),
        (12,12,'LD-000012',2,'2026-11-18 09:00:00',NULL,NULL,NULL,'2026-11-01 08:00:00','2026-11-20 08:00:00','{}'),
        (13,13,'LD-000013',1,NULL,NULL,NULL,NULL,'2026-11-01 08:00:00','2026-11-20 08:00:00','{}');
      INSERT INTO lead_sheet_sync_queue VALUES
        (10,'LD-000010',1,0,'PENDING','2020-01-01'),
        (11,'LD-000011',1,0,'PENDING','2020-01-01'),
        (12,'LD-000012',1,0,'PENDING','2020-01-01'),
        (13,'LD-000013',1,0,'PENDING','2020-01-01');
      INSERT INTO lead_assignments VALUES (13,1,'2026-11-18 09:00:00',NULL);
      INSERT INTO journey_activity_logs VALUES
        (1,10,'lead',10,'assigned','{"assigned_user_id":{"from":2,"to":1}}','2026-11-18 09:00:00'),
        (2,10,'lead',10,'lead_updated','{"sales_outcome":{"from":null,"to":"FAILED"}}','2026-11-19 08:00:00'),
        (3,10,'lead',10,'lead_updated','{"sales_outcome":{"from":"FAILED","to":"SUCCESS"}}','2026-11-19 08:00:00'),
        (4,11,'lead',11,'assigned','{"assigned_user_id":{"from":1,"to":2}}','2026-11-18 09:00:00'),
        (5,11,'lead',11,'lead_updated','{"sales_outcome":{"from":"FAILED","to":"SUCCESS"}}','2026-11-19 08:00:00'),
        (6,13,'lead',13,'assigned',NULL,'2026-11-18 09:00:00'),
        (7,11,'lead',11,'assigned','{"assigned_user_id":{"from":2,"to":1}}','2026-11-17 09:00:00'),
        (8,11,'lead',11,'lead_updated','{"sales_outcome":{"from":null,"to":"FAILED"}}','2026-11-18 08:00:00');
    `);
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'services',
      'leadSheetSyncService.js')).toString('base64');
    const script = `
      const Module = require('module');
      const filename = '/app/src/services/leadSheetSyncService.js';
      const m = new Module(filename, module);
      m.filename = filename;
      m.paths = Module._nodeModulePaths('/app/src/services');
      m._compile(Buffer.from('${source}', 'base64').toString('utf8') +
        '\\nmodule.exports.__loadJobs = loadJobs;', filename);
      const db = require('/app/src/utils/db');
      (async () => {
        try {
          const jobs = await m.exports.__loadJobs(db);
          console.log(JSON.stringify(jobs.map(job => {
            const row = m.exports.mapLeadToRow(job);
            return { id: job.id, updated: row[15], assigned: row[21], contact: row[26], outcome: row[27] };
          })));
        } finally { await db.end(); }
      })().catch(error => { console.error(error.message); process.exitCode = 1; });
    `;
    const result = spawnSync('docker', [
      'exec', '-i', '-e', `DB_NAME=${database}`, 'station-backend', 'node', '-'
    ], { input: script, encoding: 'utf8' });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr);
    const rows = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
    assert.deepEqual(rows, [
      { id: 10, updated: '20/11/2026 08:00', assigned: '18/11/2026 09:00',
        contact: '18/11/2026 10:00', outcome: '19/11/2026 08:00' },
      { id: 11, updated: '20/11/2026 08:00', assigned: '', contact: '', outcome: '' },
      { id: 12, updated: '20/11/2026 08:00', assigned: '', contact: '', outcome: '' },
      { id: 13, updated: '20/11/2026 08:00', assigned: '18/11/2026 09:00', contact: '', outcome: '' }
    ]);
  } finally {
    if (created) mysql(`DROP DATABASE \`${database}\`;`);
  }
});
