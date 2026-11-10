const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const JSZip = require('jszip');
const { PDFDocument } = require('pdf-lib');

test('real Word conversion, fixed PDF, retry, permissions and legacy preservation', {
  skip: process.env.RUN_REPORT_DOCUMENT_TESTS !== '1', timeout: 180000
}, async () => {
  const pool = require('../src/utils/db');
  const documents = require('../src/services/proposalReportDocumentService');
  const converter = require('../src/services/libreOfficeService');
  const prefix = `report-doc-${crypto.randomUUID()}`;
  const users = [];
  const proposals = [];
  const originalFiles = [];
  const originalConverter = converter.convertToPdf;
  let server;
  const createUser = async role => {
    const [result] = await pool.query(
      "INSERT INTO users(full_name,email,password,role,status,custom_data) VALUES (?,?,'not-a-login-password',?,'ACTIVE','{}')",
      [prefix, `${prefix}-${users.length}@example.invalid`, role]);
    users.push(result.insertId);
    return { id: result.insertId, role };
  };
  const createProposal = async (owner, custom = {}) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.query(
        `INSERT INTO station_proposals(user_id,latitude,longitude,owner_name,owner_phone,status,custom_data)
         VALUES (?,0,0,?,'0900000000','PROPOSAL_REPORT_CREATING',?)`,
        [owner.id, prefix, JSON.stringify(custom)]);
      proposals.push(result.insertId);
      await connection.query('DELETE FROM proposal_sheet_sync_queue WHERE proposal_id=?', [result.insertId]);
      await connection.commit();
      return result.insertId;
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  };
  const save = async (user, buffer, ext, mime) => {
    const key = `report-tests/${prefix}-${originalFiles.length}${ext}`;
    const filePath = path.join(__dirname, '../storage/uploads', key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
    const [result] = await pool.query(
      "INSERT INTO files(original_name,storage_key,mime_type,size,uploaded_by,status) VALUES (?,?,?,?,?,'active')",
      [prefix + ext, key, mime, buffer.length, user.id]);
    originalFiles.push({ id: result.insertId, path: filePath });
    return { id: result.insertId };
  };
  const makeDocx = async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>BCDX integration test</w:t></w:r></w:p><w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p><w:r><w:t>Second page - fixed signing layout</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>');
    return zip.generateAsync({ type: 'nodebuffer' });
  };
  try {
    const owner = await createUser('CTV');
    const outsider = await createUser('CTV');
    const id = await createProposal(owner);
    const word = await save(owner, await makeDocx(), '.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const nativePdf = await save(owner, Buffer.from(await pdf.save()), '.pdf', 'application/pdf');
    await assert.rejects(documents.prepareDocuments({ proposalId: id, files: [word], user: outsider }), { statusCode: 403 });
    await assert.rejects(documents.prepareDocuments({
      proposalId: id, files: Array.from({ length: 11 }, (_, i) => ({ id: i + 1 })), user: owner
    }), { statusCode: 400 });
    const invalidPdf = await save(owner, Buffer.from('not a PDF'), '.pdf', 'application/pdf');
    await assert.rejects(documents.prepareDocuments({ proposalId: id, files: [invalidPdf], user: owner }), { statusCode: 400 });
    const queued = await documents.prepareDocuments({ proposalId: id, files: [word, nativePdf], user: owner });
    assert.equal(queued.find(doc => doc.source_file_id === word.id).conversion_status, 'PENDING');
    await documents.convertDocument({ proposalId: id, documentId: queued.find(doc => doc.source_file_id === word.id).id, user: owner });
    const prepared = await documents.listDocuments(id, { initializeLegacy: false, ids: queued.map(doc => doc.id) });
    assert.equal(prepared.length, 2);
    assert.ok(prepared.every(doc => doc.conversion_status === 'READY'), JSON.stringify(prepared.map(doc => doc.conversion_error)));
    const converted = prepared.find(doc => doc.source_file_id === word.id);
    assert.notEqual(converted.signing_file_id, word.id);
    assert.equal(converted.pdf_file_id, converted.signing_file_id);
    assert.equal(converted.source_file.id, word.id);
    assert.equal(prepared.find(doc => doc.source_file_id === nativePdf.id).signing_file_id, nativePdf.id);
    const convertedFile = await require('../src/services/fileService').getFilePath(converted.pdf_file_id);
    const bytes = await fs.readFile(convertedFile.filePath);
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2);
    const again = await documents.prepareDocuments({ proposalId: id, files: [word], user: owner });
    assert.equal(again[0].pdf_file_id, converted.pdf_file_id);
    assert.equal(again[0].conversion_attempts, 1);
    const sourceFile = await require('../src/services/fileService').getFilePath(word.id);
    const preservedWord = await JSZip.loadAsync(await fs.readFile(sourceFile.filePath));
    assert.match(await preservedWord.file('word/document.xml').async('string'), /Second page - fixed signing layout/);
    await assert.rejects(documents.convertDocument({ proposalId: id, documentId: converted.id, user: outsider }), { statusCode: 403 });

    const failedWord = await save(owner, await makeDocx(), '.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    converter.convertToPdf = async () => { throw new Error('Simulated conversion outage'); };
    const failureDraft = await documents.prepareDocuments({ proposalId: id, files: [failedWord], user: owner });
    await documents.convertDocument({ proposalId: id, documentId: failureDraft[0].id, user: owner });
    const failed = await documents.listDocuments(id, { initializeLegacy: false, ids: [failureDraft[0].id] });
    assert.equal(failed[0].conversion_status, 'FAILED');
    assert.match(failed[0].conversion_error, /Simulated conversion outage/);
    assert.equal(failed[0].signing_file_id, failedWord.id);
    converter.convertToPdf = originalConverter;
    await documents.convertDocument({ proposalId: id, documentId: failed[0].id, user: owner });
    const retried = await documents.listDocuments(id, { initializeLegacy: false, ids: [failed[0].id] });
    assert.equal(retried[0].conversion_status, 'READY');
    assert.equal(retried[0].conversion_attempts, 2);

    await pool.query(
      `INSERT INTO proposal_signature_configs(proposal_id,document_id,file_id,user_id,status,page,pos_x,pos_y,box_width,box_height)
       VALUES (?,?,?,?,'PENDING',1,0.1,0.1,0.3,0.2)`,
      [id, converted.id, converted.signing_file_id, owner.id]);
    await assert.rejects(documents.convertDocument({ proposalId: id, documentId: converted.id, user: owner }), { statusCode: 409 });
    const legacy = await createProposal(owner, { file_bc_dx: [word] });
    await pool.query(
      "INSERT INTO proposal_signature_configs(proposal_id,file_id,user_id,status) VALUES (?,?,?,'PENDING')",
      [legacy, word.id, owner.id]);
    const legacyDocs = await documents.listDocuments(legacy);
    assert.equal(legacyDocs[0].signing_file_id, word.id);
    assert.equal(legacyDocs[0].pdf_file_id, null);
    assert.equal(legacyDocs[0].has_config, true);
    assert.equal(legacyDocs[0].conversion_status, 'READY');
    const express = require('express');
    const app = express();
    app.use(express.json());
    app.use('/api/my-proposals', require('../src/routes/myProposals'));
    app.use('/api/files', require('../src/routes/files'));
    server = await new Promise(resolve => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const base = `http://127.0.0.1:${server.address().port}/api/my-proposals/${id}/report/documents`;
    const token = require('../src/services/authService').generateToken(owner.id, '', owner.role);
    const downloadUrl = `http://127.0.0.1:${server.address().port}/api/files/${converted.pdf_file_id}/download`;
    const download = await fetch(`${downloadUrl}?token=${encodeURIComponent(token)}`, { headers: { Range: 'bytes=0-4' } });
    assert.equal(download.status, 206);
    assert.equal(await download.text(), '%PDF-');
    assert.match(download.headers.get('content-disposition'), /filename\*=UTF-8''/);
    const deniedDownload = await fetch(downloadUrl, { headers: {
      Authorization: `Bearer ${require('../src/services/authService').generateToken(outsider.id, '', outsider.role)}`
    } });
    assert.equal(deniedDownload.status, 403);
    const request = async (actor, suffix, body) => fetch(base + suffix, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${require('../src/services/authService').generateToken(actor.id, '', actor.role)}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const denied = await request(outsider, '/prepare', { files: [word] });
    assert.equal(denied.status, 403);
    const locked = await request(owner, `/${converted.id}/convert`, {});
    assert.equal(locked.status, 409);
    const apiPrepared = await request(owner, '/prepare', { files: [nativePdf] });
    assert.equal(apiPrepared.status, 200);
    assert.equal((await apiPrepared.json()).data.documents[0].source_file_id, nativePdf.id);
  } finally {
    if (server) await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    converter.convertToPdf = originalConverter;
    if (proposals.length) {
      const [generated] = await pool.query('SELECT DISTINCT pdf_file_id AS id FROM proposal_report_documents WHERE proposal_id IN (?) AND pdf_file_id IS NOT NULL', [proposals]);
      await pool.query('DELETE FROM proposal_signature_configs WHERE proposal_id IN (?)', [proposals]);
      await pool.query('DELETE FROM proposal_report_documents WHERE proposal_id IN (?)', [proposals]);
      await pool.query('DELETE FROM proposal_activity_logs WHERE proposal_id IN (?)', [proposals]);
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.query('DELETE FROM station_proposals WHERE id IN (?)', [proposals]);
        await connection.query('DELETE FROM proposal_sheet_sync_queue WHERE proposal_id IN (?)', [proposals]);
        await connection.query('DELETE FROM on_station_sheet_sync_queue WHERE proposal_id IN (?)', [proposals]);
        await connection.commit();
      } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
      for (const file of [...originalFiles, ...generated]) {
        const data = await require('../src/services/fileService').getFilePath(file.id);
        if (data) await fs.unlink(data.filePath);
        await pool.query('DELETE FROM files WHERE id=?', [file.id]);
      }
    }
    if (users.length) await pool.query('DELETE FROM users WHERE id IN (?)', [users]);
    await pool.end();
  }
});
