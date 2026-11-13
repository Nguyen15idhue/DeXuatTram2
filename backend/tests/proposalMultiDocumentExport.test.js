const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { PDFDocument, PDFRawStream, decodePDFRawStream, StandardFonts } = require('pdf-lib');
const JSZip = require('jszip');

const serviceDirectory = path.resolve(__dirname, '..', 'src', 'services');
const loadService = async (name, mocks) => {
  const filename = path.join(serviceDirectory, name);
  const nativeRequire = createRequire(filename);
  const module = { exports: {} };
  const source = await fs.readFile(filename, 'utf8');
  const execute = vm.runInThisContext(`(function(require,module,exports,__filename,__dirname){${source}\n})`, { filename });
  execute((id) => Object.hasOwn(mocks, id) ? mocks[id] : nativeRequire(id), module, module.exports, filename, serviceDirectory);
  return module.exports;
};

const makeHarness = async ({ root, actualStamping = false, failSnapshot = false, finance = false } = {}) => {
  const proposal = { id: 501, user_id: 7, status: 'SIGNATURE_PENDING', ma_de_xuat: 'TEST', custom_data: {} };
  const configs = [
    { id: 1, proposal_id: 501, document_id: 11, file_id: 101, user_id: 7, created_by: 7, full_name: 'Same Signer', status: actualStamping ? 'SIGNED' : 'PENDING', signature_id: 99, signed_at: '2026-01-02T03:04:05Z', page: 1, pos_x: 0.1, pos_y: 0.2, box_width: 0.3, box_height: 0.25 },
    { id: 2, proposal_id: 501, document_id: 12, file_id: 102, user_id: 7, created_by: 7, full_name: 'Same Signer', status: actualStamping ? 'SIGNED' : 'PENDING', signature_id: 99, signed_at: '2026-02-03T04:05:06Z', page: 1, pos_x: 0.5, pos_y: 0.6, box_width: 0.3, box_height: 0.25 }
  ];
  const documents = configs.map((config) => ({
    id: config.document_id, proposal_id: 501, source_file_id: config.file_id,
    signing_file_id: config.file_id, conversion_status: 'READY', is_current: 1,
    source_file: { id: config.file_id, original_name: `source-${config.document_id}.pdf`, mime_type: 'application/pdf' },
    signing_file: { id: config.file_id, original_name: `source-${config.document_id}.pdf`, mime_type: 'application/pdf' }
  }));
  let releaseLock = null;
  let activeMutations = 0;
  let maximumMutations = 0;
  const notices = [];
  const chairmanFiles = [];
  const query = async (sql, args = []) => {
    if (sql.includes('GET_LOCK')) {
      if (releaseLock) return [[{ acquired: 0 }]];
      releaseLock = true;
      activeMutations += 1;
      maximumMutations = Math.max(maximumMutations, activeMutations);
      return [[{ acquired: 1 }]];
    }
    if (sql.includes('RELEASE_LOCK')) {
      activeMutations -= 1;
      releaseLock = null;
      return [[{ released: 1 }]];
    }
    if (sql.includes('SELECT p.id FROM station_proposals')) return [
      proposal.signed_file_id || configs.every(config => config.status === 'SIGNED') ? [{ id: proposal.id }] : []
    ];
    if (sql.includes('FROM station_proposals')) return [[{ ...proposal }]];
    if (sql.includes('FROM proposal_chairman_files')) return [chairmanFiles];
    if (sql.includes('INSERT INTO proposal_chairman_files')) {
      chairmanFiles.push({ id: args[1], order_index: args[2] });
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM files WHERE id IN')) return [args.map(id => ({ id, original_name: `final-${id}.pdf` }))];
    if (sql.includes('UPDATE proposal_report_documents SET signed_file_id')) {
      documents.find(document => document.id === args[1]).signed_file_id = args[0];
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('UPDATE station_proposals SET signed_file_id')) {
      proposal.signed_file_id = args[0];
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('UPDATE proposal_signature_configs')) {
      if (sql.includes("SET status = 'CANCELLED'")) {
        configs.forEach((config) => { config.status = 'CANCELLED'; });
      } else {
        const config = configs.find((item) => item.id === args[2]);
        if (!config || config.status !== 'PENDING') return [{ affectedRows: 0 }];
        config.status = 'SIGNED';
      }
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM proposal_signature_configs')) return [configs.filter((config) => config.status !== 'CANCELLED').map((config) => ({ ...config }))];
    if (sql.includes('FROM proposal_requests')) return [[]];
    if (sql.includes('FROM users')) return [[{ id: 7, role: 'SUPER_ADMIN' },
      { id: 20, role: 'SALES', custom_data: { department: 'Phòng Tài chính và Kế toán' } },
      { id: 30, role: 'SALES', custom_data: { department: 'Back Office' } }]];
    if (sql.includes('FROM signatures')) {
      return [[{ id: 99, file_url: 'mock-signature', file_path: path.join(root || '.', 'signature.png') }]];
    }
    throw new Error(`Unexpected mock query: ${sql}`);
  };
  const pool = {
    query,
    getConnection: async () => {
      let before;
      return {
        query,
        beginTransaction: async () => { before = configs.map(config => ({ ...config })); },
        commit: async () => {},
        rollback: async () => { configs.splice(0, configs.length, ...before); },
        release: () => {}
      };
    }
  };
  const reports = { resolveScope: async () => ({
    userId: finance ? 20 : 7, role: finance ? 'SALES' : 'SUPER_ADMIN', isAdmin: !finance,
    isBackOffice: !finance, isFinance: finance
  }), isBackOffice: () => true, isFinanceDepartment: department => String(department).includes('Tài chính') };
  const notifications = { proposalCode: () => 'TEST', getUserName: async () => 'Same Signer', statusMessage: () => 'mock', create: async value => notices.push(value), statusTitle: () => 'mock' };
  const lifecycle = {
    transitionSignedApprovalWithinTransaction: async (connection, id) => {
      assert.equal(chairmanFiles.length > 0, true);
      assert.equal(proposal.signed_file_id, chairmanFiles[0].id);
      proposal.status = 'APPROVED';
      return { id, status: 'APPROVED' };
    },
    transition: async (id, status) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (status !== 'APPROVED') assert.equal(configs.some((config) => config.status === 'SIGNED'), false);
      proposal.status = status;
      return { id, status };
    },
    logActivity: async () => {}
  };
  const fileService = {
    getFilePath: async (id) => {
      const document = documents.find((item) => item.signing_file_id === Number(id));
      return document ? { file: document.signing_file, filePath: path.join(root, `${id}.pdf`) } : null;
    }
  };
  const snapshotImages = new Map();
  const snapshots = {
    read: async (id) => snapshotImages.get(id) || null,
    save: async (id, bytes) => {
      if (failSnapshot) throw new Error('Snapshot storage failed');
      snapshotImages.set(id, Buffer.from(bytes));
    }
  };
  const signedDocuments = actualStamping
    ? await loadService('signedDocumentService.js', {
      '../utils/db': pool, './fileService': fileService, './signatureSnapshotService': snapshots
    })
    : { validateSignature: async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { bytes: Buffer.from('snapshot') };
    } };
  const mocks = {
    '../utils/db': pool,
    './dynamicUtils': { getFieldDefinitionsByEntity: async () => [], mergeData: row => row, enrichUserFields: async row => row },
    './proposalProgressService': { getProgress: async () => ({ requests: [], activity: [] }) },
    './chargingStationService': { createFromApprovedProposal: async () => {} },
    './proposalReportService': reports,
    './proposalGradingService': { parseCustomData: (value) => value || {}, toFileSummaries: () => [] },
    './proposalReviewService': { resolveRoleKey: () => null },
    './proposalReportDocumentService': { getSigningDocuments: async () => documents, listDocuments: async () => documents },
    './notificationService': notifications,
    './proposalLifecycle': lifecycle,
    './proposalChairmanFileService': {
      normalizeFiles: (files, documents) => (files || documents).map(file => file.id ?? file.file_id),
      validate: async () => {},
      list: async () => chairmanFiles
    },
    './signedDocumentService': signedDocuments,
    './signatureSnapshotService': snapshots,
    './fileService': fileService,
    '../controllers/fileController': { canAccessFile: async () => true }
  };
  const signatures = await loadService('proposalSignatureService.js', mocks);
  const approvals = await loadService('proposalApprovalService.js', { ...mocks, './proposalSignatureService': signatures });
  return { signatures, approvals, proposal, configs, documents, notices, chairmanFiles, snapshots, signedDocuments, maximumMutations: () => maximumMutations };
};

test('Finance reads all completed documents without being a signer but cannot read pending unrelated proposals', async () => {
  const fixture = await makeHarness({ finance: true });
  const user = { id: 20, role: 'SALES' };
  await assert.rejects(fixture.signatures.getDetail({ user, id: 501 }), { statusCode: 403 });
  fixture.configs.forEach(config => { config.status = 'SIGNED'; });
  const detail = await fixture.signatures.getDetail({ user, id: 501 });
  assert.equal(detail.documents.length, 2);
  assert.equal(detail.can_upload_signed, true);
  assert.equal(detail.can_sign, false);
  assert.equal(detail.can_request_rework, false);
  assert.equal(detail.can_withdraw, false);
  fixture.proposal.status = 'APPROVED';
  fixture.proposal.signed_file_id = 300;
  assert.equal((await fixture.signatures.getDetail({ user, id: 501 })).documents.length, 2);
});

test('Finance upload requires every document signed and saves a shared collection before approval', async () => {
  const fixture = await makeHarness({ finance: true });
  const args = { user: { id: 20, role: 'SALES' }, id: 501,
    documents: [{ document_id: 11, file_id: 201 }, { document_id: 12, file_id: 202 }] };
  await assert.rejects(fixture.signatures.uploadSignedFile(args), { statusCode: 400 });
  fixture.configs.forEach(config => { config.status = 'SIGNED'; });
  const result = await fixture.signatures.uploadSignedFile(args);
  assert.equal(result.status, 'APPROVED');
  assert.equal(fixture.proposal.signed_file_id, 201);
  assert.deepEqual(fixture.documents.map(document => document.signed_file_id), [undefined, undefined]);
  assert.deepEqual(fixture.chairmanFiles.map(file => file.id), [201, 202]);
  assert.equal((await fixture.signatures.getDetail({ user: args.user, id: 501 })).can_upload_signed, false);
});

test('last signature notifies Finance, Back Office and SUPER_ADMIN', async () => {
  const fixture = await makeHarness();
  await fixture.signatures.sign({ user: { id: 7, role: 'SUPER_ADMIN' }, id: 501, documentId: 11 });
  assert.equal(fixture.notices.some(notice => notice.type === 'DONE'), false);
  await fixture.signatures.sign({ user: { id: 7, role: 'SUPER_ADMIN' }, id: 501, documentId: 12 });
  const recipients = fixture.notices.filter(notice => notice.type === 'DONE').map(notice => notice.userId).sort((a, b) => a - b);
  assert.deepEqual(recipients, [7, 20, 30]);
});

test('sign and withdrawal serialize in both arrival orders without losing signed configs', async () => {
  const user = { id: 7, role: 'SUPER_ADMIN' };
  const signingFirst = await makeHarness();
  const firstResults = await Promise.allSettled([
    signingFirst.signatures.sign({ user, id: 501, documentId: 11 }),
    signingFirst.approvals.withdrawSignatureConfig({ user, id: 501 })
  ]);
  assert.equal(firstResults[0].status, 'fulfilled');
  assert.equal(firstResults[1].status, 'rejected');
  assert.equal(firstResults[1].reason.statusCode, 409);
  assert.equal(signingFirst.configs[0].status, 'SIGNED');
  assert.equal(signingFirst.proposal.status, 'SIGNATURE_PENDING');
  assert.equal(signingFirst.maximumMutations(), 1);
  const withdrawalFirst = await makeHarness();
  const reverseResults = await Promise.allSettled([
    withdrawalFirst.approvals.withdrawSignatureConfig({ user, id: 501 }),
    withdrawalFirst.signatures.sign({ user, id: 501, documentId: 11 })
  ]);
  assert.equal(reverseResults[0].status, 'fulfilled');
  assert.equal(reverseResults[1].status, 'rejected');
  assert.equal(withdrawalFirst.configs.every((config) => config.status === 'CANCELLED'), true);
  assert.equal(withdrawalFirst.proposal.status, 'PROPOSAL_REPORT_REVIEWING');
  assert.equal(withdrawalFirst.maximumMutations(), 1);
});

test('snapshot storage failure rolls back SIGNED status', async () => {
  const harness = await makeHarness({ failSnapshot: true });
  await assert.rejects(harness.signatures.sign({
    user: { id: 7, role: 'SUPER_ADMIN' }, id: 501, documentId: 11
  }), /Snapshot storage failed/);
  assert.equal(harness.configs[0].status, 'PENDING');
  assert.equal(harness.configs[0].signed_at, '2026-01-02T03:04:05Z');
});

test('actual two-size PDF stamping and ZIP preserve document-specific images, coordinates, and timestamps', async () => {
  const root = path.join(__dirname, `.multidoc-fixtures-${process.pid}`);
  await fs.mkdir(root, { recursive: true });
  const previousRegular = process.env.SIGNATURE_FONT_REGULAR;
  const previousBold = process.env.SIGNATURE_FONT_BOLD;
  process.env.SIGNATURE_FONT_REGULAR = process.platform === 'win32' ? 'C:\\Windows\\Fonts\\times.ttf' : '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf';
  process.env.SIGNATURE_FONT_BOLD = process.platform === 'win32' ? 'C:\\Windows\\Fonts\\timesbd.ttf' : '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf';
  try {
    const sizes = [[600, 800], [900, 1200]];
    for (let index = 0; index < sizes.length; index += 1) {
      const pdf = await PDFDocument.create();
      const page = pdf.addPage(sizes[index]);
      page.drawText(`SOURCE_DOCUMENT_${index + 1}`, { x: 20, y: 30, font: await pdf.embedFont(StandardFonts.Helvetica) });
      await fs.writeFile(path.join(root, `${101 + index}.pdf`), await pdf.save());
    }
    await require('node:util').promisify(require('node:child_process').execFile)(
      'convert', ['-size', '80x20', 'xc:black', path.join(root, 'signature.png')]
    );
    const { signatures, snapshots, signedDocuments } = await makeHarness({ root, actualStamping: true });
    const image = await signedDocuments.validateSignature(99);
    await snapshots.save(1, image.bytes);
    await snapshots.save(2, image.bytes);
    await fs.unlink(path.join(root, 'signature.png'));
    await assert.rejects(signatures.getSignatureImage({ user: { id: 8, role: 'CTV' }, id: 501, configId: 99 }),
      { statusCode: 404 });
    const user = { id: 7, role: 'SUPER_ADMIN' };
    assert.deepEqual((await signatures.getSignatureImage({ user, id: 501, configId: 1 })).bytes, image.bytes);
    assert.deepEqual((await signatures.getSignatureImage({ user, id: 501, configId: 2 })).bytes, image.bytes);
    const inspect = async (bytes, index) => {
      const pdf = await PDFDocument.load(bytes);
      assert.equal(pdf.getPageCount(), 1);
      assert.deepEqual(Object.values(pdf.getPage(0).getSize()), sizes[index]);
      const page = pdf.getPage(0);
      const contents = page.node.Contents();
      const streams = [];
      for (let item = 0; item < contents.size(); item += 1) {
        const stream = pdf.context.lookup(contents.get(item));
        if (stream instanceof PDFRawStream) streams.push(Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1'));
      }
      const operators = streams.join('\n');
      assert.equal((operators.match(/\/Image-[^\s]+ Do/g) || []).length, 1, operators);
      const expectedLeft = sizes[index][0] * (index ? 0.5 : 0.1);
      const expectedTop = sizes[index][1] * (index ? 0.6 : 0.2);
      const translationMatrices = [...operators.matchAll(/1 0 0 1 ([\d.-]+) ([\d.-]+) cm/g)].map((match) => [Number(match[1]), Number(match[2])]);
      const fontkit = require('@pdf-lib/fontkit');
      const regular = fontkit.create(await fs.readFile(process.env.SIGNATURE_FONT_REGULAR));
      const bold = fontkit.create(await fs.readFile(process.env.SIGNATURE_FONT_BOLD));
      const layout = require('../assets/signatureTextLayout.json');
      const nameWidth = bold.layout('Đã ký bởi: Same Signer').advanceWidth / bold.unitsPerEm * layout.lines.name.fontSizePt;
      const time = index ? '11:05:06 03/02/2026' : '10:04:05 02/01/2026';
      const timeWidth = regular.layout(`Đã ký lúc: ${time}`).advanceWidth / regular.unitsPerEm * layout.lines.time.fontSizePt;
      const expandedWidth = Math.min(sizes[index][0] - expectedLeft,
        Math.max(sizes[index][0] * 0.3, Math.max(nameWidth, timeWidth) + 9));
      const availableWidth = expandedWidth - 9;
      const imageRegionHeight = sizes[index][1] * 0.25 - 36 - 11;
      const drawWidth = Math.min(availableWidth * 0.88, imageRegionHeight * 4);
      const drawHeight = drawWidth / 4;
      const expectedX = expectedLeft + 4.5 + (availableWidth - drawWidth) / 2;
      const expectedY = sizes[index][1] - expectedTop - (imageRegionHeight + drawHeight) / 2;
      assert.equal(translationMatrices.some(([x, y]) => Math.abs(x - expectedX) < 0.01
        && Math.abs(y - expectedY) < 0.01), true, operators);
      const pageText = await require('pdf-parse')(bytes);
      assert.match(pageText.text, new RegExp(`SOURCE_DOCUMENT_${index + 1}`));
      assert.doesNotMatch(pageText.text, new RegExp(`SOURCE_DOCUMENT_${index ? 1 : 2}`));
      assert.match(pageText.text, /Same Signer/);
      assert.match(pageText.text, index ? /03\/02\/2026/ : /02\/01\/2026/);
      assert.doesNotMatch(pageText.text, index ? /02\/01\/2026/ : /03\/02\/2026/);
    };
    for (let index = 0; index < 2; index += 1) {
      const result = await signatures.getSignedDocument({ user, id: 501, documentId: 11 + index });
      await inspect(result.bytes, index);
    }
    const exported = await signatures.getExportFile({ user, id: 501, all: true });
    assert.equal(exported.mime_type, 'application/zip');
    const zip = await JSZip.loadAsync(exported.bytes);
    const names = Object.keys(zip.files);
    assert.equal(names.length, 2);
    await inspect(await zip.file('11_source-11.pdf').async('nodebuffer'), 0);
    await inspect(await zip.file('12_source-12.pdf').async('nodebuffer'), 1);
    const word = new JSZip();
    word.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>');
    word.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>TEST</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>');
    await fs.writeFile(path.join(root, 'original.docx'), await word.generateAsync({ type: 'nodebuffer' }));
    const wordService = await loadService('signedDocumentService.js', {
      '../utils/db': { query: async () => { throw new Error('Must not read deleted profile signature'); } },
      './signatureSnapshotService': snapshots,
      './fileService': { getFilePath: async () => ({
        file: { id: 201, original_name: 'original.docx', mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        filePath: path.join(root, 'original.docx')
      }) }
    });
    const signedWord = await wordService.build({
      reportFileId: 201,
      signers: [{ id: 1, signature_id: 99, full_name: 'Same Signer', signed_at: '2026-01-02T03:04:05Z',
        page: 1, pos_x: 0.1, pos_y: 0.2, box_width: 0.3, box_height: 0.25 }]
    });
    const wordOutput = await JSZip.loadAsync(signedWord.bytes);
    assert.deepEqual(await wordOutput.file('word/media/signature-1.png').async('nodebuffer'), image.bytes);
  } finally {
    if (previousRegular === undefined) delete process.env.SIGNATURE_FONT_REGULAR;
    else process.env.SIGNATURE_FONT_REGULAR = previousRegular;
    if (previousBold === undefined) delete process.env.SIGNATURE_FONT_BOLD;
    else process.env.SIGNATURE_FONT_BOLD = previousBold;
    await fs.rm(root, { recursive: true, force: true });
  }
});
