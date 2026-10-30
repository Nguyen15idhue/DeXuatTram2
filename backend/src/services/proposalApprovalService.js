const pool = require('../utils/db');
const dynamicUtils = require('./dynamicUtils');
const proposalGradingService = require('./proposalGradingService');
const proposalReportService = require('./proposalReportService');

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
  if (scope.role === 'SUPER_ADMIN' || (scope.role === 'ADMIN' && scope.isBackOffice)) return;
  throw err('Chỉ SUPER_ADMIN hoặc ADMIN thuộc Back Office được duyệt BCĐX', 403);
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

exports.listProposals = async ({ user, tab = 'all', search = '', page = 1, limit = 10 } = {}) => {
  const safeTab = Object.prototype.hasOwnProperty.call(TAB_STATUSES, tab) ? tab : 'all';
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 10));
  const offset = (safePage - 1) * safeLimit;
  const scope = await proposalReportService.resolveScope(user);
  assertApprovalAccess(scope);
  const statuses = TAB_STATUSES[safeTab];

  const where = [`p.status IN (${statuses.map(() => '?').join(',')})`];
  const params = [...statuses];
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
    progress
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
    const posX = Math.min(1, Math.max(0, Number(item?.pos_x) || 0));
    const requestedWidth = Number(item?.box_width);
    const boxWidth = Math.min(
      1 - posX,
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
    const posY = Math.min(
      1 - boxHeight,
      Math.max(0, Number(item?.pos_y) || 0)
    );
    return {
      user_id: Number(item?.user_id),
      signer_title: item?.signer_title ? String(item.signer_title).trim() : null,
      page: Math.max(1, parseInt(item?.page, 10) || 1),
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
  const [rows] = await pool.query(
    `SELECT s.*, u.full_name, u.role, u.email,
            JSON_UNQUOTE(JSON_EXTRACT(u.custom_data, '$.department')) AS user_department
     FROM proposal_signature_configs s
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.proposal_id = ? AND s.status <> 'CANCELLED'
     ORDER BY s.page ASC, s.id ASC`,
    [proposal.id]
  );
  return {
    proposal_id: proposal.id,
    status: proposal.status,
    signers: rows.map((row) => ({
      id: row.id,
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
    }))
  };
};

exports.getSignerCandidates = async ({ user, id } = {}) => {
  const scope = await proposalReportService.resolveScope(user);
  assertApprovalAccess(scope);
  const proposal = await loadProposal(id);
  const proposalReviewService = require('./proposalReviewService');
  const [rows] = await pool.query("SELECT id, full_name, role, parent_id, custom_data FROM users WHERE status = 'ACTIVE'");
  const proposalCustomData = parseCustomData(proposal.custom_data);
  const relatedIds = new Set([Number(proposal.user_id)].filter(Boolean));
  if (proposal.user_id) {
    const adminUserService = require('./adminUserService');
    (await adminUserService.getAncestorIds(proposal.user_id)).forEach((id) => relatedIds.add(Number(id)));
  }
  ['nguoi_phu_trach', 'nguoi_giao_phu_trach', 'sales_quan_ly'].forEach((key) => {
    const value = proposalCustomData[key];
    const id = Number(value && typeof value === 'object' ? value.id : value);
    if (Number.isInteger(id) && id > 0) relatedIds.add(id);
  });
  const proposalRegionValue = proposalRegion(proposal.custom_data);
  const candidateRanks = {
    'Tổng giám đốc': 0,
    'Back Office': 1,
    'GĐTTKD': 2,
    'Giám đốc khu vực': 3,
    'Sale liên quan': 4,
    'Người đề xuất': 5
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
    const normalizedTitle = normalizeText(chucVu);
    const normalizedDepartment = normalizeText(department);
    if (userId === Number(proposal.user_id)) {
      push(row, 'Người đề xuất', 'Người đề xuất');
      return;
    }
    const isTgd = (normalizedTitle.includes('tong giam doc')
      && !normalizedTitle.includes('pho tong giam doc'))
      || normalizedDepartment.includes('tong giam doc');
    if (isTgd) {
      push(row, 'Tổng giám đốc', chucVu);
      return;
    }
    if (proposalReportService.isBackOffice(department)) {
      push(row, 'Back Office', chucVu);
      return;
    }
    const isGdttkd = normalizedTitle.includes('giam doc trung tam kinh doanh')
      || normalizedDepartment.includes('trung tam kd')
      || normalizedDepartment.includes('trung tam kinh doanh');
    if (isGdttkd) {
      const userRegion = proposalReviewService.resolveRegion(department)
        || proposalReviewService.resolveRegion(custom.vung_mien);
      if (!proposalRegionValue || !userRegion || userRegion === proposalRegionValue) {
        push(row, 'GĐTTKD', chucVu);
      }
      return;
    }
    if (row.role === 'SALES' && relatedIds.has(userId)) {
      const isAreaDirector = normalizedTitle.includes('giam doc khu vuc');
      push(row, isAreaDirector ? 'Giám đốc khu vực' : 'Sale liên quan', chucVu);
    }
  });
  candidates.sort((a, b) => candidateRanks[a.category] - candidateRanks[b.category]
    || a.full_name.localeCompare(b.full_name, 'vi'));
  return { proposal_id: proposal.id, status: proposal.status, candidates };
};

exports.configureSignature = async ({ user, id, fileId, signers, ip } = {}) => {
  const scope = await proposalReportService.resolveScope(user);
  assertApprovalAccess(scope);
  const proposal = await loadProposal(id);
  if (proposal.status !== REVIEWING_STATUS) {
    throw err('Chỉ cấu hình ký cho đề xuất đang duyệt BCĐX', 400);
  }
  const normalized = normalizeSigners(signers);
  if (normalized.length === 0) {
    throw err('Vui lòng chọn ít nhất một người ký', 400);
  }

  const custom = parseCustomData(proposal.custom_data);
  const reportFiles = toFileSummaries(custom[REPORT_FIELD]);
  const resolvedFileId = Number(fileId) || (reportFiles[0] ? Number(reportFiles[0].id) : null);
  if (!resolvedFileId) {
    throw err('Đề xuất chưa có file tờ trình BCĐX', 400);
  }

  const signerIds = [...new Set(normalized.map((signer) => signer.user_id))];
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

  const [fileRows] = await pool.query(
    'SELECT id, original_name FROM files WHERE id = ? LIMIT 1',
    [resolvedFileId]
  );
  if (fileRows.length === 0) {
    throw err('Không tìm thấy file tờ trình BCĐX', 400);
  }

  await pool.query(
    "DELETE FROM proposal_signature_configs WHERE proposal_id = ? AND status = 'PENDING'",
    [proposal.id]
  );
  for (const signer of normalized) {
    await pool.query(
      `INSERT INTO proposal_signature_configs
        (proposal_id, file_id, user_id, signer_title, signer_department, page, pos_x, pos_y, box_width, box_height, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        proposal.id,
        resolvedFileId,
        signer.user_id,
        signer.signer_title,
        signerDepartments.get(signer.user_id),
        signer.page,
        signer.pos_x,
        signer.pos_y,
        signer.box_width,
        signer.box_height,
        user.id
      ]
    );
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
      signers: { label: 'Người ký', old: '', new: normalized.map((s) => s.user_id).join(', ') },
      file_id: { label: 'File BCĐX', old: '', new: String(resolvedFileId) }
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
  for (const signer of normalized) {
    try {
      await notificationService.create({
        userId: signer.user_id,
        type: SIGNATURE_STATUS,
        title: notificationService.statusTitle(SIGNATURE_STATUS),
        message,
        entityType: 'station_proposals',
        entityId: proposal.id,
        createdBy: user.id
      });
    } catch { /* silent */ }
  }

  return {
    id: proposal.id,
    status: SIGNATURE_STATUS,
    file_id: resolvedFileId,
    signers: normalized,
    transition
  };
};
