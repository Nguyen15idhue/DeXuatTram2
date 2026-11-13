const pool = require('../utils/db');
const path = require('path');
const fs = require('fs');
const dynamicUtils = require('./dynamicUtils');
const proposalGradingService = require('./proposalGradingService');
const proposalReportService = require('./proposalReportService');
const proposalReportDocumentService = require('./proposalReportDocumentService');
const signedDocumentService = require('./signedDocumentService');
const signatureSnapshots = require('./signatureSnapshotService');
const JSZip = require('jszip');

const { parseCustomData, toFileSummaries } = proposalGradingService;

const SIGNATURE_PENDING = 'SIGNATURE_PENDING';
const APPROVED = 'APPROVED';
const UPDATING_STATUS = 'PROPOSAL_REPORT_UPDATING';
const REPORT_FIELD = 'file_bc_dx';
const REVISION_REQUEST_TYPE = 'REVISE_BCDX';

const SIGN_STATUS = {
  PENDING: 'PENDING',
  DOING: 'DOING',
  DONE: 'DONE',
  CEO_SIGNED: 'CEO_SIGNED'
};

const SIGN_STATUS_LABELS = {
  PENDING: 'Cần thực hiện',
  DOING: 'Đang thực hiện',
  DONE: 'Đã hoàn thành',
  CEO_SIGNED: 'Chủ tịch đã phê duyệt'
};

const configuredFileIds = (configs) => [...new Set(
  (configs || [])
    .map((config) => Number(config.file_id))
    .filter((fileId) => Number.isInteger(fileId) && fileId > 0)
)];
const documentIdOf = (document) => Number(document && document.id);
const signingFileIdOf = (document) => Number(document && document.signing_file && document.signing_file.id);
const isSignableFile = (file) => {
  const extension = path.extname(String(file && file.original_name || '')).toLowerCase();
  const mimeType = String(file && file.mime_type || '').toLowerCase();
  if (extension === '.doc' || mimeType === 'application/msword') return false;
  return extension === '.pdf' || extension === '.docx'
    || mimeType === 'application/pdf'
    || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
};
const isDocumentReadyForSignature = (document) => !['PENDING', 'PROCESSING'].includes(
  String(document && document.conversion_status || '').toUpperCase()
) && isSignableFile(document && document.signing_file);
const getSigningDocuments = (proposalId) => proposalReportDocumentService.getSigningDocuments(proposalId);
const withSignatureMutationLock = async (proposalId, operation) => {
  let connection = null;
  const lockName = `proposal-signature:${Number(proposalId)}`;
  let acquired = false;
  const deadline = Date.now() + 10000;
  try {
    do {
      connection = await pool.getConnection();
      const [rows] = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [lockName]);
      acquired = Number(rows[0]?.acquired) === 1;
      if (acquired) break;
      connection.release();
      connection = null;
      await new Promise((resolve) => setTimeout(resolve, 50));
    } while (Date.now() < deadline);
    if (!acquired) throw err('Hồ sơ đang được xử lý ký; vui lòng thử lại', 409);
    return await operation(connection);
  } finally {
    try {
      if (acquired) await connection.query('SELECT RELEASE_LOCK(?) AS released', [lockName]);
    } finally {
      if (connection) connection.release();
    }
  }
};
const validateDocumentSignerSets = (documents) => {
  for (const document of documents || []) {
    const signers = document.signers || [];
    if (new Set(signers.map((signer) => Number(signer.user_id))).size !== signers.length) {
      throw err('Một người chỉ được cấu hình một ô ký trên cùng tài liệu', 400);
    }
  }
  return true;
};
const normalizeFinalDocuments = (activeDocuments, finalDocuments) => {
  const expectedDocumentIds = activeDocuments.map(documentIdOf);
  if (finalDocuments.length !== expectedDocumentIds.length
    || new Set(finalDocuments.map((document) => document.document_id)).size !== expectedDocumentIds.length
    || expectedDocumentIds.some((documentId) => !finalDocuments.some((document) => document.document_id === documentId))) {
    throw err('Danh sách file đã ký phải khớp toàn bộ tài liệu BCĐX hiện hành', 400);
  }
  if (finalDocuments.some((document) => !Number.isInteger(document.file_id) || document.file_id <= 0)) {
    throw err('Vui lòng tải lên file BCĐX đã ký cho từng tài liệu', 400);
  }
  if (new Set(finalDocuments.map((document) => document.file_id)).size !== finalDocuments.length) {
    throw err('Mỗi tài liệu phải có file BCĐX đã ký riêng', 400);
  }
  return finalDocuments;
};
exports._internals = {
  isSignableFile,
  isDocumentReadyForSignature,
  withSignatureMutationLock,
  validateDocumentSignerSets,
  normalizeFinalDocuments
};

const TAB_STATUSES = {
  all: [SIGNATURE_PENDING, APPROVED],
  pending: [SIGNATURE_PENDING],
  chairman: [SIGNATURE_PENDING],
  completed: [SIGNATURE_PENDING, APPROVED]
};

const err = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const notificationService = require('./notificationService');

const SIGNER_TOTAL_SQL = "(SELECT COUNT(*) FROM proposal_signature_configs s WHERE s.proposal_id = p.id AND s.status <> 'CANCELLED')";
const SIGNER_SIGNED_SQL = "(SELECT COUNT(*) FROM proposal_signature_configs s WHERE s.proposal_id = p.id AND s.status = 'SIGNED')";
const SIGNING_COMPLETE_SQL = `(p.signature_completed_at IS NOT NULL OR (${SIGNER_TOTAL_SQL} > 0 AND ${SIGNER_SIGNED_SQL} = ${SIGNER_TOTAL_SQL}))`;
const MY_CONFIG_SQL = "(SELECT COUNT(*) FROM proposal_signature_configs s WHERE s.proposal_id = p.id AND s.user_id = ? AND s.status <> 'CANCELLED')";
const MY_PENDING_CONFIG_SQL = "(SELECT COUNT(*) FROM proposal_signature_configs s WHERE s.proposal_id = p.id AND s.user_id = ? AND s.status = 'PENDING')";
const MY_SIGNED_SQL = "(SELECT COUNT(*) FROM proposal_signature_configs s WHERE s.proposal_id = p.id AND s.user_id = ? AND s.status = 'SIGNED')";
const MY_COMPLETED_SQL = `(${MY_SIGNED_SQL} > 0 AND ${MY_PENDING_CONFIG_SQL} = 0)`;
const CHAIRMAN_PENDING_SQL = `(p.status = 'SIGNATURE_PENDING' AND ${SIGNING_COMPLETE_SQL} AND p.signed_file_id IS NULL)`;
const CHAIRMAN_COMPLETED_SQL = "(p.status = 'APPROVED' AND p.signed_file_id IS NOT NULL)";
const CHAIRMAN_VISIBLE_SQL = `(${CHAIRMAN_PENDING_SQL} OR ${CHAIRMAN_COMPLETED_SQL})`;

const resolveScope = async (user) => {
  const proposalReviewService = require('./proposalReviewService');
  const profile = await proposalReportService.resolveScope(user);
  const roleKey = proposalReviewService.resolveRoleKey({
    role: user && user.role,
    department: profile.department,
    chucVu: profile.chucVu
  });
  return {
    ...profile,
    isFinance: ['ADMIN', 'SALES'].includes(user?.role) && !!profile.isFinance,
    roleKey,
    isTgd: roleKey === 'TGD',
    isManager: profile.isAdmin || profile.isBackOffice || roleKey === 'TGD'
  };
};

const computeSignStatus = (row) => {
  if (row.signed_file_id) return SIGN_STATUS.CEO_SIGNED;
  if (row.signature_completed_at) return SIGN_STATUS.DONE;
  const total = Number(row.signer_total || 0);
  const signed = Number(row.signer_signed || 0);
  if (total === 0 || signed === 0) return SIGN_STATUS.PENDING;
  if (signed < total) return SIGN_STATUS.DOING;
  return SIGN_STATUS.DONE;
};

const mapSignatureRow = (row) => {
  const custom = parseCustomData(row.custom_data);
  const signStatus = computeSignStatus(row);
  const signatureConfigConflict = Number(row.signer_distinct_total || 0) !== Number(row.signer_total || 0);
  return {
    ...row,
    custom_data: custom,
    signer_total: Number(row.signer_total || 0),
    signer_signed: Number(row.signer_signed || 0),
    signature_config_conflict: signatureConfigConflict,
    sign_status: signStatus,
    sign_status_label: SIGN_STATUS_LABELS[signStatus],
    signature_manually_completed: !!row.signature_completed_at,
    can_sign: !signatureConfigConflict && Number(row.my_pending_count || 0) > 0,
    is_my_signed: Number(row.my_signed_count || 0) > 0,
    is_my_completed: Number(row.my_signed_count || 0) > 0 && Number(row.my_pending_count || 0) === 0
  };
};

exports.SIGN_STATUS = SIGN_STATUS;
exports.SIGN_STATUS_LABELS = SIGN_STATUS_LABELS;
exports.TAB_STATUSES = TAB_STATUSES;

const SIGN_STATUS_CASE_SQL = `(CASE WHEN p.signed_file_id IS NOT NULL THEN 'CEO_SIGNED' WHEN p.signature_completed_at IS NOT NULL THEN 'DONE' WHEN (${SIGNER_TOTAL_SQL}) = 0 OR (${SIGNER_SIGNED_SQL}) = 0 THEN 'PENDING' WHEN (${SIGNER_SIGNED_SQL}) < (${SIGNER_TOTAL_SQL}) THEN 'DOING' ELSE 'DONE' END)`;

exports.listProposals = async ({
  user,
  tab = 'all',
  search = '',
  page = 1,
  limit = 10,
  signStatus = '',
  myStatus = '',
  moHinh = ''
} = {}) => {
  const safeTab = Object.prototype.hasOwnProperty.call(TAB_STATUSES, tab) ? tab : 'all';
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 10));
  const offset = (safePage - 1) * safeLimit;
  const scope = await resolveScope(user);
  const canHandleChairman = scope.role === 'SUPER_ADMIN' || scope.isFinance;
  const statuses = TAB_STATUSES[safeTab];

  const where = [`p.status IN (${statuses.map(() => '?').join(',')})`];
  const params = [...statuses];
  if (statuses.includes(APPROVED)) {
    where.push("(p.status <> 'APPROVED' OR p.signed_file_id IS NOT NULL)");
  }

  if (safeTab === 'all') {
    if (!scope.isManager) {
      where.push(`(${MY_CONFIG_SQL} > 0${scope.isFinance ? ` OR ${CHAIRMAN_VISIBLE_SQL}` : ''})`);
      params.push(scope.userId);
    }
  } else if (safeTab === 'pending') {
    const uploadTask = canHandleChairman
      ? ` OR ${CHAIRMAN_PENDING_SQL}`
      : '';
    where.push(`(${MY_PENDING_CONFIG_SQL} > 0${uploadTask})`);
    params.push(scope.userId);
  } else if (safeTab === 'chairman') {
    if (scope.isFinance && scope.role !== 'SUPER_ADMIN') {
      where.push('1=0');
    } else if (scope.role !== 'SUPER_ADMIN') {
      where.push(`${MY_CONFIG_SQL} > 0`);
      params.push(scope.userId);
    }
    where.push(CHAIRMAN_PENDING_SQL);
  } else if (safeTab === 'completed') {
    where.push(`(${MY_COMPLETED_SQL}${canHandleChairman ? ` OR ${CHAIRMAN_COMPLETED_SQL}` : ''})`);
    params.push(scope.userId, scope.userId);
  }

  if (search) {
    const like = `%${String(search).trim()}%`;
    where.push(`(
      p.ma_de_xuat_gen LIKE ? OR p.owner_name LIKE ? OR p.owner_phone LIKE ? OR p.address LIKE ?
      OR u.full_name LIKE ?
    )`);
    params.push(like, like, like, like, like);
  }

  const cleanSignStatus = Object.values(SIGN_STATUS).includes(signStatus) ? signStatus : '';
  if (cleanSignStatus) {
    where.push(`${SIGN_STATUS_CASE_SQL} = ?`);
    params.push(cleanSignStatus);
  }

  const cleanMyStatus = myStatus === 'my_pending' || myStatus === 'my_signed' ? myStatus : '';
  if (cleanMyStatus === 'my_pending') {
    where.push(`${MY_PENDING_CONFIG_SQL} > 0`);
    params.push(scope.userId);
  } else if (cleanMyStatus === 'my_signed') {
    where.push(MY_COMPLETED_SQL);
    params.push(scope.userId, scope.userId);
  }

  if (moHinh) {
    where.push(`JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.mo_hinh_dau_tu')) = ?`);
    params.push(String(moHinh));
  }

  const whereClause = `WHERE ${where.join(' AND ')}`;

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM station_proposals p
     LEFT JOIN users u ON u.id = p.user_id
     ${whereClause}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);

  const orderBy = safeTab === 'all'
    ? 'p.updated_at DESC, p.id DESC'
    : 'p.updated_at ASC, p.id ASC';

  const [rows] = await pool.query(
    `SELECT p.*, p.ma_de_xuat_gen AS ma_de_xuat, u.full_name AS user_name, u.email AS user_email,
            JSON_UNQUOTE(JSON_EXTRACT(u.custom_data, '$.department')) AS owner_department,
            u.parent_id AS manager_user_id, manager.full_name AS manager_name,
            p.signed_file_id,
            ${SIGNER_TOTAL_SQL} AS signer_total,
            ${SIGNER_SIGNED_SQL} AS signer_signed,
            (SELECT COUNT(DISTINCT CONCAT(
               IF(s.document_id IS NULL, CONCAT('f', s.file_id), CONCAT('d', s.document_id)),
               ':', s.user_id
             )) FROM proposal_signature_configs s
              WHERE s.proposal_id = p.id AND s.status <> 'CANCELLED') AS signer_distinct_total,
            (SELECT COUNT(*) FROM proposal_signature_configs s
              WHERE s.proposal_id = p.id AND s.user_id = ? AND s.status <> 'CANCELLED') AS my_config_count,
            (SELECT COUNT(*) FROM proposal_signature_configs s
              WHERE s.proposal_id = p.id AND s.user_id = ? AND s.status = 'PENDING') AS my_pending_count,
            (SELECT COUNT(*) FROM proposal_signature_configs s
              WHERE s.proposal_id = p.id AND s.user_id = ? AND s.status = 'SIGNED') AS my_signed_count
     FROM station_proposals p
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN users manager ON manager.id = u.parent_id
     ${whereClause}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [scope.userId, scope.userId, scope.userId, ...params, safeLimit, offset]
  );

  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const proposals = rows.map((row) => dynamicUtils.mergeData(row, fieldDefs)).map(mapSignatureRow);

  return {
    proposals,
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) },
    meta: {
      isAdmin: !!scope.isAdmin,
      isSuperAdmin: scope.role === 'SUPER_ADMIN',
      isBackOffice: !!scope.isBackOffice,
      isFinance: !!scope.isFinance,
      can_handle_chairman: canHandleChairman,
      can_view_chairman_tab: scope.role === 'SUPER_ADMIN' || !scope.isFinance,
      isTgd: !!scope.isTgd,
      isManager: !!scope.isManager,
      department: scope.department
    }
  };
};

const loadProposal = async (id) => {
  const proposalId = Number(id);
  if (!Number.isInteger(proposalId) || proposalId <= 0) throw err('Đề xuất không hợp lệ', 400);
  const [rows] = await pool.query(
    'SELECT p.*, p.ma_de_xuat_gen AS ma_de_xuat FROM station_proposals p WHERE p.id = ?',
    [proposalId]
  );
  if (rows.length === 0) throw err('Không tìm thấy đề xuất', 404);
  return rows[0];
};

exports.canReadChairmanProposal = async ({ user, id } = {}) => {
  const scope = await resolveScope(user);
  if (!scope.isFinance) return false;
  const [rows] = await pool.query(
    `SELECT p.id FROM station_proposals p WHERE p.id = ? AND ${CHAIRMAN_VISIBLE_SQL}`, [id]);
  return rows.length > 0;
};

const loadConfigs = async (proposalId) => {
  const [rows] = await pool.query(
    `SELECT s.*, u.full_name, u.email, u.role
     FROM proposal_signature_configs s
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.proposal_id = ? AND s.status <> 'CANCELLED'
     ORDER BY s.page ASC, s.id ASC`,
    [proposalId]
  );
  return rows.map((row) => ({
    id: row.id,
    proposal_id: row.proposal_id,
    document_id: row.document_id ? Number(row.document_id) : null,
    user_id: row.user_id,
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    signer_title: row.signer_title,
    signer_department: row.signer_department || null,
    anchor_token: row.anchor_token || null,
    file_id: row.file_id,
    page: row.page,
    pos_x: Number(row.pos_x),
    pos_y: Number(row.pos_y),
    box_width: Number(row.box_width),
    box_height: Number(row.box_height),
    status: row.status,
    created_by: row.created_by ? Number(row.created_by) : null,
    signed_at: row.signed_at,
    signature_id: row.signature_id,
    signature_url: row.signature_url
  }));
};

const loadRevisionRequests = async (proposalId) => {
  const [rows] = await pool.query(
    `SELECT r.id, r.request_type, r.description, r.status, r.round_no, r.note, r.target_user_id,
            r.requested_by, r.previous_status, r.current_status, r.created_at,
            u.full_name AS requested_by_name
     FROM proposal_requests r
     LEFT JOIN users u ON u.id = r.requested_by
     WHERE r.proposal_id = ? AND r.request_type IN ('RE_GRADE', 'REVISE_BCDX')
     ORDER BY r.id DESC
     LIMIT 10`,
    [proposalId]
  );
  return rows;
};

const buildDetail = async (proposal, scope) => {
  const configs = await loadConfigs(proposal.id);
  const documents = await getSigningDocuments(proposal.id);
  const legacyDocument = documents.length === 1 ? documents[0] : null;
  const mappedConfigs = configs.map((config) => {
    const document = documents.find((item) => (config.document_id && documentIdOf(item) === config.document_id)
      || (!config.document_id && signingFileIdOf(item) === Number(config.file_id)))
      || (!config.document_id ? legacyDocument : null);
    return {
      ...config,
      document_id: config.document_id || (document ? documentIdOf(document) : null),
      file_id: config.file_id || (document ? signingFileIdOf(document) : null)
    };
  });
  const byDocument = documents.map((document) => {
    const documentConfigs = mappedConfigs.filter((config) => Number(config.document_id) === documentIdOf(document));
    const myConfig = documentConfigs.find((config) => Number(config.user_id) === Number(scope.userId)) || null;
    const hasDuplicateSigner = new Set(documentConfigs.map((config) => Number(config.user_id))).size !== documentConfigs.length;
    return {
      ...document,
      signers: documentConfigs,
      has_config: documentConfigs.length > 0,
      has_signed: !!document.signed_file_id || !!proposal.signature_completed_at || (documentConfigs.length > 0 && documentConfigs.every((config) => config.status === 'SIGNED')),
      my_config: myConfig,
      can_sign: proposal.status === SIGNATURE_PENDING && !hasDuplicateSigner && !!myConfig && myConfig.status === 'PENDING'
    };
  });
  const signatureConfigConflict = byDocument.some((document) => (
    new Set(document.signers.map((signer) => Number(signer.user_id))).size !== document.signers.length
  ));
  const fileIds = configuredFileIds(mappedConfigs);
  const custom = parseCustomData(proposal.custom_data);
  const reportFiles = toFileSummaries(custom[REPORT_FIELD]);
  const layoutFiles = toFileSummaries(custom['ban_ve_layout']);
  const revisionRequests = await loadRevisionRequests(proposal.id);
  const myConfigs = mappedConfigs.filter((config) => Number(config.user_id) === Number(scope.userId));
  const myConfig = myConfigs.find((config) => config.status === 'PENDING') || myConfigs[0] || null;
  const [signatureRows] = await pool.query(
    'SELECT id, file_url FROM signatures WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
    [scope.userId]
  );
  const hasSignature = signatureRows.length > 0;
  return {
    id: proposal.id,
    ma_de_xuat: proposal.ma_de_xuat,
    status: proposal.status,
    user_id: proposal.user_id,
    owner_name: proposal.owner_name,
    owner_phone: proposal.owner_phone,
    address: proposal.address || '',
    latitude: proposal.latitude,
    longitude: proposal.longitude,
    mo_hinh_dau_tu: custom.mo_hinh_dau_tu || '',
    vung_mien: custom.vung_mien || '',
    created_at: proposal.created_at,
    updated_at: proposal.updated_at,
    review_level: proposal.review_level || null,
    quy_hoach_score: proposal.quy_hoach_score ?? null,
    quy_hoach_note: proposal.quy_hoach_note || '',
    phap_ly_score: proposal.phap_ly_score ?? null,
    phap_ly_note: proposal.phap_ly_note || '',
    note: proposal.note || '',
    custom_data: custom,
    chot_so_luong_tru: proposal.chot_so_luong_tru,
    tong_gia_tri_chot: proposal.tong_gia_tri_chot,
    signed_file_id: proposal.signed_file_id,
    signature_completed_at: proposal.signature_completed_at || null,
    signature_manually_completed: !!proposal.signature_completed_at,
    report_files: reportFiles,
    layout_files: layoutFiles,
    documents: byDocument,
    revision_requests: revisionRequests,
    signers: mappedConfigs,
    signature_config_conflict: signatureConfigConflict,
    configured_file_ids: fileIds,
    signer_total: mappedConfigs.length,
    signer_signed: mappedConfigs.filter((config) => config.status === 'SIGNED').length,
    sign_status: proposal.signed_file_id
      ? SIGN_STATUS.CEO_SIGNED
      : (proposal.signature_completed_at || (mappedConfigs.length > 0 && mappedConfigs.every((config) => config.status === 'SIGNED'))
        ? SIGN_STATUS.DONE
        : (mappedConfigs.some((config) => config.status === 'SIGNED') ? SIGN_STATUS.DOING : SIGN_STATUS.PENDING)),
    can_sign: !signatureConfigConflict && byDocument.some((document) => document.can_sign),
    has_signature: hasSignature,
    signature_url: hasSignature ? (signatureRows[0].file_url || null) : null,
    is_my_signed: myConfigs.some((config) => config.status === 'SIGNED'),
    my_config: myConfig || null
  };
};

exports.getDetail = async ({ user, id } = {}) => {
  const scope = await resolveScope(user);
  const proposal = await loadProposal(id);
  if (proposal.status !== SIGNATURE_PENDING
    && !(proposal.status === APPROVED && proposal.signed_file_id)) {
    throw err('Đề xuất không ở trạng thái trình ký', 400);
  }
  const detail = await buildDetail(proposal, scope);
  const financeCanView = scope.isFinance && await exports.canReadChairmanProposal({ user, id: proposal.id });
  const canView = scope.isManager || !!detail.can_sign || !!detail.is_my_signed
    || Number(proposal.user_id) === Number(scope.userId) || financeCanView;
  if (!canView) throw err('Bạn không có quyền xem hồ sơ trình ký này', 403);
  let visibleDetail = detail;
  if (!scope.isManager && !financeCanView && Number(proposal.user_id) !== Number(scope.userId)) {
    const visibleDocuments = detail.documents.filter((document) => (
      document.signers.some((config) => Number(config.user_id) === Number(scope.userId))
    ));
    if (visibleDocuments.length === 0) throw err('Bạn không được phân công ký tài liệu này', 403);
    const visibleDocumentIds = new Set(visibleDocuments.map((document) => documentIdOf(document)));
    const visibleFileIds = new Set(visibleDocuments.flatMap((document) => [
      document.source_file_id, document.pdf_file_id, document.signing_file_id, document.signed_file_id
    ].map(Number).filter(Boolean)));
    const visibleSigners = detail.signers.filter((config) => visibleDocumentIds.has(Number(config.document_id)));
    visibleDetail = {
      ...detail,
      documents: visibleDocuments,
      signers: visibleSigners,
      report_files: detail.report_files.filter((file) => visibleFileIds.has(Number(file.id))),
      configured_file_ids: configuredFileIds(visibleSigners),
      signer_total: visibleSigners.length,
      signer_signed: visibleSigners.filter((config) => config.status === 'SIGNED').length,
      can_sign: visibleDocuments.some((document) => document.can_sign),
      is_my_signed: visibleSigners.some((config) => Number(config.user_id) === Number(scope.userId) && config.status === 'SIGNED'),
      my_config: visibleSigners.find((config) => Number(config.user_id) === Number(scope.userId)) || null
    };
  }
  let progress = { requests: [], activity: [] };
  let fieldDefinitions = [];
  let initialProposalData = null;
  if (canView) {
    progress = await require('./proposalProgressService').getProgress(proposal.id);
    fieldDefinitions = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
    initialProposalData = await dynamicUtils.enrichUserFields(
      dynamicUtils.mergeData(proposal, fieldDefinitions),
      fieldDefinitions
    );
  }
  return {
    ...visibleDetail,
    chairman_files: await require('./proposalChairmanFileService').list(proposal.id),
    progress,
    fieldDefinitions,
    initial_proposal_data: initialProposalData,
    sign_status_label: SIGN_STATUS_LABELS[visibleDetail.sign_status],
    can_reject: scope.role === 'SUPER_ADMIN' || !!scope.isTgd,
    can_upload_signed: proposal.status === SIGNATURE_PENDING && detail.sign_status === SIGN_STATUS.DONE
      && (scope.role === 'SUPER_ADMIN' || !!scope.isFinance),
    can_request_rework: (scope.role === 'SUPER_ADMIN' || !!scope.isTgd || !!scope.isBackOffice) && !visibleDetail.is_my_signed
      && proposal.status === SIGNATURE_PENDING,
    can_withdraw: (user.role === 'SUPER_ADMIN' || scope.isBackOffice)
      && proposal.status === SIGNATURE_PENDING && visibleDetail.signers.length > 0
      && visibleDetail.signers.every((config) => Number(config.created_by) === Number(user.id))
      && visibleDetail.signers.every((config) => config.status !== 'SIGNED'),
    can_view: canView
  };
};

const buildMessage = async (proposal, actorId, { status, actionLabel, reason }) => {
  const code = notificationService.proposalCode(proposal.custom_data, proposal.id);
  const actorName = (await notificationService.getUserName(actorId)) || 'Hệ thống';
  return notificationService.statusMessage({ code, actorName, status, actionLabel, reason });
};

const notifyRecipients = async (userIds, { type, title, message, entityId, actorId }) => {
  const ids = [...new Set((userIds || []).filter(Boolean).map(Number))];
  for (const userId of ids) {
    try {
      await notificationService.create({
        userId,
        type,
        title: title || notificationService.statusTitle(type),
        message,
        entityType: 'station_proposals',
        entityId,
        createdBy: actorId || null
      });
    } catch (error) {
      console.error(`[ProposalNotifications] Failed to notify user ${userId} for signature task ${entityId}:`, error);
    }
  }
};

const chairmanUserIds = async () => {
  const [rows] = await pool.query("SELECT id, role, custom_data FROM users WHERE status = 'ACTIVE'");
  return rows
    .filter((row) => row.role === 'SUPER_ADMIN'
      || (['ADMIN', 'SALES'].includes(row.role)
        && proposalReportService.isFinanceDepartment(parseCustomData(row.custom_data).department)))
    .map((row) => Number(row.id));
};

const notifyBackOfficeAndSigners = async ({ proposal, actorId, message, type = SIGNATURE_PENDING }) => {
  const configs = await loadConfigs(proposal.id);
  const pendingSignerIds = configs
    .filter((config) => config.status !== 'SIGNED' && config.status !== 'CANCELLED')
    .map((config) => Number(config.user_id));
  await notifyRecipients(pendingSignerIds, {
    type,
    title: 'Đề xuất đang trình ký',
    message,
    entityId: proposal.id,
    actorId
  });
};

const sign = async ({ user, id, documentId, fileId, ip, mutationConnection } = {}) => {
  const scope = await resolveScope(user);
  const proposal = await loadProposal(id);
  if (proposal.status !== SIGNATURE_PENDING) {
    throw err('Đề xuất không ở trạng thái trình ký', 400);
  }

  const configs = await loadConfigs(proposal.id);
  const documents = await getSigningDocuments(proposal.id);
  let selectedDocument = null;
  if (documentId) {
    selectedDocument = documents.find((document) => documentIdOf(document) === Number(documentId));
  } else if (fileId) {
    selectedDocument = documents.find((document) => signingFileIdOf(document) === Number(fileId));
  } else if (documents.length === 1) {
    selectedDocument = documents[0];
  }
  if (!selectedDocument) throw err('Vui lòng chọn tài liệu BCĐX cần ký', 400);
  const selectedFileId = signingFileIdOf(selectedDocument);
  if (['PENDING', 'PROCESSING'].includes(String(selectedDocument.conversion_status || '').toUpperCase())) {
    throw err('Đang xử lý chuyển đổi tài liệu; vui lòng chờ hoàn tất trước khi ký', 409);
  }
  if (!isDocumentReadyForSignature(selectedDocument)) {
    throw err('Chỉ ký trực tiếp tài liệu PDF hoặc DOCX; file .doc không được hỗ trợ', 400);
  }
  if (fileId && Number(fileId) !== selectedFileId) {
    throw err('File ký không khớp với tài liệu đã chọn', 400);
  }
  const myConfigs = configs.filter((config) => Number(config.user_id) === Number(scope.userId)
    && ((config.document_id && config.document_id === documentIdOf(selectedDocument))
      || (!config.document_id && Number(config.file_id) === selectedFileId)));
  if (myConfigs.length === 0) {
    throw err('Bạn không được phân công ký đề xuất này', 403);
  }
  if (myConfigs.length > 1) {
    throw err('Bạn có nhiều ô ký trên cùng tài liệu. Hãy cấu hình lại danh sách người ký.', 409);
  }
  const config = myConfigs[0];
  if (config.status === 'SIGNED') {
    throw err('Bạn đã ký đề xuất này', 400);
  }

  const connection = mutationConnection;
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [scope.userId]);
    const [signatureRows] = await connection.query(
      'SELECT id, file_url FROM signatures WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
      [scope.userId]
    );
    if (!signatureRows.length) throw err('Bạn chưa tải chữ ký số trong hồ sơ cá nhân', 400);
    const signature = signatureRows[0];
    const image = await signedDocumentService.validateSignature(signature.id);
    const [lockedProposals] = await connection.query(
      'SELECT status FROM station_proposals WHERE id = ? FOR UPDATE',
      [proposal.id]
    );
    if (!lockedProposals.length) throw err('Không tìm thấy đề xuất', 404);
    if (lockedProposals[0].status !== SIGNATURE_PENDING) throw err('Đề xuất không ở trạng thái trình ký', 409);
    const [updateResult] = await connection.query(
      `UPDATE proposal_signature_configs
       SET status = 'SIGNED', signed_at = NOW(), signature_id = ?, signature_url = ?
       WHERE id = ? AND proposal_id = ? AND status = 'PENDING'
         AND ((document_id = ? AND file_id = ?) OR (document_id IS NULL AND file_id = ?))`,
      [signature.id, signature.file_url || null, config.id, proposal.id, documentIdOf(selectedDocument), selectedFileId, selectedFileId]
    );
    if (!updateResult.affectedRows) throw err('Ô ký đã được ký hoặc thay đổi, vui lòng tải lại', 409);
    await signatureSnapshots.save(config.id, image.bytes, connection);
    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  }

  const proposalLifecycle = require('./proposalLifecycle');
  await proposalLifecycle.logActivity({
    proposalId: proposal.id,
    action: 'signature_signed',
    fromStatus: proposal.status,
    toStatus: proposal.status,
    changedFields: {
      signer: { label: 'Người ký', old: '', new: `${config.signer_title || ''} (${scope.userId})`.trim() }
    },
    actorId: user.id,
    actorRole: user.role,
    source: 'user',
    ip
  });

  const message = await buildMessage(proposal, user.id, {
    status: SIGNATURE_PENDING,
    actionLabel: 'Người ký',
    reason: 'Đã ký BCĐX'
  });
  await notifyBackOfficeAndSigners({ proposal, actorId: user.id, message });

  const finalConfigs = await loadConfigs(proposal.id);
  const finalDocuments = await getSigningDocuments(proposal.id);
  const allDocumentsSigned = finalDocuments.length > 0 && finalDocuments.every((document) => {
    const documentConfigs = finalConfigs.filter((item) => (item.document_id
      ? item.document_id === documentIdOf(document)
      : Number(item.file_id) === signingFileIdOf(document)));
    return documentConfigs.length > 0 && documentConfigs.every((item) => item.status === 'SIGNED');
  });
  if (allDocumentsSigned) {
    const code = notificationService.proposalCode(proposal.custom_data, proposal.id);
    const actorName = (await notificationService.getUserName(user.id)) || 'Hệ thống';
    await notifyRecipients((await chairmanUserIds()), {
      type: SIGN_STATUS.DONE,
      title: 'Đã đủ chữ ký — trình chủ tịch',
      message: `${code} đã đủ chữ ký (${actorName}). Phòng Tài chính và Kế toán vui lòng xuất file và trình chủ tịch ký phê duyệt.`,
      entityId: proposal.id,
      actorId: user.id
    });
  }

  const updated = await loadProposal(id);
  return buildDetail(updated, scope);
};

exports.reject = async ({ user, id, reason, ip } = {}) => {
  const scope = await resolveScope(user);
  if (scope.role !== 'SUPER_ADMIN' && !scope.isTgd) {
    throw err('Chỉ Tổng giám đốc hoặc SUPER_ADMIN được từ chối duyệt', 403);
  }
  const proposal = await loadProposal(id);
  if (proposal.status !== SIGNATURE_PENDING) {
    throw err('Đề xuất không ở trạng thái trình ký', 400);
  }
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) throw err('Vui lòng nhập lý do từ chối duyệt', 400);

  const proposalLifecycle = require('./proposalLifecycle');
  const transition = await proposalLifecycle.transition(proposal.id, UPDATING_STATUS, {
    reason: cleanReason,
    actorId: user.id,
    actorRole: user.role,
    source: 'user',
    ip
  });

  const [countRows] = await pool.query(
    'SELECT COUNT(*) AS n FROM proposal_requests WHERE proposal_id = ? AND request_type = ?',
    [proposal.id, REVISION_REQUEST_TYPE]
  );
  const round = Number(countRows[0]?.n || 0) + 1;

  const request = await require('./proposalRequestService').createRequest({
    proposalId: proposal.id,
    type: REVISION_REQUEST_TYPE,
    description: cleanReason,
    requestedBy: user.id,
    previousStatus: SIGNATURE_PENDING,
    currentStatus: UPDATING_STATUS,
    targetUserId: proposal.user_id || null,
    targetTitle: 'Người đề xuất',
    note: `Lần yêu cầu tạo lại BCĐX: ${round}`,
    roundNo: round
  });

  await proposalLifecycle.logActivity({
    proposalId: proposal.id,
    action: 'signature_rejected',
    fromStatus: SIGNATURE_PENDING,
    toStatus: UPDATING_STATUS,
    reason: cleanReason,
    changedFields: {
      round_no: { label: 'Số lần yêu cầu tạo lại BCĐX', old: round - 1, new: round }
    },
    actorId: user.id,
    actorRole: user.role,
    source: 'user',
    ip
  });

  return { id: proposal.id, status: UPDATING_STATUS, roundNo: round, request, transition };
};

exports.requestRework = async ({ user, id, reason, ip } = {}) => {
  const scope = await resolveScope(user);
  if (scope.role !== 'SUPER_ADMIN' && !scope.isTgd && !scope.isBackOffice) {
    throw err('Chỉ Back Office, Tổng giám đốc hoặc SUPER_ADMIN được yêu cầu làm lại BCĐX', 403);
  }
  const proposal = await loadProposal(id);
  if (proposal.status !== SIGNATURE_PENDING) {
    throw err('Đề xuất không ở trạng thái trình ký', 400);
  }
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) throw err('Vui lòng nhập lý do yêu cầu làm lại BCĐX', 400);

  const proposalLifecycle = require('./proposalLifecycle');
  const transition = await proposalLifecycle.transition(proposal.id, UPDATING_STATUS, {
    reason: cleanReason,
    actorId: user.id,
    actorRole: user.role,
    source: 'user',
    ip
  });

  const [countRows] = await pool.query(
    'SELECT COUNT(*) AS n FROM proposal_requests WHERE proposal_id = ? AND request_type = ?',
    [proposal.id, REVISION_REQUEST_TYPE]
  );
  const round = Number(countRows[0]?.n || 0) + 1;

  const request = await require('./proposalRequestService').createRequest({
    proposalId: proposal.id,
    type: REVISION_REQUEST_TYPE,
    description: cleanReason,
    requestedBy: user.id,
    previousStatus: SIGNATURE_PENDING,
    currentStatus: UPDATING_STATUS,
    targetUserId: proposal.user_id || null,
    targetTitle: 'Người đề xuất',
    note: `Lần yêu cầu làm lại BCĐX: ${round}`,
    roundNo: round
  });

  await proposalLifecycle.logActivity({
    proposalId: proposal.id,
    action: 'signature_rework_requested',
    fromStatus: SIGNATURE_PENDING,
    toStatus: UPDATING_STATUS,
    reason: cleanReason,
    changedFields: {
      round_no: { label: 'Số lần yêu cầu làm lại BCĐX', old: round - 1, new: round }
    },
    actorId: user.id,
    actorRole: user.role,
    source: 'user',
    ip
  });

  return { id: proposal.id, status: UPDATING_STATUS, roundNo: round, request, transition };
};

const uploadSignedFile = async ({ user, id, files, documents: uploadedDocuments, ip, mutationConnection } = {}) => {
  const scope = await resolveScope(user);
  if (scope.role !== 'SUPER_ADMIN' && !scope.isFinance) {
    throw err('Chỉ Phòng Tài chính và Kế toán hoặc SUPER_ADMIN được tải lên file chủ tịch đã ký', 403);
  }
  const proposal = await loadProposal(id);
  if (proposal.status !== SIGNATURE_PENDING) {
    throw err('Đề xuất không ở trạng thái trình ký', 400);
  }

  const activeDocuments = await getSigningDocuments(proposal.id);
  if (activeDocuments.length === 0) throw err('Đề xuất chưa có tài liệu BCĐX hiện hành', 400);
  const configs = await loadConfigs(proposal.id);
  const docConfigs = activeDocuments.map((document) => configs.filter((config) => (
    config.document_id
      ? config.document_id === documentIdOf(document)
      : Number(config.file_id) === signingFileIdOf(document)
  )));
  if (!proposal.signature_completed_at && docConfigs.some((items) => items.length === 0 || items.some((config) => config.status !== 'SIGNED'))) {
    throw err('Chưa đủ chữ ký trên toàn bộ tài liệu BCĐX', 400);
  }

  const chairmanFiles = require('./proposalChairmanFileService');
  const fileIds = chairmanFiles.normalizeFiles(files, uploadedDocuments);
  await chairmanFiles.validate(fileIds, user, ip);
  const signedFileId = fileIds[0];
  const message = await buildMessage(proposal, user.id, {
    status: APPROVED, actionLabel: 'Người tải file chủ tịch',
    reason: 'Đã tải lên file BCĐX chủ tịch phê duyệt'
  });
  const connection = mutationConnection;
  const proposalLifecycle = require('./proposalLifecycle');
  let transition;
  let persistedFiles;
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [lockedProposals] = await connection.query(
      'SELECT status FROM station_proposals WHERE id = ? FOR UPDATE',
      [proposal.id]
    );
    if (!lockedProposals.length) throw err('Không tìm thấy đề xuất', 404);
    if (lockedProposals[0].status !== SIGNATURE_PENDING) throw err('Đề xuất không ở trạng thái trình ký', 409);
    const [lockedFiles] = await connection.query(
      `SELECT id FROM files WHERE id IN (${fileIds.map(() => '?').join(',')}) AND status<>'deleted' FOR UPDATE`, fileIds);
    if (lockedFiles.length !== fileIds.length) throw err('Một hoặc nhiều file đã bị xóa, vui lòng tải lại', 409);
    const [existingFiles] = await connection.query('SELECT id FROM proposal_chairman_files WHERE proposal_id=?', [proposal.id]);
    if (existingFiles.length || proposal.signed_file_id) throw err('Đề xuất đã có file chủ tịch đã ký', 409);
    for (const [index, fileId] of fileIds.entries()) {
      await connection.query(
        'INSERT INTO proposal_chairman_files (proposal_id,file_id,order_index,uploaded_by) VALUES (?,?,?,?)',
        [proposal.id, fileId, index, user.id]);
    }
    await connection.query(
      'UPDATE station_proposals SET signed_file_id = ?, updated_at = NOW() WHERE id = ?',
      [signedFileId, proposal.id]
    );
    transition = await proposalLifecycle.transitionSignedApprovalWithinTransaction(connection, proposal.id, {
      reason: 'Đã tải lên file BCĐX chủ tịch phê duyệt', actorId: user.id, actorRole: user.role, ip
    });
    await proposalLifecycle.logActivity({
      proposalId: proposal.id, action: 'signed_file_uploaded', fromStatus: SIGNATURE_PENDING, toStatus: APPROVED,
      changedFields: {
        signed_file_id: { label: 'File chủ tịch đầu tiên', old: '', new: String(signedFileId) },
        signed_files: { label: 'File BCĐX chủ tịch đã ký', old: '', new: fileIds.join(', ') }
      },
      actorId: user.id, actorRole: user.role, source: 'user', ip, connection
    });
    for (const userId of new Set(configs.map(config => config.user_id).filter(Boolean))) {
      await notificationService.create({
        userId, type: APPROVED, title: 'Đề xuất đã được phê duyệt', message,
        entityType: 'station_proposals', entityId: proposal.id, createdBy: user.id
      }, connection);
    }
    persistedFiles = await chairmanFiles.list(proposal.id, connection);
    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  }

  try {
    const chargingStationService = require('./chargingStationService');
    await chargingStationService.createFromApprovedProposal(proposal.id, {
      actorId: user.id,
      actorRole: user.role,
      source: 'user',
      ip
    });
  } catch (error) {
    console.error('Create charging station error:', error);
  }

  return { id: proposal.id, status: APPROVED, signed_file_id: signedFileId, transition,
    chairman_files: persistedFiles };
};

exports.sign = (args = {}) => withSignatureMutationLock(args.id, (mutationConnection) => (
  sign({ ...args, mutationConnection })
));
exports.completeSigning = async ({ user, id, reason, ip } = {}) => {
  if (user?.role !== 'SUPER_ADMIN') throw err('Chỉ SUPER_ADMIN được xác nhận hoàn tất ký', 403);
  const proposalId = Number(id);
  if (!Number.isInteger(proposalId) || proposalId <= 0) throw err('Đề xuất không hợp lệ', 400);
  const cleanReason = typeof reason === 'string' ? reason.trim() : '';
  if (!cleanReason) throw err('Vui lòng nhập lý do xác nhận hoàn tất ký', 400);
  if (cleanReason.length > 2000) throw err('Lý do không được vượt quá 2000 ký tự', 400);
  const result = await withSignatureMutationLock(proposalId, async (connection) => {
    await connection.beginTransaction();
    try {
      const [rows] = await connection.query('SELECT * FROM station_proposals WHERE id = ? FOR UPDATE', [proposalId]);
      if (!rows.length) throw err('Không tìm thấy đề xuất', 404);
      const proposal = rows[0];
      if (proposal.status !== SIGNATURE_PENDING || proposal.signed_file_id) throw err('Đề xuất không ở trạng thái trình ký', 400);
      if (proposal.signature_completed_at) {
        await connection.commit();
        return { id: proposalId, status: SIGNATURE_PENDING, sign_status: SIGN_STATUS.DONE, already_completed: true };
      }
      const [updated] = await connection.query(
        "UPDATE proposal_signature_configs SET status = 'SIGNED' WHERE proposal_id = ? AND status = 'PENDING'",
        [proposalId]
      );
      await connection.query('UPDATE station_proposals SET signature_completed_at = NOW(), updated_at = NOW() WHERE id = ?', [proposalId]);
      await require('./proposalLifecycle').logActivity({
        proposalId, action: 'signature_manually_completed', fromStatus: SIGNATURE_PENDING, toStatus: SIGNATURE_PENDING,
        reason: cleanReason, actorId: user.id, actorRole: user.role, source: 'user', manualOverride: true, ip, connection,
        changedFields: {
          sign_status: { label: 'Trạng thái ký duyệt', old: 'Chưa hoàn tất', new: SIGN_STATUS.DONE },
          completed_signers: { label: 'Số ô ký được xác nhận thay', old: 0, new: updated.affectedRows },
        },
      });
      await connection.commit();
      return { id: proposalId, status: SIGNATURE_PENDING, sign_status: SIGN_STATUS.DONE };
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });
  if (!result.already_completed) {
    await notifyRecipients(await chairmanUserIds(), {
      type: SIGN_STATUS.DONE, title: 'SUPER_ADMIN đã xác nhận hoàn tất ký',
      message: `Đề xuất #${proposalId} đã được SUPER_ADMIN xác nhận hoàn tất khâu ký. Lý do: ${cleanReason}. Phòng Tài chính và Kế toán vui lòng trình chủ tịch và tải lên file BCĐX đã ký để kết thúc.`,
      entityId: proposalId, actorId: user.id,
    });
  }
  return result;
};
exports.uploadSignedFile = async (args = {}) => {
  const scope = await resolveScope(args.user);
  if (scope.role !== 'SUPER_ADMIN' && !scope.isFinance) {
    throw err('Chỉ Phòng Tài chính và Kế toán hoặc SUPER_ADMIN được tải lên file chủ tịch đã ký', 403);
  }
  return withSignatureMutationLock(args.id, (mutationConnection) => (
    uploadSignedFile({ ...args, mutationConnection })
  ));
};

exports.getExportFile = async ({ user, id, documentId, all = false, ip } = {}) => {
  if (all) return exports.getSignedDocument({ user, id, all: true, ip });
  const scope = await resolveScope(user);
  const proposal = await loadProposal(id);
  const detail = await buildDetail(proposal, scope);
  const document = documentId
    ? detail.documents.find((item) => documentIdOf(item) === Number(documentId))
    : detail.documents[0];
  if (!document && documentId) throw err('Không tìm thấy tài liệu BCĐX', 404);
  if (!documentId && detail.documents.length > 1) {
    throw err('Vui lòng chọn tài liệu BCĐX cần xuất hoặc yêu cầu xuất tất cả', 400);
  }
  const fileId = document
    ? (document.signed_file_id || document.recovery_file_id || document.signing_file_id || signingFileIdOf(document))
    : (proposal.signed_file_id || detail.report_files[0]?.id);
  if (!fileId) {
    throw err('Đề xuất chưa có file BCĐX để xuất', 400);
  }
  const [fileRows] = await pool.query(
    'SELECT id, original_name, mime_type FROM files WHERE id = ? LIMIT 1',
    [fileId]
  );
  if (fileRows.length === 0) {
    throw err('Không tìm thấy file BCĐX', 404);
  }
  const fileData = await require('./fileService').getFilePath(fileId);
  const canAccessFile = fileData
    && await require('../controllers/fileController').canAccessFile(fileData.file, { user, ip });
  if (!canAccessFile && !(scope.isManager || Number(proposal.user_id) === Number(scope.userId))) {
    throw err('Bạn không có quyền xem file BCĐX này', 403);
  }
  return {
    file_id: fileRows[0].id,
    document_id: document ? documentIdOf(document) : null,
    original_name: fileRows[0].original_name,
    mime_type: fileRows[0].mime_type
  };
};

exports.getSignedDocument = async ({ user, id, documentId, all = false, ip } = {}) => {
  const scope = await resolveScope(user);
  const proposal = await loadProposal(id);
  const detail = await buildDetail(proposal, scope);
  let documents = detail.documents;
  if (documentId) {
    documents = documents.filter((document) => documentIdOf(document) === Number(documentId));
    if (!documents.length) throw err('Không tìm thấy tài liệu BCĐX', 404);
  } else if (!all) {
    if (documents.length !== 1) throw err('Vui lòng chọn tài liệu BCĐX cần tải', 400);
  }
  if (!documents.length) {
    if (proposal.signed_file_id && detail.report_files.length === 0) {
      if (!scope.isManager && Number(proposal.user_id) !== Number(scope.userId)) {
        throw err('Bạn không có quyền xem file BCĐX này', 403);
      }
      return signedDocumentService.build({ signedFileId: proposal.signed_file_id, signers: [] });
    }
    throw err('Đề xuất chưa có file BCĐX để xuất', 400);
  }

  const fileController = require('../controllers/fileController');
  const buildDocument = async (document) => {
    const fileId = document.signed_file_id || document.recovery_file_id || document.signing_file_id || signingFileIdOf(document);
    if (!fileId) throw err('Tài liệu chưa có file ký chuẩn', 400);
    const fileData = await require('./fileService').getFilePath(fileId);
    if (!fileData || !await fileController.canAccessFile(fileData.file, { user, ip })) {
      throw err('Bạn không có quyền xem file BCĐX này', 403);
    }
    const documentSigners = document.signers || [];
    if (new Set(documentSigners.map((signer) => Number(signer.user_id))).size !== documentSigners.length) {
      throw err('Một người ký đang có nhiều ô trên cùng tài liệu', 409);
    }
    if (document.signed_file_id || document.recovery_file_id) {
      return signedDocumentService.build({ signedFileId: fileId, signers: [] });
    }
    return signedDocumentService.build({
      reportFileId: fileId,
      signers: documentSigners.filter((signer) => signer.status === 'SIGNED' && signer.signature_id)
    });
  };

  if (all) {
    const archive = new JSZip();
    for (const document of documents) {
      const file = await buildDocument(document);
      const safeName = String(file.original_name || `BCDX-${documentIdOf(document)}`)
        .replace(/[\\/\r\n"]/g, '_');
      archive.file(`${documentIdOf(document)}_${safeName}`, file.bytes);
    }
    return {
      original_name: `${proposal.ma_de_xuat || `BCDX-${proposal.id}`}-BCDX.zip`,
      mime_type: 'application/zip',
      bytes: await archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    };
  }
  return buildDocument(documents[0]);
};

exports.getSignatureImage = async ({ user, id, configId } = {}) => {
  const scope = await resolveScope(user);
  const proposal = await loadProposal(id);
  const detail = await buildDetail(proposal, scope);
  const config = detail.signers.find((item) => Number(item.id) === Number(configId));
  if (!config || !config.signature_id) {
    throw err('Không tìm thấy chữ ký', 404);
  }
  const canView = scope.isManager || Number(proposal.user_id) === Number(scope.userId)
    || detail.signers.some((item) => Number(item.user_id) === Number(scope.userId)
      && Number(item.document_id) === Number(config.document_id));
  if (!canView) throw err('Bạn không có quyền xem chữ ký này', 403);
  return signedDocumentService.readSignature(config);
};
