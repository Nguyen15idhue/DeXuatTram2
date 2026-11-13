const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/utils/db');
const service = require('../src/services/proposalSignatureService');
const reports = require('../src/services/proposalReportService');
const dynamic = require('../src/services/dynamicUtils');
test.after(() => pool.end());

const profile = user => ({
  userId: user.id, role: user.role, isAdmin: ['ADMIN', 'SUPER_ADMIN'].includes(user.role),
  isFinance: user.id === 20, isBackOffice: user.id === 30,
  department: user.id === 20 ? 'Phòng Tài chính và Kế toán' : user.id === 30 ? 'Back Office' : ''
});

test('chairman upload allows Back Office and Finance but denies MKT/CTV department-based upload', async t => {
  t.mock.method(reports, 'resolveScope', async user => profile(user));
  t.mock.method(pool, 'getConnection', async () => { throw new Error('Must not acquire lock'); });
  for (const user of [{ id: 30, role: 'CTV' }, { id: 30, role: 'MKT' },
    { id: 20, role: 'CTV' }, { id: 20, role: 'MKT' }]) {
    await assert.rejects(service.uploadSignedFile({ user, id: 1 }), { statusCode: 403 });
  }
  for (const user of [{ id: 30, role: 'SALES' }, { id: 30, role: 'ADMIN' }, { id: 20, role: 'SALES' }]) {
    await assert.rejects(service.uploadSignedFile({ user, id: 1 }), /Must not acquire lock/);
  }
});

for (const department of ['Phòng Tài chính và Kế toán', 'Back Office']) {
test(`${department} file access is restricted to eligible chairman proposal attachments`, async t => {
  const files = require('../src/controllers/fileController');
  let eligible = false;
  let unavailable = false;
  t.mock.method(pool, 'query', async (sql, params = []) => {
    if (sql.includes('SELECT role, token_version, custom_data FROM users')) return [[{
      role: 'SALES', token_version: 0, custom_data: { department }
    }]];
    if (sql.includes('FROM proposal_report_documents')) return [params[0] === 100 ? [{ id: 11, proposal_id: 1 }] : []];
    if (sql.includes('SELECT id,custom_data FROM station_proposals')) return [[{
      id: 1, custom_data: { ban_ve_layout: [{ id: 101, original_name: 'layout.pdf' }] }
    }]];
    return [[]];
  });
  t.mock.method(reports, 'assertReportReadAccess', async () => {
    throw Object.assign(new Error('Outside report scope'), { statusCode: 403 });
  });
  t.mock.method(service, 'canReadChairmanProposal', async ({ id }) => {
    if (unavailable) throw new Error('Database unavailable');
    return id === 1 && eligible;
  });
  const req = { user: { id: 20, role: 'SALES', tokenVersion: 0 } };
  assert.equal(await files.canAccessFile({ id: 100 }, req), false);
  eligible = true;
  assert.equal(await files.canAccessFile({ id: 100 }, req), true);
  assert.equal(await files.canAccessFile({ id: 101 }, req), true);
  assert.equal(await files.canAccessFile({ id: 999 }, req), false);
  unavailable = true;
  await assert.rejects(files.canAccessFile({ id: 101 }, req), /Database unavailable/);
});
}

test('every chairman file is accessible to proposal owner, assigned signers and Finance, not unrelated users', async t => {
  const controller = require('../src/controllers/fileController');
  let requester = { id: 1, role: 'CTV', department: '' };
  let finalMarker = 100;
  t.mock.method(pool, 'query', async (sql, params = []) => {
    if (sql.includes('SELECT role, token_version, custom_data FROM users')) {
      return [[{ role: requester.role, token_version: 0, custom_data: { department: requester.department } }]];
    }
    if (sql.includes('FROM proposal_chairman_files cf')) return [params[0] === 202 ? [{ proposal_id: 10, user_id: 1, signed_file_id: finalMarker }] : []];
    if (sql.includes('SELECT id FROM proposal_signature_configs')) return [params[1] === 2 ? [{ id: 10 }] : []];
    return [[]];
  });
  t.mock.method(reports, 'assertReportReadAccess', async () => { throw Object.assign(new Error('Outside branch'), { statusCode: 403 }); });
  const canRead = async () => controller.canAccessFile({ id: 202 }, {
    user: { id: requester.id, role: requester.role, tokenVersion: 0 }
  });
  assert.equal(await canRead(), true);
  requester = { id: 2, role: 'SALES', department: '' };
  assert.equal(await canRead(), true);
  requester = { id: 3, role: 'SALES', department: 'Phòng Tài chính và Kế toán' };
  assert.equal(await canRead(), true);
  requester = { id: 3, role: 'SALES', department: 'Back Office' };
  assert.equal(await canRead(), true);
  finalMarker = null;
  assert.equal(await canRead(), false);
  finalMarker = 100;
  requester = { id: 4, role: 'SALES', department: '' };
  assert.equal(await canRead(), false);
  requester = { id: 5, role: 'MKT', department: 'Phòng Tài chính và Kế toán' };
  assert.equal(await canRead(), false);
});

test('delete endpoint protects non-first chairman files without deleting the physical file', async t => {
  const controller = require('../src/controllers/fileController');
  const storage = require('../src/services/fileService');
  let status;
  let body;
  t.mock.method(storage, 'getFileById', async () => ({ id: 202, status: 'active' }));
  t.mock.method(storage, 'deleteFile', async () => { throw new Error('Must not delete chairman file'); });
  t.mock.method(pool, 'query', async sql => [sql.includes('UNION SELECT id FROM proposal_chairman_files') ? [{ id: 1 }] : []]);
  await controller.delete({ params: { id: 202 }, user: { id: 1, role: 'SUPER_ADMIN' } }, {
    status: code => { status = code; return { json: data => { body = data; } }; },
    json: data => { body = data; }
  });
  assert.equal(status, 409);
  assert.equal(body.success, false);
});

test('real SQL signature tabs split personal completion and chairman handoff without duplicate rows', {
  skip: process.env.RUN_SIGNATURE_SQL_TEST !== '1'
}, async t => {
  const connection = await pool.getConnection();
  const database = `test_signature_tasks_${Date.now()}`;
  const [[original]] = await connection.query('SELECT DATABASE() AS name');
  t.mock.method(pool, 'query', (sql, params) => connection.query(sql, params));
  t.mock.method(reports, 'resolveScope', async user => profile(user));
  t.mock.method(dynamic, 'getFieldDefinitionsByEntity', async () => []);
  t.mock.method(dynamic, 'mergeData', row => row);
  try {
    await connection.query(`CREATE DATABASE \`${database}\``);
    await connection.query(`USE \`${database}\``);
    await connection.query(`CREATE TABLE users(id INT PRIMARY KEY,full_name VARCHAR(40),email VARCHAR(40),parent_id INT,custom_data JSON)`);
    await connection.query(`CREATE TABLE station_proposals(id INT PRIMARY KEY,status VARCHAR(40),signed_file_id INT,
      signature_completed_at DATETIME,updated_at DATETIME,ma_de_xuat_gen VARCHAR(30),owner_name VARCHAR(40),
      owner_phone VARCHAR(20),address VARCHAR(40),user_id INT,custom_data JSON)`);
    await connection.query(`CREATE TABLE proposal_signature_configs(id INT AUTO_INCREMENT PRIMARY KEY,
      proposal_id INT,user_id INT,status VARCHAR(20),document_id INT,file_id INT)`);
    await connection.query(`INSERT INTO station_proposals(id,status,signed_file_id,signature_completed_at,updated_at) VALUES
      (1,'SIGNATURE_PENDING',NULL,NULL,NOW()),(2,'SIGNATURE_PENDING',NULL,NULL,NOW()),
      (3,'SIGNATURE_PENDING',NULL,NULL,NOW()),(4,'APPROVED',400,NULL,NOW()),
      (5,'SIGNATURE_PENDING',NULL,NOW(),NOW()),(6,'APPROVED',NULL,NULL,NOW()),
      (7,'SIGNATURE_PENDING',NULL,NULL,NOW())`);
    await connection.query(`INSERT INTO proposal_signature_configs(proposal_id,user_id,status,document_id,file_id) VALUES
      (1,10,'PENDING',1,101),(1,20,'PENDING',1,101),(2,10,'SIGNED',2,102),(2,10,'PENDING',3,103),
      (3,10,'SIGNED',4,104),(3,11,'PENDING',4,104),
      (4,11,'SIGNED',5,105),(5,10,'SIGNED',6,106),
      (7,10,'SIGNED',7,107),(7,10,'CANCELLED',8,108),(7,20,'SIGNED',7,107)`);
    const ids = async (user, tab, extra = {}) => {
      const result = await service.listProposals({ user, tab, ...extra });
      assert.equal(result.pagination.total, result.proposals.length);
      return result.proposals.map(row => row.id).sort((a, b) => a - b);
    };
    const signer = { id: 10, role: 'SALES' };
    const finance = { id: 20, role: 'SALES' };
    const superAdmin = { id: 1, role: 'SUPER_ADMIN' };
    assert.deepEqual(await ids(signer, 'pending'), [1, 2]);
    assert.deepEqual(await ids(signer, 'completed'), [3, 5, 7]);
    assert.deepEqual(await ids(signer, 'chairman'), [5, 7]);
    assert.deepEqual(await ids(signer, 'all'), [1, 2, 3, 5, 7]);
    assert.deepEqual(await ids(finance, 'pending'), [1, 5, 7]);
    assert.deepEqual(await ids(finance, 'completed'), [4, 7]);
    assert.deepEqual(await ids(finance, 'chairman'), []);
    assert.deepEqual(await ids(finance, 'all'), [1, 4, 5, 7]);
    assert.deepEqual(await ids(finance, 'pending', { myStatus: 'my_pending' }), [1]);
    assert.deepEqual(await ids(signer, 'all', { myStatus: 'my_signed' }), [3, 5, 7]);
    assert.deepEqual(await ids(superAdmin, 'pending'), [5, 7]);
    assert.deepEqual(await ids(superAdmin, 'completed'), [4]);
    assert.deepEqual(await ids(superAdmin, 'chairman'), [5, 7]);
    for (const role of ['ADMIN', 'SALES']) {
      const backOffice = { id: 30, role };
      assert.deepEqual(await ids(backOffice, 'pending'), [5, 7]);
      assert.deepEqual(await ids(backOffice, 'completed'), [4]);
      assert.deepEqual(await ids(backOffice, 'chairman'), []);
      assert.deepEqual(await ids(backOffice, 'all'), [1, 2, 3, 4, 5, 7]);
    }
    assert.equal(await service.canReadChairmanProposal({ user: finance, id: 1 }), false);
    assert.equal(await service.canReadChairmanProposal({ user: finance, id: 5 }), true);
    assert.equal(await service.canReadChairmanProposal({ user: finance, id: 4 }), true);
    assert.equal(await service.canReadChairmanProposal({ user: { id: 30, role: 'SALES' }, id: 5 }), true);
    assert.equal(await service.canReadChairmanProposal({ user: { id: 30, role: 'SALES' }, id: 1 }), false);
  } finally {
    await connection.query(`USE \`${original.name}\``);
    await connection.query(`DROP DATABASE \`${database}\``);
    connection.release();
  }
});
