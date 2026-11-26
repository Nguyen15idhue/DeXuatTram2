const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const Module = require('node:module');
const mysql = require('mysql2');
const pool = require('../src/utils/db');
const proposals = require('../src/services/admin/adminProposalService.js');
const requests = require('../src/services/proposal/proposalRequestService.js');
const users = require('../src/services/admin/adminUserService.js');
const access = require('../src/services/proposal/proposalAccessService.js');
const dynamic = require('../src/services/dynamicUtils');
const { values, addInFilter } = require('../src/utils/multiValueFilter');
const { addProposalAdvancedFilters, patternForNormalizedRegion } = require('../src/utils/proposalAdvancedFilters');
const approvals = require('../src/services/proposal/proposalApprovalService.js');
const reports = require('../src/services/proposal/proposalReportService.js');

test('approval filter options require approval access and restrict options to approval records', async t => {
  t.mock.method(reports, 'resolveScope', async user => user);
  let receivedScope;
  t.mock.method(requests, 'getFilterOptions', async scope => {
    receivedScope = scope;
    return { owners: [] };
  });
  await approvals.getFilterOptions({ roleKey: 'TGD' });
  assert.deepEqual(receivedScope.proposalStatuses, [
    'PROPOSAL_REPORT_REVIEWING', 'PROPOSAL_REPORT_UPDATING', 'SIGNATURE_PENDING', 'APPROVED'
  ]);
  assert.equal(receivedScope.signedApprovalOnly, true);
  await assert.rejects(approvals.getFilterOptions({ role: 'SALES' }), { statusCode: 403 });
});

test('proposal APIs accept repeated values and retain existing single-value parameters', async t => {
  const express = require('express');
  const app = express();
  app.use((req, res, next) => { req.user = { id: 99, role: 'SUPER_ADMIN' }; next(); });
  app.get('/proposals', require('../src/controllers/admin/adminProposalController.js').getAll);
  app.get('/requests', require('../src/controllers/proposal/proposalRequestController.js').list);
  let proposalArgs;
  let requestArgs;
  t.mock.method(proposals, 'getAllProposals', async (...args) => {
    proposalArgs = args;
    return { proposals: [], pagination: {} };
  });
  t.mock.method(requests, 'listRequests', async args => {
    requestArgs = args;
    return { requests: [], pagination: {} };
  });
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${base}/proposals?status=PENDING&status=GRADING&province=H%C3%A0+N%E1%BB%99i&province=%C4%90%C3%A0+N%E1%BA%B5ng&statuses=PENDING,APPROVED`);
    assert.equal(response.status, 200);
    assert.deepEqual(proposalArgs[0], ['PENDING', 'GRADING']);
    assert.deepEqual(proposalArgs[7].province, ['Hà Nội', 'Đà Nẵng']);
    assert.deepEqual(proposalArgs[7].statuses, ['PENDING', 'APPROVED']);
    assert.equal((await fetch(`${base}/requests?type=UPDATE_INFO&type=SUPPLEMENT&manager_user_id=20&manager_user_id=21&region=Bac`)).status, 200);
    assert.deepEqual(requestArgs.type, ['UPDATE_INFO', 'SUPPLEMENT']);
    assert.deepEqual(requestArgs.managerUserId, ['20', '21']);
    assert.equal(requestArgs.region, 'Bac');
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('multi-value filters preserve punctuation and parameterize values', () => {
  const where = [];
  const params = [];
  addInFilter(where, params, 'p.status', ['PENDING', 'GRADING', 'PENDING']);
  addInFilter(where, params, 'u.department', ['Phòng A, B']);
  assert.deepEqual(where, ['p.status IN (?,?)', 'u.department IN (?)']);
  assert.deepEqual(params, ['PENDING', 'GRADING', 'Phòng A, B']);
  assert.deepEqual(values('PENDING'), ['PENDING']);
  assert.deepEqual(values([]), []);
});

test('proposal filters apply unions within each field and preserve scope before pagination', {
  skip: process.env.RUN_PROPOSAL_FILTER_INTEGRATION_TESTS !== '1', timeout: 90000
}, async t => {
  const database = `proposal_filter_test_${process.pid}_${Date.now()}`;
  const run = (sql) => {
    const result = spawnSync('docker', [
      'exec', '-i', process.env.MYSQL_CONTAINER || 'station-mysql', 'sh', '-c',
      'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -u root --default-character-set=utf8mb4 --batch --skip-column-names'
    ], { input: sql, encoding: 'utf8' });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim() ? result.stdout.trim().split(/\r?\n/).map(line => ({ total: Number(line) })) : [];
  };
  let created = false;
  try {
    run(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    created = true;
    run(`USE \`${database}\`;
      CREATE TABLE users (id INT PRIMARY KEY, parent_id INT, role VARCHAR(30), status VARCHAR(30),
        custom_data JSON, full_name VARCHAR(80));
      CREATE TABLE station_proposals (id INT PRIMARY KEY, user_id INT, status VARCHAR(40),
        custom_data JSON, journey_id INT, signed_file_id INT, created_at DATETIME, updated_at DATETIME);
      CREATE TABLE proposal_requests (id INT PRIMARY KEY, proposal_id INT, request_type VARCHAR(40),
        status VARCHAR(20), current_status VARCHAR(40), target_user_id INT, created_at DATETIME);
      INSERT INTO users VALUES
        (10,NULL,'CTV','ACTIVE','{"department":"Phòng A, B"}','A'),
        (11,10,'CTV','ACTIVE','{"department":"Phòng C"}','B'),
        (12,NULL,'CTV','ACTIVE','{"department":"Phòng C"}','C');
      INSERT INTO station_proposals VALUES
        (1,10,'PENDING','{"province":"Hà Nội","vung_mien":"Bac","mo_hinh_dau_tu":"NQ","loai_uu_tien":"1"}',1,NULL,'2026-01-01','2026-01-01'),
        (2,11,'GRADING','{"province":"Đà Nẵng","vung_mien":"Nam","mo_hinh_dau_tu":"LK","loai_uu_tien":"2"}',NULL,NULL,'2026-01-02','2026-01-02'),
        (3,12,'PENDING','{"province":"Hà Nội","vung_mien":"Bac","mo_hinh_dau_tu":"NQ","loai_uu_tien":"1"}',3,NULL,'2026-01-03','2026-01-03'),
        (4,10,'APPROVED','{"province":"Hà Nội","vung_mien":"Bac","mo_hinh_dau_tu":"NQ","loai_uu_tien":"1"}',4,NULL,'2026-01-04','2026-01-04');
      INSERT INTO proposal_requests VALUES
        (1,1,'UPDATE_INFO','OPEN',NULL,10,'2026-01-01'),
        (2,2,'SUPPLEMENT','OPEN',NULL,11,'2026-01-02'),
        (3,3,'UPDATE_INFO','OPEN',NULL,12,'2026-01-03');
    `);
    t.mock.method(users, 'getBranchIds', async id => ({ 20: [10], 21: [11] })[id] || []);
    const advancedWhere = ['p.user_id IN (10,11)'];
    const advancedParams = [];
    await addProposalAdvancedFilters(advancedWhere, advancedParams, {
      proposalStatus: ['PENDING', 'GRADING'], model: ['NQ', 'LK'],
      province: ['Hà Nội', 'Đà Nẵng'], region: ['bac', 'nam'],
      ownerUserId: ['10', '11', '12'], managerUserId: ['20', '21'],
      dateFrom: '2026-01-01', dateTo: '2026-01-02'
    }, patternForNormalizedRegion);
    const advancedSql = `SELECT COUNT(*) FROM station_proposals p WHERE ${advancedWhere.join(' AND ')}`;
    assert.equal(run(`USE \`${database}\`; ${mysql.format(advancedSql, advancedParams)};`)[0].total, 2);
    t.mock.method(access, 'buildOwnerScopeSql', async () => ({ sql: 'p.user_id IN (?,?)', params: [10, 11] }));
    t.mock.method(dynamic, 'getFieldDefinitionsByEntity', async () => []);
    t.mock.method(dynamic, 'enrichUserFieldsMany', async rows => rows);
    t.mock.method(pool, 'query', async (sql, params = []) => {
      if (sql.includes('SELECT DISTINCT p.user_id AS id')) {
        return [[{ id: 10, name: 'A' }, { id: 11, name: 'B' }, { id: 12, name: 'C' }]];
      }
      if (sql.includes('WITH RECURSIVE user_chain')) {
        const idsQuery = sql.replace('SELECT DISTINCT u.id, u.full_name AS name', 'SELECT DISTINCT u.id')
          .replace('ORDER BY u.full_name', 'ORDER BY u.id');
        return [run(`USE \`${database}\`; ${mysql.format(idsQuery, params)};`).map(row => ({ id: row.total, name: 'A' }))];
      }
      if (sql.includes('SELECT id, role, status, parent_id, custom_data FROM users')) {
        return [[{ id: 99, role: 'SUPER_ADMIN', status: 'ACTIVE', parent_id: null, custom_data: '{}' }]];
      }
      if (sql.includes('COUNT(*) AS total') || sql.includes('COUNT(*) as total')) {
        return [run(`USE \`${database}\`; ${mysql.format(sql, params)};`)];
      }
      if (sql.startsWith('SELECT p.* FROM station_proposals p')) {
        const idsQuery = sql.replace('SELECT p.*', 'SELECT p.id');
        return [run(`USE \`${database}\`; ${mysql.format(idsQuery, params)};`).map(row => ({ id: row.total }))];
      }
      return [[]];
    });
    const filterOptions = await requests.getFilterOptions({ all: true });
    assert.deepEqual(filterOptions.managers.map(manager => manager.id), [10]);

    const scope = { role: 'NPP', userId: 10, branchIds: [10, 11] };
    const filters = {
      province: ['Hà Nội', 'Đà Nẵng'], region: ['Bac', 'Nam'],
      department: ['Phòng A, B', 'Phòng C'], ownerUserId: ['10', '11', '12'],
      leadLink: ['yes', 'no'], managerUserId: ['20', '21']
    };
    const list = (status, extra = {}) => proposals.getAllProposals(
      status, '', 1, 1, scope, ['1', '2'], null, { ...filters, ...extra }
    );
    assert.equal((await list(['PENDING', 'GRADING'])).pagination.total, 2);
    assert.equal((await list(['PENDING', 'GRADING'], { statuses: ['PENDING'] })).pagination.total, 1);
    assert.equal((await list('PENDING')).pagination.total, 1);
    assert.equal((await list(['PENDING', 'GRADING'], { leadLink: ['yes'] })).pagination.total, 1);
    assert.equal((await list(['PENDING', 'GRADING'], { leadLink: ['no'] })).pagination.total, 1);
    assert.equal((await list([], { managerUserId: ['999'] })).pagination.total, 0);

    const requestScope = { role: 'SUPER_ADMIN', userId: 99 };
    const requestList = (type, managerUserId) => requests.listRequests({
      scope: requestScope, type, managerUserId,
      proposalStatus: ['PENDING', 'GRADING'], model: ['NQ', 'LK'],
      province: ['Hà Nội', 'Đà Nẵng'], region: ['Bac', 'Nam'],
      ownerUserId: ['10', '11', '12'], limit: 1
    });
    assert.equal((await requestList(['UPDATE_INFO', 'SUPPLEMENT'], ['20', '21'])).pagination.total, 2);
    assert.equal((await requestList('UPDATE_INFO', '20')).pagination.total, 1);
    assert.equal((await requestList(['UPDATE_INFO', 'SUPPLEMENT'], ['999'])).pagination.total, 0);

    const filename = require.resolve('../src/services/excelService');
    const excel = new Module(filename, module);
    excel.filename = filename;
    excel.paths = Module._nodeModulePaths(require('node:path').dirname(filename));
    excel._compile(`${fs.readFileSync(filename, 'utf8')}\nexports.testGetAllData = getAllData;`, filename);
    const [exported] = await excel.exports.testGetAllData('station_proposals', {
      status: ['PENDING', 'GRADING'], scopeBranchUserIds: '10,11'
    });
    assert.deepEqual(exported.map(row => row.id), [2, 1]);
    const [legacy] = await excel.exports.testGetAllData('station_proposals', {
      status: 'PENDING', scopeBranchUserIds: '10,11'
    });
    assert.deepEqual(legacy.map(row => row.id), [1]);

    run(`USE \`${database}\`;
      INSERT INTO station_proposals VALUES
        (5,12,'PENDING','{"vung_mien":"Nam","nguoi_phu_trach":{"id":11}}',NULL,NULL,'2026-01-05','2026-01-05'),
        (6,NULL,'PENDING','{"vung_mien":"Nam","sales_quan_ly":{"id":10}}',NULL,NULL,'2026-01-06','2026-01-06'),
        (7,NULL,'PENDING','{"vung_mien":"Bac"}',NULL,NULL,'2026-01-07','2026-01-07');
    `);
    const organizational = await require('../src/services/proposal/proposalReviewScope.js').build(
      { id: 10, department: 'Phòng A, B', region: null },
      [
        { id: 10, parent_id: null, custom_data: { department: 'Phòng A, B' } },
        { id: 11, parent_id: 10, custom_data: { department: 'Phòng C' } },
        { id: 12, parent_id: null, custom_data: { department: 'Phòng C' } }
      ]
    );
    const scopeParams = [];
    const scopeSql = require('../src/services/proposal/proposalReviewScope.js').sql(organizational, scopeParams);
    for (const [id, expected] of [[1, 1], [2, 1], [3, 0], [5, 1], [6, 1], [7, 0]]) {
      const sql = mysql.format(`SELECT COUNT(*) FROM station_proposals p WHERE p.id = ? AND ${scopeSql}`, [id, ...scopeParams]);
      assert.equal(run(`USE \`${database}\`; ${sql};`)[0].total, expected, `proposal ${id}`);
    }
  } finally {
    if (created) run(`DROP DATABASE \`${database}\`;`);
  }
});
