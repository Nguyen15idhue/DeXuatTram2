const pool = require('../utils/db');
const path = require('path');
const fs = require('fs');
const dynamicUtils = require('./dynamicUtils');
const proposalGradingService = require('./proposalGradingService');
const proposalReportService = require('./proposalReportService');
const signedDocumentService = require('./signedDocumentService');

const { parseCustomData, toFileSummaries } = proposalGradingService;

const SIGNATURE_PENDING = 'SIGNATURE_PENDING';
const COMPLETED = 'COMPLETED';
const UPDATING_STATUS = 'PROPOSAL_REPORT_UPDATING';
const REPORT_FIELD = 'file_bc_dx';
const REVISION_REQUEST_TYPE = 'REVISE_BCDX';

const SIGN_STATUS = {
  PENDING: 'PENDING',
  DOING: 'DOING',
  DONE: 'DONE',
  CEO_SIGNED: 'CEO_SIGNED'
};

const SIGN_STATUS_LABELS = {
  PENDING: 'Cần thực hiện',
  DOING: 'Đang thực hiện',
  DONE: 'Đã hoàn thành',
  CEO_SIGNED: 'Chủ tịch đã phê duyệt'
};

const TAB_STATUSES = {
  all: [SIGNATURE_PENDING, COMPLETED],
  pending: [SIGNATURE_PENDING],
  chairman: [SIGNATURE_PENDING],
  completed: [SIGNATURE_PENDING, COMPLETED]
};

const err = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const notificationService = require('./notificationService');

const SIGNER_TOTAL_SQL = "(SELECT COUNT(*) FROM proposal_signature_configs s WHERE s.proposal_id = p.id AND s.status <> 'CANCELLED')";
const SIGNER_SIGNED_SQL = "(SELECT COUNT(*) FROM proposal_signature_configs s WHERE s.proposal_id = p.id AND s.status = 'SIGNED')";
const MY_CONFIG_SQL = "(SELECT COUNT(*) FROM proposal_signature_configs s WHERE s.proposal_id = p.id AND s.user_id = ? AND s.status <> 'CANCELLED')";
const MY_SIGNED_SQL = "(SELECT COUNT(*) FROM proposal_signature_configs s WHERE s.proposal_id = p.id AND s.user_id = ? AND s.status = 'SIGNED')";

const resolveScope = async (user) => {
  const proposalReviewService = require('./proposalReviewService');
  const profile = await proposalReportService.resolveScope(user);
  const roleKey = proposalReviewService.resolveRoleKey({
    role: user && user.role,
    department: profile.department,
    chucVu: profile.chucVu
  });
  return {
    ...profile,
    roleKey,
    isTgd: roleKey === 'TGD',
    isManager: profile.isAdmin || profile.isBackOffice || roleKey === 'TGD'
  };
};

const computeSignStatus = (row) => {
  if (row.signed_file_id) return SIGN_STATUS.CEO_SIGNED;
  const total = Number(row.signer_total || 0);
  const signed = Number(row.signer_signed || 0);
  if (total === 0 || signed === 0) return SIGN_STATUS.PENDING;
  if (signed < total) return SIGN_STATUS.DOING;
  return SIGN_STATUS.DONE;
};

const mapSignatureRow = (row) => {
  const custom = parseCustomData(row.custom_data);
  const signStatus = computeSignStatus(row);
  return {
    ...row,
    custom_data: custom,
    signer_total: Number(row.signer_total || 0),
    signer_signed: Number(row.signer_signed || 0),
    sign_status: signStatus,
    sign_status_label: SIGN_STATUS_LABELS[signStatus],
    can_sign: Number(row.my_config_count || 0) > 0 && Number(row.my_signed_count || 0) === 0,
    is_my_signed: Number(row.my_signed_count || 0) > 0
  };
};

exports.SIGN_STATUS = SIGN_STATUS;
exports.SIGN_STATUS_LABELS = SIGN_STATUS_LABELS;
exports.TAB_STATUSES = TAB_STATUSES;

exports.listProposals = async ({ user, tab = 'all', search = '', page = 1, limit = 10 } = {}) => {
  const safeTab = Object.prototype.hasOwnProperty.call(TAB_STATUSES, tab) ? tab : 'all';
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 10));
  const offset = (safePage - 1) * safeLimit;
  const scope = await resolveScope(user);
  const statuses = TAB_STATUSES[safeTab];

  const where = [`p.status IN (${statuses.map(() => '?').join(',')})`];
  const params = [...statuses];

  if (safeTab === 'all') {
    if (!scope.isManager) {
      where.push(`${MY_CONFIG_SQL} > 0`);
      params.push(scope.userId);
    }
  } else if (safeTab === 'pending') {
    if (scope.isManager) {
      // Back Office / Admin / Tổng giám đốc: toàn bộ hồ sơ đang trình ký.
    } else {
      where.push(`${MY_CONFIG_SQL} > 0 AND ${MY_SIGNED_SQL} = 0`);
      params.push(scope.userId, scope.userId);
    }
  } else if (safeTab === 'chairman') {
    where.push(`${SIGNER_TOTAL_SQL} > 0 AND ${SIGNER_SIGNED_SQL} = ${SIGNER_TOTAL_SQL}`);
    where.push('p.signed_file_id IS NULL');
  } else if (safeTab === 'completed') {
    if (scope.isManager) {
      where.push(`(p.status = 'COMPLETED' OR (${SIGNER_TOTAL_SQL} > 0 AND ${SIGNER_SIGNED_SQL} = ${SIGNER_TOTAL_SQL}))`);
    } else {
      where.push(`(${MY_SIGNED_SQL} > 0 OR p.status = 'COMPLETED')`);
      params.push(scope.userId);
    }
  }

  if (search) {
    const like = `%${String(search).trim()}%`;
    where.push(`(
      p.ma_de_xuat_gen LIKE ? OR p.owner_name LIKE ? OR p.owner_phone LIKE ? OR p.address LIKE ?
      OR u.full_name LIKE ?
    )`);
    params.push(like, like, like, like, like);
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
            p.signed_file_id,
            ${SIGNER_TOTAL_SQL} AS signer_total,
            ${SIGNER_SIGNED_SQL} AS signer_signed,
            (SELECT COUNT(*) FROM proposal_signature_configs s
              WHERE s.proposal_id = p.id AND s.user_id = ? AND s.status <> 'CANCELLED') AS my_config_count,
            (SELECT COUNT(*) FROM proposal_signature_configs s
              WHERE s.proposal_id = p.id AND s.user_id = ? AND s.status = 'SIGNED') AS my_signed_count
     FROM station_proposals p
     LEFT JOIN users u ON u.id = p.user_id
     ${whereClause}
     ORDER BY p.updated_at DESC, p.id DESC
     LIMIT ? OFFSET ?`,
    [scope.userId, scope.userId, ...params, safeLimit, offset]
  );

  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const proposals = rows.map((row) => dynamicUtils.mergeData(row, fieldDefs)).map(mapSignatureRow);

  return {
    proposals,
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) },
    meta: {
      isAdmin: !!scope.isAdmin,
      isBackOffice: !!scope.isBackOffice,
      isTgd: !!scope.isTgd,
      isManager: !!scope.isManager,
      department: scope.department
    }
  };
};

const loadProposal = async (id) => {
  const proposalId = Number(id);
  if (!Number.isInteger(proposalId) || proposalId <= 0) throw err('Đề xuất không hợp lệ', 400);
  const [rows] = await pool.query(
    'SELECT id, ma_de_xuat_gen AS ma_de_xuat, user_id, status, owner_name, owner_phone, custom_data, chot_so_luong_tru, tong_gia_tri_chot, signed_file_id FROM station_proposals WHERE id = ?',
    [proposalId]
  );
  if (rows.length === 0) throw err('Không tìm thấy đề xuất', 404);
  return rows[0];
};

const loadConfigs = async (proposalId) => {
  const [rows] = await pool.query(
    `SELECT s.*, u.full_name, u.email, u.role
     FROM proposal_signature_configs s
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.proposal_id = ? AND s.status <> 'CANCELLED'
     ORDER BY s.page ASC, s.id ASC`,
    [proposalId]
  );
  return rows.map((row) => ({
    id: row.id,
    proposal_id: row.proposal_id,
    user_id: row.user_id,
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    signer_title: row.signer_title,
    file_id: row.file_id,
    page: row.page,
    pos_x: Number(row.pos_x),
    pos_y: Number(row.pos_y),
    box_width: Number(row.box_width),
    box_height: Number(row.box_height),
    status: row.status,
    signed_at: row.signed_at,
    signature_id: row.signature_id,
    signature_url: row.signature_url
  }));
};

const buildDetail = async (proposal, scope) => {
  const configs = await loadConfigs(proposal.id);
  const custom = parseCustomData(proposal.custom_data);
  const reportFiles = toFileSummaries(custom[REPORT_FIELD]);
  const myConfig = configs.find((config) => Number(config.user_id) === Number(scope.userId));
  return {
    id: proposal.id,
    ma_de_xuat: proposal.ma_de_xuat,
    status: proposal.status,
    user_id: proposal.user_id,
    owner_name: proposal.owner_name,
    owner_phone: proposal.owner_phone,
    chot_so_luong_tru: proposal.chot_so_luong_tru,
    tong_gia_tri_chot: proposal.tong_gia_tri_chot,
    signed_file_id: proposal.signed_file_id,
    report_files: reportFiles,
    signers: configs,
    signer_total: configs.length,
    signer_signed: configs.filter((config) => config.status === 'SIGNED').length,
    sign_status: proposal.signed_file_id
      ? SIGN_STATUS.CEO_SIGNED
      : (configs.length > 0 && configs.every((config) => config.status === 'SIGNED')
        ? SIGN_STATUS.DONE
        : (configs.some((config) => config.status === 'SIGNED') ? SIGN_STATUS.DOING : SIGN_STATUS.PENDING)),
    can_sign: !!myConfig && myConfig.status === 'PENDING',
    is_my_signed: !!myConfig && myConfig.status === 'SIGNED',
    my_config: myConfig || null
  };
};

exports.getDetail = async ({ user, id } = {}) => {
  const scope = await resolveScope(user);
  const proposal = await loadProposal(id);
  if (![SIGNATURE_PENDING, COMPLETED].includes(proposal.status)) {
    throw err('Đề xuất không ở trạng thái trình ký', 400);
  }
  const detail = await buildDetail(proposal, scope);
  return {
    ...detail,
    sign_status_label: SIGN_STATUS_LABELS[detail.sign_status],
    can_reject: !!scope.isAdmin || !!scope.isTgd,
    can_upload_signed: !!scope.isAdmin || !!scope.isBackOffice,
    can_view: scope.isManager || !!detail.can_sign || Number(proposal.user_id) === Number(scope.userId)
  };
};

const buildMessage = async (proposal, actorId, { status, actionLabel, reason }) => {
  const code = notificationService.proposalCode(proposal.custom_data, proposal.id);
  const actorName = (await notificationService.getUserName(actorId)) || 'Hệ thống';
  return notificationService.statusMessage({ code, actorName, status, actionLabel, reason });
};

const notifyRecipients = async (userIds, { type, title, message, entityId, actorId }) => {
  const ids = [...new Set((userIds || []).filter(Boolean).map(Number))];
  for (const userId of ids) {
    if (Number(userId) === Number(actorId)) continue;
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

const notifyBackOfficeAndSigners = async ({ proposal, actorId, message, type = SIGNATURE_PENDING }) => {
  const backOfficeIds = (await (async () => {
    const [rows] = await pool.query("SELECT id, custom_data FROM users WHERE status = 'ACTIVE'");
    return rows
      .filter((row) => proposalReportService.isBackOffice(parseCustomData(row.custom_data).department))
      .map((row) => Number(row.id));
  })());
  const configs = await loadConfigs(proposal.id);
  const signerIds = configs.map((config) => Number(config.user_id));
  await notifyRecipients([...backOfficeIds, ...signerIds], {
    type,
    title: 'Đề xuất đang trình ký',
    message,
    entityId: proposal.id,
    actorId
  });
};

exports.sign = async ({ user, id, ip } = {}) => {
  const scope = await resolveScope(user);
  const proposal = await loadProposal(id);
  if (proposal.status !== SIGNATURE_PENDING) {
    throw err('Đề xuất không ở trạng thái trình ký', 400);
  }

  const [rows] = await pool.query(
    `SELECT * FROM proposal_signature_configs
     WHERE proposal_id = ? AND user_id = ? AND status <> 'CANCELLED'
     ORDER BY id ASC LIMIT 1`,
    [proposal.id, scope.userId]
  );
  if (rows.length === 0) {
    throw err('Bạn không được phân công ký đề xuất này', 403);
  }
  const config = rows[0];
  if (config.status === 'SIGNED') {
    throw err('Bạn đã ký đề xuất này', 400);
  }

  const [signatureRows] = await pool.query(
    'SELECT id, file_url FROM signatures WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
    [scope.userId]
  );
  if (signatureRows.length === 0) {
    throw err('Bạn chưa tải chữ ký số trong hồ sơ cá nhân', 400);
  }
  const signature = signatureRows[0];
  await signedDocumentService.validateSignature(signature.id);

  await pool.query(
    `UPDATE proposal_signature_configs
     SET status = 'SIGNED', signed_at = NOW(), signature_id = ?, signature_url = ?
     WHERE id = ?`,
    [signature.id, signature.file_url || null, config.id]
  );

  const proposalLifecycle = require('./proposalLifecycle');
  await proposalLifecycle.logActivity({
    proposalId: proposal.id,
    action: 'signature_signed',
    fromStatus: proposal.status,
    toStatus: proposal.status,
    changedFields: {
      signer: { label: 'Người ký', old: '', new: `${config.signer_title || ''} (${scope.userId})`.trim() }
    },
    actorId: user.id,
    actorRole: user.role,
    source: 'user',
    ip
  });

  const message = await buildMessage(proposal, user.id, {
    status: SIGNATURE_PENDING,
    actionLabel: 'Người ký',
    reason: 'Đã ký BCĐX'
  });
  await notifyBackOfficeAndSigners({ proposal, actorId: user.id, message });

  const updated = await loadProposal(id);
  return buildDetail(updated, scope);
};

exports.reject = async ({ user, id, reason, ip } = {}) => {
  const scope = await resolveScope(user);
  if (!scope.isAdmin && !scope.isTgd) {
    throw err('Chỉ Tổng giám đốc hoặc Admin được từ chối duyệt', 403);
  }
  const proposal = await loadProposal(id);
  if (proposal.status !== SIGNATURE_PENDING) {
    throw err('Đề xuất không ở trạng thái trình ký', 400);
  }
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) throw err('Vui lòng nhập lý do từ chối duyệt', 400);

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
    [proposal.id, REVISION_REQUEST_TYPE]
  );
  const round = Number(countRows[0]?.n || 0) + 1;

  const request = await require('./proposalRequestService').createRequest({
    proposalId: proposal.id,
    type: REVISION_REQUEST_TYPE,
    description: cleanReason,
    requestedBy: user.id,
    previousStatus: SIGNATURE_PENDING,
    currentStatus: UPDATING_STATUS,
    targetUserId: proposal.user_id || null,
    targetTitle: 'Người đề xuất',
    note: `Lần yêu cầu tạo lại BCĐX: ${round}`,
    roundNo: round
  });

  await proposalLifecycle.logActivity({
    proposalId: proposal.id,
    action: 'signature_rejected',
    fromStatus: SIGNATURE_PENDING,
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

  const message = await buildMessage(proposal, user.id, {
    status: UPDATING_STATUS,
    actionLabel: 'Tổng giám đốc',
    reason: cleanReason
  });
  const regionIds = await proposalReportService.findGdttkdIdsByRegion(
    require('./proposalReviewService').resolveRegion(parseCustomData(proposal.custom_data).vung_mien)
  );
  await notifyRecipients(regionIds, {
    type: UPDATING_STATUS,
    title: 'Đề xuất cần tạo lại tờ trình BCĐX',
    message,
    entityId: proposal.id,
    actorId: user.id
  });

  return { id: proposal.id, status: UPDATING_STATUS, roundNo: round, request, transition };
};

exports.uploadSignedFile = async ({ user, id, files, ip } = {}) => {
  const scope = await resolveScope(user);
  if (!scope.isAdmin && !scope.isBackOffice) {
    throw err('Chỉ Back Office hoặc Admin được tải lên file đã ký', 403);
  }
  const proposal = await loadProposal(id);
  if (proposal.status !== SIGNATURE_PENDING) {
    throw err('Đề xuất không ở trạng thái trình ký', 400);
  }

  const configs = await loadConfigs(proposal.id);
  if (configs.length === 0 || configs.some((config) => config.status !== 'SIGNED')) {
    throw err('Chưa đủ chữ ký của các người được phân công', 400);
  }

  const fileIds = (Array.isArray(files) ? files : [])
    .map((file) => Number(file && typeof file === 'object' ? (file.id ?? file.file_id) : file))
    .filter((fileId) => Number.isInteger(fileId) && fileId > 0);
  if (fileIds.length === 0) {
    throw err('Vui lòng tải lên file BCĐX đã ký', 400);
  }
  const [fileRows] = await pool.query(
    `SELECT id, original_name FROM files WHERE id IN (${fileIds.map(() => '?').join(',')}) AND status <> 'deleted'`,
    fileIds
  );
  if (fileRows.length === 0) {
    throw err('Không tìm thấy file đã ký', 400);
  }
  const signedFileId = fileRows[0].id;

  await pool.query(
    'UPDATE station_proposals SET signed_file_id = ?, updated_at = NOW() WHERE id = ?',
    [signedFileId, proposal.id]
  );

  const proposalLifecycle = require('./proposalLifecycle');
  const transition = await proposalLifecycle.transition(proposal.id, COMPLETED, {
    reason: 'Đã tải lên file BCĐX chủ tịch phê duyệt',
    actorId: user.id,
    actorRole: user.role,
    source: 'user',
    ip
  });

  await proposalLifecycle.logActivity({
    proposalId: proposal.id,
    action: 'signed_file_uploaded',
    fromStatus: SIGNATURE_PENDING,
    toStatus: COMPLETED,
    changedFields: {
      signed_file_id: { label: 'File BCĐX đã ký', old: '', new: String(signedFileId) }
    },
    actorId: user.id,
    actorRole: user.role,
    source: 'user',
    ip
  });

  const message = await buildMessage(proposal, user.id, {
    status: COMPLETED,
    actionLabel: 'Back Office',
    reason: 'Đã tải lên file BCĐX chủ tịch phê duyệt'
  });
  await notifyRecipients(configs.map((config) => config.user_id), {
    type: COMPLETED,
    title: 'Đề xuất đã được phê duyệt',
    message,
    entityId: proposal.id,
    actorId: user.id
  });

  return { id: proposal.id, status: COMPLETED, signed_file_id: signedFileId, transition };
};

exports.getExportFile = async ({ user, id } = {}) => {
  const scope = await resolveScope(user);
  const proposal = await loadProposal(id);
  const detail = await buildDetail(proposal, scope);
  const signedFileId = proposal.signed_file_id;
  const fallbackFileId = detail.report_files.length > 0 ? detail.report_files[0].id : null;
  const fileId = signedFileId || fallbackFileId;
  if (!fileId) {
    throw err('Đề xuất chưa có file BCĐX để xuất', 400);
  }
  const [fileRows] = await pool.query(
    'SELECT id, original_name, mime_type FROM files WHERE id = ? LIMIT 1',
    [fileId]
  );
  if (fileRows.length === 0) {
    throw err('Không tìm thấy file BCĐX', 404);
  }
  return { file_id: fileRows[0].id, original_name: fileRows[0].original_name, mime_type: fileRows[0].mime_type };
};

exports.getSignedDocument = async ({ user, id } = {}) => {
  const scope = await resolveScope(user);
  const proposal = await loadProposal(id);
  const detail = await buildDetail(proposal, scope);
  const canView = scope.isManager || detail.can_sign || detail.is_my_signed
    || Number(proposal.user_id) === Number(scope.userId);
  if (!canView) {
    throw err('Bạn không có quyền xem file BCĐX này', 403);
  }
  const reportFileId = detail.report_files.find((file) => Number(file.id) > 0)?.id;
  if (!proposal.signed_file_id && !reportFileId) {
    throw err('Đề xuất chưa có file BCĐX để xuất', 400);
  }
  return signedDocumentService.build({
    reportFileId,
    signedFileId: proposal.signed_file_id,
    signers: detail.signers.filter((signer) => signer.status === 'SIGNED')
  });
};

exports.getSignatureImagePath = async ({ user, id, configId } = {}) => {
  const scope = await resolveScope(user);
  const proposal = await loadProposal(id);
  const detail = await buildDetail(proposal, scope);
  const canView = scope.isManager || detail.can_sign || detail.is_my_signed
    || Number(proposal.user_id) === Number(scope.userId);
  if (!canView) {
    throw err('Bạn không có quyền xem chữ ký này', 403);
  }
  const config = detail.signers.find((item) => Number(item.id) === Number(configId));
  if (!config || !config.signature_id) {
    throw err('Không tìm thấy chữ ký', 404);
  }
  const [rows] = await pool.query('SELECT file_path FROM signatures WHERE id = ? LIMIT 1', [config.signature_id]);
  if (rows.length === 0 || !rows[0].file_path || !fs.existsSync(rows[0].file_path)) {
    throw err('Không tìm thấy file chữ ký', 404);
  }
  return path.resolve(rows[0].file_path);
};
