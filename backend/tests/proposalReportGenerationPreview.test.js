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

const createDocx = () => {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>{name}: {quantity}</w:t></w:r></w:p></w:body></w:document>');
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

test('real document mapping reads merged proposal data and refuses unmapped tokens', async (t) => {
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
  t.mock.method(templates, 'readDocxXml', async () => ({ zip: createDocx() }));
  t.mock.method(converter, 'convertToPdf', async (buffer) => {
    const xml = new PizZip(buffer).file('word/document.xml').asText();
    assert.match(xml, /Tên từ đề xuất: 2/);
    return { pdfBuffer: Buffer.from('%PDF-test') };
  });
  await generation.preview({ proposalId: 4, templateId: 10, values: {}, user });
  selectedTemplate = { ...template, mapping: { tokens: { quantity: template.mapping.tokens.quantity } } };
  await assert.rejects(generation.preview({ proposalId: 4, templateId: 10, values: {}, user }), /gán dữ liệu|tạo được bản xem thử/);
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
