const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const JSZip = require('jszip');
const pool = require('../src/utils/db');
const files = require('../src/services/proposalChairmanFileService');
const fileService = require('../src/services/fileService');
const fileController = require('../src/controllers/fileController');
const signatures = require('../src/services/proposalSignatureService');
const lifecycle = require('../src/services/proposalLifecycle');
test.after(() => pool.end());

test('common collection validates exact count, IDs, duplicates and legacy payload', () => {
  const selected = Array.from({ length: 20 }, (_, index) => ({ id: index + 1 }));
  assert.deepEqual(files.normalizeFiles(selected), selected.map(file => file.id));
  assert.deepEqual(files.normalizeFiles([{ id: '1' }]), [1]);
  assert.deepEqual(files.normalizeFiles(undefined, [{ document_id: 100, file_id: 10 }, { document_id: 101, file_id: 11 }]), [10, 11]);
  for (const invalid of [undefined, null, [], [...selected, { id: 21 }], [{ id: 1 }, { id: 1 }], [{ id: 0 }],
    [{ id: 'no' }], [{ id: true }], [true], [{ id: 1.5 }], [{ id: Number.MAX_SAFE_INTEGER + 1 }]]) {
    assert.throws(() => files.normalizeFiles(invalid), { statusCode: 400 });
  }
});

test('supported originals, exact 10MB boundary, missing/invalid files and ownership', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'chairman-validation-'));
  const records = new Map();
  let readable = true;
  t.mock.method(fileService, 'getFilePath', async id => records.get(id));
  t.mock.method(fileController, 'canAccessFile', async () => readable);
  try {
    const cases = [
      ['jpg', 'image/jpeg', Buffer.from([255, 216, 255])],
      ['png', 'image/png', Buffer.from([137, 80, 78, 71])],
      ['gif', 'image/gif', Buffer.from('GIF89a')],
      ['webp', 'image/webp', Buffer.from('RIFFabcdWEBP')],
      ['pdf', 'application/pdf', Buffer.from('%PDF-1.7')],
      ['doc', 'application/msword', Buffer.from([208, 207, 17, 224])],
      ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', Buffer.from([80, 75, 3, 4])]
    ];
    for (const [index, [extension, mime, bytes]] of cases.entries()) {
      const filePath = path.join(directory, `${index}.${extension}`);
      await fs.writeFile(filePath, bytes);
      records.set(index + 1, { filePath, file: { id: index + 1, original_name: `test.${extension}`, mime_type: mime, size: bytes.length } });
    }
    await files.validate([...records.keys()], { id: 1 }, '127.0.0.1');
    const pdf = records.get(5);
    await fs.truncate(pdf.filePath, files.MAX_SIZE);
    pdf.file.size = files.MAX_SIZE;
    await files.validate([5], { id: 1 });
    await fs.truncate(pdf.filePath, files.MAX_SIZE + 1);
    await assert.rejects(files.validate([5], { id: 1 }), /10MB/);
    await fs.writeFile(pdf.filePath, Buffer.from('%PDF'));
    pdf.file.size = 4;
    readable = false;
    await assert.rejects(files.validate([5], { id: 1 }), { statusCode: 403 });
    readable = true;
    pdf.file.mime_type = 'image/png';
    await assert.rejects(files.validate([5], { id: 1 }), /không phải ảnh/);
    pdf.file.mime_type = 'application/pdf';
    await fs.writeFile(pdf.filePath, 'malicious text');
    await assert.rejects(files.validate([5], { id: 1 }), /Nội dung file/);
    await assert.rejects(files.validate([999], { id: 1 }), /Không tìm thấy/);
    pdf.file.status = 'deleted';
    await assert.rejects(files.validate([5], { id: 1 }), /Không tìm thấy/);
  } finally { await fs.rm(directory, { recursive: true }); }
});

test('downloads original bytes and collision-safe ZIP names; checks proposal/file scope', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'chairman-download-'));
  const originals = [
    { id: 1, original_name: '../Ảnh.pdf', mime_type: 'application/pdf' },
    { id: 2, original_name: '../Ảnh.pdf', mime_type: 'application/pdf' },
    { id: 3, original_name: 'ảnh.png', mime_type: 'image/png' }
  ];
  t.mock.method(pool, 'query', async () => [originals]);
  t.mock.method(signatures, 'getDetail', async () => ({}));
  t.mock.method(fileController, 'canAccessFile', async () => true);
  t.mock.method(fileService, 'getFilePath', async id => ({
    file: originals.find(file => file.id === id), filePath: path.join(directory, `${id}`)
  }));
  try {
    for (const file of originals) await fs.writeFile(path.join(directory, `${file.id}`), Buffer.from(`original-${file.id}`));
    const result = await files.download({ id: 100, user: { id: 1 }, fileId: 3 });
    assert.equal(result.mime_type, 'image/png');
    assert.equal(result.bytes.toString(), 'original-3');
    const all = await files.download({ id: 100, user: { id: 1 } });
    const zip = await JSZip.loadAsync(all.bytes);
    const entries = Object.keys(zip.files);
    assert.equal(entries.length, 3);
    assert.equal(entries.some(name => name.includes('/') || name.includes('..')), false);
    for (const [index, name] of entries.entries()) assert.equal(await zip.file(name).async('string'), `original-${index + 1}`);
    await assert.rejects(files.download({ id: 100, user: { id: 1 }, fileId: 99 }), { statusCode: 404 });
    t.mock.method(fileController, 'canAccessFile', async () => false);
    await assert.rejects(files.download({ id: 100, user: { id: 1 }, fileId: 1 }), { statusCode: 403 });
    t.mock.method(signatures, 'getDetail', async () => { throw Object.assign(new Error('Outside scope'), { statusCode: 403 }); });
    await assert.rejects(files.download({ id: 100, user: { id: 1 } }), /Outside scope/);
  } finally { await fs.rm(directory, { recursive: true }); }
});

test('real migration backfills all legacy files idempotently; actual upload atomically commits or rolls back files, status, audit and notification', {
  skip: process.env.RUN_SIGNATURE_SQL_TEST !== '1'
}, async t => {
  const connection = await pool.getConnection();
  const database = `test_chairman_files_${Date.now()}`;
  const [[original]] = await connection.query('SELECT DATABASE() AS name');
  t.mock.method(pool, 'query', (sql, values) => connection.query(sql, values));
  t.mock.method(pool, 'getConnection', async () => ({
    query: (sql, values) => connection.query(sql, values),
    beginTransaction: () => connection.beginTransaction(), commit: () => connection.commit(),
    rollback: () => connection.rollback(), release: () => {}
  }));
  t.mock.method(require('../src/services/proposalReportService'), 'resolveScope',
    async () => ({ userId: 1, role: 'SUPER_ADMIN', isAdmin: true, isFinance: false }));
  t.mock.method(require('../src/services/proposalReportDocumentService'), 'getSigningDocuments',
    async () => [{ id: 11, signing_file_id: 101, source_file_id: 101 }]);
  t.mock.method(require('../src/services/chargingStationService'), 'createFromApprovedProposal', async () => {});
  t.mock.method(require('../src/services/notificationService'), 'getUserName', async () => 'Tester');
  t.mock.method(files, 'validate', async () => {});
  let failAudit = true;
  const log = lifecycle.logActivity;
  t.mock.method(lifecycle, 'logActivity', async payload => {
    if (failAudit && payload.action === 'signed_file_uploaded') throw new Error('Audit failed');
    return log(payload);
  });
  try {
    await connection.query(`CREATE DATABASE \`${database}\``);
    await connection.query(`USE \`${database}\``);
    await connection.query('CREATE TABLE users(id INT PRIMARY KEY,full_name VARCHAR(40),email VARCHAR(60),role VARCHAR(30)) ENGINE=InnoDB');
    await connection.query(`CREATE TABLE files(id INT PRIMARY KEY,original_name VARCHAR(100),mime_type VARCHAR(100),
      size INT,uploaded_by INT,status VARCHAR(20)) ENGINE=InnoDB`);
    await connection.query(`CREATE TABLE station_proposals(id INT PRIMARY KEY,user_id INT,status VARCHAR(40),
      ma_de_xuat_gen VARCHAR(40),custom_data JSON,signed_file_id INT,signature_completed_at DATETIME,journey_id INT,
      reject_reason TEXT,reviewed_by INT,reviewed_at DATETIME,updated_at DATETIME,supplement_deadline_at DATETIME,
      transition_deadline_at DATETIME,info_completed_at DATETIME,countdown_calendar_id INT) ENGINE=InnoDB`);
    await connection.query(`CREATE TABLE proposal_report_documents(id INT PRIMARY KEY,proposal_id INT,signed_file_id INT,is_current INT) ENGINE=InnoDB`);
    await connection.query(`CREATE TABLE proposal_signature_configs(id INT PRIMARY KEY,proposal_id INT,
      document_id INT,file_id INT,user_id INT,status VARCHAR(20),page INT,pos_x FLOAT,pos_y FLOAT,
      box_width FLOAT,box_height FLOAT,signer_title VARCHAR(40),signer_department VARCHAR(40),signed_at DATETIME,
      signature_id INT,signature_url VARCHAR(80),signature_snapshot_path VARCHAR(80),signature_snapshot_sha256 VARCHAR(80),
      signature_snapshot_mime VARCHAR(80),signature_snapshot_created_at DATETIME)`);
    await connection.query(`CREATE TABLE proposal_activity_logs(id INT AUTO_INCREMENT PRIMARY KEY,proposal_id INT,action VARCHAR(40),
      from_status VARCHAR(40),to_status VARCHAR(40),changed_fields JSON,reject_reason TEXT,actor_id INT,
      actor_role VARCHAR(30),source VARCHAR(30),manual_override TINYINT,ip VARCHAR(60))`);
    await connection.query(`CREATE TABLE notifications(id INT AUTO_INCREMENT PRIMARY KEY,user_id INT,type VARCHAR(40),
      title VARCHAR(200),message TEXT,entity_type VARCHAR(40),entity_id INT,created_by INT,is_read TINYINT)`);
    await connection.query("INSERT INTO users VALUES(1,'Tester','test@example.test','SUPER_ADMIN')");
    await connection.query(`INSERT INTO files VALUES (101,'1.pdf','application/pdf',1,1,'active'),
      (201,'2.png','image/png',1,1,'active'),(202,'3.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',1,1,'active')`);
    await connection.query(`INSERT INTO station_proposals(id,user_id,status,signed_file_id,ma_de_xuat_gen)
      VALUES(1,1,'APPROVED',101,'LEGACY'),(2,1,'SIGNATURE_PENDING',NULL,'NEW')`);
    await connection.query('INSERT INTO proposal_report_documents VALUES(1,1,101,1),(2,1,201,1),(3,1,202,0)');
    const migration = await fs.readFile(path.join(__dirname, '../../database/233-proposal-chairman-files.sql'), 'utf8');
    const migrate = async () => { for (const sql of migration.split(';').map(value => value.trim()).filter(Boolean)) await connection.query(sql); };
    await migrate();
    await migrate();
    assert.deepEqual((await files.list(1)).map(file => file.id), [101, 201, 202]);
    await connection.query("INSERT INTO proposal_signature_configs(id,proposal_id,document_id,file_id,user_id,status) VALUES(1,2,11,101,1,'SIGNED')");
    const args = { user: { id: 1, role: 'SUPER_ADMIN' }, id: 2, files: [{ id: 201 }, { id: 202 }] };
    await assert.rejects(signatures.uploadSignedFile(args), /Audit failed/);
    const [[rolledBack]] = await connection.query('SELECT status,signed_file_id FROM station_proposals WHERE id=2');
    assert.equal(rolledBack.status, 'SIGNATURE_PENDING');
    assert.equal(rolledBack.signed_file_id, null);
    assert.equal((await files.list(2)).length, 0);
    const [[auditBefore]] = await connection.query('SELECT COUNT(*) AS n FROM proposal_activity_logs');
    const [[noticesBefore]] = await connection.query('SELECT COUNT(*) AS n FROM notifications');
    assert.equal(auditBefore.n, 0);
    assert.equal(noticesBefore.n, 0);
    failAudit = false;
    const uploaded = await signatures.uploadSignedFile(args);
    assert.equal(uploaded.status, 'APPROVED');
    assert.equal(uploaded.signed_file_id, 201);
    assert.deepEqual(uploaded.chairman_files.map(file => file.id), [201, 202]);
    const [[auditAfter]] = await connection.query('SELECT COUNT(*) AS n FROM proposal_activity_logs');
    assert.equal(auditAfter.n, 2);
    const [[noticesAfter]] = await connection.query('SELECT COUNT(*) AS n FROM notifications');
    assert.equal(noticesAfter.n, 2);
    await assert.rejects(signatures.uploadSignedFile(args), { statusCode: 400 });
    await assert.rejects(fileService.deleteFile(202), { statusCode: 409 });
    const [[protectedFile]] = await connection.query('SELECT status FROM files WHERE id=202');
    assert.equal(protectedFile.status, 'active');
  } finally {
    await connection.query(`USE \`${original.name}\``);
    await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
    connection.release();
  }
});
