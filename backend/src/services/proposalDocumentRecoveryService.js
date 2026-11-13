const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { PDFDocument } = require('pdf-lib');
const pool = require('../utils/db');
const fileService = require('./fileService');
const signedDocuments = require('./signedDocumentService');
const office = require('./libreOfficeService');

const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const err = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const number = value => {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw err('Mã hồ sơ phục hồi không hợp lệ');
  return Number(value);
};
const reason = value => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 2000) throw err('Vui lòng nhập lý do từ 1 đến 2000 ký tự');
  return value.trim();
};
const admin = user => { if (user?.role !== 'SUPER_ADMIN') throw err('Chỉ SUPER_ADMIN được phục hồi BCĐX', 403); };
const summary = row => ({ ...row, signers: parse(row.signers), page_sizes: parse(row.page_sizes) || [],
  warnings: parse(row.warnings) || [] });
const MAX_UPLOADED_PDF_SIZE = 10 * 1024 * 1024;
const validatePdf = async bytes => {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_UPLOADED_PDF_SIZE) throw err('PDF tải lên phải có nội dung và không vượt quá 10MB');
  if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw err('Nội dung file không phải PDF hợp lệ');
  let pdf, pages;
  try {
    pdf = await PDFDocument.load(bytes, { throwOnInvalidObject: true });
    pages = pdf.getPages().map(page => page.getSize());
  }
  catch (error) { throw err(`Không đọc được PDF; không dùng file hỏng hoặc có mật khẩu: ${error.message}`); }
  if (pdf.isEncrypted) throw err('Không dùng PDF mã hóa hoặc có mật khẩu');
  if (!pages.length || pages.some(page => ![page.width, page.height].every(value => Number.isFinite(value) && value > 0))) {
    throw err('PDF phải có ít nhất một trang với kích thước hợp lệ');
  }
  if (String(pdf.getKeywords() || '').includes('TMT-EGREEN-SIGNATURE-BLOCK')) throw err('PDF đã được hệ thống chèn chữ ký; không chèn lặp');
  return pages;
};
const uploadedPdf = async (fileId, user, ip) => {
  const stored = await fileService.getFilePath(number(fileId));
  if (!stored || stored.file.mime_type !== 'application/pdf' || path.extname(stored.file.original_name).toLowerCase() !== '.pdf') {
    throw err('Vui lòng chọn file PDF hợp lệ còn hoạt động');
  }
  if (!await require('../controllers/fileController').canAccessFile(stored.file, { user, ip })) throw err('Không có quyền dùng PDF này', 403);
  if (stored.file.size > MAX_UPLOADED_PDF_SIZE || (await fs.stat(stored.filePath)).size > MAX_UPLOADED_PDF_SIZE) throw err('PDF tải lên vượt quá 10MB');
  const bytes = await fs.readFile(stored.filePath);
  const pages = await validatePdf(bytes);
  return { stored, bytes, pages };
};
const pageWarnings = async (ctx, pages) => {
  const warnings = ['Bắt buộc đối chiếu nội dung/phân trang với DOCX gốc và kiểm tra mọi ô ký trước khi xác nhận.'];
  const original = await fileService.getFilePath(ctx.document.pdf_file_id || ctx.document.signing_file_id);
  if (original?.file.mime_type === 'application/pdf') {
    try {
      const oldPdf = await PDFDocument.load(await fs.readFile(original.filePath));
      const oldPages = oldPdf.getPages().map(page => page.getSize());
      if (JSON.stringify(oldPages) !== JSON.stringify(pages)) warnings.push(`Phân trang/kích thước khác PDF cũ (${oldPages.length} → ${pages.length} trang). Kiểm tra lại mọi ô ký.`);
    } catch (error) { warnings.push(`Không đối chiếu được PDF cũ: ${error.message}`); }
  }
  return warnings;
};
const readBase = async row => {
  const base = await fileService.getFilePath(row.base_file_id);
  if (!base) throw err('Không còn PDF nền của lượt phục hồi', 404);
  const bytes = await fs.readFile(base.filePath);
  if (hash(bytes) !== base.file.checksum) throw err('PDF nền không toàn vẹn; hãy tạo lượt phục hồi mới', 409);
  if (row.input_method === 'PDF_UPLOAD') {
    const input = await fileService.getFilePath(row.uploaded_pdf_file_id);
    if (!input || hash(await fs.readFile(input.filePath)) !== row.uploaded_pdf_sha256 || hash(bytes) !== row.uploaded_pdf_sha256) {
      throw err('PDF tải lên đã thay đổi; hãy tạo lượt phục hồi mới', 409);
    }
  }
  return bytes;
};

const withLock = (id, action) => require('./proposalSignatureService')._internals.withSignatureMutationLock(number(id), action);
const context = async (proposalId, documentId, connection = pool, lock = false) => {
  const [proposals] = await connection.query(`SELECT * FROM station_proposals WHERE id=?${lock ? ' FOR UPDATE' : ''}`, [number(proposalId)]);
  if (!proposals.length) throw err('Không tìm thấy đề xuất', 404);
  const proposal = proposals[0];
  if (proposal.status !== 'SIGNATURE_PENDING' || proposal.signed_file_id) throw err('Chỉ phục hồi khi đang trình ký và chưa upload file chủ tịch', 409);
  const [finalFiles] = await connection.query(`SELECT id FROM proposal_chairman_files WHERE proposal_id=?
    UNION SELECT id FROM proposal_report_documents WHERE proposal_id=? AND is_current=1 AND signed_file_id IS NOT NULL LIMIT 1`, [proposalId, proposalId]);
  if (finalFiles.length) throw err('Hồ sơ đã có file chủ tịch; không được phục hồi', 409);
  const [pending] = await connection.query("SELECT id FROM proposal_signature_configs WHERE proposal_id=? AND status='PENDING' LIMIT 1", [proposalId]);
  if (pending.length) throw err('Đề xuất chưa hoàn tất toàn bộ chữ ký', 409);
  const [documents] = await connection.query(`SELECT * FROM proposal_report_documents WHERE id=? AND proposal_id=? AND is_current=1${lock ? ' FOR UPDATE' : ''}`, [number(documentId), proposalId]);
  if (!documents.length) throw err('Không tìm thấy tài liệu hiện hành', 404);
  const document = documents[0];
  if (document.signed_file_id) throw err('Tài liệu đã có file chủ tịch; không được phục hồi', 409);
  const [configs] = await connection.query(
    `SELECT c.*,u.full_name,s.image_sha256 AS snapshot_hash,SHA2(s.image_data,256) AS current_snapshot_hash FROM proposal_signature_configs c
     LEFT JOIN users u ON u.id=c.user_id LEFT JOIN proposal_signature_snapshots s ON s.config_id=c.id
     WHERE c.proposal_id=? AND c.status<>'CANCELLED' AND (c.document_id=? OR (c.document_id IS NULL AND c.file_id=?)) ORDER BY c.id`,
    [proposalId, documentId, document.signing_file_id]);
  if (!configs.length && !proposal.signature_completed_at) throw err('Tài liệu chưa có xác nhận hoàn tất ký', 409);
  if (configs.some(config => config.status !== 'SIGNED')) throw err('Tài liệu chưa ký đủ', 409);
  if (new Set(configs.map(config => Number(config.user_id))).size !== configs.length) throw err('Cấu hình người ký bị trùng; cần kiểm tra trước khi phục hồi', 409);
  const source = await fileService.getFilePath(document.source_file_id);
  if (!source || path.extname(source.file.original_name).toLowerCase() !== '.docx') throw err('Không còn DOCX gốc của tài liệu này', 404);
  const bytes = await fs.readFile(source.filePath);
  if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw err('DOCX gốc phải có nội dung và không vượt quá 20MB');
  if (await signedDocuments.hasRecoverySourceSignatures(bytes)) throw err('DOCX nguồn đã chứa chữ ký; không tự chèn lần nữa. Cần kiểm tra lại nguồn gốc tài liệu', 409);
  const fingerprint = hash(JSON.stringify({
    source: hash(bytes), document: [document.id, document.source_file_id, document.pdf_file_id, document.signing_file_id],
    completed: proposal.signature_completed_at, configs
  }));
  return { proposal, document, configs, source, bytes, fingerprint };
};

const rowFor = async (proposalId, documentId, recoveryId, executor = pool, lock = false) => {
  const [rows] = await executor.query(`SELECT r.*,f.original_name AS uploaded_pdf_name FROM proposal_document_recoveries r
    LEFT JOIN files f ON f.id=r.uploaded_pdf_file_id WHERE r.id=? AND r.proposal_id=? AND r.document_id=?${lock ? ' FOR UPDATE' : ''}`,
    [number(recoveryId), number(proposalId), number(documentId)]);
  if (!rows.length) throw err('Không tìm thấy bản phục hồi', 404);
  return summary(rows[0]);
};
const audit = (connection, proposalId, user, action, detail, ip) =>
  require('./proposalLifecycle').logActivity({ proposalId, action, fromStatus: 'SIGNATURE_PENDING',
    toStatus: 'SIGNATURE_PENDING', reason: detail, actorId: user.id, actorRole: user.role,
    source: 'admin_override', manualOverride: true, ip, connection });

const savePdf = async (bytes, name, userId) => {
  if (!Buffer.isBuffer(bytes) || bytes.length > 20 * 1024 * 1024) throw err('PDF phục hồi vượt quá 20MB');
  const key = `report-recovery/${crypto.randomUUID()}.pdf`;
  const filename = path.join(__dirname, '../../storage/uploads', key);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, bytes);
  try {
    const [result] = await pool.query(`INSERT INTO files(original_name,storage_key,mime_type,size,checksum,uploaded_by,status)
      VALUES (?,?,'application/pdf',?,?,?,'active')`, [name, key, bytes.length, hash(bytes), userId]);
    return result.insertId;
  } catch (error) { await fs.unlink(filename); throw error; }
};
const removeUnlinkedPdf = async id => {
  if (!id) return;
  const stored = await fileService.getFilePath(id);
  await pool.query("UPDATE files SET status='deleted' WHERE id=?", [id]);
  if (stored) await fs.unlink(stored.filePath);
};

const inspect = async ({ user, id, documentId }) => {
  admin(user);
  const ctx = await context(id, documentId);
  const [history] = await pool.query(`SELECT r.*,f.original_name AS uploaded_pdf_name FROM proposal_document_recoveries r
    LEFT JOIN files f ON f.id=r.uploaded_pdf_file_id WHERE r.document_id=? AND r.proposal_id=? ORDER BY r.id DESC`, [documentId, id]);
  return { source_file: { id: ctx.source.file.id, original_name: ctx.source.file.original_name },
    signers: ctx.configs.map(config => ({ ...config, has_snapshot: !!config.snapshot_hash, manual: !config.signature_id })),
    history: history.map(summary) };
};
const create = async ({ user, id, documentId, reason: explanation, input_method = 'DOCX_CONVERT', uploaded_pdf_file_id, ip }) => {
  admin(user);
  const cleanReason = reason(explanation);
  if (!['DOCX_CONVERT','PDF_UPLOAD'].includes(input_method)) throw err('Nguồn PDF phục hồi không hợp lệ');
  if (input_method === 'DOCX_CONVERT' && uploaded_pdf_file_id != null) throw err('Không gửi PDF tải lên khi chọn convert DOCX');
  return withLock(id, async connection => {
    let baseId;
    await connection.beginTransaction();
    try {
      const ctx = await context(id, documentId, connection, true);
      const [busy] = await connection.query("SELECT id FROM proposal_document_recoveries WHERE document_id=? AND status IN ('PENDING','PROCESSING')", [documentId]);
      if (busy.length) throw err('Tài liệu đang có lượt phục hồi chạy nền', 409);
      let input;
      let warnings = [];
      if (input_method === 'PDF_UPLOAD') {
        await connection.query('SELECT id FROM files WHERE id=? FOR UPDATE', [number(uploaded_pdf_file_id)]);
        input = await uploadedPdf(uploaded_pdf_file_id, user, ip);
        warnings = [...await pageWarnings(ctx, input.pages),
          'PDF do người dùng tải lên: hệ thống không thể bảo đảm nội dung giống DOCX hoặc tự nhận diện mọi ảnh chữ ký có sẵn. PDF nền phải chưa được chèn chữ ký.'];
        baseId = await savePdf(input.bytes, `BCDX-${id}-PDF-tai-len-phuc-hoi.pdf`, user.id);
      }
      const [result] = await connection.query(`INSERT INTO proposal_document_recoveries
        (proposal_id,document_id,source_file_id,fingerprint,signers,reason,created_by,input_method,
         uploaded_pdf_file_id,uploaded_pdf_sha256,base_file_id,page_sizes,warnings,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, documentId, ctx.document.source_file_id, ctx.fingerprint,
          JSON.stringify(ctx.configs.map(signer => ({ ...signer, recovery_manual: !signer.signature_id }))), cleanReason, user.id,
          input_method, input?.stored.file.id || null, input ? hash(input.bytes) : null, baseId || null,
          input ? JSON.stringify(input.pages) : null, JSON.stringify(warnings), input ? 'DRAFT' : 'PENDING']);
      for (const signer of ctx.configs) {
        let image = null;
        let source = signer.signature_id ? 'MISSING' : 'MANUAL';
        if (signer.signature_id) {
          try {
            image = (await signedDocuments.readSignature(signer)).bytes;
            source = signer.snapshot_hash ? 'SNAPSHOT' : 'LEGACY';
          } catch (error) {
            if (![400, 404, 409].includes(error.statusCode)) throw error;
            console.warn('[ProposalRecovery] Missing signature image:', signer.id, error.message);
          }
        }
        await connection.query(`INSERT INTO proposal_recovery_images
          (recovery_id,config_id,image_data,image_sha256,source) VALUES (?,?,?,?,?)`,
          [result.insertId, signer.id, image, image ? hash(image) : null, source]);
      }
      await audit(connection, id, user, 'document_recovery_created',
        `Tài liệu ${documentId}, bản phục hồi ${result.insertId}, nguồn ${input_method}${input ? `, PDF #${input.stored.file.id}, SHA256 ${hash(input.bytes)}` : ''}: ${cleanReason}`, ip);
      await connection.commit();
      return get({ user, id, documentId, recoveryId: result.insertId });
    } catch (error) { await connection.rollback(); await removeUnlinkedPdf(baseId); throw error; }
  });
};

const loadImages = async (recoveryId, executor = pool) => {
  const [images] = await executor.query('SELECT * FROM proposal_recovery_images WHERE recovery_id=? ORDER BY config_id', [recoveryId]);
  const map = new Map();
  for (const image of images) {
    if (image.image_data) {
      if (!Buffer.isBuffer(image.image_data) || hash(image.image_data) !== image.image_sha256) throw err('Ảnh phục hồi không toàn vẹn', 409);
      map.set(Number(image.config_id), image.image_data);
    }
  }
  return { images, map };
};
const validPositions = (positions, original, pages) => {
  if (!Array.isArray(positions) || positions.length !== original.length) throw err('Phải giữ đủ người ký của tài liệu');
  const seen = new Set();
  return positions.map(position => {
    const signer = original.find(item => Number(item.id) === Number(position.id));
    if (!signer || seen.has(signer.id)) throw err('Không được thêm, xóa hoặc lặp người ký');
    seen.add(signer.id);
    const page = Number(position.page);
    const x = Number(position.pos_x), y = Number(position.pos_y);
    const w = Number(position.box_width), h = Number(position.box_height);
    const inputs = [position.page, position.pos_x, position.pos_y, position.box_width, position.box_height];
    if (inputs.some(value => !['number','string'].includes(typeof value) || String(value).trim() === '')
      || !Number.isInteger(page) || page < 1 || page > pages.length
      || ![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || w <= 0 || h <= 0
      || x + w > 1.000001 || y + h > 1.000001) throw err(`Trang/vị trí chữ ký ${signer.full_name} không hợp lệ`);
    return { ...signer, page, pos_x: x, pos_y: y, box_width: w, box_height: h };
  });
};
const get = async ({ user, id, documentId, recoveryId }) => {
  admin(user);
  const row = await rowFor(id, documentId, recoveryId);
  const { images } = await loadImages(row.id);
  return { ...row, images: images.map(({ config_id, source, replacement_file_id, replacement_reason }) =>
    ({ config_id, source, replacement_file_id, replacement_reason })) };
};
const image = async ({ user, id, documentId, recoveryId, configId }) => {
  admin(user);
  await rowFor(id, documentId, recoveryId);
  const { map } = await loadImages(recoveryId);
  const bytes = map.get(number(configId));
  if (!bytes) throw err('Không có ảnh chữ ký trong bản phục hồi', 404);
  return bytes;
};

const update = async ({ user, id, documentId, recoveryId, signers, replacements = [], ip }) => {
  admin(user);
  return withLock(id, async connection => {
    let previewId;
    await connection.beginTransaction();
    try {
      const ctx = await context(id, documentId, connection, true);
      const row = await rowFor(id, documentId, recoveryId, connection, true);
      if (row.status !== 'DRAFT' || !row.base_file_id) throw err('Bản phục hồi chưa sẵn sàng hoặc đã xác nhận', 409);
      if (ctx.fingerprint !== row.fingerprint) throw err('Dữ liệu ký/DOCX đã thay đổi; hãy tạo lượt phục hồi mới', 409);
      const positioned = validPositions(signers, row.signers, row.page_sizes);
      if (!Array.isArray(replacements) || replacements.length > positioned.length) throw err('Danh sách ảnh thay thế không hợp lệ');
      const { images, map } = await loadImages(row.id, connection);
      const changed = new Set();
      for (const replacement of replacements) {
        const configId = number(replacement.config_id);
        const image = images.find(item => Number(item.config_id) === configId);
        if (!image || !['MISSING', 'REPLACEMENT'].includes(image.source) || changed.has(configId)) {
          throw err('Chỉ thay ảnh thiếu/hỏng; không ghi đè snapshot hoặc chữ ký thủ công', 409);
        }
        changed.add(configId);
        const fileId = number(replacement.file_id);
        const cleanReason = reason(replacement.reason);
        const stored = await fileService.getFilePath(fileId);
        if (!stored || !['image/png','image/jpeg','image/webp','image/gif'].includes(stored.file.mime_type)
          || stored.file.size > 10 * 1024 * 1024 || (await fs.stat(stored.filePath)).size > 10 * 1024 * 1024
          || !require('../controllers/fileController').verifyFileSignature(stored.filePath, stored.file.mime_type)) throw err('Ảnh thay thế không hợp lệ hoặc vượt quá 10MB');
        if (!await require('../controllers/fileController').canAccessFile(stored.file, { user, ip })) throw err('Không có quyền dùng ảnh thay thế', 403);
        const bytes = (await signedDocuments.readRecoveryImage(stored.filePath)).bytes;
        map.set(configId, bytes);
        image.source = 'REPLACEMENT';
        await connection.query(`UPDATE proposal_recovery_images SET image_data=?,image_sha256=?,source='REPLACEMENT',
          replacement_file_id=?,replacement_reason=? WHERE recovery_id=? AND config_id=?`,
          [bytes, hash(bytes), fileId, cleanReason, row.id, configId]);
      }
      if (images.some(image => image.source === 'MISSING')) throw err('Còn thiếu ảnh chữ ký; hãy chọn ảnh thay thế và nhập lý do', 409);
      const bytes = await signedDocuments.stampRecoveryPdf(await readBase(row), positioned, map);
      previewId = await savePdf(bytes, `BCDX-${id}-phuc-hoi-${row.id}.pdf`, user.id);
      await connection.query('UPDATE proposal_document_recoveries SET signers=?,preview_file_id=?,error=NULL WHERE id=?',
        [JSON.stringify(positioned), previewId, row.id]);
      await audit(connection, id, user, 'document_recovery_preview', `Dựng xem trước bản ${row.id}; ảnh thay thế: ${[...changed].join(', ') || 'không'}`, ip);
      await connection.commit();
      return get({ user, id, documentId, recoveryId });
    } catch (error) {
      await connection.rollback();
      await removeUnlinkedPdf(previewId);
      throw error;
    }
  });
};

const activate = async ({ user, id, documentId, recoveryId, reason: explanation, original = false, ip }) => {
  admin(user);
  if (typeof original !== 'boolean') throw err('Lựa chọn bản gốc phải là boolean');
  const cleanReason = reason(explanation);
  return withLock(id, async connection => {
    await connection.beginTransaction();
    try {
      const ctx = await context(id, documentId, connection, true);
      let row;
      if (!original) {
        row = await rowFor(id, documentId, recoveryId, connection, true);
        if (!['DRAFT','CONFIRMED','ACTIVE'].includes(row.status) || !row.preview_file_id) throw err('Chưa dựng bản xem trước có đủ chữ ký', 409);
        if (ctx.fingerprint !== row.fingerprint) throw err('Dữ liệu gốc đã thay đổi; không thể sử dụng bản phục hồi này', 409);
        await readBase(row);
        const pdf = await fileService.getFilePath(row.preview_file_id);
        if (!pdf) throw err('File phục hồi đã mất', 404);
        const bytes = await fs.readFile(pdf.filePath);
        if (hash(bytes) !== pdf.file.checksum) throw err('PDF phục hồi không toàn vẹn; không được kích hoạt', 409);
        const document = await PDFDocument.load(bytes);
        if (document.getPageCount() !== row.page_sizes.length) throw err('PDF phục hồi bị thay đổi số trang', 409);
        const { images } = await loadImages(row.id, connection);
        if (images.some(image => image.source === 'MISSING')) throw err('Bản phục hồi còn thiếu ảnh chữ ký', 409);
      }
      await connection.query("UPDATE proposal_document_recoveries SET status='CONFIRMED',active_document_id=NULL WHERE document_id=? AND status='ACTIVE'", [documentId]);
      if (row) await connection.query("UPDATE proposal_document_recoveries SET status='ACTIVE',active_document_id=document_id,confirmed_by=COALESCE(confirmed_by,?),confirmed_at=COALESCE(confirmed_at,NOW()) WHERE id=?", [user.id, row.id]);
      await audit(connection, id, user, original ? 'document_recovery_original' : 'document_recovery_confirmed',
        `Tài liệu ${documentId}, bản ${row?.id || 'gốc'}: ${cleanReason}`, ip);
      await connection.commit();
      return { document_id: Number(documentId), recovery_id: row?.id || null };
    } catch (error) { await connection.rollback(); throw error; }
  });
};

let processing = false;
const processNext = async () => {
  if (processing) return;
  processing = true;
  let row, baseId;
  try {
    await pool.query("UPDATE proposal_document_recoveries SET status='FAILED',error='Tiến trình convert bị gián đoạn; hãy tạo lượt mới' WHERE status='PROCESSING' AND updated_at < NOW() - INTERVAL 10 MINUTE");
    const [rows] = await pool.query("SELECT * FROM proposal_document_recoveries WHERE status='PENDING' AND input_method='DOCX_CONVERT' ORDER BY id LIMIT 1");
    if (!rows.length) return;
    row = summary(rows[0]);
    const [claimed] = await pool.query("UPDATE proposal_document_recoveries SET status='PROCESSING',error=NULL WHERE id=? AND status='PENDING'", [row.id]);
    if (!claimed.affectedRows) { row = null; return; }
    const ctx = await context(row.proposal_id, row.document_id);
    if (ctx.fingerprint !== row.fingerprint) throw err('DOCX hoặc chữ ký đã thay đổi; tạo lượt mới', 409);
    const { pdfBuffer, fontWarnings = [] } = await office.convertToPdf(ctx.bytes, '.docx');
    const pdf = await PDFDocument.load(pdfBuffer);
    const pages = pdf.getPages().map(page => page.getSize());
    const warnings = [...fontWarnings, ...await pageWarnings(ctx, pages),
      'Convert thành công không bảo đảm bố cục giống Microsoft Word.'];
    baseId = await savePdf(pdfBuffer, `${path.parse(ctx.source.file.original_name).name}-phuc-hoi.pdf`, row.created_by);
    await withLock(row.proposal_id, async connection => {
      const current = await context(row.proposal_id, row.document_id, connection);
      if (current.fingerprint !== row.fingerprint) throw err('Hồ sơ đã thay đổi trong lúc convert; không dùng kết quả', 409);
      const [saved] = await connection.query("UPDATE proposal_document_recoveries SET status='DRAFT',base_file_id=?,page_sizes=?,warnings=? WHERE id=? AND status='PROCESSING'",
        [baseId, JSON.stringify(pages), JSON.stringify(warnings), row.id]);
      if (!saved.affectedRows) throw err('Lượt phục hồi đã bị gián đoạn; không lưu PDF của lượt cũ', 409);
    });
    baseId = null;
  } catch (error) {
    console.error('[ProposalRecovery] Conversion failed:', row?.id, error);
    if (row) await pool.query("UPDATE proposal_document_recoveries SET status='FAILED',error=? WHERE id=? AND status='PROCESSING'", [String(error.message).slice(0,2000), row.id]);
    await removeUnlinkedPdf(baseId);
  } finally { processing = false; }
};

module.exports = { inspect, create, get, update, activate, image, processNext, validPositions, validatePdf };
