const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/utils/db');
const reports = require('../src/services/proposalReportService');
const documents = require('../src/services/proposalReportDocumentService');
const lifecycle = require('../src/services/proposalLifecycle');
const requests = require('../src/services/proposalRequestService');
const worker = require('../src/workers/proposalReportConversionWorker');
const converter = require('../src/services/libreOfficeService');
const fileService = require('../src/services/fileService');

test('approval API refuses configuration for pending, failed or non-PDF documents', async (t) => {
  const approval = require('../src/services/proposalApprovalService');
  const signature = require('../src/services/proposalSignatureService');
  t.mock.method(reports, 'resolveScope', async () => ({ role: 'SUPER_ADMIN', isAdmin: true }));
  t.mock.method(signature._internals, 'withSignatureMutationLock', async (_id, action) => action());
  t.mock.method(pool, 'query', async () => [[{ id: 71, status: 'PROPOSAL_REPORT_REVIEWING' }]]);
  let state;
  t.mock.method(documents, 'listDocuments', async () => [{
    id: 91, signing_file_id: 11, conversion_status: state,
    signing_file: { id: 11, mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  }]);
  for (state of ['PENDING', 'PROCESSING', 'FAILED', 'READY']) {
    await assert.rejects(approval.configureSignature({
      user: { id: 1, role: 'SUPER_ADMIN' }, id: 71,
      documents: [{ document_id: 91, file_id: 11, signers: [{ user_id: 1 }] }],
    }), { statusCode: 409 });
  }
});

test('background conversion rechecks current document and preserves originals on failure', async (t) => {
  for (const scenario of ['success', 'outage', 'superseded', 'configured', 'wrong-stage']) {
    await t.test(scenario, async (t) => {
      let proposal = { id: 71, status: scenario === 'wrong-stage' ? 'SIGNATURE_PENDING' : 'PROPOSAL_REPORT_REVIEWING', custom_data: { file_bc_dx: [{ id: 11 }] } };
      let doc = { id: 91, proposal_id: 71, source_file_id: 11, signing_file_id: 11,
        conversion_status: 'PENDING', is_current: 1 };
      let deleted = 0;
      let converted = 0;
      let savedCustom;
      const source = { id: 11, original_name: 'report.docx', mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 20 };
      const pdf = { id: 21, original_name: 'report.pdf', mime_type: 'application/pdf', size: 10 };
      const query = async (sql, params = []) => {
        if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
        if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
        if (sql.includes('FROM station_proposals')) return [[proposal]];
        if (sql.includes('SELECT d.*')) return [[{ ...doc }]];
        if (sql.includes('FROM proposal_signature_configs')) return [scenario === 'configured' ? [{ id: 1 }] : []];
        if (sql.includes('SELECT * FROM proposal_report_documents')) return [[{ ...doc }]];
        if (sql.includes('FROM proposal_report_documents')) return [[{ ...doc }]];
        if (sql.includes('FROM files')) return [[source, pdf]];
        if (sql.includes('INSERT INTO files')) {
          if (scenario === 'superseded') doc.is_current = 0;
          return [{ insertId: 21 }];
        }
        if (sql.includes("SET conversion_status='PROCESSING'")) { doc.conversion_status = 'PROCESSING'; return [{}]; }
        if (sql.includes("conversion_status='READY'")) { doc = { ...doc, signing_file_id: 21, pdf_file_id: 21, conversion_status: 'READY' }; return [{}]; }
        if (sql.includes("SET conversion_status='FAILED'")) { doc.conversion_status = 'FAILED'; doc.conversion_error = params[0]; return [{}]; }
        if (sql.includes('UPDATE station_proposals')) { savedCustom = JSON.parse(params[0]); return [{}]; }
        throw new Error(`Unexpected SQL: ${sql}`);
      };
      t.mock.method(pool, 'query', query);
      t.mock.method(pool, 'getConnection', async () => ({ query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} }));
      t.mock.method(fileService, 'getFileById', async () => source);
      t.mock.method(fileService, 'getFilePath', async () => ({ filePath: 'mock-source.docx', file: source }));
      t.mock.method(converter, 'convertToPdf', async () => {
        converted++;
        if (scenario === 'outage') throw new Error('converter unavailable');
        return { pdfBuffer: Buffer.from('%PDF-mock') };
      });
      t.mock.method(require('fs/promises'), 'readFile', async () => Buffer.from('%PDF-mock'));
      t.mock.method(require('fs/promises'), 'writeFile', async () => {});
      t.mock.method(require('fs/promises'), 'mkdir', async () => {});
      t.mock.method(fileService, 'deleteFile', async () => { deleted++; });
      t.mock.method(lifecycle, 'logActivity', async () => {});
      if (scenario === 'configured') {
        await assert.rejects(documents.convertInBackground({ proposalId: 71, documentId: 91, user: { id: 1 } }), { statusCode: 409 });
        assert.equal(converted, 0);
      } else {
        await documents.convertInBackground({ proposalId: 71, documentId: 91, user: { id: 1 } });
        if (scenario === 'success') {
          assert.equal(doc.conversion_status, 'READY');
          assert.equal(savedCustom.file_bc_dx[0].id, 21);
          assert.equal(savedCustom.file_bc_dx_sources[0].id, 11);
        } else if (scenario === 'wrong-stage') {
          assert.equal(converted, 0);
        } else {
          assert.equal(doc.conversion_status, 'FAILED');
          assert.equal(doc.signing_file_id, 11);
          assert.equal(savedCustom, undefined);
          if (scenario === 'superseded') assert.equal(deleted, 1);
        }
      }
    });
  }
});

test('submission accepts pending, processing, failed Word and native PDF without conversion or consent', async () => {
  const original = {
    query: pool.query, connection: pool.getConnection, prepare: documents.prepareDocuments,
    activate: documents.activateDocuments, log: lifecycle.logActivity, transition: lifecycle.transition,
    close: requests.closeRequests, convert: converter.convertToPdf,
  };
  const word = { id: 11, original_name: 'report.docx', mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 100 };
  let state;
  let stage;
  let saved;
  let calls = 0;
  try {
    converter.convertToPdf = async () => { throw new Error('Submission must never wait for conversion'); };
    const query = async (sql, params = []) => {
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
      if (sql.includes('FROM users WHERE id')) return [[{ custom_data: {} }]];
      if (sql.includes('FROM station_proposals')) return [[{ id: 71, user_id: 1, status: stage, custom_data: {} }]];
      if (sql.includes('FROM files')) return [[word]];
      if (sql.includes('FROM data_list_rows')) return [[{ data: { ten: 'DC60', gia: 100 } }]];
      if (sql.includes('UPDATE station_proposals')) { saved = JSON.parse(params[0]); return [{ affectedRows: 1 }]; }
      throw new Error(`Unexpected SQL: ${sql}`);
    };
    pool.query = query;
    pool.getConnection = async () => ({ query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} });
    documents.prepareDocuments = async () => [{ id: 91, conversion_status: state, source_file: word, signing_file: word }];
    documents.activateDocuments = async () => { calls++; };
    lifecycle.logActivity = async () => {};
    lifecycle.transition = async (id, status) => { stage = status; return { status }; };
    requests.closeRequests = async () => {};
    for (state of ['PENDING', 'PROCESSING', 'FAILED', 'READY']) {
      stage = 'PROPOSAL_REPORT_CREATING';
      word.original_name = state === 'READY' ? 'report.pdf' : 'report.docx';
      word.mime_type = state === 'READY' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      const result = await reports.uploadReport({
        user: { id: 1, role: 'SUPER_ADMIN' }, id: 71, files: [word],
        chotSoLuongTru: [{ mo_hinh: 'LK', so_luong: 2, loai_tru: 'DC60' }],
      });
      assert.equal(result.status, 'PROPOSAL_REPORT_REVIEWING');
      assert.equal(result.tong_gia_tri_chot, 200);
      assert.equal(saved.file_bc_dx_sources[0].id, 11);
      assert.equal(saved.file_bc_dx[0].id, 11);
    }
    assert.equal(calls, 4);
  } finally {
    pool.query = original.query; pool.getConnection = original.connection;
    documents.prepareDocuments = original.prepare; documents.activateDocuments = original.activate;
    lifecycle.logActivity = original.log; lifecycle.transition = original.transition;
    requests.closeRequests = original.close; converter.convertToPdf = original.convert;
  }
});

test('worker selects submitted current unsigned docs, recovers stale processing and does not overlap ticks', async () => {
  const original = { query: pool.query, convert: documents.convertInBackground };
  const processed = [];
  let release;
  let queries = 0;
  try {
    pool.query = async (sql) => {
      queries++;
      for (const fragment of ["p.status='PROPOSAL_REPORT_REVIEWING'", 'd.is_current=1',
        "d.conversion_status='PENDING'", "d.conversion_status='PROCESSING'", 'INTERVAL 10 MINUTE',
        'NOT EXISTS', "s.status<>'CANCELLED'", 'LIMIT 10']) assert.ok(sql.includes(fragment), fragment);
      return [[{ id: 91, proposal_id: 71, created_by: 1 }, { id: 92, proposal_id: 71, created_by: null }]];
    };
    documents.convertInBackground = async (input) => {
      processed.push(input);
      if (input.documentId === 91 && !release) await new Promise((resolve) => { release = resolve; });
    };
    const first = worker.tick();
    await new Promise((resolve) => setImmediate(resolve));
    await worker.tick();
    assert.equal(queries, 1);
    release();
    await first;
    assert.deepEqual(processed.map((item) => item.documentId), [91, 92]);
    await worker.tick();
  } finally {
    release?.();
    pool.query = original.query; documents.convertInBackground = original.convert;
    worker.stop();
  }
});
