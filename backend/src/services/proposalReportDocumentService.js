const pool = require('../utils/db');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { PDFDocument } = require('pdf-lib');
const fileService = require('./fileService');
const libreOfficeService = require('./libreOfficeService');

const error = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const EDIT_STATUSES = ['PROPOSAL_REPORT_CREATING', 'PROPOSAL_REPORT_RE_CREATING', 'PROPOSAL_REPORT_UPDATING'];
const parse = (value) => typeof value === 'string' ? JSON.parse(value) : (value || {});
const fileIds = (files) => [...new Set((Array.isArray(files) ? files : []).map(file =>
  Number(file && typeof file === 'object' ? (file.id ?? file.file_id) : file)))];
const summary = (file) => file ? {
  id: Number(file.id), original_name: file.original_name, name: file.original_name,
  mime_type: file.mime_type, size: file.size
} : null;

const loadProposal = async (proposalId, executor = pool, lock = false) => {
  if (!Number.isSafeInteger(Number(proposalId)) || Number(proposalId) <= 0) throw error('Đề xuất không hợp lệ');
  const [rows] = await executor.query(`SELECT * FROM station_proposals WHERE id = ?${lock ? ' FOR UPDATE' : ''}`, [proposalId]);
  if (!rows.length) throw error('Không tìm thấy đề xuất', 404);
  return rows[0];
};

const listDocuments = async (proposalId, { initializeLegacy = true, ids } = {}) => {
  if (initializeLegacy) await initializeDocuments(proposalId);
  const params = [proposalId];
  let filter = ' AND d.is_current = 1';
  if (ids) {
    if (!ids.length) return [];
    filter = ' AND d.id IN (?)';
    params.push(ids);
  }
  const [rows] = await pool.query(
    `SELECT d.*,r.id AS recovery_id,r.preview_file_id AS recovery_file_id,
       EXISTS(SELECT 1 FROM proposal_signature_configs s WHERE s.proposal_id=d.proposal_id
         AND s.status<>'CANCELLED' AND (s.document_id=d.id OR s.file_id=d.signing_file_id)) AS has_config,
       EXISTS(SELECT 1 FROM proposal_signature_configs s WHERE s.proposal_id=d.proposal_id
         AND s.status='SIGNED' AND (s.document_id=d.id OR s.file_id=d.signing_file_id)) AS has_signed
       FROM proposal_report_documents d LEFT JOIN proposal_document_recoveries r ON r.document_id=d.id AND r.status='ACTIVE'
       WHERE d.proposal_id = ?${filter} ORDER BY d.id`, params);
  const idsToLoad = [...new Set(rows.flatMap(row =>
    [row.source_file_id, row.pdf_file_id, row.signing_file_id, row.signed_file_id, row.recovery_file_id]).filter(Boolean))];
  const [files] = idsToLoad.length ? await pool.query('SELECT id,original_name,mime_type,size FROM files WHERE id IN (?)', [idsToLoad]) : [[]];
  const byId = new Map(files.map(file => [Number(file.id), summary(file)]));
  return rows.map(row => ({
    ...row, has_config: Boolean(row.has_config), has_signed: Boolean(row.has_signed),
    source_file: byId.get(Number(row.source_file_id)) || null,
    pdf_file: byId.get(Number(row.pdf_file_id)) || null,
    signing_file: byId.get(Number(row.signing_file_id)) || null,
    signed_file: byId.get(Number(row.signed_file_id)) || null,
    recovery_file: byId.get(Number(row.recovery_file_id)) || null
  }));
};

const initializeDocuments = async (proposalId) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const proposal = await loadProposal(proposalId, connection, true);
    const [existing] = await connection.query('SELECT id FROM proposal_report_documents WHERE proposal_id=? AND is_current=1', [proposalId]);
    if (existing.length) { await connection.commit(); return; }
    const custom = parse(proposal.custom_data);
    const ids = fileIds(custom.file_bc_dx).filter(id => Number.isSafeInteger(id) && id > 0);
    for (const id of ids) {
      const [files] = await connection.query("SELECT * FROM files WHERE id=? AND status<>'deleted'", [id]);
      if (!files.length) throw error('File BCĐX cũ không tồn tại', 409);
      const isPdf = files[0].mime_type === 'application/pdf';
      const [configs] = await connection.query("SELECT id FROM proposal_signature_configs WHERE proposal_id=? AND file_id=? AND status<>'CANCELLED'", [proposalId, id]);
      await connection.query(
        `INSERT INTO proposal_report_documents
          (proposal_id,source_file_id,pdf_file_id,signing_file_id,conversion_status,is_current,signed_file_id)
          VALUES (?,?,?,?,?,1,?) ON DUPLICATE KEY UPDATE is_current=1`,
        [proposalId, id, isPdf ? id : null, id, isPdf || configs.length ? 'READY' : 'PENDING',
          ids.length === 1 ? proposal.signed_file_id : null]);
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally { connection.release(); }
};

const assertAccess = async (proposalId, user, { write = false, preparing = false } = {}) => {
  const reports = require('./proposalReportService');
  const proposal = await loadProposal(proposalId);
  const scope = await reports.resolveScope(user);
  if (preparing || (write && EDIT_STATUSES.includes(proposal.status))) {
    if (!EDIT_STATUSES.includes(proposal.status)) throw error('Chỉ chuẩn bị tài liệu trong bước lập tờ trình', 409);
    if (!await reports.canUploadReport(scope, proposal)) throw error('Bạn không có quyền cập nhật tờ trình này', 403);
  } else {
    await reports.assertReportReadAccess(user, proposalId);
    if (write && !(scope.role === 'SUPER_ADMIN' || scope.isBackOffice)) throw error('Chỉ SUPER_ADMIN hoặc Back Office được chuyển PDF ở bước duyệt', 403);
  }
  if (write && ![...EDIT_STATUSES, 'PROPOSAL_REPORT_REVIEWING'].includes(proposal.status)) {
    throw error('Chỉ được chuyển PDF khi lập hoặc duyệt BCĐX, trước cấu hình ký', 409);
  }
  return proposal;
};

const prepareDocuments = async ({ proposalId, files, user, ip }) => {
  await assertAccess(proposalId, user, { write: true, preparing: true });
  const ids = fileIds(files);
  if (!ids.length || ids.length > 10 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    throw error('Chọn từ 1 đến 10 file BCĐX hợp lệ');
  }
  const documents = [];
  for (const id of ids) {
    const data = await fileService.getFilePath(id);
    if (!data) throw error('File BCĐX không tồn tại', 404);
    const allowed = await require('../controllers/fileController').canAccessFile(data.file, { user, ip });
    if (!allowed) throw error('Bạn không có quyền sử dụng file BCĐX này', 403);
    const ext = path.extname(data.file.original_name || '').toLowerCase();
    const mime = data.file.mime_type;
    if (!((ext === '.pdf' && mime === 'application/pdf')
      || (ext === '.docx' && mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      || (ext === '.doc' && mime === 'application/msword'))) throw error('BCĐX chỉ nhận Word hoặc PDF');
    if (Number(data.file.size) > 20 * 1024 * 1024) throw error('File BCĐX vượt quá 20 MB');
    const isPdf = mime === 'application/pdf';
    if (isPdf) {
      try {
        const pdf = await PDFDocument.load(await fs.readFile(data.filePath));
        if (!pdf.getPageCount()) throw error('File PDF không có trang');
      } catch (cause) {
        console.error('[ReportDocument] Invalid PDF:', cause);
        throw error('File PDF không hợp lệ, không có trang hoặc có mật khẩu. Vui lòng tải file PDF đọc được.');
      }
    }
    await pool.query(
      `INSERT INTO proposal_report_documents
        (proposal_id,source_file_id,pdf_file_id,signing_file_id,conversion_status,created_by)
        VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
      [proposalId, id, isPdf ? id : null, id, isPdf ? 'READY' : 'PENDING', user.id]);
    const [rows] = await pool.query('SELECT id FROM proposal_report_documents WHERE proposal_id=? AND source_file_id=?', [proposalId, id]);
    documents.push(rows[0].id);
  }
  return listDocuments(proposalId, { initializeLegacy: false, ids: documents });
};

const convertDocumentOnce = async ({ proposalId, documentId, user, ip, background = false }) => {
  if (!background) await assertAccess(proposalId, user, { write: true });
  const connection = await pool.getConnection();
  const lock = `report_pdf_${Number(documentId)}`;
  let acquired = false;
  try {
    const [locks] = await connection.query('SELECT GET_LOCK(?,0) AS acquired', [lock]);
    acquired = Number(locks[0].acquired) === 1;
    if (!acquired) throw error('Tài liệu đang chuyển PDF, vui lòng đợi', 409);
    await connection.beginTransaction();
    const initialProposal = await loadProposal(proposalId, connection, true);
    const [docs] = await connection.query('SELECT * FROM proposal_report_documents WHERE id=? AND proposal_id=? FOR UPDATE', [documentId, proposalId]);
    if (!docs.length) throw error('Không tìm thấy tài liệu BCĐX', 404);
    const document = docs[0];
    if (background && (initialProposal.status !== 'PROPOSAL_REPORT_REVIEWING' || !document.is_current
      || !['PENDING', 'PROCESSING'].includes(document.conversion_status))) {
      await connection.commit();
      return;
    }
    const [configs] = await connection.query(
      "SELECT id FROM proposal_signature_configs WHERE proposal_id=? AND status<>'CANCELLED' AND (document_id=? OR file_id=?)",
      [proposalId, document.id, document.signing_file_id]);
    if (configs.length || document.signed_file_id) throw error('Phải thu hồi cấu hình ký trước khi chuyển PDF; tài liệu đã ký không được thay đổi', 409);
    if (document.pdf_file_id && document.conversion_status === 'READY') {
      await connection.commit();
      return;
    }
    await connection.query("UPDATE proposal_report_documents SET conversion_status='PROCESSING',conversion_attempts=conversion_attempts+1,conversion_error=NULL WHERE id=?", [documentId]);
    await connection.commit();
    let pdfFile;
    try {
      const source = await fileService.getFilePath(document.source_file_id);
      if (!source) throw error('File Word gốc không tồn tại', 404);
      const { pdfBuffer } = await libreOfficeService.convertToPdf(await fs.readFile(source.filePath), path.extname(source.file.original_name));
      const storageKey = `report-pdf/${crypto.randomUUID()}.pdf`;
      const outputPath = path.join(__dirname, '../../storage/uploads', storageKey);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, pdfBuffer);
      try {
        const [result] = await pool.query(
          `INSERT INTO files(original_name,storage_key,mime_type,size,uploaded_by,status)
           VALUES (?,?,'application/pdf',?,?,'active')`,
          [`${path.parse(source.file.original_name).name}.pdf`, storageKey, pdfBuffer.length, user.id]);
        pdfFile = result.insertId;
      } catch (err) { await fs.unlink(outputPath); throw err; }
      await connection.beginTransaction();
      const proposal = await loadProposal(proposalId, connection, true);
      if (![...EDIT_STATUSES, 'PROPOSAL_REPORT_REVIEWING'].includes(proposal.status)) throw error('Trạng thái đề xuất đã thay đổi trong lúc chuyển PDF', 409);
      const [currentRows] = await connection.query('SELECT * FROM proposal_report_documents WHERE id=? AND proposal_id=? FOR UPDATE', [documentId, proposalId]);
      const currentDocument = currentRows[0];
      if (!currentDocument || currentDocument.signed_file_id
        || (background && (!currentDocument.is_current || proposal.status !== 'PROPOSAL_REPORT_REVIEWING'))) {
        throw error('Tài liệu không còn hiện hành hoặc đã ký; không thay thế PDF', 409);
      }
      const [activeConfigs] = await connection.query(
        "SELECT id FROM proposal_signature_configs WHERE proposal_id=? AND status<>'CANCELLED' AND (document_id=? OR file_id=?)",
        [proposalId, document.id, document.signing_file_id]);
      if (activeConfigs.length) throw error('Tài liệu đã được cấu hình ký trong lúc chuyển PDF', 409);
      await connection.query(
        "UPDATE proposal_report_documents SET pdf_file_id=?,signing_file_id=?,conversion_status='READY',conversion_error=NULL WHERE id=?",
        [pdfFile, pdfFile, documentId]);
      if (currentDocument.is_current) {
        const custom = parse(proposal.custom_data);
        custom.file_bc_dx_sources ||= custom.file_bc_dx;
        custom.file_bc_dx = (custom.file_bc_dx || []).map(file => Number(file.id) === Number(document.signing_file_id)
          ? { id: pdfFile, original_name: `${path.parse(source.file.original_name).name}.pdf`, mime_type: 'application/pdf' } : file);
        await connection.query('UPDATE station_proposals SET custom_data=? WHERE id=?', [JSON.stringify(custom), proposalId]);
      }
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      if (pdfFile) await fileService.deleteFile(pdfFile);
      console.error('[ReportDocument] Conversion failed:', err);
      await pool.query(
        "UPDATE proposal_report_documents SET conversion_status='FAILED',conversion_error=? WHERE id=?",
        [String(err.message || 'Không chuyển được PDF').slice(0, 1000), documentId]);
    }
    const [result] = await pool.query('SELECT conversion_status,conversion_error FROM proposal_report_documents WHERE id=?', [documentId]);
    await require('./proposalLifecycle').logActivity({
      proposalId, action: result[0].conversion_status === 'READY' ? 'report_pdf_converted' : 'report_pdf_failed',
      actorId: user?.id || null, actorRole: user?.role || null, source: background ? 'system_auto' : 'user', ip,
      changedFields: {
        report_document: { label: 'Tài liệu BCĐX', old: String(document.source_file_id), new: String(pdfFile || document.source_file_id) },
        conversion: { label: 'Chuyển PDF', old: document.conversion_status, new: result[0].conversion_error || result[0].conversion_status }
      }
    });
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    if (acquired) await connection.query('SELECT RELEASE_LOCK(?)', [lock]);
    connection.release();
  }
};

let conversionTail = Promise.resolve();
let queuedConversions = 0;
const convertDocument = (input) => {
  if (queuedConversions >= 20) return Promise.reject(error('Hàng đợi chuyển PDF đang đầy, vui lòng thử lại sau', 429));
  queuedConversions++;
  const result = conversionTail.then(() => convertDocumentOnce(input));
  conversionTail = result.then(() => undefined, () => undefined);
  return result.finally(() => { queuedConversions--; });
};

const activateDocuments = async (proposalId, documents, executor = pool) => {
  await executor.query('UPDATE proposal_report_documents SET is_current=0 WHERE proposal_id=?', [proposalId]);
  await executor.query('UPDATE proposal_report_documents SET is_current=1 WHERE proposal_id=? AND id IN (?)', [proposalId, documents.map(doc => doc.id)]);
  await executor.query("UPDATE proposal_signature_configs SET status='CANCELLED' WHERE proposal_id=? AND status<>'CANCELLED'", [proposalId]);
};

module.exports = {
  listDocuments, getSigningDocuments: listDocuments, prepareDocuments, convertDocument,
  activateDocuments, assertAccess,
  convertInBackground: (input) => convertDocument({ ...input, background: true }),
};
