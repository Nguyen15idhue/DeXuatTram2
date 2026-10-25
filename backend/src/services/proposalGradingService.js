const pool = require('../utils/db');
const dynamicUtils = require('./dynamicUtils');

const GRADING_STATUS = 'GRADING';
const REGRADING_STATUS = 'RE_GRADING';
const QH_ROLE = 'QH';
const PL_ROLE = 'PL';
const BOTH_ROLE = 'BOTH';
const DISPLAY_CONFIG_KEY = 'proposal_grading_display_config';

// Cac trang thai tu GRADING den het status flow v2.
const DOWNSTREAM_STATUSES = [
  'GRADING',
  'RE_GRADING',
  'GDTTKD_EVALUATING',
  'RE_GDTTKD_EVALUATING',
  'TGD_REVIEW',
  'DESIGNING',
  'INFOR_WAITING',
  'PROPOSAL_REPORT_CREATING',
  'PROPOSAL_REPORT_RE_CREATING',
  'PROPOSAL_REPORT_REVIEWING',
  'PROPOSAL_REPORT_UPDATING',
  'SIGNATURE_PENDING',
  'COMPLETED'
];

const GRADING_NOTE_LABELS = {
  NO_QH_NO_PL: 'Quy hoạch và Pháp lý chưa chấm điểm',
  NO_QH_YES_PL: 'Quy hoạch chưa chấm điểm, Pháp lý đã chấm',
  NO_QH_WAIT_PL: 'Quy hoạch chưa chấm điểm, Pháp lý chờ bổ sung thông tin',
  YES_QH_NO_PL: 'Quy hoạch đã chấm, Pháp lý chưa chấm điểm',
  YES_QH_WAIT_PL: 'Quy hoạch đã chấm, Pháp lý chờ bổ sung thông tin'
};

const GRADING_NOTE_VALUES = Object.keys(GRADING_NOTE_LABELS);

const LEGAL_DOCUMENTS = [
  { key: 'legal_document', label: 'Giấy chứng nhận quyền sử dụng đất' },
  { key: 'dkkd_cccd_hkd', label: 'Đăng ký kinh doanh' }
];

const normalizeText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const parseCustomData = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
};

const resolveGradingRole = (department) => {
  const dept = normalizeText(department);
  if (!dept) return null;
  if (dept.includes('quy hoach') || dept.includes('cong nghe') || dept.includes('quan he')) return QH_ROLE;
  if (dept.includes('chien luoc')) return PL_ROLE;
  return null;
};

const getUserDepartment = async (userId) => {
  if (!userId) return null;
  const [rows] = await pool.query(
    "SELECT JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.department')) AS department FROM users WHERE id = ?",
    [userId]
  );
  return rows.length > 0 ? (rows[0].department || null) : null;
};

const normalizeFileEntries = (value) => {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((item) => normalizeFileEntries(item));
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? [value] : [];
  if (typeof value === 'object') {
    if (Array.isArray(value.files)) return normalizeFileEntries(value.files);
    const fileId = value.id ?? value.file_id;
    if (fileId !== null && fileId !== undefined && fileId !== '') return [value];
    return Object.keys(value).length > 0 ? [value] : [];
  }
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text || ['[]', '{}', 'null', 'undefined'].includes(text)) return [];
    if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))) {
      try { return normalizeFileEntries(JSON.parse(text)); } catch { return [value]; }
    }
    return [value];
  }
  return [];
};

const hasFileValue = (value) => normalizeFileEntries(value).length > 0;

const toFileSummaries = (value) => normalizeFileEntries(value).map((item) => {
  if (typeof item === 'object') {
    return {
      id: item.id ?? item.file_id ?? null,
      name: item.original_name || item.name || null,
      mime_type: item.mime_type || item.type || null,
      url: item.url || null
    };
  }
  return { id: item, name: null, mime_type: null, url: null };
});

const getLegalDocsState = (customData) => {
  const custom = parseCustomData(customData);
  const documents = LEGAL_DOCUMENTS.map((doc) => {
    const files = toFileSummaries(custom[doc.key]);
    return { key: doc.key, label: doc.label, has_file: files.length > 0, files };
  });
  const missing = documents.filter((doc) => !doc.has_file).map((doc) => doc.label);
  return { complete: missing.length === 0, missing, documents };
};

const computeGradingStatus = ({ quyHoachScore, phapLyScore, legalDocsComplete }) => {
  const qhDone = quyHoachScore !== null && quyHoachScore !== undefined;
  const plDone = phapLyScore !== null && phapLyScore !== undefined;
  if (qhDone && plDone) return null;
  if (!qhDone && plDone) return 'NO_QH_YES_PL';
  if (!qhDone && !plDone) return legalDocsComplete ? 'NO_QH_NO_PL' : 'NO_QH_WAIT_PL';
  return legalDocsComplete ? 'YES_QH_NO_PL' : 'YES_QH_WAIT_PL';
};

const statusListForTab = (tab) => {
  if (tab === 'pending') return [GRADING_STATUS, REGRADING_STATUS];
  if (tab === 'completed') return [...DOWNSTREAM_STATUSES, 'CANCELLED'];
  return [...DOWNSTREAM_STATUSES, 'CANCELLED'];
};

const buildScopeClause = (scope, params) => {
  if (!scope || scope.all) return '';
  if (scope.role === 'SALES') {
    const ors = [];
    if (Array.isArray(scope.branchIds) && scope.branchIds.length > 0) {
      ors.push(`p.user_id IN (${scope.branchIds.map(() => '?').join(',')})`);
      params.push(...scope.branchIds.map(Number));
    }
    if (scope.userId) {
      ors.push(`(CAST(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.nguoi_phu_trach.id')) AS UNSIGNED) = ? OR CAST(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.sales_quan_ly.id')) AS UNSIGNED) = ?)`);
      params.push(Number(scope.userId), Number(scope.userId));
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

const mapGradingRow = (row) => {
  const custom = parseCustomData(row.custom_data);
  const legalDocs = getLegalDocsState(custom);
  const qhScore = row.quy_hoach_score === null || row.quy_hoach_score === undefined
    ? null : Number(row.quy_hoach_score);
  const plScore = row.phap_ly_score === null || row.phap_ly_score === undefined
    ? null : Number(row.phap_ly_score);
  const code = row.status === GRADING_STATUS
    ? computeGradingStatus({ quyHoachScore: qhScore, phapLyScore: plScore, legalDocsComplete: legalDocs.complete })
    : (GRADING_NOTE_VALUES.includes(row.note) ? row.note : null);
  return {
    ...row,
    custom_data: custom,
    quy_hoach_score: qhScore,
    phap_ly_score: plScore,
    legal_docs_complete: legalDocs.complete,
    legal_docs_missing: legalDocs.missing,
    legal_docs: legalDocs.documents,
    grading_status: code,
    grading_status_label: code ? (GRADING_NOTE_LABELS[code] || code) : null,
    quy_hoach_regrade_pending: !!row.quy_hoach_regrade_request_id,
    phap_ly_regrade_pending: !!row.phap_ly_regrade_request_id,
    supplement_pending: !!row.supplement_pending,
    quy_hoach_status_label: row.quy_hoach_regrade_request_id
      ? 'Đang chờ Quy hoạch chấm lại'
      : (qhScore === null ? 'Quy hoạch chưa chấm' : 'Quy hoạch đã chấm xong'),
    phap_ly_status_label: row.phap_ly_regrade_request_id
      ? 'Đang chờ Pháp lý chấm lại'
      : (plScore === null ? 'Pháp lý chưa chấm' : 'Pháp lý đã chấm xong')
  };
};

const refreshGradingNotes = async (rows) => {
  const changed = rows.filter((row) => row.status === GRADING_STATUS && (row.note || null) !== (row.grading_status || null));
  if (changed.length === 0) return;
  for (const row of changed) {
    try {
      await pool.query('UPDATE station_proposals SET note = ? WHERE id = ? AND status = ?', [
        row.grading_status || null, row.id, GRADING_STATUS
      ]);
      row.note = row.grading_status || null;
    } catch { /* silent: khong chan hien thi danh sach */ }
  }
};

exports.GRADING_STATUS = GRADING_STATUS;
exports.DOWNSTREAM_STATUSES = DOWNSTREAM_STATUSES;
exports.GRADING_NOTE_LABELS = GRADING_NOTE_LABELS;
exports.GRADING_NOTE_VALUES = GRADING_NOTE_VALUES;
exports.LEGAL_DOCUMENTS = LEGAL_DOCUMENTS;
exports.resolveGradingRole = resolveGradingRole;
exports.normalizeText = normalizeText;
exports.parseCustomData = parseCustomData;
exports.getUserDepartment = getUserDepartment;
exports.getLegalDocsState = getLegalDocsState;
exports.normalizeFileEntries = normalizeFileEntries;
exports.toFileSummaries = toFileSummaries;
exports.computeGradingStatus = computeGradingStatus;

exports.listProposals = async ({
  tab = 'all', department = '', search = '', page = 1, limit = 10, scope = {}, filters = {}
} = {}) => {
  const safeTab = ['all', 'pending', 'completed'].includes(tab) ? tab : 'all';
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 10));
  const offset = (safePage - 1) * safeLimit;
  const statuses = statusListForTab(safeTab);
  const where = [];
  const params = [];

  const withoutCancelled = [...new Set(statuses.filter((status) => status !== 'CANCELLED'))];
  if (withoutCancelled.length > 0) {
    const placeholders = withoutCancelled.map(() => '?').join(',');
    let clause = `p.status IN (${placeholders})`;
    params.push(...withoutCancelled);
    if (statuses.includes('CANCELLED')) clause = `(${clause} OR p.status = 'CANCELLED')`;
    where.push(clause);
  }

  const dept = department || scope.gradeRole || '';
  const qhRegradeExists = `EXISTS (
    SELECT 1 FROM proposal_requests rq
     WHERE rq.proposal_id = p.id AND rq.request_type = 'RE_GRADE' AND rq.status = 'OPEN'
       AND (rq.target_department = 'QH' OR rq.target_title IN ('Quy hoạch', 'Hai phòng chấm điểm'))
  )`;
  const plRegradeExists = `EXISTS (
    SELECT 1 FROM proposal_requests rp
     WHERE rp.proposal_id = p.id AND rp.request_type = 'RE_GRADE' AND rp.status = 'OPEN'
       AND (rp.target_department = 'PL' OR rp.target_title IN ('Pháp lý', 'Hai phòng chấm điểm'))
  )`;
  const supplementExists = `EXISTS (
    SELECT 1 FROM proposal_requests rs
     WHERE rs.proposal_id = p.id AND rs.request_type = 'SUPPLEMENT' AND rs.status = 'OPEN'
  )`;
  const qhDone = `(p.quy_hoach_score IS NOT NULL AND NOT ${qhRegradeExists})`;
  const plDone = `(p.phap_ly_score IS NOT NULL AND NOT ${plRegradeExists})`;

  if (safeTab === 'pending') {
    if (dept === QH_ROLE) {
      where.push(`((p.status = ? AND p.quy_hoach_score IS NULL AND NOT ${supplementExists}) OR (p.status = ? AND ${qhRegradeExists}))`);
      params.push(GRADING_STATUS, REGRADING_STATUS);
    } else if (dept === PL_ROLE) {
      where.push(`((p.status = ? AND p.phap_ly_score IS NULL AND NOT ${supplementExists}) OR (p.status = ? AND ${plRegradeExists}))`);
      params.push(GRADING_STATUS, REGRADING_STATUS);
    } else {
      where.push(`((p.status = ? AND NOT ${supplementExists}) OR (p.status = ? AND (${qhRegradeExists} OR ${plRegradeExists})))`);
      params.push(GRADING_STATUS, REGRADING_STATUS);
    }
  } else if (safeTab === 'completed') {
    if (dept === QH_ROLE) where.push(`(p.status = 'CANCELLED' OR ${qhDone})`);
    else if (dept === PL_ROLE) where.push(`(p.status = 'CANCELLED' OR ${plDone})`);
    else where.push(`(p.status = 'CANCELLED' OR (${qhDone} AND ${plDone}))`);
  }

  if (search) {
    const like = `%${String(search).trim()}%`;
    where.push('(p.ma_de_xuat_gen LIKE ? OR p.owner_name LIKE ? OR p.owner_phone LIKE ? OR p.address LIKE ? OR u.full_name LIKE ?)');
    params.push(like, like, like, like, like);
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
    const pattern = region.includes('bac') ? '%bac%' : region.includes('trung') ? '%trung%' : region.includes('nam') ? '%nam%' : null;
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

  const scoped = buildScopeClause(scope, params);
  const whereClause = `WHERE ${where.length > 0 ? where.join(' AND ') : '1 = 1'}${scoped}`;

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
            (SELECT rq.id FROM proposal_requests rq
              WHERE rq.proposal_id = p.id AND rq.request_type = 'RE_GRADE' AND rq.status = 'OPEN'
                AND (rq.target_department = 'QH' OR rq.target_title IN ('Quy hoạch', 'Hai phòng chấm điểm'))
              ORDER BY rq.created_at DESC, rq.id DESC LIMIT 1) AS quy_hoach_regrade_request_id,
            (SELECT rp.id FROM proposal_requests rp
              WHERE rp.proposal_id = p.id AND rp.request_type = 'RE_GRADE' AND rp.status = 'OPEN'
                AND (rp.target_department = 'PL' OR rp.target_title IN ('Pháp lý', 'Hai phòng chấm điểm'))
              ORDER BY rp.created_at DESC, rp.id DESC LIMIT 1) AS phap_ly_regrade_request_id,
            (SELECT MAX(rt.created_at) FROM proposal_requests rt
              WHERE rt.proposal_id = p.id AND rt.request_type = 'RE_GRADE' AND rt.status = 'OPEN') AS grading_task_created_at,
            ${supplementExists} AS supplement_pending
     FROM station_proposals p
     LEFT JOIN users u ON u.id = p.user_id
     ${whereClause}
     ORDER BY ${safeTab === 'pending' ? 'COALESCE(grading_task_created_at, p.created_at) ASC, p.id ASC' : 'p.updated_at DESC, p.id DESC'}
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );

  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const merged = rows.map((row) => dynamicUtils.mergeData(row, fieldDefs)).map(mapGradingRow);
  await refreshGradingNotes(merged);

  return {
    proposals: merged,
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) }
  };
};

  const loadDisplayConfig = async () => {
    const [rows] = await pool.query('SELECT `value` FROM proposal_lifecycle_configs WHERE `key` = ? LIMIT 1', [DISPLAY_CONFIG_KEY]);
    if (!rows[0]?.value) return {};
    try {
      const value = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  };

  exports.getProposalDetail = async (id, scope = {}) => {
    const proposalId = Number(id);
    if (!Number.isInteger(proposalId) || proposalId <= 0) throw Object.assign(new Error('Đề xuất không hợp lệ'), { statusCode: 400 });
    const params = [proposalId];
    let scopeClause = '';
    if (scope.role === 'SALES') {
      const ids = Array.isArray(scope.branchIds) ? scope.branchIds.map(Number) : [];
      if (!ids.includes(Number(scope.userId))) ids.push(Number(scope.userId));
      if (!ids.length) throw Object.assign(new Error('Bạn không có quyền xem đề xuất này'), { statusCode: 403 });
      scopeClause = ` AND p.user_id IN (${ids.map(() => '?').join(',')})`;
      params.push(...ids);
    } else if (['CTV', 'NPP'].includes(scope.role)) {
      scopeClause = ' AND p.user_id = ?';
      params.push(Number(scope.userId));
    }
    const [rows] = await pool.query(
      `SELECT p.*, p.ma_de_xuat_gen AS ma_de_xuat, u.full_name AS user_name,
              (SELECT rq.id FROM proposal_requests rq WHERE rq.proposal_id = p.id
                 AND rq.request_type = 'RE_GRADE' AND rq.status = 'OPEN'
                 AND (rq.target_department = 'QH' OR rq.target_title IN ('Quy hoạch', 'Hai phòng chấm điểm'))
                 ORDER BY rq.created_at DESC, rq.id DESC LIMIT 1) AS quy_hoach_regrade_request_id,
              (SELECT rq.description FROM proposal_requests rq WHERE rq.proposal_id = p.id
                 AND rq.request_type = 'RE_GRADE' AND rq.status = 'OPEN'
                 AND (rq.target_department = 'QH' OR rq.target_title IN ('Quy hoạch', 'Hai phòng chấm điểm'))
                 ORDER BY rq.created_at DESC, rq.id DESC LIMIT 1) AS quy_hoach_regrade_description,
              (SELECT rp.id FROM proposal_requests rp WHERE rp.proposal_id = p.id
                 AND rp.request_type = 'RE_GRADE' AND rp.status = 'OPEN'
                 AND (rp.target_department = 'PL' OR rp.target_title IN ('Pháp lý', 'Hai phòng chấm điểm'))
                 ORDER BY rp.created_at DESC, rp.id DESC LIMIT 1) AS phap_ly_regrade_request_id,
              (SELECT rp.description FROM proposal_requests rp WHERE rp.proposal_id = p.id
                 AND rp.request_type = 'RE_GRADE' AND rp.status = 'OPEN'
                 AND (rp.target_department = 'PL' OR rp.target_title IN ('Pháp lý', 'Hai phòng chấm điểm'))
                 ORDER BY rp.created_at DESC, rp.id DESC LIMIT 1) AS phap_ly_regrade_description
         FROM station_proposals p LEFT JOIN users u ON u.id = p.user_id
        WHERE p.id = ?${scopeClause}`,
      params
    );
    if (!rows.length) throw Object.assign(new Error('Không tìm thấy đề xuất hoặc bạn không có quyền xem đề xuất này'), { statusCode: 404 });
    const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
    const proposal = mapGradingRow(dynamicUtils.mergeData(rows[0], fieldDefs));
    const [requests] = await pool.query(
      `SELECT id, request_type, description, target_department, target_title, target_user_id, status, created_at, note
         FROM proposal_requests
        WHERE proposal_id = ? AND status = 'OPEN' AND request_type IN ('SUPPLEMENT', 'UPDATE_INFO', 'RE_GRADE')
        ORDER BY created_at ASC, id ASC`,
      [proposalId]
    );
    const supplementPending = requests.some((request) => request.request_type === 'SUPPLEMENT');
    const config = await loadDisplayConfig();
    return {
      proposal,
      fieldDefinitions: fieldDefs,
      displayConfig: config,
      requests,
      step: proposal.status === REGRADING_STATUS ? 'regrading' : 'grading',
      permissions: {
        canGradeQH: !supplementPending && ['GRADING', REGRADING_STATUS].includes(proposal.status)
          && (scope.gradeRole === BOTH_ROLE || scope.gradeRole === QH_ROLE)
          && (proposal.status !== REGRADING_STATUS || !!proposal.quy_hoach_regrade_request_id),
        canGradePL: !supplementPending && ['GRADING', REGRADING_STATUS].includes(proposal.status)
          && (scope.gradeRole === BOTH_ROLE || scope.gradeRole === PL_ROLE)
          && (proposal.status !== REGRADING_STATUS || !!proposal.phap_ly_regrade_request_id),
        canConfigure: scope.role === 'SUPER_ADMIN',
        canRequestSupplement: !supplementPending && ['QH', 'PL', 'BOTH'].includes(scope.gradeRole)
          && proposal.status === GRADING_STATUS
      }
    };
  };

  exports.getDisplayConfig = loadDisplayConfig;

  exports.saveDisplayConfig = async (config, fieldDefinitions) => {
    const validKeys = new Set(fieldDefinitions.map((field) => field.key));
    const clean = {};
    for (const step of ['grading', 'regrading']) {
      const keys = Array.isArray(config?.[step]) ? config[step] : [];
      clean[step] = [...new Set(keys.filter((key) => validKeys.has(key)))];
    }
    await pool.query(
      'INSERT INTO proposal_lifecycle_configs (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = CURRENT_TIMESTAMP',
      [DISPLAY_CONFIG_KEY, JSON.stringify(clean)]
    );
    return clean;
  };

  exports.requestSupplement = async ({ id, user, gradeRole, reason, ip } = {}) => {
    const proposalId = Number(id);
    const cleanReason = String(reason || '').trim();
    if (!Number.isInteger(proposalId) || proposalId <= 0) {
      throw Object.assign(new Error('Đề xuất không hợp lệ'), { statusCode: 400 });
    }
    if (cleanReason.length < 3 || cleanReason.length > 5000) {
      throw Object.assign(new Error('Vui lòng mô tả thông tin cần bổ sung (3–5000 ký tự)'), { statusCode: 400 });
    }
    if (!['QH', 'PL', BOTH_ROLE].includes(gradeRole)) {
      throw Object.assign(new Error('Bạn không có quyền yêu cầu bổ sung thông tin'), { statusCode: 403 });
    }
    const [rows] = await pool.query(
      'SELECT id, status, user_id, custom_data FROM station_proposals WHERE id = ? LIMIT 1',
      [proposalId]
    );
    const proposal = rows[0];
    if (!proposal) throw Object.assign(new Error('Không tìm thấy đề xuất'), { statusCode: 404 });
    if (proposal.status !== GRADING_STATUS) {
      throw Object.assign(new Error('Chỉ có thể yêu cầu bổ sung khi đề xuất đang ở bước chấm điểm'), { statusCode: 400 });
    }
    const request = await require('./proposalRequestService').createRequest({
      proposalId,
      type: 'SUPPLEMENT',
      description: cleanReason,
      requestedBy: user?.id,
      previousStatus: proposal.status,
      currentStatus: proposal.status,
      targetUserId: proposal.user_id,
      targetTitle: 'Người đề xuất'
    });
    const lifecycle = require('./proposalLifecycle');
    await lifecycle.logActivity({
      proposalId,
      action: 'grading_supplement_requested',
      fromStatus: proposal.status,
      toStatus: proposal.status,
      changedFields: { supplement_request: { label: 'Yêu cầu bổ sung thông tin', old: '', new: cleanReason } },
      actorId: user?.id || null,
      actorRole: user?.role || null,
      source: 'user',
      ip
    });
    if (proposal.user_id) {
      const notificationService = require('./notificationService');
      const code = notificationService.proposalCode(proposal.custom_data, proposalId);
      const actorName = (await notificationService.getUserName(user?.id)) || 'Hệ thống';
      await notificationService.create({
        userId: proposal.user_id,
        type: 'INFO_REOPENED',
        title: 'Yêu cầu bổ sung thông tin đề xuất',
        message: notificationService.statusMessage({
          code,
          actorName,
          status: proposal.status,
          actionLabel: 'Yêu cầu bổ sung',
          reason: cleanReason
        }),
        entityType: 'station_proposals',
        entityId: proposalId,
        createdBy: user?.id || null
      });
    }
    return { id: proposalId, requestId: request?.id || null, status: proposal.status };
  };

const parseScore = (value, label) => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0 || num > 3) {
    const error = new Error(`${label} phải là số nguyên từ 0 đến 3`);
    error.statusCode = 400;
    throw error;
  }
  return num;
};

const parseNote = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text.slice(0, 5000);
};

const regionDepartment = (customData) => {
  const region = normalizeText(parseCustomData(customData).vung_mien);
  if (region === 'bac' || region.includes('mien bac')) return 'Trung tâm KD miền Bắc';
  if (region === 'trung' || region.includes('mien trung')) return 'Trung tâm KD miền Trung';
  if (region === 'nam' || region.includes('mien nam')) return 'Trung tâm KD miền Nam';
  return null;
};

exports.updateGrading = async ({ id, userId, userRole, gradeRole, payload = {} } = {}) => {
  const proposalId = Number(id);
  if (!Number.isInteger(proposalId) || proposalId <= 0) {
    const error = new Error('Đề xuất không hợp lệ');
    error.statusCode = 400;
    throw error;
  }

  const [rows] = await pool.query(
    `SELECT id, status, note, review_level, quy_hoach_score, quy_hoach_note, phap_ly_score, phap_ly_note, custom_data
     FROM station_proposals WHERE id = ?`,
    [proposalId]
  );
  if (rows.length === 0) {
    const error = new Error('Không tìm thấy đề xuất');
    error.statusCode = 404;
    throw error;
  }
  const current = rows[0];
  if (![GRADING_STATUS, REGRADING_STATUS].includes(current.status)) {
    const error = new Error('Chỉ được chấm điểm khi đề xuất đang ở bước chấm điểm');
    error.statusCode = 400;
    throw error;
  }

  const role = userRole === 'SUPER_ADMIN'
    ? BOTH_ROLE
    : userRole === 'ADMIN'
      ? (gradeRole || resolveGradingRole(await getUserDepartment(userId)))
      : null;
  const canQH = role === BOTH_ROLE || role === QH_ROLE;
  const canPL = role === BOTH_ROLE || role === PL_ROLE;
  if (!canQH && !canPL) {
    const error = new Error('Tài khoản không thuộc phòng Quy hoạch hoặc Pháp lý');
    error.statusCode = 403;
    throw error;
  }

  const hasQHFields = Object.prototype.hasOwnProperty.call(payload, 'quy_hoach_score')
    || Object.prototype.hasOwnProperty.call(payload, 'quy_hoach_note');
  const hasPLFields = Object.prototype.hasOwnProperty.call(payload, 'phap_ly_score')
    || Object.prototype.hasOwnProperty.call(payload, 'phap_ly_note');
  const hasQHScore = Object.prototype.hasOwnProperty.call(payload, 'quy_hoach_score');
  const hasPLScore = Object.prototype.hasOwnProperty.call(payload, 'phap_ly_score');
  if ((hasQHFields && !canQH) || (hasPLFields && !canPL)) {
    const error = new Error('Bạn không có quyền cập nhật điểm của phòng ban khác');
    error.statusCode = 403;
    throw error;
  }

  const isGrading = current.status === GRADING_STATUS;
  const isReGrading = current.status === REGRADING_STATUS;
  if (isGrading) {
    const [supplementRows] = await pool.query(
      "SELECT COUNT(*) AS n FROM proposal_requests WHERE proposal_id = ? AND request_type = 'SUPPLEMENT' AND status = 'OPEN'",
      [proposalId]
    );
    if (Number(supplementRows[0]?.n || 0) > 0) {
      const error = new Error('Đề xuất đang chờ bổ sung thông tin; chỉ tiếp tục chấm sau khi yêu cầu được hoàn thành');
      error.statusCode = 400;
      throw error;
    }
  }
  let activeRegradeRequests = [];
  if (isReGrading) {
    const [requestRows] = await pool.query(
      `SELECT id, target_department, target_title, description, requested_by,
              previous_status, current_status, round_no, note
         FROM proposal_requests
        WHERE proposal_id = ? AND request_type = 'RE_GRADE' AND status = 'OPEN'`,
      [proposalId]
    );
    activeRegradeRequests = requestRows.filter((request) => {
      const target = normalizeText(request.target_department);
      const title = normalizeText(request.target_title);
      return (target === 'qh' || title.includes('quy hoach') || title.includes('hai phong'))
        || (target === 'pl' || title.includes('phap ly') || title.includes('hai phong'));
    });
    const activeDepartments = new Set();
    activeRegradeRequests.forEach((request) => {
      const target = normalizeText(request.target_department);
      const title = normalizeText(request.target_title);
      if (target === 'qh' || title.includes('quy hoach') || title.includes('hai phong')) activeDepartments.add(QH_ROLE);
      if (target === 'pl' || title.includes('phap ly') || title.includes('hai phong')) activeDepartments.add(PL_ROLE);
    });
    if ((hasQHFields && !activeDepartments.has(QH_ROLE)) || (hasPLFields && !activeDepartments.has(PL_ROLE))) {
      const error = new Error('Đề xuất không được yêu cầu chấm lại ở phòng ban này');
      error.statusCode = 403;
      throw error;
    }
    if (activeDepartments.size === 0) {
      const error = new Error('Không còn yêu cầu chấm lại đang mở cho đề xuất này');
      error.statusCode = 400;
      throw error;
    }
    if (!hasQHFields && !hasPLFields) {
      const error = new Error('Vui lòng nhập điểm của phòng được yêu cầu chấm lại');
      error.statusCode = 400;
      throw error;
    }
    if ((hasQHFields && !hasQHScore) || (hasPLFields && !hasPLScore)) {
      const error = new Error('Chấm lại phải gửi điểm mới của phòng được yêu cầu');
      error.statusCode = 400;
      throw error;
    }
  }

  const legalDocs = getLegalDocsState(current.custom_data);
  const updates = [];
  const params = [];
  const changedFields = {};

  let nextQH = current.quy_hoach_score === null || current.quy_hoach_score === undefined
    ? null : Number(current.quy_hoach_score);
  let nextPL = current.phap_ly_score === null || current.phap_ly_score === undefined
    ? null : Number(current.phap_ly_score);

  if (Object.prototype.hasOwnProperty.call(payload, 'quy_hoach_score')) {
    const score = parseScore(payload.quy_hoach_score, 'Điểm Quy hoạch');
    updates.push('quy_hoach_score = ?');
    params.push(score);
    changedFields.quy_hoach_score = { label: 'Quy hoạch chấm điểm', old: nextQH, new: score };
    nextQH = score;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'quy_hoach_note')) {
    const note = parseNote(payload.quy_hoach_note);
    updates.push('quy_hoach_note = ?');
    params.push(note);
    changedFields.quy_hoach_note = { label: 'Quy hoạch đánh giá', old: current.quy_hoach_note || '', new: note || '' };
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'phap_ly_score')) {
    const score = parseScore(payload.phap_ly_score, 'Điểm Pháp lý');
    if (score !== null && !legalDocs.complete) {
      const error = new Error(`Chưa đủ hồ sơ pháp lý: ${legalDocs.missing.join(', ')}`);
      error.statusCode = 400;
      throw error;
    }
    updates.push('phap_ly_score = ?');
    params.push(score);
    changedFields.phap_ly_score = { label: 'Pháp lý chấm điểm', old: nextPL, new: score };
    nextPL = score;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'phap_ly_note')) {
    const note = parseNote(payload.phap_ly_note);
    updates.push('phap_ly_note = ?');
    params.push(note);
    changedFields.phap_ly_note = { label: 'Pháp lý đánh giá', old: current.phap_ly_note || '', new: note || '' };
  }

  if (updates.length === 0) {
    const error = new Error('Không có dữ liệu đánh giá để cập nhật');
    error.statusCode = 400;
    throw error;
  }

  let nextNote = current.note;
  if (isGrading) {
    nextNote = computeGradingStatus({
      quyHoachScore: nextQH,
      phapLyScore: nextPL,
      legalDocsComplete: legalDocs.complete
    });
    updates.push('note = ?');
    params.push(nextNote);
  }

  updates.push('updated_at = NOW()');
  params.push(proposalId);
  await pool.query(
    `UPDATE station_proposals SET ${updates.join(', ')} WHERE id = ?`,
    params
  );

  if (isReGrading) {
    const sharedRequests = activeRegradeRequests.filter((request) =>
      normalizeText(request.target_title).includes('hai phong')
    );
    const targetedRequests = activeRegradeRequests.filter((request) => !sharedRequests.includes(request));
    const requestTargetsDepartment = (request, department) => {
      const target = normalizeText(request.target_department);
      const title = normalizeText(request.target_title);
      return department === 'QH'
        ? target === 'qh' || title.includes('quy hoach')
        : target === 'pl' || title.includes('phap ly');
    };
    const shouldCancelShared = nextQH === 0 || nextPL === 0;
    const requestService = require('./proposalRequestService');

    for (const request of sharedRequests) {
      await pool.query(
        `UPDATE proposal_requests SET status = ?, resolved_by = ?, resolved_at = NOW(),
                resolution_note = ? WHERE id = ? AND status = 'OPEN'`,
        [
          shouldCancelShared ? 'CANCELLED' : 'DONE',
          userId || null,
          shouldCancelShared ? 'Đề xuất bị hủy sau khi chấm điểm' : 'Đã chuyển yêu cầu cũ thành công việc riêng theo phòng',
          request.id
        ]
      );

      if (shouldCancelShared) continue;
      for (const target of [
        { department: 'QH', title: 'Quy hoạch', submitted: hasQHScore },
        { department: 'PL', title: 'Pháp lý', submitted: hasPLScore }
      ]) {
        if (target.submitted || targetedRequests.some((request) => requestTargetsDepartment(request, target.department))) continue;
        await requestService.createRequest({
          proposalId,
          type: 'RE_GRADE',
          description: request.description,
          requestedBy: request.requested_by,
          previousStatus: request.previous_status,
          currentStatus: request.current_status || REGRADING_STATUS,
          targetDepartment: target.department,
          targetTitle: target.title,
          note: request.note,
          roundNo: request.round_no
        });
      }
    }

    const resolvedRequestIds = activeRegradeRequests
      .filter((request) => !sharedRequests.includes(request)
        && ((hasQHScore && requestTargetsDepartment(request, 'QH'))
          || (hasPLScore && requestTargetsDepartment(request, 'PL'))))
      .map((request) => Number(request.id));
    if (resolvedRequestIds.length) {
      await pool.query(
        `UPDATE proposal_requests SET status = 'DONE', resolved_by = ?, resolved_at = NOW(),
                resolution_note = 'Đã cập nhật kết quả chấm điểm lại'
          WHERE id IN (${resolvedRequestIds.map(() => '?').join(',')}) AND status = 'OPEN'`,
        [userId || null, ...resolvedRequestIds]
      );
    }
  }

  const proposalLifecycle = require('./proposalLifecycle');
  await proposalLifecycle.logActivity({
    proposalId,
    action: 'grading_updated',
    fromStatus: current.status,
    toStatus: current.status,
    changedFields,
    actorId: userId || null,
    actorRole: userRole || null,
    source: 'user'
  });

  let transition = null;
  let transitionError = null;
  let nextReviewLevel = current.review_level === null || current.review_level === undefined
    ? null : Number(current.review_level);
  if (isGrading || isReGrading) {
    let target = null;
    let reason = null;
    let hasOpenRegrade = false;
    if (isReGrading) {
      const [openRows] = await pool.query(
        "SELECT COUNT(*) AS n FROM proposal_requests WHERE proposal_id = ? AND request_type = 'RE_GRADE' AND status = 'OPEN'",
        [proposalId]
      );
      hasOpenRegrade = Number(openRows[0]?.n || 0) > 0;
    }
    if (nextQH === 0 || nextPL === 0) {
      target = 'CANCELLED';
      reason = nextQH === 0 && nextPL === 0
        ? 'Điểm Quy hoạch và Pháp lý đều bằng 0'
        : nextQH === 0
          ? 'Điểm Quy hoạch bằng 0'
          : 'Điểm Pháp lý bằng 0';
    } else if (!hasOpenRegrade && nextQH !== null && nextPL !== null) {
      const total = nextQH + nextPL;
      if (total >= 4) {
        target = 'DESIGNING';
        reason = `Điểm Quy hoạch + Pháp lý đạt ${total}/6`;
      } else {
        target = isReGrading ? 'RE_GDTTKD_EVALUATING' : 'GDTTKD_EVALUATING';
        reason = isReGrading
          ? `Điểm Quy hoạch + Pháp lý đạt ${total}/6, cần GĐTTKD xem xét lại`
          : `Điểm Quy hoạch + Pháp lý đạt ${total}/6, cần GĐTTKD đánh giá`;
      }
    }

    if (target) {
      try {
        transition = await proposalLifecycle.transition(proposalId, target, {
          reason,
          actorId: userId || null,
          actorRole: userRole || null,
          source: 'system_auto'
        });
        if (target === 'CANCELLED') {
          await require('./proposalRequestService').closeRequests(
            proposalId,
            ['RE_GRADE', 'SUPPLEMENT'],
            { resolvedBy: userId || null, status: 'CANCELLED' }
          );
        }

        const reviewLevelForTarget = target === 'DESIGNING' || target === 'CANCELLED'
          ? null
          : (isReGrading ? 2 : 1);
        if (reviewLevelForTarget !== null && Number(current.review_level) !== reviewLevelForTarget) {
          await pool.query('UPDATE station_proposals SET review_level = ? WHERE id = ?', [reviewLevelForTarget, proposalId]);
          nextReviewLevel = reviewLevelForTarget;
          await proposalLifecycle.logActivity({
            proposalId,
            action: 'review_level_changed',
            fromStatus: current.status,
            toStatus: target,
            changedFields: {
              review_level: { label: 'Mức độ xem xét', old: current.review_level ?? '', new: reviewLevelForTarget }
            },
            actorId: userId || null,
            actorRole: userRole || null,
            source: 'system_auto'
          });
        }

        const proposalRequestService = require('./proposalRequestService');
        if (target === 'GDTTKD_EVALUATING') {
          try {
            await proposalRequestService.createRequest({
              proposalId,
              type: 'RE_GRADE',
              description: `Đề xuất đạt ${nextQH + nextPL}/6 điểm, cần Giám đốc Trung tâm Kinh doanh đánh giá.`,
              requestedBy: userId || null,
              previousStatus: GRADING_STATUS,
              currentStatus: target,
              targetDepartment: regionDepartment(current.custom_data),
              targetTitle: 'Giám đốc Trung tâm Kinh doanh',
              note: `Quy hoạch: ${nextQH}/3 · Pháp lý: ${nextPL}/3`
            });
          } catch { /* silent: khong chan ket qua cham diem */ }
        }
      } catch (error) {
        transitionError = error.message || 'Không chuyển được trạng thái tự động';
      }
    }
  }

  return {
    id: proposalId,
    status: transition ? transition.status : current.status,
    quy_hoach_score: nextQH,
    phap_ly_score: nextPL,
    note: nextNote,
    review_level: nextReviewLevel,
    grading_status: nextNote,
    grading_status_label: nextNote ? (GRADING_NOTE_LABELS[nextNote] || nextNote) : null,
    legal_docs_complete: legalDocs.complete,
    legal_docs_missing: legalDocs.missing,
    legal_docs: legalDocs.documents,
    transition,
    transitionError
  };
};

exports.syncNoteForProposal = async (id) => {
  const [rows] = await pool.query(
    `SELECT id, status, note, quy_hoach_score, phap_ly_score, custom_data
     FROM station_proposals WHERE id = ?`,
    [id]
  );
  if (rows.length === 0 || rows[0].status !== GRADING_STATUS) return null;
  const row = rows[0];
  const legalDocs = getLegalDocsState(row.custom_data);
  const code = computeGradingStatus({
    quyHoachScore: row.quy_hoach_score,
    phapLyScore: row.phap_ly_score,
    legalDocsComplete: legalDocs.complete
  });
  if ((row.note || null) !== (code || null)) {
    await pool.query('UPDATE station_proposals SET note = ? WHERE id = ? AND status = ?', [code || null, id, GRADING_STATUS]);
  }
  return code;
};

exports.clearGradingNote = async (id) => {
  await pool.query(
    `UPDATE station_proposals SET note = NULL
     WHERE id = ? AND note IN (${GRADING_NOTE_VALUES.map(() => '?').join(',')})`,
    [id, ...GRADING_NOTE_VALUES]
  );
};

exports.QH_ROLE = QH_ROLE;
exports.PL_ROLE = PL_ROLE;
exports.BOTH_ROLE = BOTH_ROLE;
