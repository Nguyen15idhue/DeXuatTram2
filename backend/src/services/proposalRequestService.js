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

exports.REQUEST_TYPES = REQUEST_TYPES;
exports.REQUEST_TYPE_LABELS = REQUEST_TYPE_LABELS;

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

exports.listRequests = async ({ status = 'OPEN', type = '', search = '', page = 1, limit = 10, scope = {} } = {}) => {
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
            r.previous_status, r.current_status, r.round_no, r.note, r.status,
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
