const pool = require('../utils/db');
const path = require('path');
const dynamicUtils = require('./dynamicUtils');
const proposalGradingService = require('./proposalGradingService');
const proposalReportService = require('./proposalReportService');
const proposalReportDocumentService = require('./proposalReportDocumentService');

const { normalizeText, parseCustomData, toFileSummaries } = proposalGradingService;

const REVIEWING_STATUS = 'PROPOSAL_REPORT_REVIEWING';
const UPDATING_STATUS = 'PROPOSAL_REPORT_UPDATING';
const SIGNATURE_STATUS = 'SIGNATURE_PENDING';
const APPROVED_STATUS = 'APPROVED';

const TAB_STATUSES = {
  all: [REVIEWING_STATUS, UPDATING_STATUS, SIGNATURE_STATUS, APPROVED_STATUS],
  pending: [REVIEWING_STATUS],
  updating: [UPDATING_STATUS],
  completed: [SIGNATURE_STATUS, APPROVED_STATUS]
};

const REPORT_FIELD = 'file_bc_dx';
const LAYOUT_FIELD = 'ban_ve_layout';
const UPDATE_INFO_REQUEST_TYPE = 'UPDATE_INFO';

const err = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const documentIdOf = (document) => Number(document && document.id);
const documentFileIdOf = (document) => Number(document && document.signing_file && document.signing_file.id);
const isSignableFile = (file) => {
  const extension = path.extname(String(file && file.original_name || '')).toLowerCase();
  const mimeType = String(file && file.mime_type || '').toLowerCase();
  if (extension === '.doc' || mimeType === 'application/msword') return false;
  return extension === '.pdf' || extension === '.docx'
    || mimeType === 'application/pdf'
    || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
};

const notificationService = require('./notificationService');

const mapApprovalRow = (row) => {
  const custom = parseCustomData(row.custom_data);
  const reportFiles = toFileSummaries(custom[REPORT_FIELD] ?? row[REPORT_FIELD]);
  const layoutFiles = toFileSummaries(custom[LAYOUT_FIELD] ?? row[LAYOUT_FIELD]);
  return {
    ...row,
    custom_data: custom,
    report_files: reportFiles,
    layout_files: layoutFiles,
    has_report: reportFiles.length > 0,
    has_layout: layoutFiles.length > 0,
    task_description: row.task_description || null,
    update_request_count: Number(row.update_request_count || 0),
    signer_count: Number(row.signer_count || 0),
    quy_hoach_score: row.quy_hoach_score === null || row.quy_hoach_score === undefined ? null : Number(row.quy_hoach_score),
    phap_ly_score: row.phap_ly_score === null || row.phap_ly_score === undefined ? null : Number(row.phap_ly_score)
  };
};

const scopeClause = async (scope, params) => {
  if (scope.isAdmin || scope.isBackOffice || scope.roleKey === 'TGD') return '';
  if (scope.roleKey === 'GDTTKD' && scope.region) {
    const pattern = { Bac: '%bac%', Trung: '%trung%', Nam: '%nam%' }[scope.region];
    if (pattern) {
      params.push(pattern);
      return " AND LOWER(CONVERT(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.vung_mien')) USING utf8mb4)) LIKE ?";
    }
    return '';
  }
  if (scope.role === 'SALES') {
    const adminProposalService = require('./adminProposalService');
    const branchUserIds = await adminProposalService.getBranchUserIds(scope.userId);
    const ids = [scope.userId, ...branchUserIds].filter(Boolean).map(Number);
    if (ids.length === 0) return ' AND 1 = 0';
    params.push(...ids);
    return ` AND p.user_id IN (${ids.map(() => '?').join(',')})`;
  }
  params.push(scope.userId);
  return ' AND p.user_id = ?';
};

const assertApprovalAccess = (scope) => {
  if (scope.isAdmin || scope.isBackOffice || scope.roleKey === 'TGD') return;
  throw err('Chỉ SUPER_ADMIN, nhân sự Back Office hoặc Tổng giám đốc được duyệt BCĐX', 403);
};

// Thao tác ghi cần Back Office hoặc SUPER_ADMIN; TGĐ chỉ đọc + từ chối duyệt
const assertApprovalMutation = (scope) => {
  if (scope.role === 'SUPER_ADMIN' || scope.isBackOffice) return;
  throw err('Chỉ SUPER_ADMIN hoặc nhân sự Back Office được thao tác', 403);
};

const loadProposal = async (id) => {
  const proposalId = Number(id);
  if (!Number.isInteger(proposalId) || proposalId <= 0) throw err('Đề xuất không hợp lệ', 400);
  const [rows] = await pool.query(
    'SELECT id, user_id, status, owner_name, custom_data FROM station_proposals WHERE id = ?',
    [proposalId]
  );
  if (rows.length === 0) throw err('Không tìm thấy đề xuất', 404);
  return rows[0];
};

const proposalRegion = (customData) => {
  const proposalReviewService = require('./proposalReviewService');
  return proposalReviewService.resolveRegion(parseCustomData(customData).vung_mien);
};

exports.REVIEWING_STATUS = REVIEWING_STATUS;
exports.UPDATING_STATUS = UPDATING_STATUS;
exports.TAB_STATUSES = TAB_STATUSES;

exports.listProposals = async ({ user, tab = 'all', search = '', page = 1, limit = 10, filters = {} } = {}) => {
  const safeTab = Object.prototype.hasOwnProperty.call(TAB_STATUSES, tab) ? tab : 'all';
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 10));
  const offset = (safePage - 1) * safeLimit;
  const scope = await proposalReportService.resolveScope(user);
  assertApprovalAccess(scope);
  const statuses = TAB_STATUSES[safeTab];

  const where = [`p.status IN (${statuses.map(() => '?').join(',')})`];
  const params = [...statuses];
  if (safeTab === 'pending' && scope.role !== 'SUPER_ADMIN' && (scope.roleKey === 'TGD' || !scope.isBackOffice)) {
    where.push('1 = 0');
  }
  if (statuses.includes(APPROVED_STATUS)) {
    where.push("(p.status <> 'APPROVED' OR p.signed_file_id IS NOT NULL)");
  }

  const scoped = await scopeClause(scope, params);
  if (scoped) where.push(scoped.replace(/^ AND /, ''));

  if (search) {
    const like = `%${String(search).trim()}%`;
    where.push(`(
      p.ma_de_xuat_gen LIKE ? OR p.owner_name LIKE ? OR p.owner_phone LIKE ? OR p.address LIKE ?
      OR u.full_name LIKE ?
      OR JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.lk_ten_phap_nhan')) LIKE ?
      OR JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.nq_ten_khach_hang')) LIKE ?
    )`);
    params.push(like, like, like, like, like, like, like);
  }

  const { addProposalAdvancedFilters, patternForNormalizedRegion } = require('../utils/proposalAdvancedFilters');
  await addProposalAdvancedFilters(where, params, filters, value => patternForNormalizedRegion(normalizeText(value)));
  const whereClause = `WHERE ${where.join(' AND ')}`;

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM station_proposals p
     LEFT JOIN users u ON u.id = p.user_id
     ${whereClause}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);

  const [rows] = await pool.query(
    `SELECT p.*, p.ma_de_xuat_gen AS ma_de_xuat, u.full_name AS user_name, u.email AS user_email,
            JSON_UNQUOTE(JSON_EXTRACT(u.custom_data, '$.department')) AS owner_department,
            u.parent_id AS manager_user_id, manager.full_name AS manager_name,
            (SELECT COUNT(*) FROM proposal_requests r
              WHERE r.proposal_id = p.id AND r.request_type = ?) AS update_request_count,
            (SELECT r.description FROM proposal_requests r
              WHERE r.proposal_id = p.id AND r.request_type IN (?, ?) AND r.status = 'OPEN'
              ORDER BY r.id DESC LIMIT 1) AS task_description,
            (SELECT COUNT(*) FROM proposal_signature_configs s
              WHERE s.proposal_id = p.id AND s.status <> 'CANCELLED') AS signer_count
     FROM station_proposals p
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN users manager ON manager.id = u.parent_id
     ${whereClause}
     ORDER BY p.updated_at DESC, p.id DESC
     LIMIT ? OFFSET ?`,
    [
      UPDATE_INFO_REQUEST_TYPE,
      UPDATE_INFO_REQUEST_TYPE,
      'REVISE_BCDX',
      ...params,
      safeLimit,
      offset
    ]
  );

  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const proposals = rows.map((row) => dynamicUtils.mergeData(row, fieldDefs)).map(mapApprovalRow);

  return {
    proposals,
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) },
    meta: {
      isAdmin: !!scope.isAdmin,
      isBackOffice: !!scope.isBackOffice,
      roleKey: scope.roleKey,
      region: scope.region,
      department: scope.department
    }
  };
};

exports.getFilterOptions = async (user) => {
  const scope = await proposalReportService.resolveScope(user);
  assertApprovalAccess(scope);
  return require('./proposalRequestService').getFilterOptions({
    all: true,
    proposalStatuses: TAB_STATUSES.all,
    signedApprovalOnly: true
  });
};

exports.getProposal = async ({ user, id } = {}) => {
  const scope = await proposalReportService.resolveScope(user);
  assertApprovalAccess(scope);
  const proposal = await loadProposal(id);
  const [rows] = await pool.query(
    `SELECT p.*, p.ma_de_xuat_gen AS ma_de_xuat, u.full_name AS user_name, u.email AS user_email,
            (SELECT COUNT(*) FROM proposal_requests r
              WHERE r.proposal_id = p.id AND r.request_type = ?) AS update_request_count,
            (SELECT r.description FROM proposal_requests r
              WHERE r.proposal_id = p.id AND r.request_type IN (?, ?) AND r.status = 'OPEN'
              ORDER BY r.id DESC LIMIT 1) AS task_description,
            (SELECT COUNT(*) FROM proposal_signature_configs s
              WHERE s.proposal_id = p.id AND s.status <> 'CANCELLED') AS signer_count
     FROM station_proposals p
     LEFT JOIN users u ON u.id = p.user_id
     WHERE p.id = ? LIMIT 1`,
    [UPDATE_INFO_REQUEST_TYPE, UPDATE_INFO_REQUEST_TYPE, 'REVISE_BCDX', proposal.id]
  );
  if (rows.length === 0) throw err('Không tìm thấy đề xuất', 404);
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const progress = await require('./proposalProgressService').getProgress(proposal.id);
  return {
    ...mapApprovalRow(dynamicUtils.mergeData(rows[0], fieldDefs)),
    progress,
    permissions: {
      canConfigure: scope.role === 'SUPER_ADMIN' || scope.isBackOffice,
      canRequestUpdate: scope.role === 'SUPER_ADMIN' || scope.isBackOffice,
      canReject: scope.role === 'SUPER_ADMIN' || scope.roleKey === 'TGD'
    }
  };
};

const buildMessage = async (proposal, actorId, { status, actionLabel, reason }) => {
  const code = notificationService.proposalCode(proposal.custom_data, proposal.id);
  const actorName = (await notificationService.getUserName(actorId)) || 'Hệ thống';
  return notificationService.statusMessage({ code, actorName, status, actionLabel, reason });
};

exports.requestUpdate = async ({ user, id, description, ip } = {}) => {
  const scope = await proposalReportService.resolveScope(user);
  assertApprovalAccess(scope);
  assertApprovalMutation(scope);
  const proposal = await loadProposal(id);
  if (proposal.status !== REVIEWING_STATUS) {
    throw err('Đề xuất không ở trạng thái đang duyệt BCĐX', 400);
  }
  const cleanDescription = String(description || '').trim();
  if (!cleanDescription) {
    throw err('Vui lòng mô tả thông tin cần cập nhật', 400);
  }

  const proposalLifecycle = require('./proposalLifecycle');
  const transition = await proposalLifecycle.transition(proposal.id, UPDATING_STATUS, {
    reason: cleanDescription,
    actorId: user.id,
    actorRole: user.role,
    source: 'user',
    ip
  });

  const [countRows] = await pool.query(
    'SELECT COUNT(*) AS n FROM proposal_requests WHERE proposal_id = ? AND request_type = ?',
    [proposal.id, UPDATE_INFO_REQUEST_TYPE]
  );
  const round = Number(countRows[0]?.n || 0) + 1;

  const request = await require('./proposalRequestService').createRequest({
    proposalId: proposal.id,
    type: UPDATE_INFO_REQUEST_TYPE,
    description: cleanDescription,
    requestedBy: user.id,
    previousStatus: REVIEWING_STATUS,
    currentStatus: UPDATING_STATUS,
    targetUserId: proposal.user_id || null,
    targetTitle: 'Người đề xuất',
    note: `Lần yêu cầu cập nhật thông tin: ${round}`,
    roundNo: round
  });

  await proposalLifecycle.logActivity({
    proposalId: proposal.id,
    action: 'report_update_requested',
    fromStatus: REVIEWING_STATUS,
    toStatus: UPDATING_STATUS,
    reason: cleanDescription,
    changedFields: {
      round_no: { label: 'Số lần yêu cầu cập nhật thông tin', old: round - 1, new: round }
    },
    actorId: user.id,
    actorRole: user.role,
    source: 'user',
    ip
  });

  return { id: proposal.id, status: UPDATING_STATUS, roundNo: round, request, transition };
};

exports.tgdReject = async ({ user, id, reason, ip } = {}) => {
  const scope = await proposalReportService.resolveScope(user);
  assertApprovalAccess(scope);
  const proposal = await loadProposal(id);
  if (proposal.status !== REVIEWING_STATUS) {
    throw err('Đề xuất không ở trạng thái đang duyệt BCĐX', 400);
  }
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) {
    throw err('Vui lòng nhập lý do từ chối duyệt', 400);
  }

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
    [proposal.id, 'REVISE_BCDX']
  );
  const round = Number(countRows[0]?.n || 0) + 1;

  const request = await require('./proposalRequestService').createRequest({
    proposalId: proposal.id,
    type: 'REVISE_BCDX',
    description: cleanReason,
    requestedBy: user.id,
    previousStatus: REVIEWING_STATUS,
    currentStatus: UPDATING_STATUS,
    targetDepartment: 'Trung tâm KD (GĐTTKD khu vực)',
    targetTitle: 'Giám đốc Trung tâm Kinh doanh',
    note: `Lần yêu cầu tạo lại BCĐX: ${round}`,
    roundNo: round
  });

  await proposalLifecycle.logActivity({
    proposalId: proposal.id,
    action: 'report_tgd_rejected',
    fromStatus: REVIEWING_STATUS,
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

const normalizeSigners = (signers) => {
  const list = Array.isArray(signers) ? signers : [];
  return list.map((item) => {
    const anchorToken = item?.anchor_token ? String(item.anchor_token).trim().slice(0, 64) : null;
    const anchored = !!anchorToken;
    const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));
    const requestedWidth = Number(item?.box_width);
    const boxWidth = Math.min(
      1,
      Math.max(
        0,
        item?.box_width !== null
          && item?.box_width !== undefined
          && Number.isFinite(requestedWidth)
          ? requestedWidth
          : 0.25
      )
    );
    const requestedHeight = Number(item?.box_height);
    const boxHeight = Math.min(
      1,
      Math.max(
        0,
        item?.box_height !== null
          && item?.box_height !== undefined
          && Number.isFinite(requestedHeight)
          ? requestedHeight
          : 0.25
      )
    );
    const hasPosition = item?.pos_x !== null && item?.pos_x !== undefined
      && item?.pos_y !== null && item?.pos_y !== undefined;
    const posX = hasPosition ? clamp01(item.pos_x) : (anchored ? null : 0);
    const posY = hasPosition ? Math.min(1 - boxHeight, clamp01(item.pos_y)) : (anchored ? null : 0);
    const page = item?.page
      ? Math.max(1, parseInt(item?.page, 10) || 1)
      : (anchored ? null : 1);
    return {
      user_id: Number(item?.user_id),
      signer_title: item?.signer_title ? String(item.signer_title).trim() : null,
      anchor_token: anchorToken,
      page,
      pos_x: posX,
      pos_y: posY,
      box_width: boxWidth,
      box_height: boxHeight
    };
  }).filter((item) => Number.isInteger(item.user_id) && item.user_id > 0);
};

exports.getSignatureConfig = async ({ user, id } = {}) => {
  const scope = await proposalReportService.resolveScope(user);
  assertApprovalAccess(scope);
  const proposal = await loadProposal(id);
  const documents = await proposalReportDocumentService.listDocuments(proposal.id);
  const [rows] = await pool.query(
    `SELECT s.*, u.full_name, u.role, u.email,
            JSON_UNQUOTE(JSON_EXTRACT(u.custom_data, '$.department')) AS user_department
     FROM proposal_signature_configs s
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.proposal_id = ? AND s.status <> 'CANCELLED'
     ORDER BY s.document_id ASC, s.page ASC, s.id ASC`,
    [proposal.id]
  );
  const mapSigner = (row, document) => ({
    id: row.id,
    document_id: document ? documentIdOf(document) : (row.document_id ? Number(row.document_id) : null),
    user_id: row.user_id,
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    signer_title: row.signer_title,
    signer_department: row.signer_department || row.user_department || null,
    file_id: row.file_id,
    page: row.page,
    pos_x: Number(row.pos_x),
    pos_y: Number(row.pos_y),
    box_width: Number(row.box_width),
    box_height: Number(row.box_height),
    status: row.status
  });
  const signers = rows.map((row) => {
    const document = documents.find((item) => (row.document_id && documentIdOf(item) === Number(row.document_id))
      || (!row.document_id && documentFileIdOf(item) === Number(row.file_id)));
    return mapSigner(row, document);
  });
  const canWithdraw = (scope.role === 'SUPER_ADMIN' || scope.isBackOffice)
    && proposal.status === SIGNATURE_STATUS && rows.length > 0
    && rows.every((row) => Number(row.created_by) === Number(user.id))
    && rows.every((row) => row.status !== 'SIGNED');
  return {
    proposal_id: proposal.id,
    status: proposal.status,
    can_withdraw: canWithdraw,
    documents: documents.map((document) => {
      const current = signers.filter((signer) => Number(signer.document_id) === documentIdOf(document));
      const snapshot = document.signature_anchor_snapshot && parseCustomData(document.signature_anchor_snapshot);
      const draft = proposal.status === REVIEWING_STATUS && Array.isArray(snapshot?.draft_signers)
        ? snapshot.draft_signers : [];
      return {
        ...document,
        has_signature_draft: proposal.status === REVIEWING_STATUS && Array.isArray(snapshot?.draft_signers),
        signers: current.length ? current : draft
      };
    }),
    signers
  };
};

const withdrawSignatureConfig = async ({ user, id, reason, ip } = {}) => {
  const scope = await proposalReportService.resolveScope(user);
  assertApprovalAccess(scope);
  assertApprovalMutation(scope);
  const proposal = await loadProposal(id);
  if (proposal.status !== SIGNATURE_STATUS) throw err('Đề xuất không ở trạng thái trình ký', 400);
  const [rows] = await pool.query(
    `SELECT id, created_by, status FROM proposal_signature_configs
      WHERE proposal_id = ? AND status <> 'CANCELLED'`,
    [proposal.id]
  );
  if (!rows.length) throw err('Không có cấu hình ký đang hoạt động', 400);
  if (rows.some((row) => Number(row.created_by) !== Number(user.id))) {
    throw err('Chỉ người đã cấu hình ký mới được thu hồi cấu hình này', 403);
  }
  if (rows.some((row) => row.status === 'SIGNED')) {
    throw err('Đã có người ký, không thể thu hồi cấu hình', 409);
  }
  const cleanReason = String(reason || '').trim() || 'Thu hồi cấu hình ký trước khi có chữ ký';
  const proposalLifecycle = require('./proposalLifecycle');
  const transition = await proposalLifecycle.transition(proposal.id, REVIEWING_STATUS, {
    reason: cleanReason,
    actorId: user.id,
    actorRole: user.role,
    source: 'user',
    signatureWithdrawal: true,
    ip
  });
  await pool.query(
    `UPDATE proposal_signature_configs SET status = 'CANCELLED'
      WHERE proposal_id = ? AND status <> 'CANCELLED'`,
    [proposal.id]
  );
  await proposalLifecycle.logActivity({
    proposalId: proposal.id,
    action: 'signature_config_withdrawn',
    fromStatus: SIGNATURE_STATUS,
    toStatus: REVIEWING_STATUS,
    reason: cleanReason,
    changedFields: {
      signer_configs: { label: 'Cấu hình người ký', old: rows.length, new: 0 }
    },
    actorId: user.id,
    actorRole: user.role,
    source: 'user',
    ip
  });
  return { id: proposal.id, status: REVIEWING_STATUS, transition };
};

exports.withdrawSignatureConfig = (args = {}) => (
  require('./proposalSignatureService')._internals.withSignatureMutationLock(args.id, () => (
    withdrawSignatureConfig(args)
  ))
);

const getSignerCandidatesForProposal = async (proposal) => {
  const [rows] = await pool.query("SELECT id, full_name, role, custom_data FROM users WHERE status = 'ACTIVE'");
  const ownerId = Number(proposal.user_id) || null;
  const assigneeId = Number(parseCustomData(proposal.custom_data).nguoi_phu_trach?.id) || null;
  const assignee = rows.find(row => Number(row.id) === assigneeId);
  const adminUserService = require('./adminUserService');
  const managerIds = new Set(
    assignee?.role === 'CTV'
      ? (await adminUserService.getAncestorIds(assigneeId)).map(Number)
      : []
  );
  const candidateRanks = {
    'Tổng giám đốc': 0,
    'Phòng Tài chính': 1,
    'Back Office': 2,
    'Người đề xuất': 3,
    'Người phụ trách': 4,
    'Người quản lý': 5
  };
  const candidates = [];
  const push = (row, category, title) => {
    const custom = parseCustomData(row.custom_data);
    candidates.push({
      id: Number(row.id),
      full_name: row.full_name,
      role: row.role,
      department: custom.department || null,
      chuc_vu: title || custom.chuc_vu || null,
      category,
      is_owner: Number(row.id) === Number(proposal.user_id)
    });
  };
  rows.forEach((row) => {
    const custom = parseCustomData(row.custom_data);
    const userId = Number(row.id);
    const department = custom.department || '';
    const chucVu = custom.chuc_vu || '';
    const normalizedDepartment = normalizeText(department);
    if (require('./proposalReviewService').isTgdTitle(department, chucVu)) {
      push(row, 'Tổng giám đốc', chucVu);
      return;
    }
    if (normalizedDepartment.includes('tai chinh') || normalizedDepartment.includes('finance')) {
      push(row, 'Phòng Tài chính', chucVu);
      return;
    }
    if (proposalReportService.isBackOffice(department)) {
      push(row, 'Back Office', chucVu);
      return;
    }
    if (userId === ownerId) {
      push(row, 'Người đề xuất', 'Người đề xuất');
      return;
    }
    if (userId === assigneeId) {
      push(row, 'Người phụ trách', chucVu);
      return;
    }
    if (managerIds.has(userId)) {
      push(row, 'Người quản lý', chucVu);
    }
  });
  candidates.sort((a, b) => candidateRanks[a.category] - candidateRanks[b.category]
    || a.full_name.localeCompare(b.full_name, 'vi'));
  return candidates;
};

exports.getSignerCandidates = async ({ user, id } = {}) => {
  const scope = await proposalReportService.resolveScope(user);
  assertApprovalAccess(scope);
  const proposal = await loadProposal(id);
  const candidates = await getSignerCandidatesForProposal(proposal);
  return { proposal_id: proposal.id, status: proposal.status, candidates };
};

const resolveTemplateSignerIds = (proposal, document) => {
  const ids = new Set();
  const context = document.signature_anchor_snapshot && parseCustomData(document.signature_anchor_snapshot);
  if (!context) return ids;
  const custom = parseCustomData(proposal.custom_data);
  (context.anchors || []).forEach((anchor) => {
    const fixedId = Number(anchor.user_id);
    if (Number.isInteger(fixedId) && fixedId > 0) ids.add(fixedId);
    if (anchor.mode === 'field' && anchor.field) {
      const value = custom[anchor.field];
      const fieldId = Number(value && typeof value === 'object' ? value.id : value);
      if (Number.isInteger(fieldId) && fieldId > 0) ids.add(fieldId);
    }
  });
  return ids;
};

exports.getDocumentSignerCandidates = async (proposal, snapshot, candidates) => {
  const result = [...(candidates || await getSignerCandidatesForProposal(proposal))];
  const existing = new Set(result.map((candidate) => Number(candidate.id)));
  const additionalIds = [...resolveTemplateSignerIds(proposal, { signature_anchor_snapshot: snapshot })]
    .filter((id) => !existing.has(id));
  if (additionalIds.length) {
    const [rows] = await pool.query(
      `SELECT id, full_name, role, custom_data FROM users
       WHERE status = 'ACTIVE' AND id IN (${additionalIds.map(() => '?').join(',')})`,
      additionalIds
    );
    rows.forEach((row) => {
      const custom = parseCustomData(row.custom_data);
      result.push({
        id: Number(row.id), full_name: row.full_name, role: row.role,
        department: custom.department || null, chuc_vu: custom.chuc_vu || null,
        category: 'Theo mẫu', is_owner: Number(row.id) === Number(proposal.user_id)
      });
    });
  }
  return result;
};

const inferAnchorUserId = (anchor, candidates = []) => {
  const key = String(anchor?.anchor_token || '').toLowerCase();
  let category = null;
  if (/tgd|chu_tich|ceo/.test(key)) category = 'Tổng giám đốc';
  else if (/sale.?admin|back.?office|admin/.test(key)) category = 'Back Office';
  if (!category) return null;
  const candidate = candidates.find((item) =>
    `${item.category || ''} ${item.chuc_vu || ''}`.toLowerCase().includes(category.toLowerCase())
  );
  return candidate ? Number(candidate.id) || null : null;
};

/**
 * Du doan vi tri o ky tu dong: doc PDF dang ky, tim chuoi nhan da chen trong mau.
 */
const detectAnchorsForPdf = async (proposal, context, pdfBuffer) => {
  const candidates = await getSignerCandidatesForProposal(proposal);
  if (!Array.isArray(context.anchors) || !context.box) throw err('Cấu hình ô ký của tài liệu không hợp lệ', 409);
  if (!context.anchors.length) {
    return { anchors: [], missing: [], candidates, reason: 'no_anchors' };
  }

  const { detectAnchors } = require('./pdfAnchorDetector');
  const detected = await detectAnchors(pdfBuffer, context.anchors.map((anchor) => ({
    anchor_token: anchor.anchor_token,
    label: anchor.label,
    box_width: context.box.width,
    box_height: context.box.height
  })));

  const custom = parseCustomData(proposal.custom_data);
  const resolved = context.anchors.map((anchor) => {
    const match = detected.find((item) => item.anchor_token === anchor.anchor_token) || {};
    let userId = Number(anchor.user_id) || null;
    let autoResolved = false;
    if (anchor.mode === 'field' && anchor.field) {
      const value = custom[anchor.field];
      userId = Number(value && typeof value === 'object' ? value.id : value) || null;
    }
    if (!userId && anchor.mode !== 'field') {
      const inferredId = inferAnchorUserId(anchor, candidates);
      if (inferredId) {
        userId = inferredId;
        autoResolved = true;
      }
    }
    return {
      anchor_token: anchor.anchor_token,
      label: anchor.label,
      signer_title: anchor.signer_title,
      mode: anchor.mode,
      field: anchor.field,
      user_id: userId,
      auto_resolved: autoResolved,
      page: match.page || null,
      pos_x: match.pos_x ?? null,
      pos_y: match.pos_y ?? null,
      box_width: match.box_width ?? context.box.width,
      box_height: match.box_height ?? context.box.height,
      reason: match.reason || null,
      found: !!match.found
    };
  });

  const signerIds = [...new Set(resolved.map((item) => item.user_id).filter(Boolean))];
  const names = new Map();
  if (signerIds.length) {
    const [rows] = await pool.query(
      `SELECT id, full_name FROM users WHERE status = 'ACTIVE' AND id IN (${signerIds.map(() => '?').join(',')})`,
      signerIds
    );
    rows.forEach((row) => names.set(Number(row.id), row.full_name));
  }

  return {
    proposal_id: proposal.id,
    status: proposal.status,
    box: context.box,
    missing: resolved.filter((item) => !item.found).map((item) => item.anchor_token),
    anchors: resolved.map((item) => ({
      ...item,
      user_id: names.has(Number(item.user_id)) ? item.user_id : null,
      user_name: names.get(Number(item.user_id)) || null
    })),
    candidates
  };
};

exports.detectAnchorsForPdf = detectAnchorsForPdf;

exports.detectSignatureAnchors = async ({ user, id, documentId } = {}) => {
  const scope = await proposalReportService.resolveScope(user);
  assertApprovalAccess(scope);
  const proposal = await loadProposal(id);
  if (proposal.status !== REVIEWING_STATUS) throw err('Chỉ dò vị trí ô ký khi đề xuất đang duyệt BCĐX', 400);
  const documents = await proposalReportDocumentService.listDocuments(proposal.id);
  if (!documentId && documents.length > 1) throw err('Vui lòng chọn tài liệu cần dò ô ký', 400);
  const document = documentId ? documents.find((item) => Number(item.id) === Number(documentId)) : documents[0];
  if (!document) throw err('Không tìm thấy tài liệu BCĐX hiện hành', 404);
  const context = document.signature_anchor_snapshot && parseCustomData(document.signature_anchor_snapshot);
  if (!context) return { proposal_id: proposal.id, document_id: document.id, status: proposal.status, anchors: [], missing: [], reason: 'missing_snapshot' };
  if (document.conversion_status !== 'READY' || document.signing_file?.mime_type !== 'application/pdf') {
    throw err('Chưa có PDF ký để dò vị trí ô ký', 409);
  }
  const located = await require('./fileService').getFilePath(documentFileIdOf(document));
  if (!located) throw err('Không đọc được file PDF ký', 409);
  const pdfBuffer = await require('fs/promises').readFile(located.filePath);
  return { ...(await detectAnchorsForPdf(proposal, context, pdfBuffer)), document_id: document.id };
};

exports.downloadAllProposalFiles = async ({ user, id } = {}) => {
  const scope = await proposalReportService.resolveScope(user);
  assertApprovalAccess(scope);
  const proposal = await loadProposal(id);

  const fileIds = new Set();
  const documents = await proposalReportDocumentService.listDocuments(proposal.id);
  for (const document of documents || []) {
    [document.source_file_id, document.pdf_file_id, document.signing_file_id].forEach((value) => {
      const numeric = Number(value);
      if (Number.isInteger(numeric) && numeric > 0) fileIds.add(numeric);
    });
  }

  const [fieldRows] = await pool.query(
    "SELECT `key` FROM field_definitions WHERE entity = 'station_proposals' AND type = 'file' AND status = 'active'"
  );
  const fileKeys = (fieldRows || []).map((row) => row.key);
  const custom = parseCustomData(proposal.custom_data);
  const collectFileId = (value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const numeric = Number(value.id ?? value.file_id);
      if (Number.isInteger(numeric) && numeric > 0) fileIds.add(numeric);
      return;
    }
    if (Array.isArray(value)) value.forEach(collectFileId);
  };
  for (const key of fileKeys) collectFileId(custom[key]);

  const JSZip = require('jszip');
  const zip = new JSZip();
  let count = 0;
  for (const fileId of fileIds) {
    const located = await require('./fileService').getFilePath(fileId);
    if (!located) continue;
    const data = await require('fs/promises').readFile(located.filePath);
    const baseName = located.file.original_name || `file_${fileId}`;
    zip.file(baseName, data);
    count += 1;
  }
  if (count === 0) throw err('Đề xuất chưa có file nào để tải', 400);
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const fileName = `BCDX_${proposal.ma_de_xuat_gen || proposal.id}_files.zip`;
  return { buffer, fileName };
};
const configureSignature = async ({ user, id, fileId, signers, documents: requestedDocuments, ip, mutationConnection } = {}) => {
  const scope = await proposalReportService.resolveScope(user);
  assertApprovalAccess(scope);
  assertApprovalMutation(scope);
  const proposal = await loadProposal(id);
  if (proposal.status !== REVIEWING_STATUS) {
    throw err('Chỉ cấu hình ký cho đề xuất đang duyệt BCĐX', 400);
  }
  const activeDocuments = await proposalReportDocumentService.listDocuments(proposal.id);
  if (activeDocuments.length === 0) {
    throw err('Đề xuất chưa có file tờ trình BCĐX', 400);
  }
  let documentConfigs;
  if (Array.isArray(requestedDocuments)) {
    documentConfigs = requestedDocuments;
  } else {
    if (activeDocuments.length !== 1) {
      throw err('Cần cấu hình người ký riêng cho từng tài liệu BCĐX', 400);
    }
    documentConfigs = [{
      document_id: documentIdOf(activeDocuments[0]),
      file_id: Number(fileId) || documentFileIdOf(activeDocuments[0]),
      signers
    }];
  }
  if (documentConfigs.length !== activeDocuments.length) {
    throw err('Cần cấu hình ký cho toàn bộ tài liệu BCĐX hiện hành', 400);
  }
  const configuredDocumentIds = documentConfigs.map((item) => Number(item && item.document_id));
  if (configuredDocumentIds.some((value) => !Number.isInteger(value))
    || new Set(configuredDocumentIds).size !== configuredDocumentIds.length
    || activeDocuments.some((document) => !configuredDocumentIds.includes(documentIdOf(document)))) {
    throw err('Danh sách tài liệu cấu hình ký không khớp với tài liệu BCĐX hiện hành', 400);
  }

  const normalizedDocuments = documentConfigs.map((item) => {
    const document = activeDocuments.find((candidate) => documentIdOf(candidate) === Number(item.document_id));
    const canonicalFileId = documentFileIdOf(document);
    const requestedFileId = Number(item.file_id ?? (activeDocuments.length === 1 ? fileId : null));
    if (!canonicalFileId || requestedFileId !== canonicalFileId) {
      throw err('File cấu hình ký phải đúng với file ký chuẩn của tài liệu', 400);
    }
    if (document.conversion_status !== 'READY' || document.signing_file?.mime_type !== 'application/pdf') {
      throw err('Vui lòng chuyển toàn bộ tài liệu sang PDF thành công trước khi cấu hình ký', 409);
    }
    if (!isSignableFile(document.signing_file)) {
      throw err('Tài liệu ký phải là PDF hoặc DOCX; file .doc không được hỗ trợ', 400);
    }
    const normalized = normalizeSigners(item.signers);
    if (normalized.length === 0) {
      throw err('Vui lòng chọn ít nhất một người ký cho mỗi tài liệu', 400);
    }
    if (new Set(normalized.map((signer) => signer.user_id)).size !== normalized.length) {
      throw err('Mỗi người chỉ được cấu hình một ô ký trên cùng tài liệu', 400);
    }
    return { document_id: documentIdOf(document), file_id: canonicalFileId, signers: normalized };
  });
  require('./proposalSignatureService')._internals.validateDocumentSignerSets(normalizedDocuments);

  const signerIds = [...new Set(normalizedDocuments.flatMap((document) => document.signers.map((signer) => signer.user_id)))];
  const eligibleIds = new Set((await getSignerCandidatesForProposal(proposal)).map((candidate) => candidate.id));
  if (normalizedDocuments.some((document) => {
    const source = activeDocuments.find((item) => documentIdOf(item) === document.document_id);
    const templateIds = resolveTemplateSignerIds(proposal, source);
    return document.signers.some((signer) => !eligibleIds.has(signer.user_id) && !templateIds.has(signer.user_id));
  })) {
    throw err('Chỉ được chọn người ký thuộc các nhóm được phép', 400);
  }
  const signerPlaceholders = signerIds.map(() => '?').join(', ');
  const [signerRows] = await pool.query(
    `SELECT id, JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.department')) AS department
     FROM users
     WHERE status = 'ACTIVE' AND id IN (${signerPlaceholders})`,
    signerIds
  );
  const signerDepartments = new Map(signerRows.map((row) => [Number(row.id), row.department || null]));
  if (signerDepartments.size !== signerIds.length) {
    throw err('Một hoặc nhiều người ký không còn hoạt động', 400);
  }
  const fileIds = [...new Set(normalizedDocuments.map((document) => document.file_id))];
  const [fileRows] = await pool.query(
    `SELECT id, original_name, mime_type FROM files WHERE id IN (${fileIds.map(() => '?').join(',')}) AND status <> 'deleted'`,
    fileIds
  );
  if (fileRows.length !== fileIds.length) throw err('Không tìm thấy file tờ trình BCĐX', 400);

  const connection = mutationConnection;
  let transactionStarted = false;
  let previousConfigs = [];
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [lockedProposals] = await connection.query(
      'SELECT id, status FROM station_proposals WHERE id = ? FOR UPDATE',
      [proposal.id]
    );
    if (!lockedProposals.length) throw err('Không tìm thấy đề xuất', 404);
    if (lockedProposals[0].status !== REVIEWING_STATUS) {
      throw err('Chỉ cấu hình ký cho đề xuất đang duyệt BCĐX', 400);
    }

    const [lockedDocuments] = await connection.query(
      `SELECT d.id, d.signing_file_id, d.conversion_status, f.mime_type
         FROM proposal_report_documents d
         LEFT JOIN files f ON f.id=d.signing_file_id
        WHERE d.proposal_id = ? AND d.is_current = 1
        ORDER BY d.id ASC
        FOR UPDATE`,
      [proposal.id]
    );
    if (lockedDocuments.length !== normalizedDocuments.length
      || normalizedDocuments.some((document) => {
        const current = lockedDocuments.find((item) => Number(item.id) === document.document_id);
        return !current
          || Number(current.signing_file_id) !== document.file_id
          || current.conversion_status !== 'READY' || current.mime_type !== 'application/pdf';
      })) {
      throw err('Tài liệu BCĐX hoặc trạng thái chuyển đổi đã thay đổi; vui lòng tải lại cấu hình', 409);
    }

    const [existingConfigs] = await connection.query(
      `SELECT id, document_id, user_id, file_id, status
         FROM proposal_signature_configs
        WHERE proposal_id = ? AND status <> 'CANCELLED'
        FOR UPDATE`,
      [proposal.id]
    );
    previousConfigs = existingConfigs;
    await connection.query(
      `UPDATE proposal_signature_configs
          SET status = 'CANCELLED'
        WHERE proposal_id = ? AND status <> 'CANCELLED'`,
      [proposal.id]
    );
    for (const document of normalizedDocuments) {
      for (const signer of document.signers) {
        await connection.query(
          `INSERT INTO proposal_signature_configs
            (proposal_id, document_id, file_id, user_id, signer_title, signer_department, anchor_token, page, pos_x, pos_y, box_width, box_height, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            proposal.id,
            document.document_id,
            document.file_id,
            signer.user_id,
            signer.signer_title,
            signerDepartments.get(signer.user_id),
            signer.anchor_token || null,
            signer.page,
            signer.pos_x,
            signer.pos_y,
            signer.box_width,
            signer.box_height,
            user.id
          ]
        );
      }
    }
    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  }

  const proposalLifecycle = require('./proposalLifecycle');
  const transition = await proposalLifecycle.transition(proposal.id, SIGNATURE_STATUS, {
    reason: 'Đã cấu hình trình ký BCĐX',
    actorId: user.id,
    actorRole: user.role,
    source: 'user',
    ip
  });

  await proposalLifecycle.logActivity({
    proposalId: proposal.id,
    action: 'signature_configured',
    fromStatus: REVIEWING_STATUS,
    toStatus: SIGNATURE_STATUS,
    changedFields: {
      signers: {
        label: 'Người ký',
        old: [...new Set(previousConfigs.map((s) => Number(s.user_id)))].join(', '),
        new: normalizedDocuments.flatMap((document) => document.signers.map((s) => s.user_id)).join(', ')
      },
      documents: {
        label: 'Tài liệu BCĐX',
        old: [...new Set(previousConfigs.map((s) => Number(s.document_id)).filter(Boolean))].join(', '),
        new: normalizedDocuments.map((document) => document.document_id).join(', ')
      }
    },
    actorId: user.id,
    actorRole: user.role,
    source: 'user',
    ip
  });

  const message = await buildMessage(proposal, user.id, {
    status: SIGNATURE_STATUS,
    actionLabel: 'Back Office',
    reason: 'Đã cấu hình trình ký BCĐX'
  });
  for (const signerId of signerIds) {
    try {
      await notificationService.create({
        userId: signerId,
        type: SIGNATURE_STATUS,
        title: notificationService.statusTitle(SIGNATURE_STATUS),
        message,
        entityType: 'station_proposals',
        entityId: proposal.id,
        createdBy: user.id
      });
    } catch (error) {
      console.error(`[ProposalApproval] Failed to notify signer ${signerId} for proposal ${proposal.id}:`, error);
    }
  }

  return {
    id: proposal.id,
    status: SIGNATURE_STATUS,
    documents: normalizedDocuments,
    signers: normalizedDocuments.flatMap((document) => document.signers.map((signer) => ({
      ...signer,
      document_id: document.document_id,
      file_id: document.file_id
    }))),
    transition
  };
};

exports.configureSignature = (args = {}) => (
  require('./proposalSignatureService')._internals.withSignatureMutationLock(args.id, (mutationConnection) => (
    configureSignature({ ...args, mutationConnection })
  ))
);
