const pool = require('../utils/db');
const dynamicUtils = require('./dynamicUtils');

const GRADING_STATUS = 'GRADING';
const QH_ROLE = 'QH';
const PL_ROLE = 'PL';
const BOTH_ROLE = 'BOTH';

// Cac trang thai tu GRADING den het status flow v2.
const DOWNSTREAM_STATUSES = [
  'GRADING',
  'GDTTKD_EVALUATING',
  'RE_GRADING',
  'RE_GDTTKD_EVALUATING',
  'TGD_REVIEW',
  'DESIGNING',
  'INFOR_WAITING',
  'PROPOSAL_REPORT_CREATING',
  'PROPOSAL_REPORT_RE_CREATING',
  'PROPOSAL_REPORT_REVIEWING',
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
  if (tab === 'pending') return [GRADING_STATUS];
  if (tab === 'completed') return DOWNSTREAM_STATUSES.filter((s) => s !== GRADING_STATUS).concat('CANCELLED');
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
    grading_status_label: code ? (GRADING_NOTE_LABELS[code] || code) : null
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

exports.listProposals = async ({ tab = 'all', department = '', search = '', page = 1, limit = 10, scope = {} } = {}) => {
  const safeTab = ['all', 'pending', 'completed'].includes(tab) ? tab : 'all';
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 10));
  const offset = (safePage - 1) * safeLimit;
  const statuses = statusListForTab(safeTab);
  const where = [];
  const params = [];

  const withoutCancelled = statuses.filter((status) => status !== 'CANCELLED');
  if (withoutCancelled.length > 0) {
    const placeholders = withoutCancelled.map(() => '?').join(',');
    let clause = `p.status IN (${placeholders})`;
    params.push(...withoutCancelled);
    if (statuses.includes('CANCELLED')) {
      const cancelledCondition = safeTab === 'completed'
        ? '(p.quy_hoach_score IS NOT NULL AND p.phap_ly_score IS NOT NULL)'
        : '(p.quy_hoach_score IS NOT NULL OR p.phap_ly_score IS NOT NULL)';
      clause = `(${clause} OR (p.status = 'CANCELLED' AND ${cancelledCondition}))`;
    }
    where.push(clause);
  }

  if (safeTab === 'completed') {
    where.push('p.quy_hoach_score IS NOT NULL');
    where.push('p.phap_ly_score IS NOT NULL');
  }

  if (safeTab === 'pending') {
    const dept = department || scope.gradeRole || '';
    if (dept === QH_ROLE) where.push('p.quy_hoach_score IS NULL');
    else if (dept === PL_ROLE) where.push('p.phap_ly_score IS NULL');
    else where.push('(p.quy_hoach_score IS NULL OR p.phap_ly_score IS NULL)');
  }

  if (search) {
    const like = `%${String(search).trim()}%`;
    where.push('(p.ma_de_xuat_gen LIKE ? OR p.owner_name LIKE ? OR p.owner_phone LIKE ? OR p.address LIKE ? OR u.full_name LIKE ?)');
    params.push(like, like, like, like, like);
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
    `SELECT p.*, p.ma_de_xuat_gen AS ma_de_xuat, u.full_name AS user_name, u.email AS user_email
     FROM station_proposals p
     LEFT JOIN users u ON u.id = p.user_id
     ${whereClause}
     ORDER BY p.updated_at DESC, p.id DESC
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
  if (!DOWNSTREAM_STATUSES.includes(current.status)) {
    const error = new Error('Chỉ được chấm điểm đề xuất từ trạng thái Đang đánh giá quy hoạch và pháp lý trở đi');
    error.statusCode = 400;
    throw error;
  }

  const role = gradeRole === BOTH_ROLE ? BOTH_ROLE : (gradeRole || resolveGradingRole(await getUserDepartment(userId)));
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
  if ((hasQHFields && !canQH) || (hasPLFields && !canPL)) {
    const error = new Error('Bạn không có quyền cập nhật điểm của phòng ban khác');
    error.statusCode = 403;
    throw error;
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

  const isGrading = current.status === GRADING_STATUS;
  const isReGrading = current.status === 'RE_GRADING';
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
    if (nextQH === 0 || nextPL === 0) {
      target = 'CANCELLED';
      reason = nextQH === 0 && nextPL === 0
        ? 'Điểm Quy hoạch và Pháp lý đều bằng 0'
        : nextQH === 0
          ? 'Điểm Quy hoạch bằng 0'
          : 'Điểm Pháp lý bằng 0';
    } else if (nextQH !== null && nextPL !== null) {
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
        } else if (isReGrading) {
          try {
            await proposalRequestService.closeRequests(proposalId, ['RE_GRADE'], { resolvedBy: userId || null });
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
