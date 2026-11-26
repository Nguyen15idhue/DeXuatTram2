<<<<<<< HEAD:backend/src/services/proposal/proposalReportGenerationService.js
const pool = require('../../utils/db');
const dynamicUtils = require('../dynamicUtils');
const documentService = require('../document/documentService');
const documentTemplateService = require('../document/documentTemplateService');
const libreOfficeService = require('../libreOfficeService');
const { SYSTEM_DATE_TOKENS } = require('../document/documentSystemTokens');
const { getInputFields, validateInputs, renderDocument } = require('../document/documentRendering');
=======
const pool = require('../utils/db');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const jwt = require('jsonwebtoken');
const dynamicUtils = require('./dynamicUtils');
const documentService = require('./documentService');
const documentTemplateService = require('./documentTemplateService');
const libreOfficeService = require('./libreOfficeService');
const { SYSTEM_DATE_TOKENS } = require('./documentSystemTokens');
const { getInputFields, validateInputs, renderDocument } = require('./documentRendering');
>>>>>>> d176a9f1b753f29a3f1f793d06b6b59bcda15dc8:backend/src/services/proposalReportGenerationService.js

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
  return { proposal, rawProposal: rows[0], fields, model: proposal.mo_hinh_dau_tu || '' };
};

const snapshotHash = (proposal) => crypto.createHash('sha256').update(JSON.stringify(proposal)).digest('hex');
const proofSecret = () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required for BCĐX preview');
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update('proposal-report-preview-v1').digest();
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
  for (const [name, binding] of Object.entries(template.mapping?.tokens || {})) {
    if (Object.hasOwn(SYSTEM_DATE_TOKENS, name)) continue;
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
    draft: await require('./proposalReportService').getGenerationDraft(proposalId),
    templates: templates.map((template) => ({
      id: template.id,
      name: template.name,
      model: template.model,
      fields: editableFields(template, fields, proposal),
      input_fields: getInputFields(template.mapping)
    }))
  };
};

const preview = async ({ proposalId, templateId, values, inputs = {}, chotSoLuongTru, savedDraftRevision, user } = {}) => {
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
  const resolvedInputs = validateInputs(mapping, inputs);
  if (mapping.signatureAnchors?.length || mapping.signers?.length) {
    throw error('Mẫu có cấu hình chữ ký tự động chưa được hỗ trợ trong bản xem thử');
  }
  const tokens = await documentTemplateService.listTokens(template.id);
  if (tokens.some((item) => /^\{sig_/i.test(item.token))) {
    throw error('Mẫu có vị trí ký tự động chưa được hỗ trợ trong bản xem thử');
  }
  if (savedDraftRevision !== undefined) {
    const draft = await require('./proposalReportService').getGenerationDraft(proposalId);
    if (draft.revision !== savedDraftRevision) throw error('Trụ chốt hoặc ngày dự kiến ON đã thay đổi, vui lòng tải lại', 409);
    overrides.chot_so_luong_tru = draft.chot_so_luong_tru;
    overrides.tong_gia_tri_chot = draft.tong_gia_tri_chot;
    overrides.ngay_du_kien_on = draft.ngay_du_kien_on;
  } else if (chotSoLuongTru !== undefined) {
    const result = await require('./proposalReportService').normalizePreviewChotRows(chotSoLuongTru);
    overrides.chot_so_luong_tru = result.rows;
    overrides.tong_gia_tri_chot = result.total;
  }
  const { data, loopInfos, numericData } = await documentService.buildData({ ...context.proposal, ...overrides }, mapping);
  const { zip } = await documentTemplateService.readDocxXml(template.file_id);
  for (const [key, config] of Object.entries(mapping.loops || {})) {
    if (config?.render?.empty === 'hide' && !loopInfos?.[key]?.count) {
      documentService.stripEmptyLoopRow(zip, key);
    }
  }
  const rendered = renderDocument({ zip, data, mapping, inputs, numericData });
  const converted = await libreOfficeService.convertToPdf(rendered.buffer, '.docx');
  if (converted.pdfBuffer.length > 20 * 1024 * 1024) throw error('PDF BCĐX vượt quá 20 MB');
  const blocking = rendered.warnings.filter((warning) =>
    warning.startsWith('Chưa cấu hình:') || warning.startsWith('Bảng chưa cấu hình:'));
  for (const field of getInputFields(mapping)) {
    if (field.required && String(resolvedInputs[field.key] ?? '').trim() === '') {
      blocking.push(`${field.label}: chưa nhập thông tin bắt buộc`);
    }
  }
  for (const [name, binding] of Object.entries(mapping.tokens || {})) {
    if (binding?.source !== 'field' || !tokens.some((item) => item.token === `{${name}}`)) continue;
    const definition = context.fields.find((item) => item.key === binding.key);
    if (!(definition?.required === true || Number(definition?.required) === 1)) continue;
    const value = Object.hasOwn(overrides, binding.key) ? overrides[binding.key] : context.proposal[binding.key];
    if (value == null || (typeof value === 'string' && !value.trim())
      || (Array.isArray(value) && !value.length)
      || (value && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value) && !Object.keys(value).length)
      || (definition.type === 'user' && typeof value === 'object' && !value?.id)
      || rendered.warnings.includes(`Chưa có dữ liệu: ${name}`)) {
      blocking.push(`${definition.label || binding.key}: chưa nhập thông tin bắt buộc`);
    }
  }
  let proof = null;
  if (savedDraftRevision !== undefined) {
    proof = jwt.sign({
      purpose: 'proposal-report-preview', proposalId: Number(proposalId), userId: Number(user.id),
      tokenVersion: Number(user.tokenVersion || 0), draftRevision: savedDraftRevision,
      proposalSnapshot: snapshotHash(context.rawProposal),
      templateId: id, templateSnapshot: snapshotHash(template),
      pdfHash: crypto.createHash('sha256').update(converted.pdfBuffer).digest('hex'),
      blocked: blocking.length > 0
    }, proofSecret(), { algorithm: 'HS256', expiresIn: '1h' });
  }
  return { ...converted, warnings: rendered.warnings, blocking, proof };
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

exports.generate = async ({ proposalId, user, pdfBuffer, proof, ip } = {}) => {
  let claims;
  try {
    claims = jwt.verify(proof, proofSecret(), { algorithms: ['HS256'] });
  } catch (cause) {
    if (cause instanceof jwt.JsonWebTokenError || cause instanceof jwt.TokenExpiredError) {
      throw error('Bản xem thử không hợp lệ hoặc đã hết hạn; vui lòng xem lại', 409);
    }
    throw cause;
  }
  if (!Buffer.isBuffer(pdfBuffer) || !pdfBuffer.length || claims.purpose !== 'proposal-report-preview'
    || claims.proposalId !== Number(proposalId) || claims.userId !== Number(user?.id)
    || claims.tokenVersion !== Number(user?.tokenVersion || 0)
    || claims.pdfHash !== crypto.createHash('sha256').update(pdfBuffer).digest('hex')
    || !/^[a-f0-9]{64}$/.test(claims.draftRevision || '')
    || !/^[a-f0-9]{64}$/.test(claims.proposalSnapshot || '')
    || !/^[a-f0-9]{64}$/.test(claims.templateSnapshot || '')) {
    throw error('PDF hoặc thông tin xem thử không khớp; vui lòng xem lại', 409);
  }
  if (claims.blocked) throw error('Bản xem thử còn token chưa cấu hình hoặc thiếu thông tin bắt buộc', 400);
  const context = await loadContext(proposalId, user);
  if (snapshotHash(context.rawProposal) !== claims.proposalSnapshot) {
    throw error('Đề xuất đã thay đổi, vui lòng xem lại PDF', 409);
  }
  const template = (await getAvailableTemplates(context.model)).find((item) => Number(item.id) === claims.templateId);
  if (!template || snapshotHash(template) !== claims.templateSnapshot) {
    throw error('Mẫu BCĐX đã thay đổi, vui lòng xem lại PDF', 409);
  }
  const reports = require('./proposalReportService');
  const draft = await reports.getGenerationDraft(proposalId);
  if (draft.revision !== claims.draftRevision || !draft.ngay_du_kien_on || !draft.chot_so_luong_tru?.length) {
    throw error('Trụ chốt hoặc ngày dự kiến ON đã thay đổi, vui lòng xem lại PDF', 409);
  }
  const storageKey = `report-generated/${crypto.randomUUID()}.pdf`;
  const filePath = path.join(__dirname, '../../storage/uploads', storageKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, pdfBuffer, { flag: 'wx' });
  let fileId;
  let reportSaved = false;
  try {
    const [result] = await pool.query(
      `INSERT INTO files(original_name,storage_key,mime_type,size,uploaded_by,submitter_ip,status)
       VALUES (?,?,'application/pdf',?,?,?,'active')`,
      [`BCDX_${Number(proposalId)}.pdf`, storageKey, pdfBuffer.length, user.id, ip || null]
    );
    fileId = result.insertId;
    return await reports.uploadReport({
      user, id: proposalId, files: [{ id: fileId }], chotSoLuongTru: draft.chot_so_luong_tru,
      ngayDuKienOn: draft.ngay_du_kien_on, ip,
      expectedDraftRevision: claims.draftRevision, expectedProposalSnapshot: claims.proposalSnapshot,
      onReportSaved: () => { reportSaved = true; }
    });
  } catch (cause) {
    try {
      if (!fileId) await fs.unlink(filePath);
      else if (!reportSaved) {
        await pool.query('DELETE FROM proposal_report_documents WHERE source_file_id=? AND is_current=0', [fileId]);
        const [references] = await pool.query(
          'SELECT id FROM proposal_report_documents WHERE source_file_id=? OR pdf_file_id=? OR signing_file_id=? OR signed_file_id=? LIMIT 1',
          [fileId, fileId, fileId, fileId]
        );
        if (!references.length) await require('./fileService').deleteFile(fileId);
      } else {
        cause.message = `PDF đã được lưu nhưng chưa xác nhận hoàn tất bước duyệt: ${cause.message}. Vui lòng tải lại đề xuất để kiểm tra trạng thái trước khi thử lại.`;
      }
    } catch (cleanupError) {
      console.error('[ProposalReportGeneration] Cannot clean generated PDF:', cleanupError);
    }
    throw cause;
  }
};

exports.snapshotHash = snapshotHash;
