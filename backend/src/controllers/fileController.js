const fileService = require('../services/fileService');
const proposalGradingService = require('../services/proposalGradingService');
const pool = require('../utils/db');
const fs = require('fs');

const parseUserCustomData = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
};

const verifyMagic = (filePath, mime) => {
  let buf;
  try {
    const fd = fs.openSync(filePath, 'r');
    buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
  } catch { return false; }
  if (mime === 'image/png') return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  if (mime === 'image/jpeg') return buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
  if (mime === 'image/gif') return buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a';
  if (mime === 'image/webp') return buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  if (mime === 'application/pdf') return buf.toString('ascii', 0, 4) === '%PDF';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04;
  if (mime === 'application/msword' || mime === 'application/vnd.ms-excel') return (buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0) || (buf[0] === 0x50 && buf[1] === 0x4B);
  return true;
};
exports.verifyFileSignature = verifyMagic;

const removePhysical = (p) => { try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch { /* silent */ } };

const containsFileId = (customData, fid) => {
  let obj = customData;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch { return false; }
  }
  if (!obj || typeof obj !== 'object') return false;
  const stack = [obj];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (Array.isArray(cur)) { stack.push(...cur); continue; }
    if (cur && typeof cur === 'object') {
      if (Number(cur.id) === fid && (cur.original_name || cur.storage_key || cur.name)) return true;
      stack.push(...Object.values(cur));
    }
  }
  return false;
};

const canAccessFile = async (file, req) => {
  if (!file) return false;
  let requesterId = req.user ? req.user.id : null;
  let requesterRole = req.user ? req.user.role : null;
  let requesterDepartment = null;
  let requesterChucVu = null;
  let requesterProfile = {};
  if (requesterId) {
    try {
      const [rows] = await pool.query('SELECT role, token_version, custom_data FROM users WHERE id = ?', [requesterId]);
      if (rows.length === 0 || (req.user.tokenVersion || 0) !== (rows[0].token_version || 0)) {
        requesterId = null;
        requesterRole = null;
      } else {
        requesterRole = rows[0].role;
        requesterProfile = parseUserCustomData(rows[0].custom_data);
        requesterDepartment = requesterProfile.department || null;
        requesterChucVu = requesterProfile.chuc_vu || null;
      }
    } catch { /* silent */ }
  }
  const [recoveryReferences] = await pool.query(
    'SELECT proposal_id,document_id,status,preview_file_id FROM proposal_document_recoveries WHERE ? IN (base_file_id,preview_file_id,uploaded_pdf_file_id)', [file.id]);
  if (recoveryReferences.length && !(requesterId && requesterRole === 'SUPER_ADMIN')) {
    if (!recoveryReferences.some(row => ['ACTIVE','CONFIRMED'].includes(row.status) && Number(row.preview_file_id) === Number(file.id))) return false;
  }
  if (requesterId && ['ADMIN', 'SUPER_ADMIN'].includes(requesterRole)) return true;
  if (requesterId) {
    const [recoveries] = await pool.query(
      `SELECT r.proposal_id,r.document_id,d.signing_file_id,p.user_id FROM proposal_document_recoveries r
       JOIN proposal_report_documents d ON d.id=r.document_id JOIN station_proposals p ON p.id=r.proposal_id
       WHERE r.status IN ('ACTIVE','CONFIRMED') AND r.preview_file_id=?`, [file.id]);
    for (const recovery of recoveries) {
      if (Number(recovery.user_id) === Number(requesterId)) return true;
      const [assigned] = await pool.query(
        "SELECT id FROM proposal_signature_configs WHERE proposal_id=? AND (document_id=? OR (document_id IS NULL AND file_id=?)) AND user_id=? AND status<>'CANCELLED' LIMIT 1",
        [recovery.proposal_id, recovery.document_id, recovery.signing_file_id, requesterId]);
      if (assigned.length) return true;
      if (['ADMIN','SALES'].includes(requesterRole)
        && (require('../services/proposalReportService').isFinanceDepartment(requesterDepartment)
          || require('../services/proposalReportService').isBackOffice(requesterDepartment))
        && await require('../services/proposalSignatureService').canReadChairmanProposal({
          user: { id: requesterId, role: requesterRole }, id: recovery.proposal_id
        })) return true;
      try {
        await require('../services/proposalReportService').assertReportReadAccess({ id: requesterId, role: requesterRole }, recovery.proposal_id);
        return true;
      } catch (error) { if (error.statusCode !== 403) throw error; }
    }
    if (recoveryReferences.length) return false;
  }
  if (recoveryReferences.length) return false;
  if (requesterId) {
    const [chairmanProposals] = await pool.query(
      `SELECT cf.proposal_id,p.user_id,p.signed_file_id FROM proposal_chairman_files cf
       JOIN station_proposals p ON p.id=cf.proposal_id WHERE cf.file_id=?`, [file.id]);
    for (const proposal of chairmanProposals) {
      if (Number(proposal.user_id) === Number(requesterId)) return true;
      const [assigned] = await pool.query(
        "SELECT id FROM proposal_signature_configs WHERE proposal_id=? AND user_id=? AND status<>'CANCELLED' LIMIT 1",
        [proposal.proposal_id, requesterId]);
      if (assigned.length) return true;
      const reports = require('../services/proposalReportService');
      if (requesterRole === 'SALES' && (reports.isFinanceDepartment(requesterDepartment)
        || reports.isBackOffice(requesterDepartment)) && proposal.signed_file_id) return true;
      try {
        await reports.assertReportReadAccess({ id: requesterId, role: requesterRole }, proposal.proposal_id);
        return true;
      } catch (error) { if (error.statusCode !== 403) throw error; }
    }
  }
  if (requesterId) {
    const [documents] = await pool.query(
      `SELECT d.proposal_id, d.id FROM proposal_report_documents d
        WHERE d.is_current=1 AND ? IN (d.source_file_id,d.pdf_file_id,d.signing_file_id,d.signed_file_id)`,
      [file.id]);
    for (const document of documents) {
      const [configs] = await pool.query(
        `SELECT id FROM proposal_signature_configs WHERE proposal_id=? AND user_id=?
           AND status<>'CANCELLED' AND (document_id=? OR file_id=?) LIMIT 1`,
        [document.proposal_id, requesterId, document.id, file.id]);
      if (configs.length) return true;
      if (['ADMIN', 'SALES'].includes(requesterRole)
        && (require('../services/proposalReportService').isFinanceDepartment(requesterDepartment)
          || require('../services/proposalReportService').isBackOffice(requesterDepartment))
        && await require('../services/proposalSignatureService').canReadChairmanProposal({
          user: { id: requesterId, role: requesterRole }, id: document.proposal_id
        })) return true;
      try {
        await require('../services/proposalReportService').assertReportReadAccess(
          { id: requesterId, role: requesterRole }, document.proposal_id);
        return true;
      } catch (error) {
        if (error.statusCode !== 403) throw error;
      }
    }
  }
  if (requesterId) {
    const [contractStations] = await pool.query(
      `SELECT id FROM charging_stations WHERE contract_file_id = ?
       UNION SELECT charging_station_id AS id FROM charging_station_contract_files WHERE file_id = ? LIMIT 1`,
      [file.id, file.id]
    );
    if (contractStations.length > 0) {
      return require('../services/chargingStationService').canViewChargingStation(
        contractStations[0].id,
        { id: requesterId, role: requesterRole }
      );
    }
  }
  if (requesterId) {
    const [invoiceStations] = await pool.query(
      'SELECT charging_station_id FROM charging_station_invoices WHERE evidence_file_id = ? LIMIT 1',
      [file.id]
    );
    if (invoiceStations.length > 0) {
      try {
        await require('../services/chargingStationAccessService').assertFinanceViewer({
          id: requesterId,
          role: requesterRole
        });
      } catch (error) {
        if (error.statusCode === 403) return false;
        throw error;
      }
      return require('../services/chargingStationService').canViewChargingStation(
        invoiceStations[0].charging_station_id,
        { id: requesterId, role: requesterRole }
      );
    }
  }
  if (requesterId) {
    const [linkedCharging] = await pool.query(
      `SELECT id AS charging_station_id FROM charging_stations WHERE acceptance_file_id = ?
       UNION SELECT charging_station_id FROM charging_station_images WHERE file_id = ?
       UNION SELECT charging_station_id FROM charging_station_deployments WHERE acceptance_file_id = ?
       UNION SELECT d.charging_station_id FROM charging_station_acceptance_documents a
         JOIN charging_station_deployments d ON d.id=a.deployment_id WHERE a.file_id=?
       UNION SELECT d.charging_station_id FROM charging_station_acceptance_images i
         JOIN charging_station_acceptance_documents a ON a.id=i.acceptance_document_id
         JOIN charging_station_deployments d ON d.id=a.deployment_id WHERE i.file_id=?`,
      [file.id, file.id, file.id, file.id, file.id]
    );
    for (const station of linkedCharging) {
      if (await require('../services/chargingStationService').canViewChargingStation(
        station.charging_station_id, { id: requesterId, role: requesterRole })) return true;
    }
  }
  if (requesterId && file.uploaded_by !== null && file.uploaded_by !== undefined && Number(file.uploaded_by) === Number(requesterId)) return true;
  if (requesterId && requesterRole === 'SALES'
    && (require('../services/proposalReportService').isFinanceDepartment(requesterDepartment)
      || require('../services/proposalReportService').isBackOffice(requesterDepartment))) {
    const [proposals] = await pool.query(
      `SELECT id AS proposal_id FROM station_proposals WHERE signed_file_id=?
       UNION SELECT proposal_id FROM proposal_signature_configs WHERE file_id=? AND status<>'CANCELLED'`,
      [file.id, file.id]);
    for (const proposal of proposals) {
      if (await require('../services/proposalSignatureService').canReadChairmanProposal({
        user: { id: requesterId, role: requesterRole }, id: proposal.proposal_id
      })) return true;
    }
    const [linkedProposals] = await pool.query(
      "SELECT id,custom_data FROM station_proposals WHERE status IN ('SIGNATURE_PENDING','APPROVED') AND custom_data IS NOT NULL");
    for (const proposal of linkedProposals) {
      if (containsFileId(proposal.custom_data, Number(file.id))
        && await require('../services/proposalSignatureService').canReadChairmanProposal({
          user: { id: requesterId, role: requesterRole }, id: proposal.id
        })) return true;
    }
  }
  const reqIp = req.ip || req.connection?.remoteAddress || null;
  if (file.uploaded_by === null && file.submitter_ip && reqIp && file.submitter_ip === reqIp) return true;
  if (!requesterId) {
    try {
      const fid = Number(file.id);
      const [arts] = await pool.query("SELECT videos, roles FROM help_articles WHERE status = 'published'");
      for (const a of arts) {
        let videos = a.videos;
        if (typeof videos === 'string') {
          try { videos = JSON.parse(videos); } catch { continue; }
        }
        if (!Array.isArray(videos)) continue;
        if (!videos.some((v) => v && Number(v.file_id) === fid)) continue;
        let roles = a.roles;
        if (typeof roles === 'string') {
          try { roles = JSON.parse(roles); } catch { roles = null; }
        }
        if (!roles || (Array.isArray(roles) && roles.includes('guest'))) return true;
      }
    } catch { /* silent */ }
  }
  if (requesterId) {
    const reviewRole = require('../services/proposalReviewService').resolveRoleKey({
      role: requesterRole, department: requesterDepartment, chucVu: requesterChucVu
    });
    const reviewScope = reviewRole === 'GDTTKD'
      ? (await require('../services/proposalReviewService').resolveReviewer({ id: requesterId, role: requesterRole })).managementScope
      : null;
    try {
      const fid = Number(file.id);
      const reviewService = require('../services/proposalReviewService');
      const reportService = require('../services/proposalReportService');
      const [props] = await pool.query('SELECT user_id, status, review_level, custom_data FROM station_proposals');
      let branchIds = null;
      if (requesterRole === 'SALES' || requesterRole === 'NPP') {
        const ids = await require('../services/adminUserService').getBranchIds(requesterId);
        branchIds = new Set(ids.map(Number));
      }
      const gradingStatuses = new Set([...proposalGradingService.DOWNSTREAM_STATUSES, 'CANCELLED']);
      const isGradingDepartment = requesterRole === 'SALES'
        && !!proposalGradingService.resolveGradingRole(requesterDepartment);
      let requesterRoleKey = null;
      let requesterRegion = null;
      let isGdttkdUser = false;
      let isTgdUser = false;
      let isBackOfficeUser = false;
      try {
        requesterRoleKey = reviewService.resolveRoleKey({
          role: requesterRole,
          department: requesterDepartment,
          chucVu: requesterChucVu
        });
        requesterRegion = reviewService.resolveRegion(requesterProfile.department)
          || reviewService.resolveRegion(requesterProfile.vung_mien);
        isGdttkdUser = requesterRoleKey === reviewService.REVIEW_ROLE.GDTTKD;
        isTgdUser = requesterRoleKey === reviewService.REVIEW_ROLE.TGD;
        isBackOfficeUser = !!reportService.isBackOffice(requesterDepartment);
      } catch { /* silent */ }
      for (const p of props) {
        if (!containsFileId(p.custom_data, fid)) continue;
        if (p.user_id !== null && Number(p.user_id) === Number(requesterId)) return true;
        if (branchIds && p.user_id !== null && branchIds.has(Number(p.user_id))) return true;
        if (isTgdUser) return true;
        if (isGradingDepartment && gradingStatuses.has(p.status)) return true;
        if (isGdttkdUser && p.review_level !== null && p.review_level !== undefined) {
          if (require('../services/proposalReviewScope').matches(reviewScope, p)) return true;
          if (['GDTTKD_EVALUATING', 'RE_GDTTKD_EVALUATING', 'RE_GRADING', 'TGD_REVIEW'].includes(p.status)) continue;
        }
        if ((isGdttkdUser || isTgdUser || isBackOfficeUser) && gradingStatuses.has(p.status)) {
          if (isGdttkdUser && requesterRegion) {
            const proposalRegion = reviewService.resolveRegion(parseUserCustomData(p.custom_data).vung_mien);
            if (proposalRegion && proposalRegion !== requesterRegion) continue;
          }
          return true;
        }
      }
      const [sts] = await pool.query('SELECT custom_data FROM stations');
      for (const s of sts) {
        if (!containsFileId(s.custom_data, fid)) continue;
        if (['SALES', 'ADMIN', 'SUPER_ADMIN'].includes(requesterRole)) return true;
      }
      const [arts] = await pool.query("SELECT videos, roles FROM help_articles WHERE status = 'published'");
      for (const a of arts) {
        let videos = a.videos;
        if (typeof videos === 'string') {
          try { videos = JSON.parse(videos); } catch { continue; }
        }
        if (!Array.isArray(videos)) continue;
        const linked = videos.some((v) => v && Number(v.file_id) === fid);
        if (!linked) continue;
        let roles = a.roles;
        if (typeof roles === 'string') {
          try { roles = JSON.parse(roles); } catch { roles = null; }
        }
        if (!roles || (Array.isArray(roles) && roles.includes(requesterRole))) return true;
      }
    } catch { /* silent */ }
  }
  return false;
};

exports.canAccessFile = canAccessFile;

exports.upload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Không có file nào được upload' });
    }
    const mime = String(req.file.mimetype || '').toLowerCase().split(';')[0].trim();
    if (!verifyMagic(req.file.path, mime)) {
      removePhysical(req.file.path);
      return res.status(400).json({ success: false, message: 'Nội dung file không khớp định dạng' });
    }

    const userId = req.user ? req.user.id : null;
    const originalNameOverride = req.body.originalName || null;
    const file = await fileService.uploadFile(req.file, userId, originalNameOverride);

    res.status(201).json({
      success: true,
      data: file,
      message: 'Upload file thành công'
    });
  } catch (error) {
    console.error('Upload file error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.guestUpload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Không có file nào được upload' });
    }
    const mime = String(req.file.mimetype || '').toLowerCase().split(';')[0].trim();
    if (!verifyMagic(req.file.path, mime)) {
      removePhysical(req.file.path);
      return res.status(400).json({ success: false, message: 'Nội dung file không khớp định dạng' });
    }

    const ip = req.ip || req.connection?.remoteAddress || null;
    const file = await fileService.uploadFile(req.file, null, null, ip);

    res.status(201).json({
      success: true,
      data: file,
      message: 'Upload file thành công'
    });
  } catch (error) {
    console.error('Guest upload file error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.cleanupOrphans = async (req, res) => {
  try {
    const ttl = Number(process.env.ORPHAN_FILE_TTL_HOURS) || 24;
    const result = await fileService.cleanupOrphanGuestFiles(ttl);
    res.json({ success: true, data: result, message: `Đã dọn ${result.deleted} file mồ côi` });
  } catch (error) {
    console.error('Cleanup orphans error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.getById = async (req, res) => {
  try {
    const file = await fileService.getFileById(req.params.id);
    if (!file) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy file' });
    }
    const allowed = await canAccessFile(file, req);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập tài nguyên này' });
    }
    res.json({ success: true, data: file });
  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.download = async (req, res) => {
  try {
    const result = await fileService.getFilePath(req.params.id);
    if (!result) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy file' });
    }
    const allowed = await canAccessFile(result.file, req);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập tài nguyên này' });
    }

    const mime = result.file.mime_type || 'application/octet-stream';
    const charset = mime.startsWith('text/') || mime.includes('json') || mime.includes('xml') ? '; charset=utf-8' : '';
    res.setHeader('Content-Type', mime + charset);

    const originalName = result.file.original_name || 'download';
    const safeName = originalName.replace(/[^\w\s.\-()]/g, '_');
    const encodedName = encodeURIComponent(originalName);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${encodedName}`);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    res.sendFile(result.filePath);
  } catch (error) {
    console.error('Download file error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.preview = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await fileService.getFilePath(id);
    if (!result) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy file' });
    }
    const allowed = await canAccessFile(result.file, req);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập tài nguyên này' });
    }

    const mime = result.file.mime_type || 'application/octet-stream';

    // PDF gốc → serve trực tiếp
    if (mime === 'application/pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      return res.sendFile(result.filePath);
    }

    // Word → convert (cache) → serve PDF
    const filePreviewCacheService = require('../services/filePreviewCacheService');
    if (!filePreviewCacheService.isWord(mime)) {
      return res.status(400).json({ success: false, message: 'File không hỗ trợ xem trước' });
    }

    const pdfFileId = await filePreviewCacheService.getPreviewPdfFileId(id);
    if (!pdfFileId) {
      return res.status(500).json({ success: false, message: 'Không thể chuyển đổi file sang PDF' });
    }
    const pdfResult = await fileService.getFilePath(pdfFileId);
    if (!pdfResult) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy file PDF preview' });
    }
    const pdfAllowed = await canAccessFile(pdfResult.file, req);
    if (!pdfAllowed) {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập tài nguyên này' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.sendFile(pdfResult.filePath);
  } catch (error) {
    console.error('Preview file error:', error);
    res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.delete = async (req, res) => {
  try {
    const file = await fileService.getFileById(req.params.id);
    if (!file) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy file' });
    }
    if (file.uploaded_by !== req.user.id && !['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập tài nguyên này' });
    }
    const [linkedReports] = await pool.query(
      `SELECT id FROM proposal_report_documents WHERE is_current=1
         AND ? IN (source_file_id,pdf_file_id,signing_file_id,signed_file_id)
       UNION SELECT id FROM proposal_signature_configs WHERE file_id=? AND status<>'CANCELLED'
       UNION SELECT id FROM proposal_chairman_files WHERE file_id=?
       UNION SELECT id FROM proposal_document_recoveries WHERE ? IN (source_file_id,base_file_id,preview_file_id,uploaded_pdf_file_id)
       UNION SELECT recovery_id FROM proposal_recovery_images WHERE replacement_file_id=?
       LIMIT 1`, [file.id, file.id, file.id, file.id, file.id]);
    if (linkedReports.length) {
      return res.status(409).json({ success: false, message: 'Không được xóa tài liệu BCĐX đang sử dụng hoặc đã cấu hình ký. Hãy cập nhật hồ sơ theo quy trình.' });
    }
    const [linkedOnFiles] = await pool.query(
      `SELECT id FROM charging_station_deployments WHERE acceptance_file_id=?
       UNION SELECT id FROM charging_stations WHERE acceptance_file_id=? OR contract_file_id=?
       UNION SELECT id FROM charging_station_contract_files WHERE file_id=?
       UNION SELECT id FROM charging_station_invoices WHERE evidence_file_id=?
       UNION SELECT id FROM charging_station_acceptance_documents WHERE file_id=?
       UNION SELECT id FROM charging_station_acceptance_images WHERE file_id=? LIMIT 1`,
      [file.id, file.id, file.id, file.id, file.id, file.id, file.id]);
    if (linkedOnFiles.length) {
      return res.status(409).json({ success: false, message: 'Không được xóa chứng từ hợp đồng, nghiệm thu hoặc hóa đơn ON trạm đang sử dụng' });
    }

    await fileService.deleteFile(req.params.id);
    res.json({ success: true, message: 'Xóa file thành công' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Lỗi server' });
  }
};
