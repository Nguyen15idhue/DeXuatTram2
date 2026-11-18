const test = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const pool = require('../src/utils/db');
const bulk = require('../src/services/chargingStationBulkAcceptanceService');
const work = require('../src/services/chargingStationWorkService');

const superAdmin = { id: 1, role: 'SUPER_ADMIN' };
const admin = { id: 2, role: 'ADMIN' };

test.after(() => pool.end());

test('bulk acceptance requires SUPER_ADMIN and validates the reason and preview targets before writing', async t => {
  const query = t.mock.method(pool, 'query', () => assert.fail('Unexpected query'));
  const connect = t.mock.method(pool, 'getConnection', () => assert.fail('Unexpected connection'));
  const body = { request_id: 'preview-1', reason: 'Audit reason', stations: [{ id: 1, token: 'a'.repeat(64) }] };
  await assert.rejects(bulk.preview(admin), { statusCode: 403 });
  await assert.rejects(bulk.execute(body, admin), { statusCode: 403 });
  await assert.rejects(bulk.execute({ ...body, reason: '  ' }, superAdmin), { statusCode: 400 });
  await assert.rejects(bulk.execute({ ...body, stations: [...body.stations, ...body.stations] }, superAdmin), { statusCode: 400 });
  await assert.rejects(bulk.execute({ ...body, stations: Array.from({ length: 21 }, (_, i) => ({ id: i + 1, token: 'a'.repeat(64) })) },
    superAdmin), { statusCode: 400, message: /tối đa 20/ });
  assert.equal(query.mock.callCount(), 0);
  assert.equal(connect.mock.callCount(), 0);
});

test('real SQL: bulk acceptance eligibility, preservation, per-station rollback, stale preview and idempotent retry', {
  skip: process.env.RUN_BULK_ACCEPTANCE_SQL_TEST !== '1'
}, async t => {
  const source = await pool.getConnection();
  const database = `test_bulk_acceptance_${Date.now()}`;
  let fixture;
  try {
    const [[original]] = await source.query('SELECT DATABASE() AS name');
    await source.query(`CREATE DATABASE \`${database}\``);
    for (const table of [
      'charging_stations', 'station_proposals', 'warehouse_exports', 'warehouse_export_items', 'charging_station_commitments',
      'charging_station_deployments', 'charging_station_acceptance_documents', 'charging_station_acceptance_images',
      'charging_station_activity_logs', 'charging_station_fulfillment_events'
    ]) await source.query(`CREATE TABLE \`${database}\`.\`${table}\` LIKE \`${original.name}\`.\`${table}\``);
    fixture = mysql.createPool({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER, password: process.env.DB_PASSWORD, database, charset: 'utf8mb4' });
    t.mock.method(pool, 'query', (...args) => fixture.query(...args));
    t.mock.method(pool, 'getConnection', () => fixture.getConnection());
    t.mock.method(console, 'error', () => {});

    await fixture.query(`INSERT INTO charging_stations(id,proposal_id,ma_tram,status,sub_status,acceptance_file_id,cms_station_code,on_date)
      VALUES (1,1,'MIXED','OPERATING','ACTIVE',NULL,'CMS-1','2026-11-01'),
             (2,2,'LEGACY','ACCEPTANCE','ACCEPT_FAILED',20,NULL,NULL),
             (3,3,'CANCELLED','CANCELLED',NULL,NULL,NULL,NULL),
             (4,4,'ALREADY','ACCEPTANCE','ACCEPT_PASSED',40,NULL,NULL),
             (5,5,'STALE','ACCEPTANCE','NOT_ACCEPTED',NULL,NULL,NULL),
             (6,6,'RETURN-HISTORY','ACCEPTANCE','NOT_ACCEPTED',NULL,NULL,NULL),
             (7,7,'COMMITMENTS-ONLY','ACCEPTANCE','NOT_ACCEPTED',NULL,NULL,NULL),
             (8,8,'REVIEW-REQUIRED','ACCEPTANCE','NOT_ACCEPTED',NULL,NULL,NULL),
             (99,99,'OUTSIDE-FIRST-PAGE','ACCEPTANCE','NOT_ACCEPTED',NULL,NULL,NULL)`);
    await fixture.query('UPDATE charging_stations SET fulfillment_review_required=1 WHERE id=8');
    await fixture.query(`INSERT INTO station_proposals(id,user_id,latitude,longitude,owner_name,owner_phone,status)
      VALUES(2,1,10,106,'Fixture','0000000000','DEPLOYING')`);
    await fixture.query(`INSERT INTO charging_station_commitments(id,charging_station_id,model,pole_id,quantity,source_key)
      VALUES(1,7,'LK',1,1,'line:1')`);
    await fixture.query(`INSERT INTO warehouse_exports(id,exporter_user_id,export_date,charging_station_id,destination_type,transport_status)
      VALUES(11,1,NOW(),1,'STATION','DELIVERED'),(12,1,NOW(),1,'STATION','RETURN_PENDING'),
            (13,1,NOW(),1,'STATION','RETURNED'),(31,1,NOW(),3,'STATION','DELIVERED'),
            (61,1,NOW(),6,'STATION','DELIVERED')`);
    await fixture.query(`INSERT INTO warehouse_export_items(id,export_id,pole_id,quantity,return_pending_quantity)
      VALUES(101,11,1,7,0),(102,12,1,1,0),(103,13,1,1,0),(104,11,1,1,1),
            (301,31,1,1,0),(601,61,1,1,0)`);
    await fixture.query(`INSERT INTO charging_station_deployments(id,charging_station_id,export_item_id,quantity,stage,sub_status,
      installation_status,installation_version,acceptance_status,on_quantity,on_date,returned_at)
      VALUES(11,1,101,2,'OPERATING','ACTIVE','DONE',4,'NOT',1,'2026-11-01',NULL),
            (12,1,101,1,'CONFIGURING','NOT_CONFIGURED','DONE',5,'FAILED',0,NULL,NULL),
            (13,1,101,1,'CONFIGURING','NOT_CONFIGURED','DONE',0,'PASSED',0,NULL,NULL),
            (14,1,101,1,'INSTALLING','INSTALLING','DOING',0,'NOT',0,NULL,NULL),
            (15,1,102,1,'CONFIGURING','NOT_CONFIGURED','DONE',0,'NOT',0,NULL,NULL),
            (16,1,103,1,'CONFIGURING','NOT_CONFIGURED','DONE',0,'NOT',0,NULL,NULL),
            (17,1,104,1,'CONFIGURING','NOT_CONFIGURED','DONE',0,'NOT',0,NULL,NULL),
            (31,3,301,1,'CONFIGURING','NOT_CONFIGURED','DONE',0,'NOT',0,NULL,NULL),
            (61,6,601,1,'CONFIGURING','NOT_CONFIGURED','DONE',0,'NOT',0,NULL,NOW())`);
    await fixture.query(`INSERT INTO charging_station_acceptance_documents(id,deployment_id,kind,file_id,note)
      VALUES(1,12,'EQUIPMENT',42,'Existing'),(2,12,'INFRASTRUCTURE',43,'Existing')`);
    await fixture.query(`INSERT INTO charging_station_acceptance_images (acceptance_document_id,file_id,sort_order) VALUES(1,44,0)`);

    const { request_id, stations } = await bulk.preview(superAdmin);
    assert.deepEqual(stations.map(row => [row.id, row.portions, row.quantity, row.legacy]),
      [[1, 2, 3, false], [2, 0, 0, true], [5, 0, 0, true], [99, 0, 0, true]]);
    await fixture.query("UPDATE charging_stations SET sub_status='ACCEPT_FAILED' WHERE id=5");
    const [before] = await fixture.query(`SELECT id,installation_status,installation_version,stage,sub_status,on_quantity,on_date
      FROM charging_station_deployments ORDER BY id`);
    const [docsBefore] = await fixture.query('SELECT * FROM charging_station_acceptance_documents ORDER BY id');
    const [imagesBefore] = await fixture.query('SELECT * FROM charging_station_acceptance_images ORDER BY id');
    await fixture.query(`CREATE TRIGGER fixture_fail_audit BEFORE INSERT ON charging_station_activity_logs FOR EACH ROW
      BEGIN IF JSON_UNQUOTE(JSON_EXTRACT(NEW.changed_fields,'$.deployment_id'))='12'
        THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture rollback'; END IF; END`);
    const payload = { request_id, reason: '  Verified by admin  ', stations };
    const first = await bulk.execute(payload, superAdmin);
    assert.deepEqual(first.stations.map(row => row.status), ['failed', 'updated', 'skipped', 'updated']);
    assert.equal(first.stations[0].retryable, true);
    assert.deepEqual((await fixture.query('SELECT acceptance_status FROM charging_station_deployments WHERE id IN (11,12) ORDER BY id'))[0],
      [{ acceptance_status: 'NOT' }, { acceptance_status: 'FAILED' }]);
    await fixture.query('DROP TRIGGER fixture_fail_audit');
    const [retried, repeat] = await Promise.all([bulk.execute(payload, superAdmin), bulk.execute(payload, superAdmin)]);
    assert.deepEqual(retried, repeat);
    assert.deepEqual([retried.updated, retried.skipped, retried.failed, retried.legacy, retried.portions, retried.quantity], [3, 1, 0, 2, 2, 3]);
    assert.deepEqual((await fixture.query(`SELECT acceptance_status,acceptance_legacy,workflow_version
      FROM charging_station_deployments ORDER BY id`))[0].map(row => Object.values(row)),
    [['PASSED', 1, 1], ['PASSED', 0, 1], ['PASSED', 0, 0], ...Array.from({ length: 6 }, () => ['NOT', 0, 0])]);
    assert.deepEqual((await fixture.query(`SELECT id,installation_status,installation_version,stage,sub_status,on_quantity,on_date
      FROM charging_station_deployments ORDER BY id`))[0], before);
    assert.deepEqual((await fixture.query('SELECT * FROM charging_station_acceptance_documents ORDER BY id'))[0], docsBefore);
    assert.deepEqual((await fixture.query('SELECT * FROM charging_station_acceptance_images ORDER BY id'))[0], imagesBefore);
    const [[legacy]] = await fixture.query('SELECT status,sub_status,acceptance_file_id FROM charging_stations WHERE id=2');
    assert.deepEqual(legacy, { status: 'CONFIGURING', sub_status: 'NOT_CONFIGURED', acceptance_file_id: 20 });
    const [[worklist]] = await fixture.query(`SELECT ${work.stageFilters['nghiem-thu'].need} AS needed,
      ${work.stageFilters['nghiem-thu'].completed} AS completed
      FROM charging_stations cs JOIN station_proposals p ON p.id=cs.proposal_id WHERE cs.id=2`);
    assert.deepEqual(worklist, { needed: 0, completed: 1 });
    const [[logs]] = await fixture.query(`SELECT COUNT(*) AS n FROM charging_station_activity_logs
      WHERE actor_id=1 AND source='admin_override' AND reject_reason='Verified by admin'
        AND JSON_UNQUOTE(JSON_EXTRACT(changed_fields,'$.request_id'))=?`, [request_id]);
    assert.equal(logs.n, 4);
    assert.deepEqual((await bulk.preview(superAdmin)).stations.map(row => row.id), [5]);
  } finally {
    if (fixture) await fixture.end();
    await source.query(`DROP DATABASE IF EXISTS \`${database}\``);
    source.release();
  }
});
