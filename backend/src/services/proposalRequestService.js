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
  const [rows] = await pool.query('SELECT id, role, status, custom_data FROM users WHERE id = ?', [userId]);
  if (rows.length === 0) return null;
  const custom = parseCustomData(rows[0].custom_data);
  return {
    id: Number(rows[0].id),
    role: rows[0].role,
    department: custom.department || null,
    chucVu: custom.chuc_vu || null
  };
};

// Cac loai yeu cau phu hop voi vai tro/phong ban cua mot nguoi dung
// (RE_GRADE -> QH/PL, LAYOUT_SUPPLEMENT -> CN&QH, REVISE_BCDX -> GDTTKD/Back Office, TGD_REVIEW -> TGĐ)
const assignedTypesForUser = (user) => {
  if (!user) return [];
  const reviewService = require('./proposalReviewService');
  const gradingService = require('./proposalGradingService');
  const reportService = require('./proposalReportService');
  const types = [];
  if (gradingService.resolveGradingRole(user.department)) types.push('RE_GRADE');
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

const scopeClause = (scope, params) => {
  if (!scope || !scope.role) return '';
  if (scope.role === 'SALES') {
    const ors = [];
    if (Array.isArray(scope.branchIds) && scope.branchIds.length > 0) {
      ors.push(`p.user_id IN (${scope.branchIds.map(() => '?').join(',')})`);
      params.push(...scope.branchIds.map(Number));
    }
    if (scope.userId) {
      ors.push('r.target_user_id = ?');
      params.push(Number(scope.userId));
    }
    if (ors.length === 0) return ' AND 1 = 0';
    return ` AND (${ors.join(' OR ')})`;
  }
  if (scope.role === 'CTV' || scope.role === 'NPP') {
    if (!scope.userId) return ' AND 1 = 0';
    params.push(Number(scope.userId));
    return ' AND p.user_id = ?';
  }
  return '';
};

exports.listRequests = async ({ status = 'OPEN', type = '', search = '', page = 1, limit = 10, scope = {}, my = false } = {}) => {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 10));
  const offset = (safePage - 1) * safeLimit;
  const where = [];
  const params = [];

  if (status && ['OPEN', 'DONE', 'CANCELLED'].includes(status)) {
    where.push('r.status = ?');
    params.push(status);
  }
  if (type && REQUEST_TYPES.includes(type)) {
    where.push('r.request_type = ?');
    params.push(type);
  }
  if (search) {
    const like = `%${String(search).trim()}%`;
    where.push('(p.ma_de_xuat_gen LIKE ? OR u.full_name LIKE ? OR r.description LIKE ?)');
    params.push(like, like, like);
  }
  const scoped = scopeClause(scope, params);
  if (my && scope.userId) {
    const me = await loadUserById(scope.userId);
    if (me) {
      const conds = ['r.target_user_id = ?'];
      params.push(me.id);
      const assignedTypes = assignedTypesForUser(me);
      if (assignedTypes.length > 0) {
        conds.push(`r.request_type IN (${assignedTypes.map(() => '?').join(',')})`);
        params.push(...assignedTypes);
      }
      where.push(`(${conds.join(' OR ')})`);
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
    `SELECT r.id, r.proposal_id, r.request_type, r.description, r.requested_by,
            r.previous_status, r.current_status, r.round_no, r.note, r.resolution_note, r.status,
            r.created_at, r.updated_at,
            p.ma_de_xuat_gen AS ma_de_xuat, p.user_id AS owner_id,
            p.status AS proposal_status, p.updated_at AS proposal_updated_at,
            u.full_name AS owner_name,
            ru.full_name AS requested_by_name,
            tu.full_name AS target_user_name
     FROM proposal_requests r
     JOIN station_proposals p ON p.id = r.proposal_id
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN users ru ON ru.id = r.requested_by
     LEFT JOIN users tu ON tu.id = r.target_user_id
     ${whereClause}
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );

  return {
    requests: rows,
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) }
  };
};

exports.getRequestById = async (id) => {
  const [rows] = await pool.query(
    `SELECT r.*, p.ma_de_xuat_gen AS ma_de_xuat, p.status AS proposal_status, u.full_name AS owner_name
     FROM proposal_requests r
     JOIN station_proposals p ON p.id = r.proposal_id
     LEFT JOIN users u ON u.id = p.user_id
     WHERE r.id = ?`,
    [id]
  );
  return rows[0] || null;
};

// Danh dấu yêu cầu đã hoàn thành (kèm ghi chú kết quả)
exports.completeRequest = async (id, { user = null, resolutionNote = null } = {}) => {
  const request = await exports.getRequestById(id);
  if (!request) throw err('Không tìm thấy yêu cầu', 404);
  if (request.status !== 'OPEN') throw err('Yêu cầu đã được xử lý trước đó', 400);
  if (!user) throw err('Chưa xác thực', 401);
  if (['CTV', 'NPP', 'MKT'].includes(user.role)) throw err('Bạn không có quyền cập nhật yêu cầu này', 403);

  let allowed = ['ADMIN', 'SUPER_ADMIN'].includes(user.role);
  if (!allowed && Number(request.target_user_id) === Number(user.id)) allowed = true;
  if (!allowed) allowed = assignedTypesForUser(
    await loadUserById(user.id)
  ).includes(request.request_type);
  if (!allowed) throw err('Bạn không phải người nhận công việc của yêu cầu này', 403);

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

