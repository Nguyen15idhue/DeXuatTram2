const pool = require('../utils/db');
const dynamicUtils = require('./dynamicUtils');
const proposalGradingService = require('./proposalGradingService');
const { isGdtt } = require('../constants/salesRanks');

const { normalizeText, parseCustomData, resolveGradingRole, getLegalDocsState } = proposalGradingService;

const REVIEW_ROLE = {
  GDTTKD: 'GDTTKD',
  QH: 'QH',
  PL: 'PL',
  TGD: 'TGD',
  ADMIN: 'ADMIN'
};

const REVIEW_ROLE_LABELS = {
  GDTTKD: 'Giám đốc Trung tâm Kinh doanh',
  QH: 'Phòng Quy hoạch',
  PL: 'Phòng Pháp lý',
  TGD: 'Tổng Giám đốc',
  ADMIN: 'Quản trị'
};

const REVIEW_LEVEL_LABELS = {
  1: 'GĐTTKD xem xét',
  2: 'Quy hoạch và Pháp lý chấm lại',
  3: 'Tổng Giám đốc xem xét'
};

const REGION_LABELS = { Bac: 'Miền Bắc', Trung: 'Miền Trung', Nam: 'Miền Nam' };

const GDTTKD_STATUSES = ['GDTTKD_EVALUATING', 'RE_GDTTKD_EVALUATING'];
const TGD_STATUS = 'TGD_REVIEW';
const REGRADING_STATUS = 'RE_GRADING';
const REVIEWER_KEYS = [REVIEW_ROLE.GDTTKD, REVIEW_ROLE.QH, REVIEW_ROLE.PL, REVIEW_ROLE.TGD];

const err = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const resolveRegion = (value) => {
  const text = normalizeText(value);
  if (!text) return null;
  if (text.includes('mien bac') || text === 'bac' || text.endsWith(' bac')) return 'Bac';
  if (text.includes('mien trung') || text === 'trung' || text.endsWith(' trung')) return 'Trung';
  if (text.includes('mien nam') || text === 'nam' || text.endsWith(' nam')) return 'Nam';
  return null;
};

const isTgdTitle = (department, chucVu) => {
  const title = normalizeText(chucVu);
  const dept = normalizeText(department);
  if (title.includes('pho tong giam doc')) return false;
  return title.includes('tong giam doc') || dept.includes('tong giam doc');
};

const getUserProfile = async (userId) => {
  if (!userId) return { department: null, chucVu: null, customData: {} };
  const [rows] = await pool.query('SELECT custom_data FROM users WHERE id = ? LIMIT 1', [userId]);
  const customData = rows.length > 0 ? parseCustomData(rows[0].custom_data) : {};
  return {
    department: customData.department || null,
    chucVu: customData.chuc_vu || null,
    customData
  };
};

const resolveRoleKey = ({ role, department, chucVu }) => {
  const normalizedDepartment = normalizeText(department);
  if (role === 'SUPER_ADMIN') return REVIEW_ROLE.ADMIN;
  if (role === 'ADMIN') {
    return normalizedDepartment.includes('ban tong giam doc') ? REVIEW_ROLE.TGD : REVIEW_ROLE.ADMIN;
  }
  if (isTgdTitle(department, chucVu)) return REVIEW_ROLE.TGD;
  const gradingRole = resolveGradingRole(department);
  if (gradingRole) return gradingRole;
  const title = normalizeText(chucVu);
  const dept = normalizeText(department);
  if (isGdtt(chucVu, department) || title.includes('giam doc trung tam kinh doanh')
    || dept.includes('trung tam kd') || dept.includes('trung tam kinh doanh')) {
    return REVIEW_ROLE.GDTTKD;
  }
  return null;
};

const resolveReviewer = async (user) => {
  const profile = await getUserProfile(user && user.id);
  const roleKey = resolveRoleKey({
    role: user && user.role,
    department: profile.department,
    chucVu: profile.chucVu
  });
  const region = roleKey === REVIEW_ROLE.GDTTKD
    ? (resolveRegion(profile.department) || resolveRegion(profile.customData.vung_mien))
    : null;
  return {
    isAdmin: ['SUPER_ADMIN', 'ADMIN'].includes(user && user.role),
    isSuperAdmin: user?.role === 'SUPER_ADMIN',
    roleKey,
    roleLabel: REVIEW_ROLE_LABELS[roleKey] || null,
    region,
    regionLabel: REGION_LABELS[region] || null,
    department: profile.department,
    chucVu: profile.chucVu,
    customData: profile.customData
  };
};

const resolveListScope = (user) => resolveReviewer(user);

const proposalRegion = (customData) => resolveRegion(parseCustomData(customData).vung_mien);

const regionClause = (region, params) => {
  if (!region) return '';
  const pattern = {
    Bac: '%bac%',
    Trung: '%trung%',
    Nam: '%nam%'
  }[region];
  if (!pattern) return '';
  params.push(pattern);
  return " AND LOWER(CONVERT(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.vung_mien')) USING utf8mb4)) LIKE ?";
};

const mapReviewRow = (row) => {
  const custom = parseCustomData(row.custom_data);
  const legalDocs = getLegalDocsState(custom);
  const level = row.review_level === null || row.review_level === undefined ? null : Number(row.review_level);
  const qhScore = row.quy_hoach_score === null || row.quy_hoach_score === undefined ? null : Number(row.quy_hoach_score);
  const plScore = row.phap_ly_score === null || row.phap_ly_score === undefined ? null : Number(row.phap_ly_score);
  return {
    ...row,
    custom_data: custom,
    review_level: level,
    review_level_label: level ? (REVIEW_LEVEL_LABELS[level] || `Mức ${level}`) : null,
    quy_hoach_score: qhScore,
    phap_ly_score: plScore,
    legal_docs_complete: legalDocs.complete,
    legal_docs_required: legalDocs.required,
    legal_docs_uploaded_complete: legalDocs.uploadedComplete,
    legal_docs_missing: legalDocs.missing,
    legal_docs: legalDocs.documents,
    vung_mien_label: REGION_LABELS[proposalRegion(custom)] || (custom.vung_mien || null)
  };
};

const listReviews = async ({
  user,
  tab = 'all',
  search = '',
  filters = {},
  page = 1,
  limit = 10
} = {}) => {
  const safeTab = ['all', 'pending', 'completed'].includes(tab) ? tab : 'all';
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 10));
  const offset = (safePage - 1) * safeLimit;
  const scope = await resolveListScope(user);
  const canReview = scope.isAdmin || REVIEWER_KEYS.includes(scope.roleKey);

  if (!canReview) {
    return {
      proposals: [],
      pagination: { page: safePage, limit: safeLimit, total: 0, totalPages: 0 },
      meta: {
        canReview: false,
        isAdmin: false,
        reviewRole: null,
        reviewRoleLabel: null,
        region: null,
        regionLabel: null,
        reviewLevelLabels: REVIEW_LEVEL_LABELS
      }
    };
  }

  const where = [];
  const params = [];

  if (safeTab === 'all') {
    where.push('p.review_level IS NOT NULL');
  } else if (safeTab === 'pending') {
    if (scope.roleKey === REVIEW_ROLE.GDTTKD) {
      where.push(`((p.status = ? AND p.review_level = 1) OR (p.status = ? AND p.review_level = 2))`);
      params.push('GDTTKD_EVALUATING', 'RE_GDTTKD_EVALUATING');
      const clause = regionClause(scope.region, params);
      if (clause) where.push(clause.replace(/^ AND /, ''));
    } else if (scope.roleKey === REVIEW_ROLE.QH || scope.roleKey === REVIEW_ROLE.PL) {
      where.push('p.status = ?');
      params.push(REGRADING_STATUS);
    } else if (scope.roleKey === REVIEW_ROLE.TGD) {
      where.push('p.status = ?');
      params.push(TGD_STATUS);
    } else {
      where.push(`p.status IN (${[...GDTTKD_STATUSES, REGRADING_STATUS, TGD_STATUS].map(() => '?').join(',')})`);
      params.push(...GDTTKD_STATUSES, REGRADING_STATUS, TGD_STATUS);
    }
  } else {
    if (scope.roleKey === REVIEW_ROLE.QH || scope.roleKey === REVIEW_ROLE.PL) {
      where.push('p.review_level = 2');
    } else if (scope.roleKey === REVIEW_ROLE.TGD) {
      where.push('p.review_level = 3');
    } else {
      where.push('p.review_level IS NOT NULL');
    }
  }

  if (scope.roleKey === REVIEW_ROLE.GDTTKD && scope.region && safeTab !== 'pending') {
    const clause = regionClause(scope.region, params);
    if (clause) where.push(clause.replace(/^ AND /, ''));
  }

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

  if (filters.proposalStatus) {
    where.push('p.status = ?');
    params.push(String(filters.proposalStatus));
  }
  if (filters.model) {
    where.push("JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.mo_hinh_dau_tu')) = ?");
    params.push(String(filters.model));
  }
  if (filters.province) {
    where.push("JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.province')) = ?");
    params.push(String(filters.province));
  }
  if (filters.region) {
    const selectedRegion = resolveRegion(filters.region);
    if (selectedRegion) {
      const clause = regionClause(selectedRegion, params);
      if (clause) where.push(clause.replace(/^ AND /, ''));
    }
  }
  if (filters.ownerUserId) {
    where.push('p.user_id = ?');
    params.push(Number(filters.ownerUserId));
  }
  if (filters.managerUserId) {
    const adminUserService = require('./adminUserService');
    const branchIds = await adminUserService.getBranchIds(Number(filters.managerUserId));
    if (branchIds.length) {
      where.push(`p.user_id IN (${branchIds.map(() => '?').join(',')})`);
      params.push(...branchIds.map(Number));
    } else {
      where.push('1 = 0');
    }
  }
  if (filters.dateFrom) {
    where.push('p.created_at >= ?');
    params.push(`${String(filters.dateFrom).slice(0, 10)} 00:00:00`);
  }
  if (filters.dateTo) {
    where.push('p.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(String(filters.dateTo).slice(0, 10));
  }

  const whereClause = `WHERE ${where.length > 0 ? where.join(' AND ') : '1 = 1'}`;

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
            u.parent_id AS manager_user_id, manager.full_name AS manager_name
     FROM station_proposals p
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN users manager ON manager.id = u.parent_id
     ${whereClause}
     ORDER BY
       CASE WHEN ? = 'pending' THEN p.updated_at END ASC,
       CASE WHEN ? <> 'pending' THEN p.updated_at END DESC,
       p.id ASC
     LIMIT ? OFFSET ?`,
    [...params, safeTab, safeTab, safeLimit, offset]
  );

  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const proposals = rows.map((row) => dynamicUtils.mergeData(row, fieldDefs)).map(mapReviewRow);

  return {
    proposals,
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) },
    meta: {
      canReview: true,
      isAdmin: !!scope.isAdmin,
      isSuperAdmin: !!scope.isSuperAdmin,
      reviewRole: scope.roleKey,
      reviewRoleLabel: scope.roleLabel,
      region: scope.region,
      regionLabel: scope.regionLabel,
      reviewLevelLabels: REVIEW_LEVEL_LABELS
    }
  };
};

const getReviewDetail = async (id, user) => {
  const scope = await resolveReviewer(user);
  const proposalId = Number(id);
  if (!Number.isInteger(proposalId) || proposalId <= 0) throw err('Đề xuất không hợp lệ', 400);
  if (!scope.isAdmin && !REVIEWER_KEYS.includes(scope.roleKey)) {
    throw err('Bạn không có quyền xem đề xuất này', 403);
  }

  const [rows] = await pool.query(
    `SELECT p.*, p.ma_de_xuat_gen AS ma_de_xuat, u.full_name AS user_name, u.email AS user_email
       FROM station_proposals p
       LEFT JOIN users u ON u.id = p.user_id
      WHERE p.id = ? AND p.review_level IS NOT NULL
      LIMIT 1`,
    [proposalId]
  );
  if (!rows.length) throw err('Không tìm thấy đề xuất', 404);
  const row = rows[0];
  if (!scope.isAdmin && scope.roleKey === REVIEW_ROLE.GDTTKD) assertRegion(scope, row);

  const [requests] = await pool.query(
    `SELECT r.id, r.request_type, r.description, r.requested_by, r.previous_status,
            r.current_status, r.target_department, r.target_title, r.target_user_id,
            r.round_no, r.note, r.status, r.created_at, r.resolved_at,
            requester.full_name AS requested_by_name, resolver.full_name AS resolved_by_name
       FROM proposal_requests r
       LEFT JOIN users requester ON requester.id = r.requested_by
       LEFT JOIN users resolver ON resolver.id = r.resolved_by
      WHERE r.proposal_id = ? AND r.request_type IN ('RE_GRADE', 'TGD_REVIEW')
      ORDER BY r.created_at ASC, r.id ASC`,
    [proposalId]
  );
  const fieldDefinitions = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const proposal = mapReviewRow(dynamicUtils.mergeData(row, fieldDefinitions));
  const progress = await require('./proposalProgressService').getProgress(proposalId);
  const isGdttkd = scope.roleKey === REVIEW_ROLE.GDTTKD || scope.isSuperAdmin;
  const isTgd = scope.roleKey === REVIEW_ROLE.TGD || scope.isSuperAdmin;
  const status = proposal.status;
  const reviewLevel = proposal.review_level;

  return {
    proposal,
    fieldDefinitions,
    requests,
    progress,
    permissions: {
      canRequestRegrade: isGdttkd && status === 'GDTTKD_EVALUATING' && reviewLevel === 1,
      canCancelGdttkd: isGdttkd
        && ((status === 'GDTTKD_EVALUATING' && reviewLevel === 1)
          || (status === 'RE_GDTTKD_EVALUATING' && reviewLevel === 2)),
      canSubmitToTgd: isGdttkd && status === 'RE_GDTTKD_EVALUATING' && reviewLevel === 2,
      canCancelTgd: isTgd && status === TGD_STATUS && reviewLevel === 3,
      canApproveTgd: isTgd && status === TGD_STATUS && reviewLevel === 3
    },
    viewer: {
      roleKey: scope.roleKey,
      isAdmin: scope.isAdmin,
      isSuperAdmin: scope.isSuperAdmin,
      region: scope.region
    }
  };
};

const loadProposal = async (id) => {
  const proposalId = Number(id);
  if (!Number.isInteger(proposalId) || proposalId <= 0) throw err('Đề xuất không hợp lệ', 400);
  const [rows] = await pool.query(
    `SELECT id, user_id, status, review_level, quy_hoach_score, phap_ly_score, custom_data
     FROM station_proposals WHERE id = ?`,
    [proposalId]
  );
  if (rows.length === 0) throw err('Không tìm thấy đề xuất', 404);
  return rows[0];
};

const assertRole = (scope, allowed) => {
  if (scope.isSuperAdmin) return;
  if (!scope.roleKey || !allowed.includes(scope.roleKey)) {
    throw err('Bạn không có quyền thực hiện thao tác này', 403);
  }
};

const assertStatus = (proposal, allowed) => {
  if (!allowed.includes(proposal.status)) {
    throw err('Đề xuất không ở trạng thái phù hợp để thực hiện thao tác này', 400);
  }
};

const assertRegion = (scope, proposal) => {
  if (scope.isSuperAdmin || scope.roleKey !== REVIEW_ROLE.GDTTKD || !scope.region) return;
  const region = proposalRegion(proposal.custom_data);
  if (region !== scope.region) {
    const label = REGION_LABELS[scope.region] || scope.region;
    throw err(`Đề xuất không thuộc ${label}`, 403);
  }
};

const requireReason = (reason, message) => {
  const text = String(reason || '').trim();
  if (!text) throw err(message, 400);
  return text;
};

const logReview = async ({
  proposalId, action, fromStatus, toStatus, reason, changedFields,
  actorId, actorRole, source = 'user', ip
}) => {
  await require('./proposalLifecycle').logActivity({
    proposalId, action, fromStatus, toStatus, reason, changedFields,
    actorId: actorId || null, actorRole: actorRole || null, source, ip
  });
};

const countRegradeRound = async (proposalId) => {
  const [rows] = await pool.query(
    `SELECT COALESCE(MAX(round_no), 0) AS n FROM proposal_requests
     WHERE proposal_id = ? AND request_type = 'RE_GRADE'`,
    [proposalId]
  );
  return Number(rows[0]?.n || 0) + 1;
};

const requestRegrade = async ({ user, id, reason, departments, ip }) => {
  const scope = await resolveReviewer(user);
  assertRole(scope, [REVIEW_ROLE.GDTTKD]);
  const proposal = await loadProposal(id);
  assertStatus(proposal, ['GDTTKD_EVALUATING']);
  if (Number(proposal.review_level) !== 1) throw err('Đề xuất không ở mức GĐTTKD xem xét', 400);
  assertRegion(scope, proposal);
  const cleanReason = requireReason(reason, 'Vui lòng nhập lý do yêu cầu đánh giá lại');
  const scoredDepartments = [
    ...(proposal.quy_hoach_score !== null && proposal.quy_hoach_score !== undefined ? ['QH'] : []),
    ...(proposal.phap_ly_score !== null && proposal.phap_ly_score !== undefined ? ['PL'] : [])
  ];
  const selectedDepartments = departments === undefined ? scoredDepartments : departments;
  const targets = [...new Set(Array.isArray(selectedDepartments) ? selectedDepartments : [])];
  if (targets.length === 0 || targets.some((department) => !['QH', 'PL'].includes(department))) {
    throw err('Không có phòng đã chấm điểm hợp lệ để yêu cầu chấm lại', 400);
  }
  if (targets.some((department) => !scoredDepartments.includes(department))) {
    throw err('Chỉ được yêu cầu chấm lại phòng đã có điểm', 400);
  }

  const transition = await require('./proposalLifecycle').transition(proposal.id, REGRADING_STATUS, {
    reason: cleanReason,
    actorId: user.id,
    actorRole: user.role,
    source: 'user',
    ip
  });

  await pool.query('UPDATE station_proposals SET review_level = 2 WHERE id = ?', [proposal.id]);
  await require('./proposalRequestService').closeRequests(proposal.id, ['RE_GRADE'], { resolvedBy: user.id });

  const round = await countRegradeRound(proposal.id);
  const requestService = require('./proposalRequestService');
  const targetDetails = {
    QH: { department: 'QH', title: 'Quy hoạch', role: REVIEW_ROLE.QH },
    PL: { department: 'PL', title: 'Pháp lý', role: REVIEW_ROLE.PL }
  };
  const requests = [];
  for (const department of targets) {
    const target = targetDetails[department];
    requests.push(await requestService.createRequest({
      proposalId: proposal.id,
      type: 'RE_GRADE',
      description: cleanReason,
      requestedBy: user.id,
      previousStatus: 'GDTTKD_EVALUATING',
      currentStatus: REGRADING_STATUS,
      targetDepartment: target.department,
      targetTitle: target.title,
      note: `Lần chấm lại: ${round}`,
      roundNo: round
    }));
  }

  await logReview({
    proposalId: proposal.id,
    action: 'review_regrade_requested',
    fromStatus: 'GDTTKD_EVALUATING',
    toStatus: REGRADING_STATUS,
    reason: cleanReason,
    changedFields: {
      review_level: { label: 'Mức độ xem xét', old: proposal.review_level ?? '', new: 2 },
      round_no: { label: 'Lần chấm lại', old: '', new: round },
      departments: { label: 'Phòng cần chấm lại', old: '', new: targets.join(', ') }
    },
    actorId: user.id,
    actorRole: user.role,
    ip
  });

  try {
    await require('./proposalLifecycle').notifyStepReceivers(proposal.id, REGRADING_STATUS, {
      actorId: user.id,
      reason: `${cleanReason} · Lần chấm lại: ${round}`
    });
  } catch (error) {
    console.error(`[ProposalNotifications] Failed to notify regrading recipients for proposal ${proposal.id}:`, error);
  }

  return { id: proposal.id, status: REGRADING_STATUS, review_level: 2, roundNo: round, requests, transition };
};

const toTgd = async ({ user, id, reason, ip }) => {
  const scope = await resolveReviewer(user);
  assertRole(scope, [REVIEW_ROLE.GDTTKD]);
  const proposal = await loadProposal(id);
  assertStatus(proposal, ['RE_GDTTKD_EVALUATING']);
  if (Number(proposal.review_level) !== 2) throw err('Đề xuất không ở mức GĐTTKD xem xét lại', 400);
  assertRegion(scope, proposal);
  const cleanReason = requireReason(reason, 'Vui lòng nhập lý do trình Tổng giám đốc');

  const transition = await require('./proposalLifecycle').transition(proposal.id, TGD_STATUS, {
    reason: cleanReason,
    actorId: user.id,
    actorRole: user.role,
    source: 'user',
    ip
  });

  await pool.query('UPDATE station_proposals SET review_level = 3 WHERE id = ?', [proposal.id]);
  await require('./proposalRequestService').closeRequests(proposal.id, ['RE_GRADE'], { resolvedBy: user.id });
  const request = await require('./proposalRequestService').createRequest({
    proposalId: proposal.id,
    type: 'TGD_REVIEW',
    description: cleanReason,
    requestedBy: user.id,
    previousStatus: 'RE_GDTTKD_EVALUATING',
    currentStatus: TGD_STATUS,
    targetTitle: 'Tổng Giám đốc',
    note: 'Trình Tổng giám đốc xem xét'
  });

  await logReview({
    proposalId: proposal.id,
    action: 'review_to_tgd',
    fromStatus: 'RE_GDTTKD_EVALUATING',
    toStatus: TGD_STATUS,
    reason: cleanReason,
    changedFields: {
      review_level: { label: 'Mức độ xem xét', old: proposal.review_level ?? '', new: 3 }
    },
    actorId: user.id,
    actorRole: user.role,
    ip
  });

  return { id: proposal.id, status: TGD_STATUS, review_level: 3, request, transition };
};

const cancelAtGdttkd = async ({ user, id, reason, ip }) => {
  const scope = await resolveReviewer(user);
  assertRole(scope, [REVIEW_ROLE.GDTTKD]);
  const proposal = await loadProposal(id);
  assertStatus(proposal, GDTTKD_STATUSES);
  const allowedGdttkdStatus = (proposal.status === 'GDTTKD_EVALUATING' && Number(proposal.review_level) === 1)
    || (proposal.status === 'RE_GDTTKD_EVALUATING' && Number(proposal.review_level) === 2);
  if (!allowedGdttkdStatus) throw err('Đề xuất không ở mức xem xét phù hợp để hủy', 400);
  assertRegion(scope, proposal);
  const cleanReason = requireReason(reason, 'Vui lòng nhập lý do hủy đề xuất');

  await require('./proposalRequestService').closeRequests(proposal.id, ['RE_GRADE'], {
    resolvedBy: user.id,
    status: 'CANCELLED'
  });
  const transition = await require('./proposalLifecycle').transition(proposal.id, 'CANCELLED', {
    reason: cleanReason,
    actorId: user.id,
    actorRole: user.role,
    source: 'user',
    ip
  });

  await logReview({
    proposalId: proposal.id,
    action: 'review_cancelled',
    fromStatus: proposal.status,
    toStatus: 'CANCELLED',
    reason: cleanReason,
    actorId: user.id,
    actorRole: user.role,
    ip
  });

  return { id: proposal.id, status: 'CANCELLED', review_level: proposal.review_level, transition };
};

const approveByTgd = async ({ user, id, reason, ip }) => {
  const scope = await resolveReviewer(user);
  assertRole(scope, [REVIEW_ROLE.TGD]);
  const proposal = await loadProposal(id);
  assertStatus(proposal, [TGD_STATUS]);
  if (Number(proposal.review_level) !== 3) throw err('Đề xuất không ở mức Tổng Giám đốc xem xét', 400);
  const cleanReason = requireReason(reason, 'Vui lòng nhập lý do duyệt đề xuất');
  const targetStatus = proposalGradingService.isNqDirectPayment(proposal.custom_data)
    ? 'PROPOSAL_REPORT_CREATING'
    : 'DESIGNING';

  await require('./proposalRequestService').closeRequests(proposal.id, ['TGD_REVIEW'], { resolvedBy: user.id });
  const transition = await require('./proposalLifecycle').transition(proposal.id, targetStatus, {
    reason: cleanReason,
    actorId: user.id,
    actorRole: user.role,
    source: 'user',
    ip
  });

  await logReview({
    proposalId: proposal.id,
    action: 'review_approved',
    fromStatus: TGD_STATUS,
    toStatus: targetStatus,
    reason: cleanReason,
    actorId: user.id,
    actorRole: user.role,
    ip
  });

  return { id: proposal.id, status: targetStatus, review_level: proposal.review_level, transition };
};

const rejectByTgd = async ({ user, id, reason, ip }) => {
  const scope = await resolveReviewer(user);
  assertRole(scope, [REVIEW_ROLE.TGD]);
  const proposal = await loadProposal(id);
  assertStatus(proposal, [TGD_STATUS]);
  if (Number(proposal.review_level) !== 3) throw err('Đề xuất không ở mức Tổng Giám đốc xem xét', 400);
  const cleanReason = requireReason(reason, 'Vui lòng nhập lý do không duyệt đề xuất');

  await require('./proposalRequestService').closeRequests(proposal.id, ['TGD_REVIEW'], {
    resolvedBy: user.id,
    status: 'CANCELLED'
  });
  const transition = await require('./proposalLifecycle').transition(proposal.id, 'CANCELLED', {
    reason: cleanReason,
    actorId: user.id,
    actorRole: user.role,
    source: 'user',
    ip
  });

  await logReview({
    proposalId: proposal.id,
    action: 'review_rejected',
    fromStatus: TGD_STATUS,
    toStatus: 'CANCELLED',
    reason: cleanReason,
    actorId: user.id,
    actorRole: user.role,
    ip
  });

  return { id: proposal.id, status: 'CANCELLED', review_level: proposal.review_level, transition };
};

exports.REVIEW_ROLE = REVIEW_ROLE;
exports.REVIEW_ROLE_LABELS = REVIEW_ROLE_LABELS;
exports.REVIEW_LEVEL_LABELS = REVIEW_LEVEL_LABELS;
exports.REGION_LABELS = REGION_LABELS;
exports.resolveRegion = resolveRegion;
exports.resolveRoleKey = resolveRoleKey;
exports.resolveReviewer = resolveReviewer;
exports.listReviews = listReviews;
exports.getReviewDetail = getReviewDetail;
exports.requestRegrade = requestRegrade;
exports.toTgd = toTgd;
exports.cancelAtGdttkd = cancelAtGdttkd;
exports.approveByTgd = approveByTgd;
exports.rejectByTgd = rejectByTgd;
