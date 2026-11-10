const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const pool = require('../src/utils/db');
const files = require('../src/services/fileService');
const converter = require('../src/services/libreOfficeService');
const previews = require('../src/services/filePreviewCacheService');

test('Preview cache checks source, converter/fonts, missing files and coalesces concurrent requests', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-cache-test-'));
  const inputPath = path.join(directory, 'input.docx');
  fs.writeFileSync(inputPath, 'source one');
  const original = {
    query: pool.query, getFileById: files.getFileById, getFilePath: files.getFilePath,
    convertToPdf: converter.convertToPdf, signature: converter.getConversionSignature,
  };
  let signature = 'fonts-one';
  let cached;
  let conversions = 0;
  let present = true;
  const generated = [];
  const source = { id: 7001, mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', original_name: 'fixture.docx' };
  try {
    converter.getConversionSignature = async () => signature;
    converter.convertToPdf = async () => { conversions++; return { pdfBuffer: Buffer.from('%PDF-fixture') }; };
    files.getFileById = async (id) => Number(id) === source.id ? source : { id, status: 'active' };
    files.getFilePath = async (id) => Number(id) === source.id
      ? { file: source, filePath: inputPath }
      : present ? { filePath: inputPath } : null;
    pool.query = async (sql, params) => {
      if (sql.includes('SELECT pdf_file_id')) return [cached ? [cached] : []];
      if (sql.startsWith('INSERT INTO files')) {
        generated.push(path.join(__dirname, '../storage/uploads', params[1]));
        return [{ insertId: 8000 + conversions }];
      }
      if (sql.startsWith('SELECT * FROM files')) return [[{ id: params[0] }]];
      if (sql.includes('INSERT INTO file_preview_cache')) {
        cached = { pdf_file_id: params[1], source_hash: params[2] };
        return [{}];
      }
      throw new Error(`Unexpected SQL in cache test: ${sql}`);
    };
    assert.deepEqual(await Promise.all([previews.getPreviewPdfFileId(7001), previews.getPreviewPdfFileId('7001')]), [8001, 8001]);
    assert.equal(conversions, 1);
    assert.equal(await previews.getPreviewPdfFileId(7001), 8001);
    signature = 'fonts-two';
    assert.equal(await previews.getPreviewPdfFileId(7001), 8002);
    fs.writeFileSync(inputPath, 'source two');
    assert.equal(await previews.getPreviewPdfFileId(7001), 8003);
    cached.source_hash = crypto.createHash('sha256').update('source two').digest('hex');
    assert.equal(await previews.getPreviewPdfFileId(7001), 8004, 'Legacy hash invalidates');
    present = false;
    assert.equal(await previews.getPreviewPdfFileId(7001), 8005, 'Missing cached PDF regenerates');
    converter.convertToPdf = async () => { throw new Error('Conversion unavailable'); };
    await assert.rejects(previews.getPreviewPdfFileId(7001), /Conversion unavailable/);
    converter.convertToPdf = async () => { conversions++; return { pdfBuffer: Buffer.from('%PDF-fixture') }; };
    assert.equal(await previews.getPreviewPdfFileId(7001), 8006, 'Failed promise is not retained');
  } finally {
    pool.query = original.query;
    files.getFileById = original.getFileById;
    files.getFilePath = original.getFilePath;
    converter.convertToPdf = original.convertToPdf;
    converter.getConversionSignature = original.signature;
    generated.forEach((filename) => fs.unlinkSync(filename));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
