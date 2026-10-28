const pool = require('../utils/db');

const REQUEST_TYPES = ['UPDATE_INFO', 'SUPPLEMENT', 'LAYOUT_SUPPLEMENT', 'RE_GRADE', 'REVISE_BCDX', 'TGD_REVIEW', 'OTHER'];

const REQUEST_TYPE_LABELS = {
  UPDATE_INFO: 'Yêu cầu cập nhật thông tin',
  SUPPLEMENT: 'Yêu cầu bổ sung thông tin',
  LAYOUT_SUPPLEMENT: 'Yêu cầu bổ sung thông tin để vẽ layout',
  RE_GRADE: 'Yêu cầu chấm điểm lại',
  REVISE_BCDX: 'Yêu cầu sửa BCĐX',
  TGD_REVIEW: 'Trình Tổng giám đốc',
  OTHER: 'Yêu cầu khác'
};

const normalizeType = (type) => (REQUEST_TYPES.includes(type) ? type : 'UPDATE_INFO');

const err = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const parseCustomData = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
};

const loadUserById = async (userId) => {
  if (!userId) return null;
  const [rows] = await pool.query('SELECT id, role, status, parent_id, custom_data FROM users WHERE id = ?', [userId]);
  if (rows.length === 0) return null;
  const custom = parseCustomData(rows[0].custom_data);
  return {
    id: Number(rows[0].id),
    role: rows[0].role,
    parentId: rows[0].parent_id ? Number(rows[0].parent_id) : null,
    department: custom.department || null,
    chucVu: custom.chuc_vu || null,
    customData: custom
  };
};

const getReviewProfile = (user) => {
  const reviewService = require('./proposalReviewService');
  const roleKey = reviewService.resolveRoleKey({
    role: user?.role,
    department: user?.department,
    chucVu: user?.chucVu
  });
  return {
    roleKey,
    region: roleKey === reviewService.REVIEW_ROLE.GDTTKD
      ? reviewService.resolveRegion(user?.department) || reviewService.resolveRegion(user?.customData?.vung_mien)
      : null
  };
};

const regionPattern = (value) => {
  const region = require('./proposalReviewService').resolveRegion(value);
  return { Bac: '%bac%', Trung: '%trung%', Nam: '%nam%' }[region] || null;
};

// Cac loai yeu cau phu hop voi vai tro/phong ban cua mot nguoi dung
// (RE_GRADE -> QH/PL, LAYOUT_SUPPLEMENT -> CN&QH, REVISE_BCDX -> GDTTKD/Back Office, TGD_REVIEW -> TGĐ)
const assignedTypesForUser = (user) => {
  if (!user) return [];
  const reviewService = require('./proposalReviewService');
  const gradingService = require('./proposalGradingService');
  const reportService = require('./proposalReportService');
  const types = [];
  if (user.role === 'SUPER_ADMIN' || (user.role === 'ADMIN' && gradingService.resolveGradingRole(user.department))) {
    types.push('RE_GRADE');
  }
  const dept = gradingService.normalizeText(user.department);
  if (dept.includes('cong nghe') || dept.includes('quy hoach') || dept.includes('quan he')) types.push('LAYOUT_SUPPLEMENT');
  if (reportService.isBackOffice(user.department)) types.push('REVISE_BCDX');
  let roleKey = null;
  try {
    roleKey = reviewService.resolveRoleKey({ role: user.role, department: user.department, chucVu: user.chucVu });
  } catch { roleKey = null; }
  if (roleKey === reviewService.REVIEW_ROLE.GDTTKD && !types.includes('REVISE_BCDX')) types.push('REVISE_BCDX');
  if (roleKey === reviewService.REVIEW_ROLE.TGD) types.push('TGD_REVIEW');
  return types;
};

exports.REQUEST_TYPES = REQUEST_TYPES;
exports.REQUEST_TYPE_LABELS = REQUEST_TYPE_LABELS;
exports.assignedTypesForUser = assignedTypesForUser;
exports.loadUserById = loadUserById;

exports.createRequest = async ({
  proposalId,
  type = 'UPDATE_INFO',
  description = null,
  requestedBy = null,
  previousStatus = null,
  currentStatus = null,
  targetDepartment = null,
  targetTitle = null,
  targetUserId = null,
  note = null,
  roundNo = null
} = {}) => {
  if (!proposalId) return null;
  const requestType = normalizeType(type);
  let round = Number(roundNo);
  if (!Number.isInteger(round) || round < 1) {
    const [countRows] = await pool.query(
      'SELECT COUNT(*) AS n FROM proposal_requests WHERE proposal_id = ? AND request_type = ?',
      [proposalId, requestType]
    );
    round = Number(countRows[0]?.n || 0) + 1;
  }
  const [result] = await pool.query(
    `INSERT INTO proposal_requests
      (proposal_id, request_type, description, requested_by, previous_status, current_status,
       target_department, target_title, target_user_id, round_no, note, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')`,
    [
      proposalId,
      requestType,
      description ? String(description) : null,
      requestedBy ? Number(requestedBy) : null,
      previousStatus || null,
      currentStatus || null,
      targetDepartment || null,
      targetTitle || null,
      targetUserId ? Number(targetUserId) : null,
      round,
      note ? String(note) : null
    ]
  );
  return { id: result.insertId, roundNo: round };
};

exports.closeRequests = async (proposalId, types = null, { resolvedBy = null, status = 'DONE' } = {}) => {
  if (!proposalId) return 0;
  const params = [status === 'CANCELLED' ? 'CANCELLED' : 'DONE', resolvedBy ? Number(resolvedBy) : null, proposalId];
  let typeClause = '';
  const list = Array.isArray(types) ? types.filter((t) => REQUEST_TYPES.includes(t)) : [];
  if (list.length > 0) {
    typeClause = ` AND request_type IN (${list.map(() => '?').join(',')})`;
    params.push(...list);
  }
  const [result] = await pool.query(
    `UPDATE proposal_requests
     SET status = ?, resolved_by = ?, resolved_at = NOW()
     WHERE proposal_id = ? AND status = 'OPEN'${typeClause}`,
    params
  );
  return result.affectedRows || 0;
};

const scopeClause = (scope, params, workScope = 'all', user = null) => {
  if (!scope || !scope.role) return '';
  if (workScope === 'mine') return '';
  if (workScope === 'subordinates') return '';
  if (scope.role === 'SALES' || scope.role === 'NPP') {
    const ors = [];
    const ids = Array.isArray(scope.branchIds) ? scope.branchIds.map(Number) : [];
    const allowedIds = workScope === 'subordinates'
      ? ids.filter((id) => id !== Number(scope.userId))
      : ids;
    if (allowedIds.length > 0) {
      ors.push(`p.user_id IN (${allowedIds.map(() => '?').join(',')})`);
      params.push(...allowedIds);
    }
    if (workScope !== 'subordinates' && scope.userId) {
      ors.push('r.target_user_id = ?');
      params.push(Number(scope.userId));
    }
    if (workScope !== 'subordinates' && scope.region) {
      ors.push("LOWER(CONVERT(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.vung_mien')) USING utf8mb4)) LIKE ?");
      params.push(regionPattern(scope.region) || `%${String(scope.region).toLowerCase()}%`);
    }
    if (workScope === 'all' && user) {
      ors.push(requestAssignmentClause(user, params));
    }
    if (ors.length === 0) return ' AND 1 = 0';
    return ` AND (${ors.join(' OR ')})`;
  }
  if (scope.role === 'CTV') {
    if (workScope === 'subordinates') return ' AND 1 = 0';
    if (!scope.userId) return ' AND 1 = 0';
    params.push(Number(scope.userId));
    return ' AND p.user_id = ?';
  }
  return '';
};

const addProposalFilters = (where, params, filters = {}, dateField = 'p.created_at') => {
  if (filters.proposalStatus) {
    where.push('p.status = ?');
    params.push(filters.proposalStatus);
  }
  if (filters.model) {
    where.push("JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.mo_hinh_dau_tu')) = ?");
    params.push(filters.model);
  }
  if (filters.province) {
    where.push("JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.province')) = ?");
    params.push(filters.province);
  }
  if (filters.region) {
    const pattern = regionPattern(filters.region);
    if (pattern) {
      where.push("LOWER(CONVERT(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.vung_mien')) USING utf8mb4)) LIKE ?");
      params.push(pattern);
    } else {
      where.push("JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.vung_mien')) = ?");
      params.push(filters.region);
    }
  }
  if (filters.ownerUserId) {
    where.push('p.user_id = ?');
    params.push(Number(filters.ownerUserId));
  }
  if (filters.managerUserId) {
    const adminUserService = require('./adminUserService');
    return adminUserService.getBranchIds(Number(filters.managerUserId)).then((branchIds) => {
      if (branchIds.length === 0) where.push('1 = 0');
      else {
        where.push(`p.user_id IN (${branchIds.map(() => '?').join(',')})`);
        params.push(...branchIds.map(Number));
      }
      addDateFilters(where, params, filters, dateField);
    });
  }
  addDateFilters(where, params, filters, dateField);
  return Promise.resolve();
};

const addDateFilters = (where, params, filters, dateField) => {
  if (filters.dateFrom) {
    where.push(`${dateField} >= ?`);
    params.push(`${String(filters.dateFrom).slice(0, 10)} 00:00:00`);
  }
  if (filters.dateTo) {
    where.push(`${dateField} <= ?`);
    params.push(`${String(filters.dateTo).slice(0, 10)} 23:59:59`);
  }
};

const requestAssignmentClause = (user, params) => {
  const conditions = [];
  if (user?.id) {
    conditions.push('r.target_user_id = ?');
    params.push(Number(user.id));
    const assignedTypes = assignedTypesForUser(user);
    if (assignedTypes.length > 0) {
      const reviewProfile = getReviewProfile(user);
      const regularTypes = assignedTypes.filter((type) => !['REVISE_BCDX', 'RE_GRADE'].includes(type));
      if (regularTypes.length > 0) {
        conditions.push(`r.request_type IN (${regularTypes.map(() => '?').join(',')})`);
        params.push(...regularTypes);
      }
      if (assignedTypes.includes('RE_GRADE')) {
        const gradingRole = require('./proposalGradingService').resolveGradingRole(user.department);
        if (user.role === 'SUPER_ADMIN') {
          conditions.push("r.request_type = 'RE_GRADE'");
        } else if (gradingRole) {
          conditions.push("(r.request_type = 'RE_GRADE' AND (r.target_department = ? OR r.target_title = 'Hai phòng chấm điểm'))");
          params.push(gradingRole);
        }
      }
      if (assignedTypes.includes('REVISE_BCDX')) {
        if (reviewProfile.roleKey === 'GDTTKD' && reviewProfile.region) {
          conditions.push("(r.request_type = 'REVISE_BCDX' AND LOWER(CONVERT(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.vung_mien')) USING utf8mb4)) LIKE ?)");
          params.push(regionPattern(reviewProfile.region));
        } else {
          conditions.push("r.request_type = 'REVISE_BCDX'");
        }
      }
    }
  }
  return conditions.length > 0 ? `(${conditions.join(' OR ')})` : '1 = 0';
};

exports.listRequests = async ({
  status = 'OPEN', type = '', search = '', page = 1, limit = 10, scope = {},
  workScope = '', my = false, proposalStatus = '', model = '', province = '',
  region = '', ownerUserId = '', managerUserId = '', dateFrom = '', dateTo = ''
} = {}) => {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 10));
  const offset = (safePage - 1) * safeLimit;
  const where = [];
  const params = [];
  const normalizedWorkScope = workScope || (my ? 'mine' : 'all');
  const managerUser = scope.userId ? await loadUserById(scope.userId) : null;

  if (status && ['OPEN', 'DONE', 'CANCELLED'].includes(status)) {
    where.push('r.status = ?');
    params.push(status);
  }
  if (status === 'OPEN') where.push("p.status <> 'PAUSED'");
  if (type && REQUEST_TYPES.includes(type)) {
    where.push('r.request_type = ?');
    params.push(type);
  }
  if (search) {
    const like = `%${String(search).trim()}%`;
    where.push('(p.ma_de_xuat_gen LIKE ? OR u.full_name LIKE ? OR p.owner_name LIKE ? OR p.address LIKE ? OR p.tracking_code LIKE ? OR r.description LIKE ?)');
    params.push(like, like, like, like, like, like);
  }
  if (normalizedWorkScope === 'mine') {
    where.push(requestAssignmentClause(managerUser, params));
  } else if (normalizedWorkScope === 'subordinates') {
    if (!['SALES', 'NPP'].includes(scope.role) || !Array.isArray(scope.branchIds) || scope.branchIds.length < 2) {
      throw err('Bạn không có quyền xem công việc của cấp dưới', 403);
    }
  }
  await addProposalFilters(where, params, {
    proposalStatus, model, province, region, ownerUserId, managerUserId, dateFrom, dateTo
  }, 'r.created_at');

  const reviewProfile = managerUser ? getReviewProfile(managerUser) : {};
  const effectiveScope = {
    ...scope,
    region: reviewProfile.roleKey === 'GDTTKD' ? reviewProfile.region : null
  };
  const scoped = scopeClause(effectiveScope, params, normalizedWorkScope, managerUser);
  if (normalizedWorkScope === 'subordinates') {
    const ids = (scope.branchIds || []).map(Number).filter((id) => id !== Number(scope.userId));
    if (ids.length === 0) where.push('1 = 0');
    else {
      where.push(`p.user_id IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    }
  }
  const whereClause = `WHERE ${where.length > 0 ? where.join(' AND ') : '1 = 1'}${scoped}`;

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM proposal_requests r
     JOIN station_proposals p ON p.id = r.proposal_id
     LEFT JOIN users u ON u.id = p.user_id
     ${whereClause}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);

  const [rows] = await pool.query(
    `SELECT r.id, r.proposal_id, r.request_type, r.description, r.requested_by, r.target_user_id,
            r.previous_status, r.current_status, r.round_no, r.note, r.resolution_note, r.status,
            r.created_at, r.updated_at,
            p.ma_de_xuat_gen AS ma_de_xuat, p.user_id AS owner_id,
            p.status AS proposal_status, p.updated_at AS proposal_updated_at,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.mo_hinh_dau_tu')) AS mo_hinh_dau_tu,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.province')) AS province,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.vung_mien')) AS vung_mien,
            p.address AS address,
            u.full_name AS owner_name, u.parent_id AS manager_user_id,
            JSON_UNQUOTE(JSON_EXTRACT(u.custom_data, '$.department')) AS owner_department,
            manager.full_name AS manager_name,
            ru.full_name AS requested_by_name,
            tu.full_name AS target_user_name
     FROM proposal_requests r
     JOIN station_proposals p ON p.id = r.proposal_id
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN users manager ON manager.id = u.parent_id
     LEFT JOIN users ru ON ru.id = r.requested_by
     LEFT JOIN users tu ON tu.id = r.target_user_id
     ${whereClause}
     ORDER BY ${status === 'OPEN' ? 'r.created_at ASC, r.id ASC' : 'r.created_at DESC, r.id DESC'}
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );

  const branchIds = ['SALES', 'NPP'].includes(managerUser?.role)
    ? new Set((await require('./adminUserService').getBranchIds(managerUser.id)).map(Number))
    : new Set();
  const canManageOwner = (row) => {
    if (!managerUser || !row.owner_id) return false;
    if (managerUser.role === 'ADMIN') return false;
    if (Number(row.owner_id) === Number(managerUser.id)) return true;
    if (Number(row.target_user_id) !== Number(row.owner_id)) return false;
    if (branchIds.has(Number(row.owner_id))) return true;
    if (reviewProfile.roleKey === 'GDTTKD' && reviewProfile.region) {
      const proposalRegion = require('./proposalReviewService').resolveRegion(row.vung_mien);
      return proposalRegion === reviewProfile.region;
    }
    return false;
  };
  const requests = rows.map((row) => {
    const task = { ...row, proposal_custom_data: JSON.stringify({ vung_mien: row.vung_mien }) };
    const assigned = requestAssignedToUser(task, managerUser);
    const canManage = canManageOwner(row);
    const scoreTask = row.request_type === 'RE_GRADE';
    return {
      ...row,
      can_update: !scoreTask && (managerUser?.role === 'SUPER_ADMIN'
        || (managerUser?.role === 'ADMIN' && assigned)
        || (Number(row.target_user_id) === Number(row.owner_id) && canManage)),
      can_complete: !scoreTask && (managerUser?.role === 'SUPER_ADMIN'
        || assigned
        || (Number(row.target_user_id) === Number(row.owner_id) && canManage))
    };
  });

  return {
    requests,
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) }
  };
};

exports.getFilterOptions = async (scope = {}) => {
  const params = [];
  const visibility = [];
  if (['SALES', 'NPP'].includes(scope.role)) {
    const branchIds = Array.isArray(scope.branchIds) ? scope.branchIds.map(Number) : [];
    if (branchIds.length === 0) visibility.push('1 = 0');
    else {
      visibility.push(`p.user_id IN (${branchIds.map(() => '?').join(',')})`);
      params.push(...branchIds);
    }
    if (scope.region) {
      visibility.push("LOWER(CONVERT(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.vung_mien')) USING utf8mb4)) LIKE ?");
      params.push(regionPattern(scope.region) || `%${String(scope.region).toLowerCase()}%`);
    }
  } else if (scope.role === 'CTV') {
    visibility.push('p.user_id = ?');
    params.push(Number(scope.userId));
  }
  const scoped = visibility.length > 0 ? ` AND (${visibility.join(' OR ')})` : '';
  const [owners] = await pool.query(
    `SELECT DISTINCT p.user_id AS id, u.full_name AS name,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.province')) AS province,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.mo_hinh_dau_tu')) AS model,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.vung_mien')) AS region
       FROM station_proposals p
       LEFT JOIN users u ON u.id = p.user_id
      WHERE p.user_id IS NOT NULL${scoped}
      ORDER BY u.full_name`,
    params
  );
  const ownerIds = owners.map((owner) => Number(owner.id));
  const managerIds = ownerIds.length > 0
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
    managers: managerIds.map((manager) => ({ id: Number(manager.id), name: manager.name })),
    provinces: uniqueValues('province'),
    models: uniqueValues('model'),
    regions: uniqueValues('region')
  };
};

exports.getRequestById = async (id) => {
  const [rows] = await pool.query(
    `SELECT r.*, p.ma_de_xuat_gen AS ma_de_xuat, p.status AS proposal_status,
            p.user_id AS owner_id, p.custom_data AS proposal_custom_data,
            u.full_name AS owner_name
     FROM proposal_requests r
     JOIN station_proposals p ON p.id = r.proposal_id
     LEFT JOIN users u ON u.id = p.user_id
     WHERE r.id = ?`,
    [id]
  );
  return rows[0] || null;
};

const requestAssignedToUser = (request, user) => {
  if (!request || !user) return false;
  if (Number(request.target_user_id) === Number(user.id)) return true;
  const types = assignedTypesForUser(user);
  if (!types.includes(request.request_type)) return false;
  if (request.request_type === 'RE_GRADE') {
    if (user.role === 'SUPER_ADMIN') return true;
    if (user.role !== 'ADMIN') return false;
    const gradingRole = require('./proposalGradingService').resolveGradingRole(user.department);
    return !!gradingRole
      && (request.target_department === gradingRole || request.target_title === 'Hai phòng chấm điểm');
  }
  if (request.request_type === 'REVISE_BCDX') {
    const reviewProfile = getReviewProfile(user);
    if (reviewProfile.roleKey === 'GDTTKD' && reviewProfile.region) {
      const proposalRegion = require('./proposalReviewService').resolveRegion(
        parseCustomData(request.proposal_custom_data).vung_mien
      );
      return proposalRegion === reviewProfile.region;
    }
  }
  return true;
};

const canManageProposalOwner = async (user, request) => {
  if (!user || !request || !request.owner_id) return false;
  const ownerId = Number(request.owner_id);
  if (Number(user.id) === ownerId) return true;
  if (user.role === 'SUPER_ADMIN') return true;
  const profile = await loadUserById(user.id);
  if (!profile) return false;
  if (profile.role === 'ADMIN') return requestAssignedToUser(request, profile);
  const targetUserId = Number(request.target_user_id);
  if (targetUserId !== ownerId) return false;

  const ancestors = await require('./adminUserService').getAncestorIds(ownerId);
  if (ancestors.includes(Number(user.id))) return true;

  const reviewProfile = getReviewProfile(profile);
  if (reviewProfile.roleKey === 'GDTTKD' && reviewProfile.region) {
    const proposalRegion = require('./proposalReviewService').resolveRegion(
      parseCustomData(request.proposal_custom_data).vung_mien
    );
    return proposalRegion === reviewProfile.region;
  }
  return false;
};

const canActOnRequest = async (user, request) => {
  if (!user || !request) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  if (requestAssignedToUser(request, await loadUserById(user.id))) return true;
  if (Number(request.target_user_id) === Number(request.owner_id)) {
    return canManageProposalOwner(user, request);
  }
  return false;
};

const canUpdateProposalForRequest = async (user, request) => {
  if (!user || !request) return false;
  if (!['SUPPLEMENT', 'UPDATE_INFO', 'LAYOUT_SUPPLEMENT', 'REVISE_BCDX'].includes(request.request_type)) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.role === 'ADMIN') return requestAssignedToUser(request, await loadUserById(user.id));
  if (Number(request.target_user_id) !== Number(request.owner_id)) return false;
  return canManageProposalOwner(user, request);
};

exports.canManageProposalOwner = canManageProposalOwner;
exports.canActOnRequest = canActOnRequest;
exports.canUpdateProposalForRequest = canUpdateProposalForRequest;

exports.getRequestContext = async (id, user) => {
  const request = await exports.getRequestById(id);
  if (!request) throw err('Không tìm thấy yêu cầu', 404);
  if (!await canActOnRequest(user, request)) throw err('Bạn không có quyền xem yêu cầu này', 403);
  if (request.status !== 'OPEN') throw err('Yêu cầu không còn mở', 400);
  return request;
};

// Danh dấu yêu cầu đã hoàn thành (kèm ghi chú kết quả)
exports.completeRequest = async (id, { user = null, resolutionNote = null } = {}) => {
  const request = await exports.getRequestById(id);
  if (!request) throw err('Không tìm thấy yêu cầu', 404);
  if (request.status !== 'OPEN') throw err('Yêu cầu đã được xử lý trước đó', 400);
  if (request.proposal_status === 'PAUSED') throw err('Đề xuất đang tạm dừng; không thể hoàn thành yêu cầu trước khi tiếp tục', 400);
  if (!user) throw err('Chưa xác thực', 401);
  if (!await canActOnRequest(user, request)) throw err('Bạn không phải người nhận công việc của yêu cầu này', 403);
  if (request.request_type === 'RE_GRADE') throw err('Yêu cầu chấm lại chỉ được hoàn thành khi phòng nhập điểm mới', 400);

  const cleanNote = String(resolutionNote || '').trim();
  if (!cleanNote) throw err('Vui lòng nhập ghi chú kết quả xử lý', 400);

  await pool.query(
    `UPDATE proposal_requests
     SET status = 'DONE', resolved_by = ?, resolved_at = NOW(), resolution_note = ?
     WHERE id = ?`,
    [user.id, cleanNote, id]
  );
  try {
    await require('./proposalLifecycle').logActivity({
      proposalId: request.proposal_id,
      action: 'request_completed',
      fromStatus: request.current_status || null,
      toStatus: request.current_status || null,
      changedFields: {
        request: { label: 'Yêu cầu', old: '', new: REQUEST_TYPE_LABELS[request.request_type] || request.request_type },
        resolution_note: { label: 'Kết quả', old: '', new: cleanNote }
      },
      actorId: user.id,
      actorRole: user.role || null,
      source: 'user'
    });
  } catch { /* silent */ }
  return { id: Number(id), status: 'DONE', resolution_note: cleanNote, resolved_by: Number(user.id) };
};
