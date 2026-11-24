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
  await assert.rejects(generation.generate({ proposalId: 4, user }), { statusCode: 501 });
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
