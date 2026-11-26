const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

test('entry tasks and approval serialize against proposal edits', {
  skip: process.env.RUN_PROPOSAL_ENTRY_INTEGRATION_TESTS !== '1',
  timeout: 60000
}, async (t) => {
  if (!/^proposal_entry_test_[a-z0-9]+$/.test(process.env.DB_NAME || '')) {
    throw new Error('A dedicated proposal_entry_test_* database is required');
  }
  const config = {
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, multipleStatements: true
  };
  const setup = await mysql.createConnection(config);
  const schema = `
    CREATE TABLE users (id INT PRIMARY KEY, parent_id INT, role VARCHAR(30), status VARCHAR(30), custom_data JSON, full_name VARCHAR(80));
    CREATE TABLE station_proposals (
      id INT PRIMARY KEY, user_id INT, status VARCHAR(40), owner_name VARCHAR(80),
      latitude DECIMAL(10,6), longitude DECIMAL(10,6),
      journey_id INT NULL, custom_data JSON, signed_file_id INT NULL,
      supplement_deadline_at DATETIME NULL, transition_deadline_at DATETIME NULL,
      countdown_calendar_id INT NULL, paused_from_status VARCHAR(40) NULL, paused_at DATETIME NULL,
      info_completed_at DATETIME NULL, reject_reason TEXT NULL, reviewed_by INT NULL,
      reviewed_at DATETIME NULL, updated_at DATETIME NULL, signature_completed_at DATETIME NULL,
      ma_de_xuat_gen VARCHAR(80) NULL, address VARCHAR(255) NULL, chot_so_luong_tru JSON NULL
    );
    CREATE TABLE proposal_requests (
      id INT AUTO_INCREMENT PRIMARY KEY, proposal_id INT, request_type ENUM('UPDATE_INFO','SUPPLEMENT','LAYOUT_SUPPLEMENT','RE_GRADE','REVISE_BCDX','TGD_REVIEW','OTHER') NOT NULL DEFAULT 'UPDATE_INFO',
      description TEXT NULL, requested_by INT NULL, previous_status VARCHAR(40) NULL,
      current_status VARCHAR(40) NULL, target_user_id INT NULL, target_department VARCHAR(100) NULL, target_title VARCHAR(100) NULL,
      round_no INT NOT NULL DEFAULT 1, note TEXT NULL, resolution_note TEXT NULL,
      status ENUM('OPEN','DONE','CANCELLED') NOT NULL DEFAULT 'OPEN', resolved_by INT NULL, resolved_at DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE proposal_activity_logs (
      id INT AUTO_INCREMENT PRIMARY KEY, proposal_id INT, action VARCHAR(40), from_status VARCHAR(40), to_status VARCHAR(40),
      changed_fields JSON NULL, reject_reason TEXT NULL, actor_id INT NULL, actor_role VARCHAR(30) NULL,
      source VARCHAR(30), manual_override TINYINT, ip VARCHAR(50) NULL
    );
    CREATE TABLE forms (id INT PRIMARY KEY, entity VARCHAR(40), purpose VARCHAR(20), status VARCHAR(20), is_default TINYINT, layout_config JSON);
    CREATE TABLE field_definitions (id INT PRIMARY KEY, \`key\` VARCHAR(80));
    CREATE TABLE form_fields (form_id INT, field_id INT, config JSON);
    INSERT INTO forms VALUES (13,'station_proposals','create','active',1,'{}');
    INSERT INTO field_definitions VALUES (1,'owner_name'),(2,'latitude'),(3,'longitude');
    INSERT INTO form_fields VALUES (13,1,'{}'),(13,2,'{}'),(13,3,'{}');
    INSERT INTO users VALUES
      (1,NULL,'SUPER_ADMIN','ACTIVE','{}','Super'),
      (2,NULL,'ADMIN','ACTIVE','{}','Admin'),
      (3,NULL,'SALES','ACTIVE','{"chuc_vu":"Giám đốc Khu vực"}','GĐKV'),
      (4,3,'NPP','ACTIVE','{}','NPP'), (5,4,'CTV','ACTIVE','{}','CTV');
    INSERT INTO station_proposals (id,user_id,status,owner_name,latitude,longitude,custom_data) VALUES
      (10,5,'PENDING','Đủ',21,105,'{}'), (11,3,'PENDING','',21,105,'{}'),
      (12,4,'PENDING','Đủ',21,105,'{}');
  `;
  await setup.query(schema);
  const migration = fs.readFileSync(path.join(__dirname, '..', '..', 'database', '255-proposal-entry-approval.sql'), 'utf8');
  await setup.query(migration);
  await setup.query(migration);
  const pool = require('../src/utils/db');
  const approval = require('../src/services/proposalEntryApproval');
  const dynamic = require('../src/services/dynamicUtils');
  const lifecycle = require('../src/services/proposalLifecycle');
  const notification = require('../src/services/notificationService');
  const grading = require('../src/services/proposalGradingService');
  const requests = require('../src/services/proposalRequestService');
  const access = require('../src/services/proposalAccessService');
  t.mock.method(dynamic, 'getFieldDefinitionsByEntity', async () => [
    { key: 'owner_name', label: 'Tên', type: 'text', required: 1 },
    { key: 'latitude', label: 'Vĩ độ', type: 'number', required: 1 },
    { key: 'longitude', label: 'Kinh độ', type: 'number', required: 1 }
  ]);
  t.mock.method(lifecycle, 'getDeadlineDates', async () => ({ supplement: null, transition: null, calendarId: null }));
  t.mock.method(lifecycle, 'notifyStepReceivers', async () => []);
  t.mock.method(notification, 'getUserName', async () => 'Quản lý');
  t.mock.method(notification, 'create', async () => {});
  t.mock.method(grading, 'syncNoteForProposal', async () => {});
  t.mock.method(access, 'buildOwnerScopeSql', async user => ({ sql: 'p.user_id = ?', params: [user.id] }));
  try {
    assert.equal((await lifecycle.processPendingEntry(10, { actorId: 5, actorRole: 'CTV' })).waitingManagerApproval, true);
    await lifecycle.processPendingEntry(10, { actorId: 5, actorRole: 'CTV' });
    let [tasks] = await setup.query("SELECT status FROM proposal_requests WHERE proposal_id=10");
    assert.deepEqual(tasks.map(row => row.status), ['OPEN']);
    const managerTasks = await requests.listRequests({ scope: { role: 'SALES', userId: 3 }, limit: 1 });
    assert.equal(managerTasks.pagination.total, 1);
    assert.equal(managerTasks.requests[0].can_approve, true);
    assert.equal(managerTasks.requests[0].can_complete, false);
    const distributorTasks = await requests.listRequests({ scope: { role: 'NPP', userId: 4 }, limit: 1 });
    assert.equal(distributorTasks.pagination.total, 0);
    await assert.rejects(lifecycle.transition(10, 'GRADING', { actorId: 4, actorRole: 'NPP' }), { statusCode: 403 });

    const lock = await pool.getConnection();
    await lock.beginTransaction();
    await lock.query('SELECT id FROM station_proposals WHERE id=10 FOR UPDATE');
    const racingApproval = lifecycle.transition(10, 'GRADING', { actorId: 3, actorRole: 'SALES' });
    await new Promise(resolve => setTimeout(resolve, 150));
    await lock.query("UPDATE station_proposals SET owner_name='' WHERE id=10");
    await lock.commit();
    lock.release();
    await assert.rejects(racingApproval, { statusCode: 400 });
    const [stillPending] = await setup.query('SELECT status FROM station_proposals WHERE id=10');
    assert.equal(stillPending[0].status, 'PENDING');

    await approval.preparePending(10, 5, 'CTV');
    [tasks] = await setup.query("SELECT status FROM proposal_requests WHERE proposal_id=10");
    assert.deepEqual(tasks.map(row => row.status), ['CANCELLED']);
    await setup.query("UPDATE station_proposals SET owner_name='Đủ' WHERE id=10");
    await approval.preparePending(10, 5, 'CTV');
    const result = await lifecycle.transition(10, 'GRADING', { actorId: 3, actorRole: 'SALES' });
    assert.equal(result.status, 'GRADING');
    [tasks] = await setup.query("SELECT status FROM proposal_requests WHERE proposal_id=10 ORDER BY id");
    assert.deepEqual(tasks.map(row => row.status), ['CANCELLED', 'DONE']);
    const incomplete = await lifecycle.processPendingEntry(11, { actorId: 3, actorRole: 'SALES' });
    assert.equal(incomplete.confirmed, false);
    await setup.query("UPDATE station_proposals SET owner_name='Đủ' WHERE id=11");
    const automatic = await lifecycle.processPendingEntry(11, { actorId: 3, actorRole: 'SALES' });
    assert.equal(automatic.movedTo, 'GRADING');

    await lifecycle.processPendingEntry(12, { actorId: 4, actorRole: 'NPP' });
    await approval.reopenPending(12, { actorId: 3, actorRole: 'SALES' });
    let [reopened] = await setup.query('SELECT info_completed_at FROM station_proposals WHERE id=12');
    assert.equal(reopened[0].info_completed_at, null);
    [tasks] = await setup.query('SELECT request_type, status FROM proposal_requests WHERE proposal_id=12 ORDER BY id');
    assert.deepEqual(tasks.map(row => [row.request_type, row.status]), [
      ['ENTRY_APPROVAL', 'CANCELLED'], ['UPDATE_INFO', 'OPEN']
    ]);
    await lifecycle.processPendingEntry(12, { actorId: 4, actorRole: 'NPP' });
    await lifecycle.transition(12, 'CANCELLED', { actorId: 3, actorRole: 'SALES', reason: 'Không tiếp tục' });
    [tasks] = await setup.query("SELECT status FROM proposal_requests WHERE proposal_id=12 AND request_type='ENTRY_APPROVAL' ORDER BY id");
    assert.deepEqual(tasks.map(row => row.status), ['CANCELLED', 'CANCELLED']);
  } finally {
    await pool.end();
    await setup.end();
  }
});
