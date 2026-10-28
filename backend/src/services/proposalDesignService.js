const pool = require('../utils/db');
const dynamicUtils = require('./dynamicUtils');
const proposalGradingService = require('./proposalGradingService');

const { normalizeText, parseCustomData } = proposalGradingService;
const { normalizeFileEntries, toFileSummaries } = proposalGradingService;

const LAYOUT_ROLE = 'DESIGN';
const DESIGNING_STATUS = 'DESIGNING';
const WAITING_STATUS = 'INFOR_WAITING';
const REPORT_CREATING_STATUS = 'PROPOSAL_REPORT_CREATING';
const LAYOUT_FIELD = 'ban_ve_layout';
const SUPPLEMENT_REQUEST_TYPE = 'LAYOUT_SUPPLEMENT';

const TAB_STATUSES = {
  all: ['DESIGNING', 'INFOR_WAITING', 'PROPOSAL_REPORT_CREATING', 'PROPOSAL_REPORT_REVIEWING', 'SIGNATURE_PENDING', 'COMPLETED'],
  pending: ['DESIGNING'],
  waiting: ['INFOR_WAITING'],
  layout: ['PROPOSAL_REPORT_CREATING', 'PROPOSAL_REPORT_REVIEWING', 'SIGNATURE_PENDING', 'COMPLETED', 'CANCELLED']
};

const MANAGEABLE_STATUSES = [DESIGNING_STATUS, WAITING_STATUS];

const err = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const resolveDesignRole = (department) => {
  const dept = normalizeText(department);
  if (!dept) return null;
  if (dept.includes('cong nghe') || dept.includes('quy hoach') || dept.includes('quan he')) return LAYOUT_ROLE;
  return null;
};

const getUserProfile = async (userId) => {
  if (!userId) return { department: null };
  const [rows] = await pool.query('SELECT custom_data FROM users WHERE id = ? LIMIT 1', [userId]);
  const customData = rows.length > 0 ? parseCustomData(rows[0].custom_data) : {};
  return { department: customData.department || null, customData };
};

const resolveScope = async (user) => {
  const profile = await getUserProfile(user && user.id);
  const isAdmin = !!user && ['SUPER_ADMIN', 'ADMIN'].includes(user.role);
  const roleKey = isAdmin ? LAYOUT_ROLE : resolveDesignRole(profile.department);
  return { isAdmin, roleKey, department: profile.department, customData: profile.customData };
};

const assertCanManage = (scope) => {
  if (scope.isAdmin) return;
  if (scope.roleKey !== LAYOUT_ROLE) {
    throw err('Bạn không thuộc Phòng Công nghệ và Quy hoạch', 403);
  }
};

const mapLayoutRow = (row) => {
  const custom = parseCustomData(row.custom_data);
  const files = toFileSummaries(custom[LAYOUT_FIELD] ?? row[LAYOUT_FIELD]);
  const count = Number(row.supplement_request_count || 0);
  return {
    ...row,
    custom_data: custom,
    layout_files: files,
    has_layout: files.length > 0,
    supplement_request_count: Number.isFinite(count) ? count : 0,
    can_manage: MANAGEABLE_STATUSES.includes(row.status)
  };
};

exports.LAYOUT_ROLE = LAYOUT_ROLE;
exports.DESIGNING_STATUS = DESIGNING_STATUS;
exports.WAITING_STATUS = WAITING_STATUS;
exports.LAYOUT_FIELD = LAYOUT_FIELD;
exports.SUPPLEMENT_REQUEST_TYPE = SUPPLEMENT_REQUEST_TYPE;
exports.TAB_STATUSES = TAB_STATUSES;
exports.resolveDesignRole = resolveDesignRole;

exports.listProposals = async ({
  user,
  tab = 'all',
  search = '',
  page = 1,
  limit = 20,
  filters = {}
} = {}) => {
  const safeTab = Object.prototype.hasOwnProperty.call(TAB_STATUSES, tab) ? tab : 'all';
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 20));
  const offset = (safePage - 1) * safeLimit;
  const scope = await resolveScope(user);

  if (!scope.isAdmin && scope.roleKey !== LAYOUT_ROLE) {
    return {
      proposals: [],
      pagination: { page: safePage, limit: safeLimit, total: 0, totalPages: 0 },
      meta: { canManage: false, isAdmin: false, department: scope.department }
    };
  }

  const statuses = TAB_STATUSES[safeTab];
  const where = [];
  const params = [];

  const nonCancelled = statuses.filter((status) => status !== 'CANCELLED');
  if (nonCancelled.length > 0) {
    const placeholders = nonCancelled.map(() => '?').join(',');
    let clause = `p.status IN (${placeholders})`;
    params.push(...nonCancelled);
    if (statuses.includes('CANCELLED')) {
      clause = `(${clause} OR (p.status = 'CANCELLED' AND EXISTS (
        SELECT 1 FROM proposal_activity_logs l
        WHERE l.proposal_id = p.id AND l.action = 'layout_approved'
      )))`;
    }
    where.push(clause);
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
    const region = normalizeText(filters.region);
    const pattern = region.includes('bac') ? '%bac%'
      : region.includes('trung') ? '%trung%'
        : region.includes('nam') ? '%nam%' : null;
    if (pattern) {
      where.push("LOWER(CONVERT(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.vung_mien')) USING utf8mb4)) LIKE ?");
      params.push(pattern);
    }
  }
  if (filters.ownerUserId) {
    where.push('p.user_id = ?');
    params.push(Number(filters.ownerUserId));
  }
  if (filters.managerUserId) {
    const branchIds = await require('./adminUserService').getBranchIds(Number(filters.managerUserId));
    if (branchIds.length === 0) where.push('1 = 0');
    else {
      where.push(`p.user_id IN (${branchIds.map(() => '?').join(',')})`);
      params.push(...branchIds.map(Number));
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
            u.parent_id AS manager_user_id, manager.full_name AS manager_name,
            (SELECT COUNT(*) FROM proposal_requests r
              WHERE r.proposal_id = p.id AND r.request_type = ?) AS supplement_request_count
     FROM station_proposals p
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN users manager ON manager.id = u.parent_id
     ${whereClause}
     ORDER BY p.updated_at DESC, p.id DESC
     LIMIT ? OFFSET ?`,
    [SUPPLEMENT_REQUEST_TYPE, ...params, safeLimit, offset]
  );

  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const proposals = rows.map((row) => dynamicUtils.mergeData(row, fieldDefs)).map(mapLayoutRow);

  return {
    proposals,
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) },
    meta: { canManage: true, isAdmin: !!scope.isAdmin, department: scope.department }
  };
};

exports.getFilterOptions = async ({ user } = {}) => {
  const scope = await resolveScope(user);
  assertCanManage(scope);
  const statuses = TAB_STATUSES.all;
  const statusClause = `p.status IN (${statuses.map(() => '?').join(',')})`;
  const [owners] = await pool.query(
    `SELECT DISTINCT p.user_id AS id, u.full_name AS name,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.province')) AS province,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.mo_hinh_dau_tu')) AS model,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.vung_mien')) AS region
       FROM station_proposals p
       LEFT JOIN users u ON u.id = p.user_id
      WHERE p.user_id IS NOT NULL
        AND (${statusClause} OR (p.status = 'CANCELLED' AND EXISTS (
          SELECT 1 FROM proposal_activity_logs l
           WHERE l.proposal_id = p.id AND l.action = 'layout_approved'
        )))
      ORDER BY u.full_name`,
    statuses
  );
  const ownerIds = owners.map((owner) => Number(owner.id)).filter(Boolean);
  const managers = ownerIds.length > 0
    ? await pool.query(
      `WITH RECURSIVE user_chain AS (
         SELECT id, parent_id, 0 AS depth
           FROM users
          WHERE id IN (${ownerIds.map(() => '?').join(',')})
         UNION ALL
         SELECT parent.id, parent.parent_id, child.depth + 1
           FROM users parent
           JOIN user_chain child ON parent.id = child.parent_id
          WHERE child.depth < 20
       )
       SELECT DISTINCT u.id, u.full_name AS name
         FROM user_chain chain
         JOIN users u ON u.id = chain.id
        WHERE u.id NOT IN (${ownerIds.map(() => '?').join(',')})
        ORDER BY u.full_name`,
      [...ownerIds, ...ownerIds]
    ).then(([rows]) => rows)
    : [];
  const uniqueValues = (key) => [...new Set(owners.map((owner) => owner[key]).filter(Boolean))].sort();
  return {
    owners: owners.filter((owner) => owner.id).map(({ id, name }) => ({ id: Number(id), name })),
    managers,
    provinces: uniqueValues('province'),
    models: uniqueValues('model'),
    regions: uniqueValues('region')
  };
};

exports.getProposalDetail = async ({ user, id } = {}) => {
  const scope = await resolveScope(user);
  assertCanManage(scope);
  const proposalId = Number(id);
  if (!Number.isInteger(proposalId) || proposalId <= 0) {
    throw err('Đề xuất không hợp lệ', 400);
  }
  const statuses = TAB_STATUSES.all;
  const statusPlaceholders = statuses.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT p.*, p.ma_de_xuat_gen AS ma_de_xuat,
            u.full_name AS user_name, u.email AS user_email,
            u.parent_id AS manager_user_id, manager.full_name AS manager_name,
            (SELECT COUNT(*) FROM proposal_requests r
              WHERE r.proposal_id = p.id AND r.request_type = ?) AS supplement_request_count
       FROM station_proposals p
       LEFT JOIN users u ON u.id = p.user_id
       LEFT JOIN users manager ON manager.id = u.parent_id
      WHERE p.id = ?
        AND (p.status IN (${statusPlaceholders}) OR (p.status = 'CANCELLED' AND EXISTS (
          SELECT 1 FROM proposal_activity_logs l
           WHERE l.proposal_id = p.id AND l.action = 'layout_approved'
        )))
      LIMIT 1`,
    [SUPPLEMENT_REQUEST_TYPE, proposalId, ...statuses]
  );
  if (rows.length === 0) throw err('Không tìm thấy đề xuất trong phạm vi đánh giá layout', 404);

  const fieldDefinitions = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const proposal = mapLayoutRow(dynamicUtils.mergeData(rows[0], fieldDefinitions));
  const progress = await require('./proposalProgressService').getProgress(proposalId);
  return { proposal, fieldDefinitions, progress };
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

const assertStatus = (proposal, allowed) => {
  if (!allowed.includes(proposal.status)) {
    throw err('Đề xuất không ở trạng thái phù hợp để thực hiện thao tác này', 400);
  }
};

const requireText = (value, message) => {
  const text = String(value || '').trim();
  if (!text) throw err(message, 400);
  return text;
};

const findUsersByRole = async ({ roleKey, region = null }) => {
  const [rows] = await pool.query("SELECT id, role, custom_data FROM users WHERE status = 'ACTIVE'");
  const proposalReviewService = require('./proposalReviewService');
  const ids = [];
  for (const row of rows) {
    const custom = parseCustomData(row.custom_data);
    if (roleKey === LAYOUT_ROLE) {
      if (resolveDesignRole(custom.department)) ids.push(Number(row.id));
      continue;
    }
    const key = proposalReviewService.resolveRoleKey({
      role: row.role,
      department: custom.department,
      chucVu: custom.chuc_vu
    });
    if (key !== roleKey) continue;
    if (region) {
      const userRegion = proposalReviewService.resolveRegion(custom.department)
        || proposalReviewService.resolveRegion(custom.vung_mien);
      if (userRegion !== region) continue;
    }
    ids.push(Number(row.id));
  }
  if (ids.length === 0 && roleKey === 'GDTTKD' && !region) {
    const [admins] = await pool.query("SELECT id FROM users WHERE status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN')");
    admins.forEach((row) => ids.push(Number(row.id)));
  }
  return [...new Set(ids)];
};

const notifyUsers = async (userIds, { type, title, message, entityId, actorId }) => {
  if (!userIds || userIds.length === 0) return;
  const notificationService = require('./notificationService');
  for (const userId of userIds) {
    if (!userId || Number(userId) === Number(actorId)) continue;
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
    } catch { /* silent */ }
  }
};

const buildMessage = async (proposal, actorId, { status, actionLabel, reason }) => {
  const notificationService = require('./notificationService');
  const code = notificationService.proposalCode(proposal.custom_data, proposal.id);
  const actorName = (await notificationService.getUserName(actorId)) || 'Hệ thống';
  return notificationService.statusMessage({ code, actorName, status, actionLabel, reason });
};

const notifyDesignDepartment = async ({ proposal, actorId, type = 'DESIGNING', title, message }) => {
  const ids = await findUsersByRole({ roleKey: LAYOUT_ROLE });
  await notifyUsers(ids, { type, title, message, entityId: proposal.id, actorId });
};

const normalizeLayoutFiles = async (value) => {
  const entries = normalizeFileEntries(value);
  const ids = [];
  entries.forEach((entry) => {
    const raw = entry && typeof entry === 'object' ? (entry.id ?? entry.file_id) : entry;
    const fileId = Number(raw);
    if (Number.isInteger(fileId) && fileId > 0 && !ids.includes(fileId)) ids.push(fileId);
  });
  if (ids.length === 0) return [];
  const [rows] = await pool.query(
    `SELECT id, original_name, mime_type, size FROM files
     WHERE id IN (${ids.map(() => '?').join(',')}) AND status <> 'deleted'`,
    ids
  );
  const byId = new Map(rows.map((row) => [Number(row.id), row]));
  return ids.map((fileId) => byId.get(fileId)).filter(Boolean).map((row) => ({
    id: Number(row.id),
    original_name: row.original_name,
    mime_type: row.mime_type,
    size: row.size
  }));
};

exports.updateLayout = async ({ user, id, files, approve = false, ip } = {}) => {
  const scope = await resolveScope(user);
  assertCanManage(scope);
  const proposal = await loadProposal(id);
  assertStatus(proposal, [DESIGNING_STATUS]);

  const provided = files !== undefined;
  const layoutFiles = provided ? await normalizeLayoutFiles(files) : [];
  if (provided && layoutFiles.length === 0) {
    throw err('Vui lòng tải lên bản vẽ layout', 400);
  }

  const custom = parseCustomData(proposal.custom_data);
  const previous = toFileSummaries(custom[LAYOUT_FIELD]);
  const nextFiles = provided ? layoutFiles : previous.filter((file) => file.id).map((file) => ({
    id: Number(file.id),
    original_name: file.name,
    mime_type: file.mime_type,
    size: null
  }));

  if (approve && nextFiles.length === 0) {
    throw err('Vui lòng tải lên bản vẽ layout trước khi duyệt', 400);
  }

  const proposalLifecycle = require('./proposalLifecycle');
  if (provided) {
    const nextCustom = { ...custom, [LAYOUT_FIELD]: nextFiles };
    await pool.query('UPDATE station_proposals SET custom_data = ?, updated_at = NOW() WHERE id = ?', [
      JSON.stringify(nextCustom), proposal.id
    ]);
    await proposalLifecycle.logActivity({
      proposalId: proposal.id,
      action: 'layout_updated',
      fromStatus: proposal.status,
      toStatus: proposal.status,
      changedFields: {
        [LAYOUT_FIELD]: {
          label: 'Bản vẽ layout',
          old: previous.map((file) => file.name || file.id).join(', '),
          new: nextFiles.map((file) => file.original_name || file.id).join(', ')
        }
      },
      actorId: user.id,
      actorRole: user.role,
      source: 'user',
      ip
    });
  }

  let transition = null;
  if (approve) {
    await require('./proposalRequestService').closeRequests(proposal.id, [SUPPLEMENT_REQUEST_TYPE], { resolvedBy: user.id });
    transition = await proposalLifecycle.transition(proposal.id, REPORT_CREATING_STATUS, {
      reason: 'Đã duyệt bản vẽ layout',
      actorId: user.id,
      actorRole: user.role,
      source: 'user',
      ip
    });
    await proposalLifecycle.logActivity({
      proposalId: proposal.id,
      action: 'layout_approved',
      fromStatus: proposal.status,
      toStatus: REPORT_CREATING_STATUS,
      actorId: user.id,
      actorRole: user.role,
      source: 'user',
      ip
    });
  }

  return {
    id: proposal.id,
    status: transition ? transition.status : proposal.status,
    layout_files: nextFiles,
    approved: !!approve,
    transition
  };
};

const countSupplementRounds = async (proposalId) => {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS n FROM proposal_requests WHERE proposal_id = ? AND request_type = ?',
    [proposalId, SUPPLEMENT_REQUEST_TYPE]
  );
  return Number(rows[0]?.n || 0) + 1;
};

exports.requestSupplement = async ({ user, id, description, ip } = {}) => {
  const scope = await resolveScope(user);
  assertCanManage(scope);
  const proposal = await loadProposal(id);
  assertStatus(proposal, [DESIGNING_STATUS]);
  const cleanDescription = requireText(description, 'Vui lòng mô tả thông tin cần bổ sung');

  const transition = await require('./proposalLifecycle').transition(proposal.id, WAITING_STATUS, {
    reason: cleanDescription,
    actorId: user.id,
    actorRole: user.role,
    source: 'user',
    ip
  });

  const round = await countSupplementRounds(proposal.id);
  const request = await require('./proposalRequestService').createRequest({
    proposalId: proposal.id,
    type: SUPPLEMENT_REQUEST_TYPE,
    description: cleanDescription,
    requestedBy: user.id,
    previousStatus: DESIGNING_STATUS,
    currentStatus: WAITING_STATUS,
    targetUserId: proposal.user_id || null,
    targetTitle: 'Người đề xuất',
    note: `Lần yêu cầu bổ sung: ${round}`,
    roundNo: round
  });

  await require('./proposalLifecycle').logActivity({
    proposalId: proposal.id,
    action: 'layout_supplement_requested',
    fromStatus: DESIGNING_STATUS,
    toStatus: WAITING_STATUS,
    reason: cleanDescription,
    changedFields: {
      round_no: { label: 'Số lần yêu cầu bổ sung', old: round - 1, new: round }
    },
    actorId: user.id,
    actorRole: user.role,
    source: 'user',
    ip
  });

  return {
    id: proposal.id,
    status: WAITING_STATUS,
    roundNo: round,
    request,
    transition
  };
};

exports.cancelProposal = async ({ user, id, reason, ip } = {}) => {
  const scope = await resolveScope(user);
  assertCanManage(scope);
  const proposal = await loadProposal(id);
  assertStatus(proposal, MANAGEABLE_STATUSES);
  const cleanReason = requireText(reason, 'Vui lòng nhập lý do hủy đề xuất');

  await require('./proposalRequestService').closeRequests(proposal.id, [SUPPLEMENT_REQUEST_TYPE], {
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

  await require('./proposalLifecycle').logActivity({
    proposalId: proposal.id,
    action: 'layout_cancelled',
    fromStatus: proposal.status,
    toStatus: 'CANCELLED',
    reason: cleanReason,
    actorId: user.id,
    actorRole: user.role,
    source: 'user',
    ip
  });

  return { id: proposal.id, status: 'CANCELLED', transition };
};

exports.notifyInfoSupplemented = async ({ proposalId, actorId }) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, user_id, status, custom_data FROM station_proposals WHERE id = ?',
      [proposalId]
    );
    if (rows.length === 0) return;
    const proposal = rows[0];
    const message = await buildMessage(proposal, actorId, {
      status: DESIGNING_STATUS,
      actionLabel: 'Người đề xuất',
      reason: 'Đã bổ sung thông tin theo yêu cầu'
    });
    await notifyDesignDepartment({
      proposal,
      actorId,
      type: DESIGNING_STATUS,
      title: 'Đề xuất đã bổ sung thông tin, tiếp tục vẽ Layout',
      message
    });
  } catch { /* silent: khong chan luu de xuat */ }
};
