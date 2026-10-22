const pool = require('../utils/db');
const dynamicUtils = require('./dynamicUtils');
const proposalGradingService = require('./proposalGradingService');

const { normalizeText, parseCustomData, normalizeFileEntries, toFileSummaries } = proposalGradingService;

const CREATING_STATUS = 'PROPOSAL_REPORT_CREATING';
const RE_CREATING_STATUS = 'PROPOSAL_REPORT_RE_CREATING';
const REVIEWING_STATUS = 'PROPOSAL_REPORT_REVIEWING';
const UPDATING_STATUS = 'PROPOSAL_REPORT_UPDATING';
const SIGNATURE_STATUS = 'SIGNATURE_PENDING';
const COMPLETED_STATUS = 'COMPLETED';
const CANCELLED_STATUS = 'CANCELLED';

const TAB_STATUSES = {
  all: [
    CREATING_STATUS, RE_CREATING_STATUS, UPDATING_STATUS, REVIEWING_STATUS,
    SIGNATURE_STATUS, COMPLETED_STATUS, CANCELLED_STATUS
  ],
  pending: [CREATING_STATUS, RE_CREATING_STATUS, UPDATING_STATUS],
  completed: [REVIEWING_STATUS, SIGNATURE_STATUS, COMPLETED_STATUS, CANCELLED_STATUS]
};

const REPORT_FIELD = 'file_bc_dx';
const LAYOUT_FIELD = 'ban_ve_layout';
const REVISION_REQUEST_TYPE = 'REVISE_BCDX';
const UPDATE_INFO_REQUEST_TYPE = 'UPDATE_INFO';
const CLOSED_ON_UPLOAD_TYPES = [REVISION_REQUEST_TYPE, UPDATE_INFO_REQUEST_TYPE];

const err = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const isBackOffice = (department) => {
  const dept = normalizeText(department);
  return !!dept && (dept.includes('back office') || dept.includes('backoffice'));
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

const resolveScope = async (user) => {
  const proposalReviewService = require('./proposalReviewService');
  const profile = await getUserProfile(user && user.id);
  const isAdmin = !!user && ['SUPER_ADMIN', 'ADMIN'].includes(user.role);
  const roleKey = proposalReviewService.resolveRoleKey({
    role: user && user.role,
    department: profile.department,
    chucVu: profile.chucVu
  });
  const region = roleKey === 'GDTTKD'
    ? (proposalReviewService.resolveRegion(profile.department)
      || proposalReviewService.resolveRegion(profile.customData.vung_mien))
    : null;
  return {
    userId: user && user.id,
    role: user && user.role,
    isAdmin,
    isBackOffice: isBackOffice(profile.department),
    roleKey,
    region,
    department: profile.department,
    chucVu: profile.chucVu,
    customData: profile.customData
  };
};

const scopeClause = async (scope, params) => {
  if (scope.isAdmin || scope.isBackOffice) return '';
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

const mapReportRow = (row) => {
  const custom = parseCustomData(row.custom_data);
  const reportFiles = toFileSummaries(custom[REPORT_FIELD] ?? row[REPORT_FIELD]);
  const layoutFiles = toFileSummaries(custom[LAYOUT_FIELD] ?? row[LAYOUT_FIELD]);
  const taskDescription = row.task_description || null;
  return {
    ...row,
    custom_data: custom,
    report_files: reportFiles,
    layout_files: layoutFiles,
    has_report: reportFiles.length > 0,
    has_layout: layoutFiles.length > 0,
    task_description: taskDescription,
    revision_request_count: Number(row.revision_request_count || 0),
    quy_hoach_score: row.quy_hoach_score === null || row.quy_hoach_score === undefined ? null : Number(row.quy_hoach_score),
    phap_ly_score: row.phap_ly_score === null || row.phap_ly_score === undefined ? null : Number(row.phap_ly_score)
  };
};

exports.CREATING_STATUS = CREATING_STATUS;
exports.RE_CREATING_STATUS = RE_CREATING_STATUS;
exports.REVIEWING_STATUS = REVIEWING_STATUS;
exports.UPDATING_STATUS = UPDATING_STATUS;
exports.REPORT_FIELD = REPORT_FIELD;
exports.REVISION_REQUEST_TYPE = REVISION_REQUEST_TYPE;
exports.UPDATE_INFO_REQUEST_TYPE = UPDATE_INFO_REQUEST_TYPE;
exports.TAB_STATUSES = TAB_STATUSES;
exports.resolveScope = resolveScope;
exports.isBackOffice = isBackOffice;

exports.listProposals = async ({ user, tab = 'all', search = '', page = 1, limit = 10 } = {}) => {
  const safeTab = Object.prototype.hasOwnProperty.call(TAB_STATUSES, tab) ? tab : 'all';
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 10));
  const offset = (safePage - 1) * safeLimit;
  const scope = await resolveScope(user);
  const statuses = TAB_STATUSES[safeTab];

  const where = [`p.status IN (${statuses.map(() => '?').join(',')})`];
  const params = [...statuses];

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
            (SELECT COUNT(*) FROM proposal_requests r
              WHERE r.proposal_id = p.id AND r.request_type = ?) AS revision_request_count,
            (SELECT r.description FROM proposal_requests r
              WHERE r.proposal_id = p.id AND r.request_type IN (?, ?) AND r.status = 'OPEN'
              ORDER BY r.id DESC LIMIT 1) AS task_description
     FROM station_proposals p
     LEFT JOIN users u ON u.id = p.user_id
     ${whereClause}
     ORDER BY p.updated_at DESC, p.id DESC
     LIMIT ? OFFSET ?`,
    [REVISION_REQUEST_TYPE, REVISION_REQUEST_TYPE, UPDATE_INFO_REQUEST_TYPE, ...params, safeLimit, offset]
  );

  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const proposals = rows.map((row) => dynamicUtils.mergeData(row, fieldDefs)).map(mapReportRow);

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

const loadProposal = async (id) => {
  const proposalId = Number(id);
  if (!Number.isInteger(proposalId) || proposalId <= 0) throw err('Đề xuất không hợp lệ', 400);
  const [rows] = await pool.query(
    'SELECT id, user_id, status, owner_name, custom_data, chot_so_luong_tru, tong_gia_tri_chot FROM station_proposals WHERE id = ?',
    [proposalId]
  );
  if (rows.length === 0) throw err('Không tìm thấy đề xuất', 404);
  return rows[0];
};

const proposalRegion = (customData) => {
  const proposalReviewService = require('./proposalReviewService');
  return proposalReviewService.resolveRegion(parseCustomData(customData).vung_mien);
};

const assertCanUpload = async (scope, proposal) => {
  if (scope.isAdmin) return;
  if (Number(proposal.user_id) === Number(scope.userId)) return;
  if (scope.roleKey === 'GDTTKD') {
    const region = proposalRegion(proposal.custom_data);
    if (scope.region && region && region !== scope.region) {
      throw err('Đề xuất không thuộc khu vực của bạn', 403);
    }
    return;
  }
  throw err('Bạn không có quyền tải tờ trình BCĐX cho đề xuất này', 403);
};

const assertCanReview = (scope) => {
  if (scope.isAdmin || scope.isBackOffice) return;
  throw err('Chỉ Back Office hoặc Admin được duyệt BCĐX', 403);
};

const normalizeReportFiles = async (value) => {
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

const notificationService = require('./notificationService');

const notifyUsers = async (userIds, { type, title, message, entityId, actorId }) => {
  if (!userIds || userIds.length === 0) return;
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

const findUsersByDepartment = async (keyword) => {
  const [rows] = await pool.query("SELECT id, role, custom_data FROM users WHERE status = 'ACTIVE'");
  const ids = rows
    .filter((row) => {
      const custom = parseCustomData(row.custom_data);
      const dept = normalizeText(custom.department);
      return !!dept && dept.includes(keyword);
    })
    .map((row) => Number(row.id));
  return [...new Set(ids)];
};

const findAdminIds = async () => {
  const [rows] = await pool.query("SELECT id FROM users WHERE status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN')");
  return rows.map((row) => Number(row.id));
};

const notifyBackOffice = async ({ proposal, actorId, message, type = 'PROPOSAL_REPORT_REVIEWING' }) => {
  let ids = await findUsersByDepartment('back office');
  if (ids.length === 0) ids = await findAdminIds();
  await notifyUsers(ids, {
    type,
    title: 'Đề xuất cần duyệt tờ trình BCĐX',
    message,
    entityId: proposal.id,
    actorId
  });
};

const findGdttkdIdsByRegion = async (region) => {
  const proposalReviewService = require('./proposalReviewService');
  const [rows] = await pool.query("SELECT id, role, custom_data FROM users WHERE status = 'ACTIVE'");
  const ids = [];
  rows.forEach((row) => {
    const custom = parseCustomData(row.custom_data);
    const key = proposalReviewService.resolveRoleKey({
      role: row.role,
      department: custom.department,
      chucVu: custom.chuc_vu
    });
    if (key !== 'GDTTKD') return;
    if (region) {
      const userRegion = proposalReviewService.resolveRegion(custom.department)
        || proposalReviewService.resolveRegion(custom.vung_mien);
      if (userRegion !== region) return;
    }
    ids.push(Number(row.id));
  });
  return [...new Set(ids)];
};

const findGdttkdAncestorIds = async (userId) => {
  const adminUserService = require('./adminUserService');
  const proposalReviewService = require('./proposalReviewService');
  const ancestorIds = await adminUserService.getAncestorIds(userId);
  if (!ancestorIds || ancestorIds.length === 0) return [];
  const [rows] = await pool.query(
    `SELECT id, role, custom_data FROM users WHERE id IN (${ancestorIds.map(() => '?').join(',')})`,
    ancestorIds
  );
  return rows
    .filter((row) => proposalReviewService.resolveRoleKey({
      role: row.role,
      department: parseCustomData(row.custom_data).department,
      chucVu: parseCustomData(row.custom_data).chuc_vu
    }) === 'GDTTKD')
    .map((row) => Number(row.id));
};

const buildMessage = async (proposal, actorId, { status, actionLabel, reason }) => {
  const code = notificationService.proposalCode(proposal.custom_data, proposal.id);
  const actorName = (await notificationService.getUserName(actorId)) || 'Hệ thống';
  return notificationService.statusMessage({ code, actorName, status, actionLabel, reason });
};

exports.findGdttkdAncestorIds = findGdttkdAncestorIds;
exports.findGdttkdIdsByRegion = findGdttkdIdsByRegion;

const TRU_LIST_ID = 18;
const INVESTMENT_MODELS = new Set(['TDT', 'LK', 'NQ', 'NQ_LK']);

const loadTruPrices = async () => {
  const [rows] = await pool.query(
    'SELECT data FROM data_list_rows WHERE list_id = ?',
    [TRU_LIST_ID]
  );
  const map = new Map();
  rows.forEach((row) => {
    const data = typeof row.data === 'string' ? parseCustomData(row.data) : (row.data || {});
    const ten = data.ten;
    if (!ten || data.gia === null || data.gia === undefined || data.gia === '') return;
    const gia = Number(data.gia);
    if (Number.isFinite(gia)) map.set(String(ten), gia);
  });
  return map;
};

const normalizeChotRows = (rows, prices) => {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length > 50) throw err('Số lượng dòng trụ chốt không được vượt quá 50', 400);
  const result = [];
  list.forEach((item, index) => {
    const row = item && typeof item === 'object' ? item : {};
    const moHinh = String(row.mo_hinh || '').trim();
    if (!INVESTMENT_MODELS.has(moHinh)) {
      throw err(`Dòng ${index + 1}: thiếu mô hình liên kết`, 400);
    }
    const soLuong = Number(row.so_luong);
    if (!Number.isInteger(soLuong) || soLuong <= 0) {
      throw err(`Dòng ${index + 1}: số lượng trụ chốt không hợp lệ`, 400);
    }
    const loaiTru = String(row.loai_tru || '').trim();
    if (!loaiTru) {
      throw err(`Dòng ${index + 1}: thiếu loại trụ`, 400);
    }
    const giaChot = prices.get(loaiTru);
    if (giaChot === undefined || !Number.isFinite(giaChot) || giaChot < 0) {
      throw err(`Dòng ${index + 1}: thiếu giá chốt cho loại trụ "${loaiTru}"`, 400);
    }
    result.push({
      mo_hinh: moHinh,
      so_luong: soLuong,
      loai_tru: loaiTru,
      gia_chot: giaChot,
      thanh_tien: soLuong * giaChot
    });
  });
  return result;
};

const sumChotTotal = (rows) => rows.reduce((sum, row) => sum + (Number(row.thanh_tien) || 0), 0);

exports.uploadReport = async ({ user, id, files, chotSoLuongTru, ip } = {}) => {
  const scope = await resolveScope(user);
  const proposal = await loadProposal(id);
  if (![CREATING_STATUS, RE_CREATING_STATUS, UPDATING_STATUS].includes(proposal.status)) {
    throw err('Đề xuất không ở trạng thái lập tờ trình BCĐX', 400);
  }
  await assertCanUpload(scope, proposal);

  const reportFiles = await normalizeReportFiles(files);
  if (reportFiles.length === 0) {
    throw err('Vui lòng tải lên file tờ trình BCĐX', 400);
  }

  const prices = await loadTruPrices();
  const chotRows = normalizeChotRows(chotSoLuongTru, prices);
  if (chotRows.length === 0) {
    throw err('Vui lòng nhập số lượng trụ chốt (mô hình liên kết, số lượng, loại trụ, giá chốt)', 400);
  }
  const totalValue = sumChotTotal(chotRows);

  const custom = parseCustomData(proposal.custom_data);
  const previous = toFileSummaries(custom[REPORT_FIELD]);
  if ([RE_CREATING_STATUS, UPDATING_STATUS].includes(proposal.status)) {
    const existingFileIds = new Set(previous.map((file) => Number(file.id)).filter(Number.isFinite));
    if (!reportFiles.some((file) => !existingFileIds.has(Number(file.id)))) {
      throw err('Vui lòng tải lên file BCĐX mới theo yêu cầu cập nhật', 400);
    }
  }
  const previousChotRows = Array.isArray(proposal.chot_so_luong_tru)
    ? proposal.chot_so_luong_tru
    : parseCustomData(proposal.chot_so_luong_tru);
  const previousTotal = proposal.tong_gia_tri_chot;
  const nextCustom = { ...custom, [REPORT_FIELD]: reportFiles };

  await pool.query(
    `UPDATE station_proposals
     SET custom_data = ?, chot_so_luong_tru = ?, tong_gia_tri_chot = ?, updated_at = NOW()
     WHERE id = ?`,
    [JSON.stringify(nextCustom), JSON.stringify(chotRows), totalValue, proposal.id]
  );

  const proposalLifecycle = require('./proposalLifecycle');
  await proposalLifecycle.logActivity({
    proposalId: proposal.id,
    action: 'report_uploaded',
    fromStatus: proposal.status,
    toStatus: proposal.status,
    changedFields: {
      [REPORT_FIELD]: {
        label: 'Tờ trình BCĐX',
        old: previous.map((file) => file.name || file.id).join(', '),
        new: reportFiles.map((file) => file.original_name || file.id).join(', ')
      },
      chot_so_luong_tru: {
        label: 'Số lượng trụ chốt',
        old: Array.isArray(previousChotRows)
          ? previousChotRows.map((row) => `${row.mo_hinh}_${row.so_luong} ${row.loai_tru}`).join(' + ')
          : '',
        new: chotRows.map((row) => `${row.mo_hinh}_${row.so_luong} ${row.loai_tru}`).join(' + ')
      },
      tong_gia_tri_chot: {
        label: 'Tổng giá trị chốt',
        old: previousTotal === null || previousTotal === undefined ? '' : String(previousTotal),
        new: String(totalValue)
      }
    },
    actorId: user.id,
    actorRole: user.role,
    source: 'user',
    ip
  });

  await require('./proposalRequestService').closeRequests(
    proposal.id,
    CLOSED_ON_UPLOAD_TYPES,
    { resolvedBy: user.id }
  );

  const transition = await proposalLifecycle.transition(proposal.id, REVIEWING_STATUS, {
    reason: 'Đã tải lên tờ trình BCĐX',
    actorId: user.id,
    actorRole: user.role,
    source: 'user',
    ip
  });

  const message = await buildMessage(proposal, user.id, {
    status: REVIEWING_STATUS,
    actionLabel: 'Người lập tờ trình',
    reason: 'Đã tải lên tờ trình BCĐX'
  });
  await notifyBackOffice({ proposal, actorId: user.id, message });

  return {
    id: proposal.id,
    status: REVIEWING_STATUS,
    report_files: reportFiles,
    chot_so_luong_tru: chotRows,
    tong_gia_tri_chot: totalValue,
    transition
  };
};

exports.requestRevision = async ({ user, id, description, ip } = {}) => {
  const scope = await resolveScope(user);
  assertCanReview(scope);
  const proposal = await loadProposal(id);
  if (proposal.status !== REVIEWING_STATUS) {
    throw err('Đề xuất không ở trạng thái đang duyệt BCĐX', 400);
  }
  const cleanDescription = String(description || '').trim();
  if (!cleanDescription) {
    throw err('Vui lòng mô tả nội dung cần tạo lại BCĐX', 400);
  }

  const proposalLifecycle = require('./proposalLifecycle');
  const transition = await proposalLifecycle.transition(proposal.id, RE_CREATING_STATUS, {
    reason: cleanDescription,
    actorId: user.id,
    actorRole: user.role,
    source: 'user',
    ip
  });

  const round = await (async () => {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS n FROM proposal_requests WHERE proposal_id = ? AND request_type = ?',
      [proposal.id, REVISION_REQUEST_TYPE]
    );
    return Number(rows[0]?.n || 0) + 1;
  })();

  const request = await require('./proposalRequestService').createRequest({
    proposalId: proposal.id,
    type: REVISION_REQUEST_TYPE,
    description: cleanDescription,
    requestedBy: user.id,
    previousStatus: REVIEWING_STATUS,
    currentStatus: RE_CREATING_STATUS,
    targetUserId: proposal.user_id || null,
    targetTitle: 'Người đề xuất',
    note: `Lần yêu cầu tạo lại BCĐX: ${round}`,
    roundNo: round
  });

  await proposalLifecycle.logActivity({
    proposalId: proposal.id,
    action: 'report_revision_requested',
    fromStatus: REVIEWING_STATUS,
    toStatus: RE_CREATING_STATUS,
    reason: cleanDescription,
    changedFields: {
      round_no: { label: 'Số lần yêu cầu tạo lại BCĐX', old: round - 1, new: round }
    },
    actorId: user.id,
    actorRole: user.role,
    source: 'user',
    ip
  });

  const message = await buildMessage(proposal, user.id, {
    status: RE_CREATING_STATUS,
    actionLabel: 'Back Office',
    reason: cleanDescription
  });
  const recipientIds = await findGdttkdIdsByRegion(proposalRegion(proposal.custom_data));
  await notifyUsers([...recipientIds, proposal.user_id], {
    type: RE_CREATING_STATUS,
    title: 'Đề xuất cần tạo lại tờ trình BCĐX',
    message,
    entityId: proposal.id,
    actorId: user.id
  });

  return { id: proposal.id, status: RE_CREATING_STATUS, roundNo: round, request, transition };
};
