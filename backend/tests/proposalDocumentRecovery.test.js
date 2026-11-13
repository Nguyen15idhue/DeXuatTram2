const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const JSZip = require('jszip');
const { PDFDocument } = require('pdf-lib');
const pool = require('../src/utils/db');
const service = require('../src/services/proposalDocumentRecoveryService');
const files = require('../src/services/fileService');
const lifecycle = require('../src/services/proposalLifecycle');
const signatures = require('../src/services/proposalSignatureService');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
test.after(() => pool.end());

test('normalized placements preserve the exact signer set, reject invalid pages and bounds', () => {
  const original = [{ id: 1, full_name: 'Signer', signed_at: '2026-01-01', page: 1, pos_x: .1, pos_y: .2, box_width: .5, box_height: .2 }];
  const pages = [{ width: 595, height: 842 }, { width: 842, height: 595 }];
  const valid = service.validPositions([{ ...original[0], signed_at: 'FAKE', full_name: 'FAKE', page: 2 }], original, pages);
  assert.equal(valid[0].signed_at, '2026-01-01');
  assert.equal(valid[0].full_name, 'Signer');
  assert.equal(valid[0].page, 2);
  for (const updates of [{ page: 0 }, { page: 3 }, { page: 1.5 }, { pos_x: -.1 }, { pos_x: null }, { pos_x: false }, { pos_y: '' }, { pos_y: NaN }, { box_width: 1 }, { box_height: 0 }, { id: 2 }]) {
    assert.throws(() => service.validPositions([{ ...original[0], ...updates }], original, pages), { statusCode: 400 });
  }
  assert.throws(() => service.validPositions([], original, pages));
  assert.throws(() => service.validPositions([original[0], original[0]], original, pages));
});

test('recovery APIs reject non-SUPER_ADMIN before database/file access', async () => {
  for (const method of ['inspect','create','get','update','activate','image']) {
    for (const role of ['ADMIN','SALES','CTV','NPP','MKT']) {
      await assert.rejects(service[method]({ user: { id: 1, role }, id: 1, documentId: 1, recoveryId: 1 }), { statusCode: 403 });
    }
  }
});

const docx = async () => {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:rFonts w:ascii="TMT Missing Test Font" w:hAnsi="TMT Missing Test Font"/></w:rPr><w:t>BCDX recovery content: first page</w:t><w:br w:type="page"/><w:t>Second page - retain signed content</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>');
  return zip.generateAsync({ type: 'nodebuffer' });
};

test('real SQL: DOCX conversion, frozen snapshots/replacements/manual signing, rollback and export', { skip: process.env.RUN_SIGNATURE_SQL_TEST !== '1' }, async t => {
  const connection = await pool.getConnection();
  const [[original]] = await connection.query('SELECT DATABASE() AS name');
  const database = `test_document_recovery_${Date.now()}`;
  const prefix = `recovery-test-${crypto.randomUUID()}`;
  const uploadRoot = path.resolve(__dirname, '../storage/uploads');
  const physical = new Set();
  const query = async (sql, values) => {
    if (/INSERT INTO files\(original_name,storage_key/.test(sql)) physical.add(path.join(uploadRoot, values[1]));
    if (sql.startsWith('CREATE TABLE') && !sql.includes('ENGINE=')) sql += ' ENGINE=InnoDB';
    try { return await connection.query(sql, values); }
    catch (error) {
      if (sql.startsWith('CREATE TABLE')) {
        const [[status]] = await connection.query('SHOW ENGINE INNODB STATUS');
        console.error('Recovery schema error:', /LATEST FOREIGN KEY ERROR[\s\S]*?(?=\n-{5,})/.exec(status.Status)?.[0]);
      }
      throw error;
    }
  };
  t.mock.method(pool, 'query', query);
  t.mock.method(pool, 'getConnection', async () => ({
    query, beginTransaction: () => connection.beginTransaction(), commit: () => connection.commit(),
    rollback: () => connection.rollback(), release: () => {}
  }));
  t.mock.method(require('../src/services/proposalReportService'), 'resolveScope',
    async user => ({ userId: user.id, role: user.role, isAdmin: user.role === 'SUPER_ADMIN',
      isBackOffice: false, isFinance: user.id === 4 }));
  const args = { user: { id: 1, role: 'SUPER_ADMIN' }, id: 1, documentId: 11, reason: 'PDF cũ convert lỗi; phục hồi từ DOCX gốc' };
  const log = lifecycle.logActivity;
  let failAudit = false;
  t.mock.method(lifecycle, 'logActivity', async payload => {
    if (failAudit) throw new Error('Audit failed');
    return log(payload);
  });
  const putFile = async (id, ext, mime, bytes) => {
    const key = `${prefix}-${id}.${ext}`;
    const filename = path.join(uploadRoot, key);
    physical.add(filename);
    await fs.mkdir(uploadRoot, { recursive: true });
    await fs.writeFile(filename, bytes);
    await query("INSERT INTO files(id,original_name,storage_key,mime_type,size,uploaded_by,status) VALUES(?,?,?,?,?,1,'active')",
      [id, `${id}.${ext}`, key, mime, bytes.length]);
    return filename;
  };
  try {
    await connection.query(`CREATE DATABASE \`${database}\``);
    await connection.query(`USE \`${database}\``);
    await query('CREATE TABLE users(id INT PRIMARY KEY,full_name VARCHAR(60),email VARCHAR(80),role VARCHAR(20),token_version INT DEFAULT 0,custom_data JSON)');
    await query("INSERT INTO users(id,full_name,email,role) VALUES(1,'Người ký 1','test@example.test','SUPER_ADMIN'),(2,'Người ký 2','test2@example.test','SALES'),(3,'Thủ công','test3@example.test','SALES')");
    await query('CREATE TABLE files(id INT AUTO_INCREMENT PRIMARY KEY,original_name VARCHAR(200),storage_key VARCHAR(200),mime_type VARCHAR(150),size INT,checksum VARCHAR(64),uploaded_by INT,status VARCHAR(20))');
    await query(`CREATE TABLE station_proposals(id INT PRIMARY KEY,user_id INT,status VARCHAR(50),custom_data JSON,ma_de_xuat VARCHAR(40),
      signed_file_id INT,signature_completed_at DATETIME,supplement_deadline_at DATETIME,transition_deadline_at DATETIME)`);
    await query("INSERT INTO station_proposals VALUES(1,1,'SIGNATURE_PENDING','{}','BCDX-1',NULL,NULL,'2027-01-01','2027-01-02')");
    await query('ALTER TABLE station_proposals ADD ma_de_xuat_gen VARCHAR(40) GENERATED ALWAYS AS (ma_de_xuat)');
    await query('CREATE TABLE proposal_report_documents(id INT PRIMARY KEY,proposal_id INT,source_file_id INT,pdf_file_id INT,signing_file_id INT,signed_file_id INT,is_current INT)');
    await query(`CREATE TABLE proposal_signature_configs(id INT PRIMARY KEY,proposal_id INT,document_id INT,file_id INT,user_id INT,
      status VARCHAR(20),signature_id INT,signed_at DATETIME,page INT,pos_x FLOAT,pos_y FLOAT,box_width FLOAT,box_height FLOAT,signer_title VARCHAR(50),signer_department VARCHAR(80))`);
    await query('CREATE TABLE proposal_signature_snapshots(config_id INT PRIMARY KEY,image_data MEDIUMBLOB,image_sha256 CHAR(64))');
    await query('CREATE TABLE signatures(id INT PRIMARY KEY,user_id INT,file_path VARCHAR(200),file_url VARCHAR(200),updated_at DATETIME)');
    await query('CREATE TABLE proposal_chairman_files(id INT PRIMARY KEY,proposal_id INT,file_id INT)');
    await query('CREATE TABLE proposal_requests(id INT,proposal_id INT,request_type VARCHAR(30),description TEXT,status VARCHAR(20),round_no INT,note TEXT,target_user_id INT,requested_by INT,previous_status VARCHAR(50),current_status VARCHAR(50),created_at DATETIME)');
    await query(`CREATE TABLE proposal_activity_logs(id INT AUTO_INCREMENT PRIMARY KEY,proposal_id INT,action VARCHAR(50),
      from_status VARCHAR(50),to_status VARCHAR(50),changed_fields JSON,reject_reason TEXT,actor_id INT,actor_role VARCHAR(30),source VARCHAR(30),manual_override INT,ip VARCHAR(50))`);
    const migration = await fs.readFile(path.resolve(__dirname, '../../database/234-proposal-document-recovery.sql'), 'utf8');
    for (let run = 0; run < 2; run++) for (const sql of migration.split(';').map(value => value.trim()).filter(Boolean)) await query(sql);
    const word = await docx();
    const { stdout: png } = await require('node:util').promisify(require('node:child_process').execFile)(
      'convert', ['-size','80x20','xc:black','png:-'], { encoding: 'buffer' });
    const sourcePath = await putFile(101, 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', word);
    await putFile(102, 'pdf', 'application/pdf', Buffer.from('%PDF-BROKEN'));
    await putFile(103, 'png', 'image/png', png);
    await query('INSERT INTO proposal_report_documents VALUES(11,1,101,102,102,NULL,1),(12,1,101,102,102,NULL,0)');
    await query(`INSERT INTO proposal_signature_configs VALUES
      (1,1,11,102,1,'SIGNED',1,'2026-01-01 01:02:03',1,.05,.3,.8,.2,'Giám đốc','Phòng kinh doanh'),
      (2,1,11,102,2,'SIGNED',2,'2026-01-02 01:02:03',2,.05,.3,.8,.2,'Giám đốc','Phòng kinh doanh'),
      (3,1,11,102,3,'SIGNED',NULL,NULL,2,.05,.6,.8,.2,'Nhân viên','Phòng kinh doanh')`);
    await query('INSERT INTO proposal_signature_snapshots VALUES(1,?,?)', [png, hash(png)]);
    await query("INSERT INTO signatures VALUES(1,1,'missing1.png',NULL,NOW()),(2,2,'missing2.png',NULL,NOW())");
    const [[beforeProposal]] = await query('SELECT * FROM station_proposals WHERE id=1');
    const [beforeConfigs] = await query('SELECT * FROM proposal_signature_configs ORDER BY id');
    const history = await service.inspect(args);
    assert.equal(history.history.length, 0);
    assert.equal(history.signers.length, 3);
    for (const patch of [{ id: 0 }, { documentId: 999 }]) await assert.rejects(service.inspect({ ...args, ...patch }));
    await query("UPDATE station_proposals SET status='APPROVED'");
    await assert.rejects(service.create(args), { statusCode: 409 });
    await query("UPDATE station_proposals SET status='SIGNATURE_PENDING'");
    await query("UPDATE proposal_signature_configs SET status='PENDING' WHERE id=2");
    await assert.rejects(service.create(args), { statusCode: 409 });
    await query("UPDATE proposal_signature_configs SET status='SIGNED' WHERE id=2");
    await query('INSERT INTO proposal_chairman_files VALUES(1,1,103)');
    await assert.rejects(service.create(args), { statusCode: 409 });
    await query('DELETE FROM proposal_chairman_files');
    await assert.rejects(service.create({ ...args, reason: '' }), { statusCode: 400 });
    let row = await service.create(args);
    const firstId = row.id;
    await assert.rejects(service.create(args), { statusCode: 409 });
    await service.processNext();
    row = await service.get({ ...args, recoveryId: firstId });
    assert.equal(row.status, 'DRAFT', row.error);
    assert.equal(row.page_sizes.length, 2);
    assert.ok(row.warnings.some(value => value.includes('Thiếu font')));
    assert.ok(row.warnings.some(value => value.includes('PDF cũ')));
    assert.deepEqual(row.images.map(image => image.source), ['SNAPSHOT','MISSING','MANUAL']);
    assert.equal(row.signers[2].recovery_manual, true);
    await assert.rejects(service.activate({ ...args, recoveryId: firstId }), { statusCode: 409 });
    await assert.rejects(service.update({ ...args, recoveryId: firstId, signers: row.signers }), { statusCode: 409 });
    await assert.rejects(service.update({ ...args, recoveryId: firstId, signers: row.signers, replacements: [{ config_id: 1, file_id: 103, reason: 'bad' }] }), { statusCode: 409 });
    await assert.rejects(service.update({ ...args, recoveryId: firstId, signers: row.signers, replacements: [{ config_id: 2, file_id: 103, reason: '' }] }), { statusCode: 400 });
    const positions = row.signers;
    row = await service.update({ ...args, recoveryId: firstId, signers: positions,
      replacements: [{ config_id: 2, file_id: 103, reason: 'Không còn ảnh chữ ký lịch sử của người ký 2' }] });
    assert.ok(row.preview_file_id);
    const stored = await files.getFilePath(row.preview_file_id);
    const signedBytes = await fs.readFile(stored.filePath);
    const signedPdf = await PDFDocument.load(signedBytes);
    assert.equal(signedPdf.getPageCount(), 2);
    assert.ok(signedPdf.getKeywords().includes('TMT-EGREEN-SIGNATURE'));
    assert.equal(row.images[1].source, 'REPLACEMENT');
    const access = require('../src/controllers/fileController').canAccessFile;
    await query("UPDATE users SET role='ADMIN' WHERE id=1");
    assert.equal(await access(stored.file, { user: { id: 1, role: 'ADMIN' } }), false);
    assert.equal(await access((await files.getFilePath(row.base_file_id)).file, { user: { id: 1, role: 'ADMIN' } }), false);
    await query("UPDATE users SET role='SUPER_ADMIN' WHERE id=1");
    assert.equal(await access(stored.file, { user: args.user }), true);
    await assert.rejects(service.update({ ...args, recoveryId: firstId, signers: row.signers,
      replacements: [{ config_id: 3, file_id: 103, reason: 'Không được giả chữ ký' }] }), { statusCode: 409 });
    await query("UPDATE proposal_signature_configs SET signer_title='Changed' WHERE id=1");
    await assert.rejects(service.activate({ ...args, recoveryId: firstId }), { statusCode: 409 });
    await query("UPDATE proposal_signature_configs SET signer_title='Giám đốc' WHERE id=1");
    await fs.writeFile(sourcePath, Buffer.concat([word, Buffer.from('changed')]));
    await assert.rejects(service.activate({ ...args, recoveryId: firstId }), { statusCode: 409 });
    await fs.writeFile(sourcePath, word);
    failAudit = true;
    await assert.rejects(service.activate({ ...args, recoveryId: firstId }), /Audit failed/);
    assert.equal((await service.get({ ...args, recoveryId: firstId })).status, 'DRAFT');
    failAudit = false;
    await fs.writeFile(stored.filePath, Buffer.from('corrupted PDF'));
    await assert.rejects(service.activate({ ...args, recoveryId: firstId }), { statusCode: 409 });
    await fs.writeFile(stored.filePath, signedBytes);
    await service.activate({ ...args, recoveryId: firstId });
    assert.equal((await service.get({ ...args, recoveryId: firstId })).status, 'ACTIVE');
    await assert.rejects(service.update({ ...args, recoveryId: firstId, signers: row.signers }), { statusCode: 409 });
    const [afterConfigs] = await query('SELECT * FROM proposal_signature_configs ORDER BY id');
    const [[afterProposal]] = await query('SELECT * FROM station_proposals WHERE id=1');
    assert.deepEqual(afterConfigs, beforeConfigs);
    assert.deepEqual(afterProposal, beforeProposal);
    const [[snapshot]] = await query('SELECT * FROM proposal_signature_snapshots WHERE config_id=1');
    assert.deepEqual(snapshot.image_data, png);
    const [[fileStatus]] = await query('SELECT status FROM files WHERE id=102');
    assert.equal(fileStatus.status, 'active');
    assert.equal(await access(stored.file, { user: { id: 2, role: 'SALES' } }), true);
    await query("INSERT INTO users(id,full_name,email,role,custom_data) VALUES(4,'Unrelated','test4@example.test','SALES','{}')");
    t.mock.method(require('../src/services/proposalReportService'), 'assertReportReadAccess', async (user) => {
      if (user.id === 4) throw Object.assign(new Error('Outside scope'), { statusCode: 403 });
    });
    assert.equal(await access(stored.file, { user: { id: 4, role: 'SALES' } }), false);
    await query('UPDATE users SET custom_data=? WHERE id=4', [JSON.stringify({ department: 'Phòng Tài chính và Kế toán' })]);
    assert.equal(await access(stored.file, { user: { id: 4, role: 'SALES' } }), true);
    await assert.rejects(files.deleteFile(row.preview_file_id), { statusCode: 409 });
    await assert.rejects(files.deleteFile(103), { statusCode: 409 });
    const exported = await signatures.getSignedDocument({ user: args.user, id: 1, documentId: 11 });
    assert.deepEqual(exported.bytes, signedBytes);
    const download = await signatures.getExportFile({ user: args.user, id: 1, documentId: 11 });
    assert.equal(download.file_id, row.preview_file_id);
    const all = await signatures.getSignedDocument({ user: args.user, id: 1, all: true });
    const zip = await JSZip.loadAsync(all.bytes);
    assert.equal(Object.keys(zip.files).length, 1);
    assert.deepEqual(await zip.file(Object.keys(zip.files)[0]).async('nodebuffer'), signedBytes);
    await query("UPDATE proposal_signature_snapshots SET image_data='corrupted' WHERE config_id=1");
    const stillFrozen = await signatures.getSignedDocument({ user: args.user, id: 1, documentId: 11 });
    assert.deepEqual(stillFrozen.bytes, signedBytes);
    await query('UPDATE proposal_signature_snapshots SET image_data=? WHERE config_id=1', [png]);
    await service.activate({ ...args, recoveryId: firstId, original: true });
    assert.equal((await service.get({ ...args, recoveryId: firstId })).status, 'CONFIRMED');
    await service.activate({ ...args, recoveryId: firstId });
    await query('UPDATE signatures SET file_path=? WHERE id=2', [(await files.getFilePath(103)).filePath]);
    const second = await service.create(args);
    assert.deepEqual((await service.get({ ...args, recoveryId: second.id })).images.map(image => image.source), ['SNAPSHOT','LEGACY','MANUAL']);
    await query("UPDATE station_proposals SET signed_file_id=103");
    await service.processNext();
    assert.equal((await service.get({ ...args, recoveryId: second.id })).status, 'FAILED');
    await assert.rejects(service.activate({ ...args, recoveryId: firstId }), { statusCode: 409 });
  } finally {
    await connection.rollback();
    await connection.query(`USE \`${original.name}\``);
    await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
    connection.release();
    for (const filename of physical) await fs.rm(filename, { force: true });
  }
});
