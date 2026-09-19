const pool = require('../utils/db');
const notificationService = require('./notificationService');

const ALL_STATUSES = ['PENDING', 'REVIEWING', 'APPROVED', 'REJECTED', 'CANCELLED', 'CONTRACT_SIGNED', 'CONTRACT_FAILED', 'ARCHIVED'];

const ALLOWED_TRANSITIONS = {
  PENDING: ['REVIEWING', 'REJECTED', 'CANCELLED'],
  REVIEWING: ['APPROVED', 'CANCELLED', 'ARCHIVED'],
  APPROVED: ['CONTRACT_SIGNED', 'CONTRACT_FAILED'],
  ARCHIVED: ['CONTRACT_SIGNED', 'CANCELLED'],
  CONTRACT_SIGNED: ['CANCELLED'],
  CONTRACT_FAILED: ['CANCELLED'],
  REJECTED: ['PENDING'],
  CANCELLED: []
};

const REASON_REQUIRED = ['REJECTED', 'CANCELLED'];

const SKIP_DIFF_KEYS = new Set([
  'id', 'user_id', 'created_at', 'updated_at', 'custom_data', 'status',
  'submission_source', 'submitter_ip', 'contact_1office_id', 'contact_1office_code',
  'last_synced_at', 'last_synced_data', 'sync_status', 'ma_de_xuat_gen',
  'reviewed_by', 'reviewed_at', 'reject_reason'
]);

const normVal = (v) => {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
};

exports.buildDiff = (oldFlat, newFlat, fieldDefs) => {
  const labelOf = (key) => {
    const f = (fieldDefs || []).find(d => d.key === key);
    return (f && f.label) || key;
  };
  const keys = new Set([...Object.keys(oldFlat || {}), ...Object.keys(newFlat || {})]);
  const diff = {};
  for (const k of keys) {
    if (SKIP_DIFF_KEYS.has(k)) continue;
    const o = normVal(oldFlat ? oldFlat[k] : '');
    const n = normVal(newFlat ? newFlat[k] : '');
    if (o !== n) {
      diff[k] = { label: labelOf(k), old: o.slice(0, 500), new: n.slice(0, 500) };
    }
  }
  return diff;
};

exports.ALL_STATUSES = ALL_STATUSES;
exports.ALLOWED_TRANSITIONS = ALLOWED_TRANSITIONS;

const err = (message, statusCode) => Object.assign(new Error(message), { statusCode });

exports.logActivity = async ({ proposalId, action, fromStatus, toStatus, changedFields, reason, actorId, actorRole, source, manualOverride, ip }) => {
  await pool.query(
    `INSERT INTO proposal_activity_logs
      (proposal_id, action, from_status, to_status, changed_fields, reject_reason, actor_id, actor_role, source, manual_override, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      proposalId, action,
      fromStatus || null, toStatus || null,
      changedFields ? JSON.stringify(changedFields) : null,
      reason || null, actorId || null, actorRole || null,
      source || 'user', manualOverride ? 1 : 0, ip || null
    ]
  );
};

exports.transition = async (id, to, opts = {}) => {
  const { reason, actorId, actorRole, source = 'user', manualOverride = false, ip, isSuperAdmin = false } = opts;
  if (!ALL_STATUSES.includes(to)) {
    throw err('Trạng thái không hợp lệ', 400);
  }
  const [rows] = await pool.query(
    'SELECT id, user_id, status, contact_1office_code, custom_data FROM station_proposals WHERE id = ?',
    [id]
  );
  if (rows.length === 0) {
    throw err('Không tìm thấy đề xuất', 404);
  }
  const proposal = rows[0];
  const from = proposal.status;
  if (from === to) {
    return { id, status: to, prevStatus: from, unchanged: true, autoPush: null };
  }
  const isEmergencyReopen = from === 'CANCELLED' && to === 'PENDING' && source === 'user' && isSuperAdmin === true;
  if (!(ALLOWED_TRANSITIONS[from] || []).includes(to) && !isEmergencyReopen) {
    await exports.logActivity({
      proposalId: id, action: 'status_change_denied',
      fromStatus: from, toStatus: to,
      actorId, actorRole, source, ip
    });
    throw err(`Không thể chuyển trạng thái từ "${from}" sang "${to}"`, 400);
  }
  const cleanReason = REASON_REQUIRED.includes(to) ? String(reason || '').trim() : null;
  if (REASON_REQUIRED.includes(to) && !cleanReason) {
    throw err(to === 'REJECTED' ? 'Vui lòng nhập lý do từ chối' : 'Vui lòng nhập lý do hủy', 400);
  }
  if (isEmergencyReopen && !String(reason || '').trim()) {
    throw err('Mở lại khẩn cấp cần nhập lý do', 400);
  }
  const auditReason = cleanReason || (isEmergencyReopen ? String(reason || '').trim() : null);

  await pool.query(
    `UPDATE station_proposals
     SET status = ?, reject_reason = ?, reviewed_by = ?, reviewed_at = NOW(), updated_at = NOW()
     WHERE id = ?`,
    [to, cleanReason, actorId || null, id]
  );

  if (proposal.user_id) {
    await notificationService.create({
      userId: proposal.user_id,
      type: to,
      title: notificationService.statusTitle(to),
      message: REASON_REQUIRED.includes(to) ? cleanReason : null,
      entityType: 'station_proposals',
      entityId: id,
      createdBy: actorId || null
    });
  }

  await exports.logActivity({
    proposalId: id, action: 'status_change',
    fromStatus: from, toStatus: to, reason: auditReason,
    actorId, actorRole, source: isEmergencyReopen ? 'admin_override' : source,
    manualOverride: manualOverride || isEmergencyReopen, ip
  });

  let autoPush = null;
  if (to === 'REVIEWING' && from !== 'REVIEWING') {
    autoPush = await autoPushOnReview(id, actorId || null);
  }

  return { id, status: to, prevStatus: from, autoPush };
};

async function autoPushOnReview(id, reviewerId) {
  try {
    const apiConfigService = require('./apiConfigService');
    const syncService = require('./syncService');
    const config = await apiConfigService.getDefaultPushConfig();
    if (!config) {
      return { queued: false, reason: 'Chưa có cấu hình API 1Office đang hoạt động' };
    }
    const results = await syncService.pushTo1Office([id], config.id, reviewerId);
    const first = results && results[0];
    if (!first || !first.success) {
      return { queued: false, reason: (first && first.error) || 'Không tạo được lệnh đẩy' };
    }
    return { queued: true, jobId: first.jobId, isUpdate: !!first.isUpdate, apiConfigId: config.id };
  } catch (e) {
    return { queued: false, reason: e.message || 'Lỗi tạo lệnh đẩy' };
  }
}
