const pool = require('../utils/db');
const Docxtemplater = require('docxtemplater');
const dynamicUtils = require('./dynamicUtils');
const documentService = require('./documentService');
const documentTemplateService = require('./documentTemplateService');
const libreOfficeService = require('./libreOfficeService');

const EDIT_STATUSES = new Set([
  'PROPOSAL_REPORT_CREATING',
  'PROPOSAL_REPORT_RE_CREATING',
  'PROPOSAL_REPORT_UPDATING'
]);
const EDITABLE_TYPES = new Set(['text', 'textarea', 'email', 'phone', 'url', 'number', 'date']);
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const error = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

const loadContext = async (proposalId, user) => {
  const id = Number(proposalId);
  if (!Number.isSafeInteger(id) || id <= 0) throw error('Đề xuất không hợp lệ');
  const [rows] = await pool.query('SELECT * FROM station_proposals WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) throw error('Không tìm thấy đề xuất', 404);
  const reports = require('./proposalReportService');
  const scope = await reports.resolveScope(user);
  if (!await reports.canUploadReport(scope, rows[0])) {
    throw error('Bạn không có quyền tạo tờ trình BCĐX cho đề xuất này', 403);
  }
  if (!EDIT_STATUSES.has(rows[0].status)) {
    throw error('Đề xuất không ở trạng thái lập tờ trình BCĐX', 409);
  }
  const fields = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const proposal = dynamicUtils.mergeData(rows[0], fields);
  return { proposal, fields, model: proposal.mo_hinh_dau_tu || '' };
};

const getAvailableTemplates = async (model) => {
  const templates = await documentTemplateService.listTemplates();
  return templates.filter((template) => (
    template.status === 'active'
    && template.file_id
    && ['station_proposals', 'proposal_report'].includes(template.entity)
    && (!template.model || template.model === model)
  ));
};

const editableFields = (template, fields, proposal) => {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const result = new Map();
  for (const binding of Object.values(template.mapping?.tokens || {})) {
    if (!binding || binding.source !== 'field' || result.has(binding.key)) continue;
    const field = byKey.get(binding.key);
    if (!field || FORBIDDEN_KEYS.has(field.key) || !EDITABLE_TYPES.has(field.type)) continue;
    const value = proposal[field.key];
    if (value !== null && value !== undefined && typeof value === 'object' && !(value instanceof Date)) continue;
    const dateValue = value instanceof Date
      ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
      : value;
    result.set(field.key, {
      key: field.key,
      label: field.label || field.key,
      type: field.type,
      value: dateValue ?? ''
    });
  }
  return [...result.values()];
};

exports.listPreviewOptions = async ({ proposalId, user } = {}) => {
  const { proposal, fields, model } = await loadContext(proposalId, user);
  const templates = await getAvailableTemplates(model);
  return {
    model,
    templates: templates.map((template) => ({
      id: template.id,
      name: template.name,
      model: template.model,
      fields: editableFields(template, fields, proposal)
    }))
  };
};

const preview = async ({ proposalId, templateId, values, user } = {}) => {
  const context = await loadContext(proposalId, user);
  const id = Number(templateId);
  if (!Number.isSafeInteger(id) || id <= 0) throw error('Vui lòng chọn mẫu BCĐX');
  const template = (await getAvailableTemplates(context.model)).find((item) => Number(item.id) === id);
  if (!template) throw error('Mẫu không khả dụng hoặc không phù hợp mô hình đề xuất');
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw error('Dữ liệu xem trước không hợp lệ');
  const allowed = new Map(editableFields(template, context.fields, context.proposal).map((field) => [field.key, field]));
  if (Object.keys(values).length > allowed.size) throw error('Dữ liệu xem trước có trường không được phép');
  const overrides = {};
  for (const [key, value] of Object.entries(values)) {
    const field = allowed.get(key);
    if (!field || typeof value !== 'string' || value.length > 10000) {
      throw error(`Dữ liệu xem trước không hợp lệ: ${key}`);
    }
    if (field.type === 'number' && value !== '' && !Number.isFinite(Number(value))) {
      throw error(`${field.label}: số không hợp lệ`);
    }
    if (field.type === 'date' && value !== '') {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      const date = match && new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
      if (!date || date.toISOString().slice(0, 10) !== value) {
        throw error(`${field.label}: ngày không hợp lệ`);
      }
    }
    overrides[key] = field.type === 'number' && value !== '' ? Number(value) : value;
  }
  const mapping = template.mapping || {};
  if (mapping.signatureAnchors?.length || mapping.signers?.length) {
    throw error('Mẫu có cấu hình chữ ký tự động chưa được hỗ trợ trong bản xem thử');
  }
  const tokens = await documentTemplateService.listTokens(template.id);
  if (tokens.some((item) => /^\{sig_/i.test(item.token))) {
    throw error('Mẫu có vị trí ký tự động chưa được hỗ trợ trong bản xem thử');
  }
  const { data, loopInfos } = await documentService.buildData({ ...context.proposal, ...overrides }, mapping);
  const { zip } = await documentTemplateService.readDocxXml(template.file_id);
  for (const [key, config] of Object.entries(mapping.loops || {})) {
    if (config?.render?.empty === 'hide' && !loopInfos?.[key]?.count) {
      documentService.stripEmptyLoopRow(zip, key);
    }
  }
  let doc;
  try {
    doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: (part) => { throw error(`Mẫu chưa gán dữ liệu cho trường ${part.value}`); }
    });
    doc.render(data);
  } catch (cause) {
    if (cause.statusCode) throw cause;
    const details = cause.properties?.errors?.map((item) => item.message).join('; ') || cause.message;
    throw error(`Không tạo được bản xem thử: ${details}`);
  }
  const buffer = doc.getZip().generate({ type: 'nodebuffer' });
  return libreOfficeService.convertToPdf(buffer, '.docx');
};

let pendingPreviews = 0;
exports.preview = async (input = {}) => {
  if (pendingPreviews >= 5) throw error('Hệ thống đang xử lý nhiều bản xem thử, vui lòng thử lại sau', 429);
  pendingPreviews += 1;
  try {
    return await preview(input);
  } finally {
    pendingPreviews -= 1;
  }
};

exports.generate = async ({ proposalId, user } = {}) => {
  await loadContext(proposalId, user);
  throw error('Gửi BCĐX từ mẫu chưa hoàn thiện; vui lòng sử dụng chức năng tải tờ trình', 501);
};
