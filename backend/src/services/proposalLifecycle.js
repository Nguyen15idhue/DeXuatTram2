const pool = require('../utils/db');
const notificationService = require('./notificationService');

const ALL_STATUSES = ['PENDING', 'REVIEWING', 'PRINCIPLE_APPROVED', 'APPROVED', 'REJECTED', 'CANCELLED', 'CONTRACT_SIGNED', 'CONTRACT_FAILED', 'ARCHIVED'];

const ALLOWED_TRANSITIONS = {
  PENDING: ['REVIEWING', 'REJECTED', 'CANCELLED'],
  REVIEWING: ['PRINCIPLE_APPROVED', 'APPROVED', 'CANCELLED', 'ARCHIVED'],
  PRINCIPLE_APPROVED: ['APPROVED', 'CANCELLED'],
  APPROVED: ['CONTRACT_SIGNED', 'CONTRACT_FAILED', 'CANCELLED'],
  ARCHIVED: ['CONTRACT_SIGNED', 'CANCELLED'],
  CONTRACT_SIGNED: ['CANCELLED'],
  CONTRACT_FAILED: ['CANCELLED'],
  REJECTED: ['PENDING', 'CANCELLED'],
  CANCELLED: []
};

const REASON_REQUIRED = ['REJECTED', 'CANCELLED'];

// Cac dich chi duoc cap nhat tu 1Office (webhook) hoac he thong tu dong.
// Thao tac tay tu UI (source=user) bi chan ke ca khi ma tran cho phep.
const WEBHOOK_ONLY_TARGETS = ['PRINCIPLE_APPROVED', 'APPROVED', 'ARCHIVED', 'CONTRACT_SIGNED', 'CONTRACT_FAILED'];

const SKIP_DIFF_KEYS = new Set([
  'id', 'user_id', 'created_at', 'updated_at', 'custom_data', 'status',
  'submission_source', 'submitter_ip', 'contact_1office_id', 'contact_1office_code',
  'last_synced_at', 'last_synced_data', 'sync_status', 'ma_de_xuat_gen',
  'reviewed_by', 'reviewed_at', 'reject_reason', 'supplement_deadline_at', 'info_completed_at'
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
  const { reason, actorId, actorRole, source = 'user', manualOverride = false, ip, isSuperAdmin = false, force = false } = opts;
  if (!ALL_STATUSES.includes(to)) {
    throw err('Trạng thái không hợp lệ', 400);
  }
  const [rows] = await pool.query(
    'SELECT id, user_id, status, contact_1office_code, custom_data, supplement_deadline_at FROM station_proposals WHERE id = ?',
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
  const forceOverride = force === true && source === 'user' && isSuperAdmin === true;
  if (forceOverride && !String(reason || '').trim()) {
    throw err('Ghi đè trạng thái cần nhập lý do', 400);
  }
  if (!forceOverride) {
    if (!(ALLOWED_TRANSITIONS[from] || []).includes(to) && !isEmergencyReopen) {
      await exports.logActivity({
        proposalId: id, action: 'status_change_denied',
        fromStatus: from, toStatus: to,
        actorId, actorRole, source, ip
      });
      throw err(`Không thể chuyển trạng thái từ "${from}" sang "${to}"`, 400);
    }
    if (WEBHOOK_ONLY_TARGETS.includes(to) && source === 'user') {
      await exports.logActivity({
        proposalId: id, action: 'status_change_denied',
        fromStatus: from, toStatus: to,
        actorId, actorRole, source, ip
      });
      throw err('Trạng thái này chỉ được cập nhật tự động từ 1Office', 400);
    }
    if (from === 'PENDING' && to === 'REVIEWING' && source === 'user') {
      const { checkCompleteness } = require('./proposalCompleteness');
      const check = await checkCompleteness(id);
      if (!check.complete) {
        const e = err(`Thông tin chưa đầy đủ, không thể duyệt: ${check.missing[0] || 'thiếu trường bắt buộc'}`, 400);
        e.details = check.missing;
        throw e;
      }
    }
    if (isEmergencyReopen && !String(reason || '').trim()) {
      throw err('Mở lại khẩn cấp cần nhập lý do', 400);
    }
  }
  const cleanReason = forceOverride
    ? String(reason).trim()
    : (REASON_REQUIRED.includes(to) ? String(reason || '').trim() : null);
  if (!forceOverride && REASON_REQUIRED.includes(to) && !cleanReason) {
    throw err(to === 'REJECTED' ? 'Vui lòng nhập lý do từ chối' : 'Vui lòng nhập lý do hủy', 400);
  }
  const auditReason = cleanReason || (isEmergencyReopen ? String(reason || '').trim() : null);

  await pool.query(
    `UPDATE station_proposals
     SET status = ?, reject_reason = ?, reviewed_by = ?, reviewed_at = NOW(), updated_at = NOW()
     WHERE id = ?`,
    [to, cleanReason, actorId || null, id]
  );

  const deadlineMinutes = await exports.getDeadlineMinutes(to);
  const sameSharedGroup = COUNTDOWN_SHARED_GROUP[from] && COUNTDOWN_SHARED_GROUP[from] === COUNTDOWN_SHARED_GROUP[to];
  const keepDeadline = sameSharedGroup && proposal.supplement_deadline_at != null;
  if (deadlineMinutes && !keepDeadline) {
    try {
      await pool.query(
        'UPDATE station_proposals SET supplement_deadline_at = DATE_ADD(NOW(), INTERVAL ? MINUTE), info_completed_at = NULL WHERE id = ?',
        [deadlineMinutes, id]
      );
    } catch { /* silent: khong chan chuyen trang thai vi deadline */ }
  }

  let stationCreated = null;
  let stationCreateError = null;
  if (to === 'CONTRACT_SIGNED') {
    try {
      const stationService = require('./stationService');
      const r = await stationService.convertProposalToStation(id, { actorId, actorRole, source, ip, skipNotify: true });
      if (r.created) stationCreated = r.station;
    } catch (e) {
      stationCreateError = e.message || 'Lỗi tạo trạm';
    }
  }

  if (proposal.user_id) {
    const code = notificationService.proposalCode(proposal.custom_data, id);
    let actorName;
    if (source === 'system_auto') actorName = 'Hệ thống';
    else actorName = (await notificationService.getUserName(actorId)) || (source === 'webhook' ? '1Office' : 'Hệ thống');
    if (stationCreated) {
      const createdMaTram = stationCreated.ma_tram || '';
      await notificationService.create({
        userId: proposal.user_id,
        type: to,
        title: notificationService.statusTitle(to),
        message: `Mã đề xuất: ${code} · Ký hợp đồng thành công và tạo trạm "${stationCreated.name}"${createdMaTram ? ` (${createdMaTram})` : ''} · Người thực hiện: ${actorName}`,
        entityType: 'stations',
        entityId: stationCreated.id,
        createdBy: actorId || null
      });
    } else {
      let message = notificationService.statusMessage({
        code,
        actorName,
        reason: REASON_REQUIRED.includes(to) ? cleanReason : null,
        status: to
      });
      if (stationCreateError) message += ` · Tạo trạm lỗi: ${stationCreateError}`;
      await notificationService.create({
        userId: proposal.user_id,
        type: to,
        title: notificationService.statusTitle(to),
        message,
        entityType: 'station_proposals',
        entityId: id,
        createdBy: actorId || null
      });
    }
  }

  const overrideActive = (typeof forceOverride !== 'undefined' && forceOverride) || isEmergencyReopen;
  await exports.logActivity({
    proposalId: id, action: 'status_change',
    fromStatus: from, toStatus: to, reason: auditReason,
    actorId, actorRole, source: overrideActive ? 'admin_override' : source,
    manualOverride: manualOverride || overrideActive, ip
  });

  let autoPush = null;
  if (to === 'REVIEWING' && from !== 'REVIEWING') {
    autoPush = await autoPushOnReview(id, actorId || null);
  }

  let autoSync = null;
  if (to === 'APPROVED' && from !== 'APPROVED') {
    autoSync = await autoSyncOnApproved(id, actorId || null);
  }

  if (to === 'PRINCIPLE_APPROVED' && from !== 'PRINCIPLE_APPROVED') {
    await reservePendingStationCode(id, actorId, actorRole, source, ip).catch(() => {});
  }

  return {
    id, status: to, prevStatus: from, autoPush, autoSync,
    stationCreated: stationCreated ? { id: stationCreated.id, name: stationCreated.name, ma_tram: stationCreated.ma_tram || null } : null,
    stationCreateError
  };
};

async function reservePendingStationCode(id, actorId, actorRole, source, ip) {
  const [rows] = await pool.query(
    'SELECT id, custom_data, pending_station_code FROM station_proposals WHERE id = ?',
    [id]
  );
  if (rows.length === 0 || rows[0].pending_station_code) return;
  let cd = rows[0].custom_data;
  if (typeof cd === 'string') {
    try { cd = JSON.parse(cd); } catch { cd = {}; }
  }
  const maTinh = cd && cd.ma_tinh ? String(cd.ma_tinh).trim() : '';
  if (!maTinh) return;
  const stationCodeService = require('./stationCodeService');
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = await stationCodeService.generatePendingCode(maTinh);
    try {
      await pool.query(
        'UPDATE station_proposals SET pending_station_code = ? WHERE id = ? AND pending_station_code IS NULL',
        [code, id]
      );
      await exports.logActivity({
        proposalId: id, action: 'station_code_reserved',
        changedFields: { pending_station_code: { label: 'Mã trạm chờ', old: '', new: code } },
        actorId: actorId || null, actorRole: actorRole || null, source: source || 'user', ip: ip || null
      });
      return;
    } catch (e) {
      if (e && e.code === 'ER_DUP_ENTRY') continue;
      throw e;
    }
  }
  await exports.logActivity({
    proposalId: id, action: 'auto_failed',
    changedFields: { error: 'Không giữ được mã trạm chờ sau 2 lần thử' },
    actorId: actorId || null, actorRole: actorRole || null, source: 'system_auto', ip: ip || null
  });
}

async function autoSyncOnApproved(id, actorId) {
  try {
    const apiConfigService = require('./apiConfigService');
    const syncService = require('./syncService');
    const config = await apiConfigService.getDefaultPushConfig();
    if (!config) {
      return { synced: false, queued: false, reason: 'Chưa có cấu hình API 1Office đang hoạt động' };
    }
    const results = await syncService.pushTo1Office([id], config.id, actorId, {
      allowStatuses: ['APPROVED'],
      setStatus: 'Đang triển khai'
    });
    const first = results && results[0];
    if (!first || !first.success) {
      try {
        await exports.logActivity({
          proposalId: id, action: 'sync_push', source: 'system_auto',
          actorId: actorId || null,
          changedFields: { error: (first && first.error) || 'Không tạo được lệnh đồng bộ', final: true }
        });
      } catch { /* silent */ }
      return { synced: false, queued: false, reason: (first && first.error) || 'Không tạo được lệnh đồng bộ' };
    }
    return { synced: true, queued: true, jobId: first.jobId, isUpdate: !!first.isUpdate, apiConfigId: config.id, warnings: first.warnings || [], droppedFields: first.droppedFields || [] };
  } catch (e) {
    return { synced: false, queued: false, reason: e.message || 'Lỗi tạo lệnh đồng bộ' };
  }
}

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
    if (!first.isUpdate && !first.deduped) {
      try {
        const workAutomationService = require('./workAutomationService');
        const auto = await workAutomationService.getByKey('auto_assign_process');
        if (auto && auto.enabled) {
          await workAutomationService.createPendingRun({
            automationId: auto.id,
            proposalId: id,
            proposalCode: (first.contactData && first.contactData.code) || null,
            trigger: 'auto',
          });
        }
      } catch { /* silent: khong chan luong duyet */ }
    }
    return { queued: true, jobId: first.jobId, isUpdate: !!first.isUpdate, apiConfigId: config.id, warnings: first.warnings || [], droppedFields: first.droppedFields || [] };
  } catch (e) {
    return { queued: false, reason: e.message || 'Lỗi tạo lệnh đẩy' };
  }
}

const COUNTDOWN_CONFIG_KEY = 'supplement_countdown_config';

const LEGACY_DAY_KEYS = {
  PENDING: 'review_supplement_days',
  REVIEWING: 'review_supplement_days',
  PRINCIPLE_APPROVED: 'principle_supplement_days',
  APPROVED: null,
  ARCHIVED: null
};

const DEFAULT_COUNTDOWN_RULES = [
  { status: 'PENDING', days: 3, hours: 0, minutes: 0, enabled: true },
  { status: 'REVIEWING', days: 3, hours: 0, minutes: 0, enabled: true },
  { status: 'PRINCIPLE_APPROVED', days: 15, hours: 0, minutes: 0, enabled: true },
  { status: 'APPROVED', days: 10, hours: 0, minutes: 0, enabled: false },
  { status: 'ARCHIVED', days: 10, hours: 0, minutes: 0, enabled: false }
];

// PENDING va REVIEWING dung chung 1 moc countdown: khi chuyen PENDING -> REVIEWING
// KHONG dat lai deadline (giu moc cua PENDING).
const COUNTDOWN_SHARED_GROUP = { PENDING: 'review', REVIEWING: 'review' };

const clamp = (v, max) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(max, n);
};

const normalizeRule = (r, fallback) => {
  const days = clamp(r.days, 365);
  const hours = clamp(r.hours, 23);
  const minutes = clamp(r.minutes, 59);
  const hasDuration = days > 0 || hours > 0 || minutes > 0;
  return {
    status: r.status,
    days: hasDuration ? days : fallback.days,
    hours: hasDuration ? hours : 0,
    minutes: hasDuration ? minutes : 0,
    enabled: r.enabled !== false
  };
};

const parseRules = (raw) => {
  const map = {};
  (Array.isArray(raw) ? raw : []).forEach((r) => {
    if (!r || !ALL_STATUSES.includes(r.status)) return;
    map[r.status] = r;
  });
  return DEFAULT_COUNTDOWN_RULES.map((d) => (map[d.status] ? normalizeRule(map[d.status], d) : { ...d }));
};

exports.getCountdownConfig = async () => {
  let rules = null;
  let warnHours = 24;
  try {
    const [rows] = await pool.query(
      'SELECT `value` FROM proposal_lifecycle_configs WHERE `key` = ? LIMIT 1',
      [COUNTDOWN_CONFIG_KEY]
    );
    if (rows[0] && rows[0].value) {
      const parsed = JSON.parse(rows[0].value);
      rules = parseRules(parsed.rules);
      if (parsed.warn_hours) warnHours = Math.max(1, Math.min(168, Number(parsed.warn_hours) || 24));
    }
  } catch { /* fallback below */ }

  if (!rules) {
    const [legacy] = await pool.query(
      "SELECT `key`, `value` FROM proposal_lifecycle_configs WHERE `key` IN ('review_supplement_days','principle_supplement_days')"
    ).catch(() => [[]]);
    const legacyMap = {};
    (legacy || []).forEach((r) => { legacyMap[r.key] = r.value; });
    rules = DEFAULT_COUNTDOWN_RULES.map((d) => {
      const key = LEGACY_DAY_KEYS[d.status];
      const v = key ? Number(legacyMap[key]) : NaN;
      return { ...d, days: Number.isFinite(v) && v > 0 ? Math.min(365, v) : d.days };
    });
  }
  return { warn_hours: warnHours, rules, ...(await exports.getExtendLimits()) };
};

exports.saveCountdownConfig = async (config) => {
  const warnHours = Math.max(1, Math.min(168, Number(config && config.warn_hours) || 24));
  const rules = parseRules(config && config.rules).map((r) => ({ ...r }));
  const value = JSON.stringify({ warn_hours: warnHours, rules });
  await pool.query(
    `INSERT INTO proposal_lifecycle_configs (\`key\`, \`value\`) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), updated_at = CURRENT_TIMESTAMP`,
    [COUNTDOWN_CONFIG_KEY, value]
  );
  let limits = null;
  if (config && (config.extend_max_times !== undefined || config.extend_max_days_per_time !== undefined)) {
    const current = await exports.getExtendLimits();
    limits = await exports.saveExtendLimits({
      maxTimes: config.extend_max_times !== undefined ? config.extend_max_times : current.maxTimes,
      maxDaysPerTime: config.extend_max_days_per_time !== undefined ? config.extend_max_days_per_time : current.maxDaysPerTime
    });
  }
  return { warn_hours: warnHours, rules, ...(limits || await exports.getExtendLimits()) };
};

exports.getDeadlineParts = async (status) => {
  const cfg = await exports.getCountdownConfig();
  const rule = cfg.rules.find((r) => r.status === status);
  if (!rule || !rule.enabled) return null;
  const totalMinutes = (Number(rule.days) || 0) * 1440 + (Number(rule.hours) || 0) * 60 + (Number(rule.minutes) || 0);
  if (totalMinutes <= 0) return null;
  return totalMinutes;
};

exports.getDeadlineMinutes = async (status) => exports.getDeadlineParts(status);

exports.getEnabledCountdownStatuses = async () => {
  const cfg = await exports.getCountdownConfig();
  return cfg.rules.filter((r) => r.enabled).map((r) => r.status);
};

exports.getCountdownWarnHours = async () => {
  const cfg = await exports.getCountdownConfig();
  return cfg.warn_hours || 24;
};

const INFO_NOTIFY_ROLES = ['SUPER_ADMIN', 'ADMIN'];

const EXTEND_MAX_TIMES_KEY = 'extend_max_times';
const EXTEND_MAX_DAYS_KEY = 'extend_max_days_per_time';
const EXTEND_MAX_HOURS = 23;
const DEFAULT_EXTEND_MAX_TIMES = 3;
const DEFAULT_EXTEND_MAX_DAYS = 30;

exports.getExtendLimits = async () => {
  let maxTimes = DEFAULT_EXTEND_MAX_TIMES;
  let maxDaysPerTime = DEFAULT_EXTEND_MAX_DAYS;
  try {
    const [rows] = await pool.query(
      'SELECT `key`, `value` FROM proposal_lifecycle_configs WHERE `key` IN (?, ?)',
      [EXTEND_MAX_TIMES_KEY, EXTEND_MAX_DAYS_KEY]
    );
    (rows || []).forEach((r) => {
      if (r.key === EXTEND_MAX_TIMES_KEY) {
        const v = Math.floor(Number(r.value));
        if (Number.isFinite(v) && v >= 0 && v <= 99) maxTimes = v;
      }
      if (r.key === EXTEND_MAX_DAYS_KEY) {
        const v = Math.floor(Number(r.value));
        if (Number.isFinite(v) && v >= 1 && v <= 365) maxDaysPerTime = v;
      }
    });
  } catch { /* fallback defaults */ }
  return { maxTimes, maxDaysPerTime };
};

exports.saveExtendLimits = async ({ maxTimes, maxDaysPerTime }) => {
  const t = Math.floor(Number(maxTimes));
  const d = Math.floor(Number(maxDaysPerTime));
  if (!Number.isFinite(t) || t < 0 || t > 99) throw err('Số lần gia hạn tối đa không hợp lệ (0–99, 0 = không giới hạn)', 400);
  if (!Number.isFinite(d) || d < 1 || d > 365) throw err('Số ngày tối đa mỗi lần không hợp lệ (1–365)', 400);
  await pool.query(
    'INSERT INTO proposal_lifecycle_configs (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = CURRENT_TIMESTAMP',
    [EXTEND_MAX_TIMES_KEY, String(t)]
  );
  await pool.query(
    'INSERT INTO proposal_lifecycle_configs (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = CURRENT_TIMESTAMP',
    [EXTEND_MAX_DAYS_KEY, String(d)]
  );
  return { maxTimes: t, maxDaysPerTime: d };
};

exports.countDeadlineExtends = async (id) => {
  try {
    const [rows] = await pool.query(
      "SELECT COUNT(*) AS n FROM proposal_activity_logs WHERE proposal_id = ? AND action = 'deadline_extended'",
      [id]
    );
    return Number(rows[0] ? rows[0].n : 0) || 0;
  } catch { return 0; }
};

exports.getExtendInfo = async (id) => {
  const { maxTimes, maxDaysPerTime } = await exports.getExtendLimits();
  const used = await exports.countDeadlineExtends(id);
  return {
    maxTimes, maxDaysPerTime, used,
    remaining: maxTimes === 0 ? null : Math.max(0, maxTimes - used)
  };
};

exports.extendDeadline = async (id, { days = 0, hours = 0, reason = '' } = {}, opts = {}) => {
  const { actorId, actorRole, source = 'user', ip } = opts;
  const { maxTimes, maxDaysPerTime } = await exports.getExtendLimits();
  const d = Math.floor(Number(days) || 0);
  const h = Math.floor(Number(hours) || 0);
  if (d < 0 || h < 0 || d > maxDaysPerTime || h > EXTEND_MAX_HOURS) {
    throw err(`Thời gian gia hạn không hợp lệ (tối đa ${maxDaysPerTime} ngày/lần)`, 400);
  }
  const totalMinutes = d * 1440 + h * 60;
  if (totalMinutes <= 0) {
    throw err('Vui lòng nhập thời gian gia hạn', 400);
  }
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) {
    throw err('Vui lòng nhập lý do gia hạn', 400);
  }
  const [rows] = await pool.query(
    'SELECT id, user_id, status, custom_data, supplement_deadline_at, info_completed_at FROM station_proposals WHERE id = ?',
    [id]
  );
  if (rows.length === 0) {
    throw err('Không tìm thấy đề xuất', 404);
  }
  const proposal = rows[0];
  const enabled = await exports.getEnabledCountdownStatuses();
  if (!proposal.supplement_deadline_at || !enabled.includes(proposal.status)) {
    throw err('Đề xuất không trong thời gian bổ sung thông tin', 400);
  }
  if (new Date(proposal.supplement_deadline_at).getTime() <= Date.now()) {
    throw err('Đề xuất đã quá hạn, không thể gia hạn', 400);
  }
  const usedExtends = await exports.countDeadlineExtends(id);
  if (maxTimes > 0 && usedExtends >= maxTimes) {
    throw err(`Đề xuất đã gia hạn ${usedExtends}/${maxTimes} lần, không thể gia hạn thêm`, 400);
  }
  const oldIso = new Date(proposal.supplement_deadline_at).toISOString();
  await pool.query(
    'UPDATE station_proposals SET supplement_deadline_at = DATE_ADD(supplement_deadline_at, INTERVAL ? MINUTE), info_completed_at = NULL, updated_at = NOW() WHERE id = ?',
    [totalMinutes, id]
  );
  const [after] = await pool.query('SELECT supplement_deadline_at FROM station_proposals WHERE id = ?', [id]);
  const newIso = new Date(after[0].supplement_deadline_at).toISOString();
  await exports.logActivity({
    proposalId: id, action: 'deadline_extended',
    fromStatus: proposal.status, toStatus: proposal.status,
    changedFields: { old_deadline: oldIso, new_deadline: newIso, days: d, hours: h },
    reason: cleanReason, actorId, actorRole, source, ip
  });
  const code = notificationService.proposalCode(proposal.custom_data, id);
  const actorName = source === 'system_auto'
    ? 'Hệ thống'
    : ((await notificationService.getUserName(actorId)) || 'Hệ thống');
  const userIds = await collectInfoNotifyIds(proposal);
  userIds.delete(Number(actorId));
  for (const uid of userIds) {
    if (!uid) continue;
    try {
      await notificationService.create({
        userId: uid,
        type: 'SUPPLEMENT_EXTENDED',
        title: notificationService.statusTitle('SUPPLEMENT_EXTENDED'),
        message: notificationService.statusMessage({
          code, actorName, status: 'SUPPLEMENT_EXTENDED',
          actionLabel: 'Người gia hạn', reason: `Gia hạn ${d} ngày ${h} giờ: ${cleanReason}`
        }),
        entityType: 'station_proposals',
        entityId: id,
        createdBy: actorId || null
      });
    } catch { /* silent */ }
  }
  return { id, oldDeadline: oldIso, newDeadline: newIso, days: d, hours: h, usedExtends: usedExtends + 1, maxTimes, remaining: maxTimes === 0 ? null : Math.max(0, maxTimes - usedExtends - 1) };
};

const collectInfoNotifyIds = async (proposal) => {
  const userIds = new Set();
  if (proposal.user_id) userIds.add(Number(proposal.user_id));
  try {
    const [owner] = await pool.query('SELECT parent_id FROM users WHERE id = ?', [proposal.user_id]);
    let pid = owner.length > 0 ? owner[0].parent_id : null;
    let guard = 0;
    while (pid && guard < 10) {
      guard++;
      userIds.add(Number(pid));
      const [up] = await pool.query('SELECT parent_id FROM users WHERE id = ?', [pid]);
      pid = up.length > 0 ? up[0].parent_id : null;
    }
  } catch { /* silent */ }
  try {
    const [admins] = await pool.query(
      `SELECT id FROM users WHERE role IN (${INFO_NOTIFY_ROLES.map(() => '?').join(', ')}) AND status = 'ACTIVE'`,
      INFO_NOTIFY_ROLES
    );
    admins.forEach((a) => userIds.add(Number(a.id)));
  } catch { /* silent */ }
  return userIds;
};

exports.setInfoCompleted = async (id, completed, opts = {}) => {
  const { actorId, actorRole, source = 'user', ip } = opts;
  const [rows] = await pool.query(
    'SELECT id, user_id, status, custom_data, supplement_deadline_at, info_completed_at FROM station_proposals WHERE id = ?',
    [id]
  );
  if (rows.length === 0) {
    throw err('Không tìm thấy đề xuất', 404);
  }
  const proposal = rows[0];
  const enabled = await exports.getEnabledCountdownStatuses();
  if (!proposal.supplement_deadline_at || !enabled.includes(proposal.status)) {
    throw err('Đề xuất không trong thời gian bổ sung thông tin', 400);
  }
  const already = proposal.info_completed_at != null;
  if ((completed && already) || (!completed && !already)) {
    return { id, completed: already, unchanged: true };
  }
  if (completed) {
    await pool.query('UPDATE station_proposals SET info_completed_at = NOW(), updated_at = NOW() WHERE id = ?', [id]);
  } else {
    await pool.query('UPDATE station_proposals SET info_completed_at = NULL, updated_at = NOW() WHERE id = ?', [id]);
  }
  await exports.logActivity({
    proposalId: id, action: completed ? 'info_completed' : 'info_reopened',
    fromStatus: proposal.status, toStatus: proposal.status,
    actorId, actorRole, source, ip
  });
  if (completed) {
    const code = notificationService.proposalCode(proposal.custom_data, id);
    const actorName = source === 'system_auto'
      ? 'Hệ thống'
      : ((await notificationService.getUserName(actorId)) || 'Hệ thống');
    const userIds = await collectInfoNotifyIds(proposal);
    userIds.delete(Number(actorId));
    for (const uid of userIds) {
      if (!uid) continue;
      try {
        await notificationService.create({
          userId: uid,
          type: 'INFO_COMPLETED',
          title: notificationService.statusTitle('INFO_COMPLETED'),
          message: notificationService.statusMessage({ code, actorName, status: 'INFO_COMPLETED', actionLabel: 'Người xác nhận' }),
          entityType: 'station_proposals',
          entityId: id,
          createdBy: actorId || null
        });
      } catch { /* silent */ }
    }
  } else {
    const code = notificationService.proposalCode(proposal.custom_data, id);
    const actorName = source === 'system_auto'
      ? 'Hệ thống'
      : ((await notificationService.getUserName(actorId)) || 'Hệ thống');
    const userIds = await collectInfoNotifyIds(proposal);
    userIds.delete(Number(actorId));
    for (const uid of userIds) {
      if (!uid) continue;
      try {
        await notificationService.create({
          userId: uid,
          type: 'INFO_REOPENED',
          title: notificationService.statusTitle('INFO_REOPENED'),
          message: notificationService.statusMessage({ code, actorName, status: 'INFO_REOPENED', actionLabel: 'Người mở lại' }),
          entityType: 'station_proposals',
          entityId: id,
          createdBy: actorId || null
        });
      } catch { /* silent */ }
    }
  }
  return { id, completed: !!completed, unchanged: false };
};
