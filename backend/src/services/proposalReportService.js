const pool = require('../utils/db');
const path = require('path');
const dynamicUtils = require('./dynamicUtils');
const proposalGradingService = require('./proposalGradingService');

const { normalizeText, parseCustomData, normalizeFileEntries, toFileSummaries } = proposalGradingService;

const CREATING_STATUS = 'PROPOSAL_REPORT_CREATING';
const RE_CREATING_STATUS = 'PROPOSAL_REPORT_RE_CREATING';
const REVIEWING_STATUS = 'PROPOSAL_REPORT_REVIEWING';
const UPDATING_STATUS = 'PROPOSAL_REPORT_UPDATING';
const SIGNATURE_STATUS = 'SIGNATURE_PENDING';
const APPROVED_STATUS = 'APPROVED';
const CANCELLED_STATUS = 'CANCELLED';

const TAB_STATUSES = {
  all: [
    CREATING_STATUS, RE_CREATING_STATUS, UPDATING_STATUS, REVIEWING_STATUS,
    SIGNATURE_STATUS, APPROVED_STATUS, CANCELLED_STATUS
  ],
  pending: [CREATING_STATUS, RE_CREATING_STATUS, UPDATING_STATUS],
  completed: [REVIEWING_STATUS, SIGNATURE_STATUS, APPROVED_STATUS, CANCELLED_STATUS]
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

const canUploadReport = async (scope, proposal) => {
  if (scope.role === 'SUPER_ADMIN') return true;
  if (Number(proposal.user_id) === Number(scope.userId)) return true;
  if (Number(proposal.owner_parent_id) === Number(scope.userId)) return true;
  if (scope.roleKey === 'GDTTKD' && scope.region) {
    const region = proposalRegion(proposal.custom_data);
    return !!region && region === scope.region;
  }
  return false;
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

exports.listProposals = async ({
  user,
  tab = 'all',
  search = '',
  page = 1,
  limit = 10,
  filters = {}
} = {}) => {
  const safeTab = Object.prototype.hasOwnProperty.call(TAB_STATUSES, tab) ? tab : 'all';
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 10));
  const offset = (safePage - 1) * safeLimit;
  const scope = await resolveScope(user);
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
    params.push(`${filters.dateFrom} 00:00:00`);
  }
  if (filters.dateTo) {
    where.push('p.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(filters.dateTo);
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
            u.parent_id AS owner_parent_id, u.parent_id AS manager_user_id, manager.full_name AS manager_name,
            (SELECT COUNT(*) FROM proposal_requests r
              WHERE r.proposal_id = p.id AND r.request_type = ?) AS revision_request_count,
            (SELECT r.description FROM proposal_requests r
              WHERE r.proposal_id = p.id AND r.request_type IN (?, ?) AND r.status = 'OPEN'
              ORDER BY r.id DESC LIMIT 1) AS task_description
     FROM station_proposals p
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN users manager ON manager.id = u.parent_id
     ${whereClause}
     ORDER BY p.updated_at DESC, p.id DESC
     LIMIT ? OFFSET ?`,
    [REVISION_REQUEST_TYPE, REVISION_REQUEST_TYPE, UPDATE_INFO_REQUEST_TYPE, ...params, safeLimit, offset]
  );

  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const proposals = await Promise.all(rows.map(async (row) => ({
    ...mapReportRow(dynamicUtils.mergeData(row, fieldDefs)),
    can_upload: await canUploadReport(scope, row)
  })));

  return {
    proposals,
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) },
    meta: {
      isAdmin: !!scope.isAdmin,
      isSuperAdmin: scope.role === 'SUPER_ADMIN',
      isBackOffice: !!scope.isBackOffice,
      roleKey: scope.roleKey,
      region: scope.region,
      department: scope.department
    }
  };
};

exports.getFilterOptions = async (user) => {
  const scope = await resolveScope(user);
  const proposalRequestService = require('./proposalRequestService');
  let filterScope;
  if (scope.isAdmin || scope.isBackOffice) {
    filterScope = { all: true };
  } else if (scope.roleKey === 'GDTTKD' && scope.region) {
    filterScope = { role: 'NPP', branchIds: [], region: scope.region };
  } else if (scope.role === 'SALES') {
    const adminProposalService = require('./adminProposalService');
    const branchIds = await adminProposalService.getBranchUserIds(scope.userId);
    filterScope = { role: 'SALES', userId: scope.userId, branchIds: [scope.userId, ...branchIds] };
  } else if (['CTV', 'NPP'].includes(scope.role)) {
    filterScope = { role: 'CTV', userId: scope.userId };
  } else {
    filterScope = { role: scope.role, userId: scope.userId, branchIds: [] };
  }
  return proposalRequestService.getFilterOptions(filterScope);
};

exports.getProposalDetail = async ({ user, id } = {}) => {
  const proposalId = Number(id);
  if (!Number.isInteger(proposalId) || proposalId <= 0) throw err('Đề xuất không hợp lệ', 400);
  const scope = await resolveScope(user);
  const params = [proposalId];
  const scoped = await scopeClause(scope, params);
  const [rows] = await pool.query(
    `SELECT p.*, p.ma_de_xuat_gen AS ma_de_xuat, u.full_name AS user_name,
            u.email AS user_email, u.parent_id AS owner_parent_id
       FROM station_proposals p
       LEFT JOIN users u ON u.id = p.user_id
      WHERE p.id = ?${scoped}`,
    params
  );
  if (rows.length === 0) {
    const [existing] = await pool.query('SELECT id FROM station_proposals WHERE id = ?', [proposalId]);
    if (existing.length > 0) throw err('Bạn không có quyền xem đề xuất này', 403);
    throw err('Không tìm thấy đề xuất', 404);
  }
  const proposal = rows[0];
  if (!TAB_STATUSES.all.includes(proposal.status)
    || (proposal.status === APPROVED_STATUS && !proposal.signed_file_id)) {
    throw err('Đề xuất chưa thuộc quy trình lập tờ trình BCĐX', 404);
  }
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const mapped = mapReportRow(dynamicUtils.mergeData(proposal, fieldDefs));
  const progress = await require('./proposalProgressService').getProgress(proposalId);
  const requests = progress.requests.filter((request) => (
    [REVISION_REQUEST_TYPE, 'LAYOUT_SUPPLEMENT', 'UPDATE_INFO'].includes(request.request_type)
  ));
  return {
    proposal: mapped,
    fieldDefinitions: fieldDefs,
    requests,
    activity: progress.activity,
    progress,
    permissions: { canUpload: await canUploadReport(scope, proposal) },
    meta: {
      isAdmin: !!scope.isAdmin,
      isSuperAdmin: scope.role === 'SUPER_ADMIN',
      isBackOffice: !!scope.isBackOffice,
      roleKey: scope.roleKey,
      region: scope.region
    }
  };
};

const loadProposal = async (id) => {
  const proposalId = Number(id);
  if (!Number.isInteger(proposalId) || proposalId <= 0) throw err('Đề xuất không hợp lệ', 400);
  const [rows] = await pool.query(
    `SELECT p.id, p.user_id, p.status, p.owner_name, p.custom_data,
            p.chot_so_luong_tru, p.tong_gia_tri_chot, u.parent_id AS owner_parent_id
       FROM station_proposals p
       LEFT JOIN users u ON u.id = p.user_id
      WHERE p.id = ?`,
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
  if (await canUploadReport(scope, proposal)) return;
  if (scope.roleKey === 'GDTTKD') throw err('Đề xuất không thuộc khu vực của bạn', 403);
  throw err('Bạn không có quyền tải tờ trình BCĐX cho đề xuất này', 403);
};

const assertCanReview = (scope) => {
  if (scope.isAdmin || scope.isBackOffice) return;
  throw err('Chỉ Back Office hoặc Admin được duyệt BCĐX', 403);
};

const normalizeReportFiles = async (value, existingIds = []) => {
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
  if (rows.length !== ids.length) throw err('Một hoặc nhiều file tờ trình không tồn tại hoặc đã bị xóa', 400);
  const existingFileIds = new Set(existingIds.map(Number));
  const allowedExtensions = new Set(['.pdf', '.doc', '.docx']);
  const allowedMimeTypes = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]);
  for (const row of rows) {
    if (existingFileIds.has(Number(row.id))) continue;
    const extension = path.extname(String(row.original_name || '')).toLowerCase();
    const mimeType = String(row.mime_type || '').toLowerCase().split(';')[0].trim();
    if (!allowedExtensions.has(extension) || !allowedMimeTypes.has(mimeType)) {
      throw err('File tờ trình chỉ chấp nhận định dạng Word (.doc, .docx) hoặc PDF', 400);
    }
  }
  const byId = new Map(rows.map((row) => [Number(row.id), row]));
  return ids.map((fileId) => byId.get(fileId)).filter(Boolean).map((row) => ({
    id: Number(row.id),
    original_name: row.original_name,
    mime_type: row.mime_type,
    size: row.size
  }));
};

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

  const custom = parseCustomData(proposal.custom_data);
  const previous = toFileSummaries(custom[REPORT_FIELD]);
  const reportFiles = await normalizeReportFiles(files, previous.map((file) => file.id));
  if (reportFiles.length === 0) {
    throw err('Vui lòng tải lên file tờ trình BCĐX', 400);
  }

  const prices = await loadTruPrices();
  const chotRows = normalizeChotRows(chotSoLuongTru, prices);
  if (chotRows.length === 0) {
    throw err('Vui lòng nhập số lượng trụ chốt (mô hình liên kết, số lượng, loại trụ, giá chốt)', 400);
  }
  const totalValue = sumChotTotal(chotRows);

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

  return { id: proposal.id, status: RE_CREATING_STATUS, roundNo: round, request, transition };
};
