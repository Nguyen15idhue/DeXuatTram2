const test = require('node:test');
const assert = require('node:assert/strict');
const PizZip = require('pizzip');
const pool = require('../src/utils/db');
const dynamic = require('../src/services/dynamicUtils');
const reports = require('../src/services/proposalReportService');
const templates = require('../src/services/documentTemplateService');
const documents = require('../src/services/documentService');
const converter = require('../src/services/libreOfficeService');
const generation = require('../src/services/proposalReportGenerationService');
const { getSystemDateTokens } = require('../src/services/documentSystemTokens');
const rendering = require('../src/services/documentRendering');
const adminProposals = require('../src/services/adminProposalService');
const formulaEngine = require('../src/services/documentFormula');
const lifecycle = require('../src/services/proposalLifecycle');

const user = { id: 1, role: 'SUPER_ADMIN' };
const fields = [
  { key: 'mo_hinh_dau_tu', label: 'Mô hình', type: 'select' },
  { key: 'ten_phap_nhan', label: 'Tên pháp nhân', type: 'text' },
  { key: 'ngay_du_kien', label: 'Ngày dự kiến', type: 'date' },
  { key: 'so_luong', label: 'Số lượng', type: 'number' }
];
const template = {
  id: 10, name: 'Mẫu NQ_LK', entity: 'station_proposals', model: 'NQ_LK',
  status: 'active', file_id: 7,
  mapping: { tokens: {
    name: { source: 'field', key: 'ten_phap_nhan' },
    date: { source: 'field', key: 'ngay_du_kien' },
    quantity: { source: 'field', key: 'so_luong' }
  } }
};

const createDocx = (text = '{name}: {quantity}') => {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
  return zip;
};

test.after(() => pool.end());

test('signature anchors use the responsible user and preserve explicit signer settings', () => {
  const plan = generation.buildAnchorPlan({ signers: [
    { anchor_token: 'sign_gdkv', field: 'sales_quan_ly', mode: 'field' },
    { anchor_token: 'sign_tgd', mode: 'fixed', user_id: 8, label: 'TGĐ' }
  ] }, ['{sign_gdkv}', '{sign_tgd}']);
  assert.equal(plan[0].field, 'nguoi_phu_trach');
  assert.equal(plan[0].mode, 'field');
  assert.equal(plan[1].user_id, 8);
  assert.equal(generation.buildAnchorPlan({}, ['{sign_gdkv}'])[0].field, 'nguoi_phu_trach');
});

test('signature boxes preserve split Word tokens and reject mixed paragraphs', () => {
  const boxes = require('../src/services/documentSignatureBoxService');
  const xml = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>{sign_</w:t></w:r><w:r><w:t>gdkv}</w:t></w:r></w:p></w:body></w:document>';
  const result = boxes.replaceAnchorWithBox(xml, '{sign_gdkv}', 'Ký GĐKV', 3000, 1000);
  assert.match(result, /Ký GĐKV/);
  assert.match(result, /w:val="nil"/);
  assert.match(result, /w:val="FFFFFF"/);
  const mixed = xml.replace('{sign_', 'Chú thích {sign_');
  assert.throws(() => boxes.replaceAnchorWithBox(mixed, '{sign_gdkv}', 'Ký', 3000, 1000), /nằm riêng/);
});

test('QR image is embedded with the proposal URL', async (t) => {
  const qr = require('../src/services/documentQrService');
  const helper = require('../src/utils/qrHelper');
  const generate = helper.generateQrPngBuffer;
  const spy = t.mock.method(helper, 'generateQrPngBuffer', (...args) => generate(...args));
  const zip = createDocx('{qr_de_xuat}');
  const url = generation.buildProposalUrl(4);
  assert.equal((await qr.applyQrImages(zip, { token: 'qr_de_xuat', url })).applied, true);
  assert.equal(spy.mock.calls[0].arguments[0], url);
  assert.match(zip.file('word/document.xml').asText(), /w:drawing/);
  const image = Object.keys(zip.files).find((name) => name.startsWith('word/media/qr-'));
  assert.deepEqual([...zip.file(image).asNodeBuffer().subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test('saving finalized poles and ON date preserves data and rejects a stale draft', async (t) => {
  let proposal = {
    id: 4, status: 'PROPOSAL_REPORT_CREATING', custom_data: {},
    chot_so_luong_tru: null, tong_gia_tri_chot: null, saved_on_date: null
  };
  let rollbacks = 0;
  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => { rollbacks += 1; },
    release: () => {},
    query: async (sql, params) => {
      if (sql.startsWith('UPDATE station_proposals')) {
        proposal = {
          ...proposal, chot_so_luong_tru: JSON.parse(params[0]),
          tong_gia_tri_chot: Number(params[1]).toFixed(2), saved_on_date: params[2]
        };
        return [{ affectedRows: 1 }];
      }
      return [[{ ...proposal }]];
    }
  };
  t.mock.method(pool, 'query', async (sql) => {
    if (sql.includes('FROM users')) return [[{ custom_data: {} }]];
    if (sql.includes('FROM station_proposals')) return [[{ ...proposal }]];
    throw new Error(`Unexpected query: ${sql}`);
  });
  t.mock.method(pool, 'getConnection', async () => connection);
  t.mock.method(reports, 'normalizePreviewChotRows', async () => ({
    rows: [{ mo_hinh: 'LK', so_luong: 2, loai_tru: 'DC60', gia_chot: 100, thanh_tien: 200 }],
    total: 200
  }));
  t.mock.method(lifecycle, 'logActivity', async () => {});

  const initial = await reports.getGenerationDraft(4);
  const saved = await reports.saveGenerationDraft({
    user, id: 4, chotSoLuongTru: [{ mo_hinh: 'LK', so_luong: 2, loai_tru: 'DC60' }],
    ngayDuKienOn: '2026-12-01', revision: initial.revision
  });
  assert.equal(saved.tong_gia_tri_chot, 200);
  assert.equal((await reports.getGenerationDraft(4)).revision, saved.revision);
  assert.equal(proposal.saved_on_date, '2026-12-01');
  await assert.rejects(reports.saveGenerationDraft({
    user, id: 4, chotSoLuongTru: [], ngayDuKienOn: '2026-12-02', revision: initial.revision
  }), { statusCode: 409 });
  assert.equal(proposal.saved_on_date, '2026-12-01');
  assert.equal(rollbacks, 1);
});

test('preview filters templates, applies permitted edits without database writes', async (t) => {
  const queries = [];
  t.mock.method(pool, 'query', async (sql) => {
    queries.push(sql);
    return [[{
      id: 4, status: 'PROPOSAL_REPORT_CREATING', custom_data: {
        mo_hinh_dau_tu: 'NQ_LK', ten_phap_nhan: 'Tên cũ', so_luong: 2
      }
    }]];
  });
  t.mock.method(reports, 'resolveScope', async () => ({ role: 'SUPER_ADMIN' }));
  t.mock.method(reports, 'canUploadReport', async () => true);
  t.mock.method(dynamic, 'getFieldDefinitionsByEntity', async () => fields);
  t.mock.method(templates, 'listTemplates', async () => [
    template,
    { ...template, id: 11, model: 'TDT' },
    { ...template, id: 12, status: 'inactive' }
  ]);
  t.mock.method(templates, 'listTokens', async () => []);
  t.mock.method(templates, 'readDocxXml', async () => ({ zip: createDocx() }));
  t.mock.method(documents, 'buildData', async (proposal) => ({
    data: { name: proposal.ten_phap_nhan, quantity: proposal.so_luong }
  }));
  t.mock.method(converter, 'convertToPdf', async (buffer) => {
    const xml = new PizZip(buffer).file('word/document.xml').asText();
    assert.match(xml, /Tên mới: 3/);
    return { pdfBuffer: Buffer.from('%PDF-test'), fontWarnings: [] };
  });

  const options = await generation.listPreviewOptions({ proposalId: 4, user });
  assert.deepEqual(options.templates.map((item) => item.id), [10]);
  assert.equal(options.templates[0].fields.find((field) => field.key === 'ten_phap_nhan').value, 'Tên cũ');
  const result = await generation.preview({
    proposalId: 4, templateId: 10, user,
    values: { ten_phap_nhan: 'Tên mới', so_luong: '3' }
  });
  assert.equal(result.pdfBuffer.toString(), '%PDF-test');
  assert.ok(queries.every((sql) => /^\s*SELECT/i.test(sql)));
  await assert.rejects(generation.preview({ proposalId: 4, templateId: 11, user, values: {} }), /không khả dụng/);
  await assert.rejects(generation.preview({ proposalId: 4, templateId: 10, user, values: { status: 'APPROVED' } }), /không được phép|không hợp lệ/);
  await assert.rejects(generation.preview({ proposalId: 4, templateId: 10, user, values: { ngay_du_kien: '2026-02-31' } }), /ngày không hợp lệ/);
});

test('only the unchanged, complete preview PDF may be sent for review', async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = require('crypto').randomBytes(32).toString('hex');
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  const proposal = {
    id: 4, status: 'PROPOSAL_REPORT_CREATING',
    custom_data: { mo_hinh_dau_tu: 'NQ_LK', ten_phap_nhan: 'Tên mới', so_luong: 3 }
  };
  const draft = {
    revision: 'a'.repeat(64), ngay_du_kien_on: '2026-12-01',
    chot_so_luong_tru: [{ mo_hinh: 'LK', so_luong: 1, loai_tru: 'DC60' }], tong_gia_tri_chot: 100
  };
  const reportTemplate = {
    ...template, mapping: { ...template.mapping, tokens: {
      ...template.mapping.tokens, extra: { source: 'input', type: 'text', label: 'Thông tin thêm', required: true }
    } }
  };
  const pdfDocument = await require('pdf-lib').PDFDocument.create();
  pdfDocument.addPage([600, 800]);
  const pdf = Buffer.from(await pdfDocument.save());
  let submitted;
  t.mock.method(pool, 'query', async (sql) => {
    if (sql.startsWith('SELECT * FROM station_proposals')) return [[proposal]];
    if (sql.includes('INSERT INTO files')) return [{ insertId: 99 }];
    throw new Error(`Unexpected query: ${sql}`);
  });
  t.mock.method(reports, 'resolveScope', async () => ({ role: 'SUPER_ADMIN' }));
  t.mock.method(reports, 'canUploadReport', async () => true);
  t.mock.method(reports, 'getGenerationDraft', async () => draft);
  t.mock.method(reports, 'uploadReport', async (input) => { submitted = input; return { status: 'PROPOSAL_REPORT_REVIEWING' }; });
  t.mock.method(dynamic, 'getFieldDefinitionsByEntity', async () => fields);
  t.mock.method(templates, 'listTemplates', async () => [reportTemplate]);
  t.mock.method(templates, 'listTokens', async () => []);
  t.mock.method(templates, 'readDocxXml', async () => ({ zip: createDocx() }));
  t.mock.method(documents, 'buildData', async () => ({ data: { name: 'Tên mới', quantity: 3 } }));
  t.mock.method(converter, 'convertToPdf', async () => ({ pdfBuffer: pdf, fontWarnings: [] }));
  t.mock.method(require('../src/services/proposalApprovalService'), 'detectAnchorsForPdf', async () => ({
    anchors: [{ anchor_token: 'sign_gdkv', found: true, user_id: 7, user_name: 'Người phụ trách' }]
  }));
  let candidates = [
    { id: 7, full_name: 'Người phụ trách', chuc_vu: 'GĐKV' },
    { id: 8, full_name: 'Back Office', department: 'Back Office' }
  ];
  t.mock.method(require('../src/services/proposalApprovalService'), 'getDocumentSignerCandidates', async () => candidates);
  t.mock.method(require('fs/promises'), 'mkdir', async () => {});
  t.mock.method(require('fs/promises'), 'writeFile', async () => {});

  const input = { proposalId: 4, templateId: 10, user, values: {}, savedDraftRevision: draft.revision };
  const incomplete = await generation.preview({ ...input, inputs: { extra: '' } });
  assert.ok(incomplete.blocking.length);
  await assert.rejects(generation.generate({ proposalId: 4, user, pdfBuffer: pdf, proof: incomplete.proof }), { statusCode: 400 });
  const complete = await generation.preview({ ...input, inputs: { extra: 'Đã nhập' } });
  assert.deepEqual(complete.signatureAnchors.candidates, candidates);
  await assert.rejects(generation.generate({ proposalId: 4, user, pdfBuffer: Buffer.from('other'), proof: complete.proof }), { statusCode: 409 });
  const positions = [{ anchor_token: 'sign_gdkv', user_id: 7, page: 1, pos_x: 0.3, pos_y: 0.2, box_width: 0.3, box_height: 0.1 }];
  await assert.rejects(generation.generate({ proposalId: 4, user, pdfBuffer: pdf, proof: complete.proof,
    signaturePositions: [{ ...positions[0], user_id: 8 }] }), /người ký không hợp lệ/);
  await assert.rejects(generation.generate({ proposalId: 4, user, pdfBuffer: pdf, proof: complete.proof,
    signaturePositions: [{ ...positions[0], anchor_token: null, user_id: 9 }] }), /người ký không hợp lệ/);
  await assert.rejects(generation.generate({ proposalId: 4, user, pdfBuffer: pdf, proof: complete.proof,
    signaturePositions: [positions[0], positions[0]] }), /người ký không hợp lệ/);
  await assert.rejects(generation.generate({ proposalId: 4, user, pdfBuffer: pdf, proof: complete.proof,
    signaturePositions: [{ ...positions[0], page: 2 }] }), /người ký không hợp lệ/);
  await assert.rejects(generation.generate({ proposalId: 4, user, pdfBuffer: pdf, proof: complete.proof,
    signaturePositions: [{ ...positions[0], pos_x: 0.9 }] }), /người ký không hợp lệ/);
  candidates = candidates.filter((candidate) => candidate.id !== 8);
  await assert.rejects(generation.generate({ proposalId: 4, user, pdfBuffer: pdf, proof: complete.proof,
    signaturePositions: [{ ...positions[0], anchor_token: null, user_id: 8 }] }), /người ký không hợp lệ/);
  candidates.push({ id: 8, full_name: 'Back Office', department: 'Back Office' });
  await generation.generate({ proposalId: 4, user, pdfBuffer: pdf, proof: complete.proof,
    signaturePositions: [{ ...positions[0], anchor_token: null, user_id: 8, full_name: 'Giả mạo' }] });
  assert.equal(submitted.signatureAnchorSnapshot.draft_signers[0].full_name, 'Back Office');
  assert.equal(submitted.signatureAnchorSnapshot.draft_signers[0].anchor_token, null);
  await generation.generate({ proposalId: 4, user, pdfBuffer: pdf, proof: complete.proof, signaturePositions: [] });
  assert.deepEqual(submitted.signatureAnchorSnapshot.draft_signers, []);
  const result = await generation.generate({ proposalId: 4, user, pdfBuffer: pdf, proof: complete.proof, signaturePositions: positions });
  assert.equal(result.status, 'PROPOSAL_REPORT_REVIEWING');
  assert.equal(submitted.files[0].id, 99);
  assert.equal(submitted.expectedDraftRevision, draft.revision);
  assert.equal(submitted.signatureAnchorSnapshot.template_id, reportTemplate.id);
  assert.deepEqual(submitted.signatureAnchorSnapshot.box, { width: 0.3, height: 0.1 });
  assert.equal(submitted.signatureAnchorSnapshot.draft_signers[0].pos_x, 0.3);
});

test('preview rejects unauthorized users, wrong status and unsupported signature anchors', async (t) => {
  let status = 'PROPOSAL_REPORT_CREATING';
  let allowed = false;
  t.mock.method(pool, 'query', async () => [[{ id: 4, status, custom_data: { mo_hinh_dau_tu: 'NQ_LK' } }]]);
  t.mock.method(reports, 'resolveScope', async () => ({ role: 'SALES' }));
  t.mock.method(reports, 'canUploadReport', async () => allowed);
  t.mock.method(dynamic, 'getFieldDefinitionsByEntity', async () => fields);
  t.mock.method(templates, 'listTemplates', async () => [template]);
  t.mock.method(templates, 'listTokens', async () => [{ token: '{sig_tgd}' }]);
  await assert.rejects(generation.listPreviewOptions({ proposalId: 4, user }), { statusCode: 403 });
  allowed = true;
  status = 'PROPOSAL_REPORT_REVIEWING';
  await assert.rejects(generation.listPreviewOptions({ proposalId: 4, user }), { statusCode: 409 });
  status = 'PROPOSAL_REPORT_CREATING';
  await assert.rejects(generation.preview({ proposalId: 4, templateId: 10, values: {}, user }), /chữ ký|vị trí ký/);
});

test('GĐKV can obtain preview options only for a proposal in the permitted branch', async (t) => {
  const proposal = { id: 4, user_id: 7, status: 'PROPOSAL_REPORT_CREATING', custom_data: { mo_hinh_dau_tu: 'NQ_LK' } };
  t.mock.method(pool, 'query', async () => [[proposal]]);
  t.mock.method(reports, 'resolveScope', async () => ({ role: 'SALES', userId: 44 }));
  t.mock.method(adminProposals, 'getBranchUserIds', async () => [7]);
  t.mock.method(dynamic, 'getFieldDefinitionsByEntity', async () => fields);
  t.mock.method(templates, 'listTemplates', async () => [template]);
  t.mock.method(reports, 'getGenerationDraft', async () => ({ revision: 'r' }));
  assert.equal((await generation.listPreviewOptions({ proposalId: 4, user: { id: 44, role: 'SALES' } })).templates.length, 1);
  proposal.user_id = 8;
  await assert.rejects(generation.listPreviewOptions({ proposalId: 4, user: { id: 44, role: 'SALES' } }), { statusCode: 403 });
});

test('preview uses temporary finalized poles and current catalogue prices without saving', async (t) => {
  const queries = [];
  t.mock.method(pool, 'query', async (sql) => {
    queries.push(sql);
    if (sql.includes('FROM station_proposals')) return [[{
      id: 4, status: 'PROPOSAL_REPORT_CREATING', custom_data: { mo_hinh_dau_tu: 'NQ_LK' },
      chot_so_luong_tru: [{ loai_tru: 'old' }], tong_gia_tri_chot: 10
    }]];
    if (sql.includes('FROM data_list_rows')) return [[{ data: { ten: 'DC60', gia: 100 } }]];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  t.mock.method(reports, 'resolveScope', async () => ({ role: 'SUPER_ADMIN' }));
  t.mock.method(reports, 'canUploadReport', async () => true);
  t.mock.method(dynamic, 'getFieldDefinitionsByEntity', async () => fields);
  t.mock.method(templates, 'listTemplates', async () => [template]);
  t.mock.method(templates, 'listTokens', async () => []);
  t.mock.method(templates, 'readDocxXml', async () => ({ zip: createDocx('{name}') }));
  t.mock.method(documents, 'buildData', async (proposal) => {
    assert.equal(proposal.tong_gia_tri_chot, 300);
    assert.deepEqual(proposal.chot_so_luong_tru.map(({ loai_tru, so_luong, gia_chot, thanh_tien }) =>
      ({ loai_tru, so_luong, gia_chot, thanh_tien })), [
      { loai_tru: 'DC60', so_luong: 3, gia_chot: 100, thanh_tien: 300 }
    ]);
    return { data: { name: 'OK' } };
  });
  t.mock.method(converter, 'convertToPdf', async () => ({ pdfBuffer: Buffer.from('%PDF-test') }));

  await generation.preview({ proposalId: 4, templateId: 10, values: {}, user,
    chotSoLuongTru: [{ mo_hinh: 'LK', so_luong: 3, loai_tru: 'DC60', gia_chot: 1 }] });
  assert.ok(queries.every((sql) => /^\s*SELECT/i.test(sql)));
  await assert.rejects(generation.preview({ proposalId: 4, templateId: 10, values: {}, user,
    chotSoLuongTru: [{ mo_hinh: 'LK', so_luong: 0, loai_tru: 'DC60' }] }), /số lượng/i);
  await assert.rejects(generation.preview({ proposalId: 4, templateId: 10, values: {}, user,
    chotSoLuongTru: [] }), /ít nhất một dòng/);
});

test('real document mapping reads proposal data and marks unmapped tokens in preview', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-12-31T17:00:00Z').getTime() });
  documents.clearCache();
  t.after(() => documents.clearCache());
  t.mock.method(pool, 'query', async (sql) => {
    if (sql.includes('FROM station_proposals')) return [[{
      id: 4, status: 'PROPOSAL_REPORT_CREATING',
      custom_data: { mo_hinh_dau_tu: 'NQ_LK', ten_phap_nhan: 'Tên từ đề xuất', so_luong: 2 }
    }]];
    if (sql.includes('FROM document_constants')) return [[]];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  t.mock.method(reports, 'resolveScope', async () => ({ role: 'SUPER_ADMIN' }));
  t.mock.method(reports, 'canUploadReport', async () => true);
  t.mock.method(dynamic, 'getFieldDefinitionsByEntity', async () => fields);
  let selectedTemplate = template;
  t.mock.method(templates, 'listTemplates', async () => [selectedTemplate]);
  t.mock.method(templates, 'listTokens', async () => []);
  t.mock.method(templates, 'readDocxXml', async () => ({
    zip: createDocx('{name}: {quantity}. Hà Nội, ngày {today_day} tháng {today_month} năm {today_year}')
  }));
  t.mock.method(converter, 'convertToPdf', async (buffer) => {
    const xml = new PizZip(buffer).file('word/document.xml').asText();
    assert.match(xml, selectedTemplate === template ? /Tên từ đề xuất: 2/ : /\[Chưa cấu hình: name\]: 2/);
    assert.match(xml, /Hà Nội, ngày 1 tháng 1 năm 2027/);
    return { pdfBuffer: Buffer.from('%PDF-test') };
  });
  await generation.preview({ proposalId: 4, templateId: 10, values: {}, user });
  selectedTemplate = { ...template, mapping: { tokens: { quantity: template.mapping.tokens.quantity } } };
  const partial = await generation.preview({ proposalId: 4, templateId: 10, values: {}, user });
  assert.deepEqual(partial.warnings, ['Chưa cấu hình: name']);
});

test('system dates use Vietnam midnight and calendar rollover independently of server timezone', () => {
  assert.deepEqual(getSystemDateTokens(new Date('2026-12-31T16:59:59Z')), {
    today_day: '31', today_month: '12', today_year: '2026'
  });
  assert.deepEqual(getSystemDateTokens(new Date('2026-12-31T17:00:00Z')), {
    today_day: '1', today_month: '1', today_year: '2027'
  });
});

test('system dates need no mapping and cannot be replaced by old field bindings', async (t) => {
  documents.clearCache();
  t.after(() => documents.clearCache());
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-24T18:00:00Z').getTime() });
  t.mock.method(dynamic, 'getFieldDefinitionsByEntity', async () => fields);
  t.mock.method(pool, 'query', async (sql) => {
    assert.match(sql, /FROM document_constants/);
    return [[]];
  });
  const { data } = await documents.buildData({ today_day: 'old day' }, {
    tokens: { today_day: { source: 'field', key: 'today_day' } }
  });
  assert.deepEqual(data, { today_day: '25', today_month: '11', today_year: '2026' });
});

test('mapping validation accepts automatic dates but still rejects unbound ordinary tokens', async (t) => {
  t.mock.method(templates, 'getTemplate', async () => ({ id: 10, file_id: 7 }));
  t.mock.method(templates, 'readDocxXml', async () => ({ zip: createDocx('{today_day} {today_month} {today_year}') }));
  let names = ['today_day', 'today_month', 'today_year'];
  t.mock.method(templates, 'listTokens', async () => names.map((name) => ({
    token: `{${name}}`, kind: 'scalar', split: false
  })));
  assert.deepEqual(await templates.validateMapping(10, {}), { valid: true, errors: [] });
  names.push('customer_name');
  const result = await templates.validateMapping(10, {});
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /customer_name/);
});

test('shared renderer distinguishes unknown, empty and input values while preserving loops and zero', () => {
  const mapping = {
    tokens: {
      empty: { source: 'field', key: 'empty' },
      note: { source: 'input', label: 'Nội dung', type: 'textarea', required: true }
    },
    loops: {
      poles: { source: 'field', table: 'poles', columns: { quantity: 'quantity' } },
      draft: { parts: [] }
    }
  };
  const result = rendering.renderDocument({
    zip: createDocx('{unknown}|{empty}|{note}|{#poles}{quantity}{/poles}|{#unmapped}{column}{/unmapped}|{#draft}{draft_column}{/draft}'),
    data: { empty: '', poles: [{ quantity: 0 }], draft: [] },
    mapping, inputs: { note: 'Dòng một\nDòng hai & <ba>' }
  });
  const xml = new PizZip(result.buffer).file('word/document.xml').asText();
  assert.match(xml, /\[Chưa cấu hình: unknown\]/);
  assert.match(xml, /\[Chưa có dữ liệu: empty\]/);
  assert.match(xml, /Dòng một/);
  assert.match(xml, /<w:br\/>/);
  assert.match(xml, /Dòng hai &amp; &lt;ba&gt;/);
  assert.match(xml, /\|0\|/);
  assert.ok(result.warnings.includes('Bảng chưa cấu hình: unmapped'));
  assert.ok(result.warnings.includes('Bảng chưa cấu hình: draft'));
  assert.match(xml, /\[Chưa cấu hình: draft_column\]/);
  assert.ok(!result.warnings.some((warning) => warning.includes('quantity')));
});

test('input bindings validate defaults, dates, types and request allowlist', () => {
  const mapping = { tokens: {
    amount: { source: 'input', label: 'Giá trị', type: 'number', defaultValue: '0' },
    day: { source: 'input', label: 'Ngày', type: 'date', defaultValue: '2026-02-28' }
  } };
  assert.deepEqual(rendering.validateInputs(mapping), { amount: 0, day: '2026-02-28' });
  assert.throws(() => rendering.validateInputs(mapping, { amount: 'abc' }), /số không hợp lệ/);
  assert.throws(() => rendering.validateInputs(mapping, { day: '2026-02-31' }), /ngày không hợp lệ/);
  assert.throws(() => rendering.validateInputs(mapping, { amount: 3 }), /không hợp lệ/);
  assert.throws(() => rendering.validateInputs(mapping, { status: 'APPROVED' }), /không được phép/);
  assert.throws(() => rendering.validateInputs(mapping, { today_day: '5' }), /không được phép/);
  assert.throws(() => rendering.getInputFields({ tokens: {
    bad: { source: 'input', label: 'Sai', type: 'file' }
  } }), /cấu hình hợp lệ/);
});

test('invalid Word syntax is returned as a readable 400 by validation and export', async (t) => {
  const malformed = () => createDocx('{/danh_sach_tru)0');
  t.mock.method(templates, 'getTemplate', async () => ({ id: 10, file_id: 7 }));
  t.mock.method(templates, 'readDocxXml', async () => ({ zip: malformed() }));
  const validation = await templates.validateMapping(10, {});
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('; '), /unclosed|unopened/i);
  assert.match(validation.errors.join('; '), /danh_sach_tru/);
  documents.clearCache();
  t.after(() => documents.clearCache());
  t.mock.method(dynamic, 'getFieldDefinitionsByEntity', async () => fields);
  t.mock.method(adminProposals, 'getProposalWithUser', async () => ({ id: 4, mo_hinh_dau_tu: 'LK' }));
  t.mock.method(pool, 'query', async (sql) => sql.includes('FROM document_constants') ? [[]] : [[{ id: 10, file_id: 7, mapping: {} }]]);
  await assert.rejects(documents.exportReports([4], { templateId: 10 }), (cause) => {
    assert.equal(cause.statusCode, 400);
    assert.match(cause.message, /danh_sach_tru/);
    return true;
  });
});

test('BCĐX-only inputs render in PDF preview without writing the proposal', async (t) => {
  const configured = { ...template, mapping: { ...template.mapping, tokens: {
    ...template.mapping.tokens,
    report_note: { source: 'input', label: 'Nội dung BCĐX', type: 'textarea', required: true }
  } } };
  const queries = [];
  documents.clearCache();
  t.after(() => documents.clearCache());
  t.mock.method(pool, 'query', async (sql) => {
    queries.push(sql);
    if (sql.includes('FROM document_constants')) return [[]];
    if (sql.includes('FROM station_proposals')) return [[{ id: 4, status: 'PROPOSAL_REPORT_CREATING', custom_data: { mo_hinh_dau_tu: 'NQ_LK', ten_phap_nhan: 'Tên cũ', so_luong: 0 } }]];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  t.mock.method(reports, 'resolveScope', async () => ({}));
  t.mock.method(reports, 'canUploadReport', async () => true);
  t.mock.method(dynamic, 'getFieldDefinitionsByEntity', async () => fields);
  t.mock.method(templates, 'listTemplates', async () => [configured]);
  t.mock.method(templates, 'listTokens', async () => []);
  t.mock.method(templates, 'readDocxXml', async () => ({ zip: createDocx('{name}: {quantity}; {report_note}') }));
  let note = 'Nội dung mới';
  t.mock.method(converter, 'convertToPdf', async (buffer) => {
    const xml = new PizZip(buffer).file('word/document.xml').asText();
    assert.ok(xml.includes(note));
    assert.match(xml, /Tên cũ: 0/);
    return { pdfBuffer: Buffer.from('%PDF-test') };
  });
  const options = await generation.listPreviewOptions({ proposalId: 4, user });
  assert.equal(options.templates[0].input_fields[0].key, 'report_note');
  await generation.preview({ proposalId: 4, templateId: 10, values: {}, inputs: { report_note: note }, user });
  note = '[Chưa có dữ liệu: report_note]';
  const incomplete = await generation.preview({ proposalId: 4, templateId: 10, values: {}, user });
  assert.ok(incomplete.warnings.includes('Chưa có dữ liệu: report_note'));
  assert.ok(queries.every((sql) => /^\s*SELECT/i.test(sql)));
});

test('default template lookup includes entity and model in SQL parameters', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.deepEqual(params, ['proposal_report', 'NQ_LK', 'NQ_LK']);
    return [[{ id: 1, file_id: 2, mapping: '{}' }]];
  });
  assert.equal((await documents.resolveTemplate('NQ_LK', null, 'proposal_report')).id, 1);
});

  test('cross-table formulas use original footer numbers and BCĐX-only numeric inputs', async (t) => {
    documents.clearCache();
    t.after(() => documents.clearCache());
    t.mock.method(dynamic, 'getFieldDefinitionsByEntity', async () => []);
    t.mock.method(pool, 'query', async (sql) => {
      assert.match(sql, /FROM document_constants/);
      return [[]];
    });
    const mapping = {
      tokens: {
        ty_le: { source: 'formula', expression: 'chi_phi_tru_f_tong_value / tong_chi_phi * 100', decimalPlaces: 2 },
        tong_chi_phi: { source: 'formula', expression: 'SUM(chi_phi_khac_f_tong_value, chi_phi_tru_f_tong_value, extra)' },
        extra: { source: 'input', label: 'Bổ sung', type: 'number', defaultValue: '0' }
      },
      loops: Object.fromEntries(['chi_phi_khac', 'chi_phi_tru'].map((name) => [name, {
        source: 'field', table: name, columns: { cost: 'cost' },
        footers: [{ id: 'tong', formula: 'SUM(cost)', label: 'Tổng' }]
      }]))
    };
    const built = await documents.buildData({
      chi_phi_tru: [{ cost: 1000000 }, { cost: 2000000 }],
      chi_phi_khac: [{ cost: 500000 }, { cost: 500000 }]
    }, mapping);
    assert.equal(built.data.chi_phi_tru_f_tong_value, '3.000.000');
    assert.equal(built.numericData.chi_phi_tru_f_tong_value, 3000000);
    const result = rendering.renderDocument({
      zip: createDocx('{chi_phi_tru_f_tong_value}; {tong_chi_phi}; {ty_le}%'),
      ...built, mapping, inputs: { extra: '0' }
    });
    const xml = new PizZip(result.buffer).file('word/document.xml').asText();
    assert.match(xml, /3\.000\.000; 4\.000\.000; 75,00%/);
    assert.deepEqual(result.warnings, []);
  });

  test('formula dependencies use unrounded values and report missing data without zero defaults', () => {
    const mapping = { tokens: {
      doubled: { source: 'formula', expression: 'half * 2' },
      half: { source: 'formula', expression: 'amount / 2', decimalPlaces: 0 },
      amount: { source: 'input', label: 'Số', type: 'number' }
    } };
    const result = formulaEngine.evaluateScalars(mapping, { amount: 3 });
    assert.equal(result.display.half, '2');
    assert.equal(result.raw.doubled, 3);
    assert.equal(result.display.doubled, '3');
    const missing = formulaEngine.evaluateScalars(mapping, {});
    assert.equal(missing.display.half, '');
    assert.equal(missing.display.doubled, '');
    assert.equal(missing.warnings.length, 2);
  });

  test('formula configuration rejects unknown references, cycles and unsafe expressions', async (t) => {
    const config = (expression) => ({ tokens: { total: { source: 'formula', expression } } });
    assert.throws(() => formulaEngine.scalarPlan(config('unknown + 1')), /không có token/);
    assert.throws(() => formulaEngine.scalarPlan(config('total + 1')), /tham chiếu vòng/);
    assert.throws(() => formulaEngine.scalarPlan({ tokens: {
      first: { source: 'formula', expression: 'second + 1' },
      second: { source: 'formula', expression: 'first + 1' }
    } }), /tham chiếu vòng/);
    for (const expression of ['x = 1', 'import("fs")', 'random()', '[1, 2]', 'total.constructor', '"text"']) {
      assert.throws(() => formulaEngine.scalarPlan(config(expression)), { statusCode: 400 });
    }
    assert.throws(() => formulaEngine.evaluateScalars(config('1 / 0'), {}), /chia cho 0/);
    t.mock.method(templates, 'getTemplate', async () => ({ id: 10 }));
    const checked = await templates.validateMapping(10, config('unknown + 1'));
    assert.equal(checked.valid, false);
    assert.match(checked.errors.join('; '), /unknown/);
  });

test('new NQ_LK template preserves chosen status and default flag', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    if (sql.startsWith('INSERT')) {
      assert.equal(params[2], 'NQ_LK');
      assert.equal(params[5], 'inactive');
      assert.equal(params[6], 1);
      return [{ insertId: 4 }];
    }
    return [[{ id: 4, model: 'NQ_LK', status: 'inactive', is_default: 1 }]];
  });
  const result = await templates.createTemplate({
    name: 'Kết hợp', model: 'NQ_LK', status: 'inactive', is_default: true
  });
  assert.equal(result.model, 'NQ_LK');
});
