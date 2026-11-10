const pool = require('../utils/db');
const notificationService = require('./notificationService');
const businessDeadlines = require('./businessDeadlineService');

const ALL_STATUSES = [
  'PENDING', 'REVIEWING', 'PRINCIPLE_APPROVED', 'APPROVED', 'REJECTED', 'CANCELLED',
  'CONTRACT_SIGNED', 'CONTRACT_FAILED', 'ARCHIVED', 'DEPLOYING',
  'GRADING', 'GDTTKD_EVALUATING', 'RE_GRADING', 'RE_GDTTKD_EVALUATING', 'TGD_REVIEW', 'DESIGNING',
  'INFOR_WAITING',
  'PROPOSAL_REPORT_CREATING', 'PROPOSAL_REPORT_RE_CREATING', 'PROPOSAL_REPORT_REVIEWING', 'PROPOSAL_REPORT_UPDATING', 'SIGNATURE_PENDING',
  'PAUSED', 'ACTIVE'
];

const ALLOWED_TRANSITIONS = {
  PENDING: ['REVIEWING', 'GRADING', 'REJECTED', 'CANCELLED'],
  REVIEWING: ['APPROVED', 'CANCELLED', 'ARCHIVED'],
  PRINCIPLE_APPROVED: ['APPROVED', 'CANCELLED'],
  APPROVED: ['CONTRACT_SIGNED', 'CONTRACT_FAILED', 'CANCELLED', 'DEPLOYING'],
  ARCHIVED: ['CONTRACT_SIGNED', 'CANCELLED'],
  CONTRACT_SIGNED: ['CANCELLED', 'DEPLOYING', 'ACTIVE'],
  DEPLOYING: ['CANCELLED', 'ACTIVE'],
  ACTIVE: [],
  CONTRACT_FAILED: ['CANCELLED'],
  REJECTED: ['PENDING', 'CANCELLED'],
  CANCELLED: [],
  GRADING: ['DESIGNING', 'PROPOSAL_REPORT_CREATING', 'GDTTKD_EVALUATING', 'CANCELLED'],
  GDTTKD_EVALUATING: ['DESIGNING', 'RE_GRADING', 'TGD_REVIEW', 'CANCELLED'],
  RE_GRADING: ['DESIGNING', 'PROPOSAL_REPORT_CREATING', 'GDTTKD_EVALUATING', 'RE_GDTTKD_EVALUATING', 'CANCELLED'],
  RE_GDTTKD_EVALUATING: ['TGD_REVIEW', 'CANCELLED'],
  TGD_REVIEW: ['DESIGNING', 'PROPOSAL_REPORT_CREATING', 'CANCELLED'],
  DESIGNING: ['INFOR_WAITING', 'PROPOSAL_REPORT_CREATING', 'CANCELLED', 'GDTTKD_EVALUATING', 'RE_GDTTKD_EVALUATING'],
  INFOR_WAITING: ['DESIGNING', 'CANCELLED'],
  PROPOSAL_REPORT_CREATING: ['PROPOSAL_REPORT_REVIEWING', 'PROPOSAL_REPORT_RE_CREATING', 'CANCELLED'],
  PROPOSAL_REPORT_RE_CREATING: ['PROPOSAL_REPORT_REVIEWING', 'CANCELLED'],
  PROPOSAL_REPORT_REVIEWING: ['SIGNATURE_PENDING', 'PROPOSAL_REPORT_RE_CREATING', 'PROPOSAL_REPORT_UPDATING', 'CANCELLED'],
  PROPOSAL_REPORT_UPDATING: ['PROPOSAL_REPORT_REVIEWING', 'CANCELLED'],
  SIGNATURE_PENDING: ['APPROVED', 'PROPOSAL_REPORT_UPDATING', 'CANCELLED']
};

const REASON_REQUIRED = ['REJECTED', 'CANCELLED'];
const ON_STATION_RESTORABLE_STATUSES = ['APPROVED', 'CONTRACT_SIGNED', 'DEPLOYING', 'ACTIVE'];

const STATUS_STEP_LABELS = {
  PENDING: 'đang đề xuất',
  GRADING: 'đánh giá Quy hoạch và Pháp lý',
  GDTTKD_EVALUATING: 'GĐTTKD đánh giá',
  RE_GRADING: 'chấm điểm lại Quy hoạch và Pháp lý',
  RE_GDTTKD_EVALUATING: 'GĐTTKD xem xét lại',
  TGD_REVIEW: 'Tổng giám đốc xem xét',
  DESIGNING: 'vẽ Layout',
  PROPOSAL_REPORT_CREATING: 'lập tờ trình BCĐX',
  PROPOSAL_REPORT_REVIEWING: 'duyệt BCĐX',
  SIGNATURE_PENDING: 'trình ký',
  APPROVED: 'đã duyệt BCĐX',
  PAUSED: 'đang tạm dừng',
  CANCELLED: 'đã hủy',
  ACTIVE: 'đang hoạt động'
};

exports.STATUS_STEP_LABELS = STATUS_STEP_LABELS;

const SKIP_DIFF_KEYS = new Set([
  'id', 'user_id', 'created_at', 'updated_at', 'custom_data', 'status',
  'submission_source', 'submitter_ip', 'ma_de_xuat_gen',
  'reviewed_by', 'reviewed_at', 'reject_reason', 'supplement_deadline_at', 'transition_deadline_at', 'info_completed_at', 'countdown_calendar_id'
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

exports.logActivity = async ({ proposalId, action, fromStatus, toStatus, changedFields, reason, actorId, actorRole, source, manualOverride, ip, connection = pool }) => {
  await connection.query(
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

exports.transitionOnStationWithinTransaction = async (connection, id, to, ctx = {}) => {
  if (!['DEPLOYING', 'ACTIVE'].includes(to)) throw err('Mốc ON trạm không hợp lệ', 400);
  const [rows] = await connection.query('SELECT * FROM station_proposals WHERE id=? FOR UPDATE', [id]);
  if (!rows.length) throw err('Không tìm thấy đề xuất', 404);
  const proposal = rows[0];
  if (proposal.status === to) return { unchanged: true };
  if (!(ALLOWED_TRANSITIONS[proposal.status] || []).includes(to)) {
    console.error('[ProposalLifecycle] denied ON-station milestone:', id, proposal.status, to);
    throw err(`Không thể chuyển đề xuất từ ${proposal.status} sang ${to}`, 409);
  }
  await connection.query(`UPDATE station_proposals SET status=?, supplement_deadline_at=NULL,
    transition_deadline_at=NULL, info_completed_at=NULL, reviewed_by=?, reviewed_at=NOW() WHERE id=?`,
  [to, ctx.actorId || null, id]);
  await exports.logActivity({
    proposalId: id, action: 'status_change', fromStatus: proposal.status, toStatus: to,
    actorId: ctx.actorId, actorRole: ctx.actorRole, source: 'system_auto', ip: ctx.ip,
    reason: ctx.reason, connection
  });
  if (proposal.user_id) {
    await connection.query(`INSERT INTO notifications
      (user_id,type,title,message,entity_type,entity_id,created_by)
      VALUES (?,?,?,?,'station_proposals',?,?)`,
    [proposal.user_id, to, notificationService.statusTitle(to),
      notificationService.statusMessage({
        code: notificationService.proposalCode(proposal.custom_data, id),
        actorName: 'Hệ thống', status: to, reason: ctx.reason
      }), id, ctx.actorId || null]);
  }
  if (proposal.journey_id) {
    await require('./journeyActivityService').log({
      journey_id: proposal.journey_id, entity_type: 'proposal', entity_id: id,
      action: 'proposal_status_changed', status_before: proposal.status, status_after: to,
      actor_id: ctx.actorId, actor_role: ctx.actorRole, source: 'system_auto',
      reason: ctx.reason, ip: ctx.ip
    }, connection);
    await require('./journeySyncService').recomputeStage(proposal.journey_id, connection);
    const [leads] = await connection.query('SELECT id,external_crm_id FROM leads WHERE journey_id=? LIMIT 1', [proposal.journey_id]);
    const lead = leads[0];
    if (lead?.external_crm_id) {
      const outbound = require('./crmOutboundService');
      const code = notificationService.proposalCode(proposal.custom_data, id);
      await outbound.enqueue({
        eventId: `eg_${lead.id}_status_${id}_${proposal.status}_${to}`, eventType: 'lead.care',
        leadId: lead.id, crmLeadId: lead.external_crm_id, conn: connection,
        payload: { leadId: lead.external_crm_id, staff: 'Hệ thống', ref: code,
          note: `Đã chuyển đề xuất ${code} từ trạng thái "${proposal.status}" sang "${to}"` }
      });
      if (to === 'ACTIVE') {
        await outbound.enqueue({
          eventId: `eg_${lead.id}_on_${id}`, eventType: 'lead.result', leadId: lead.id,
          crmLeadId: lead.external_crm_id, conn: connection,
          payload: { leadId: lead.external_crm_id, status: 'won',
            note: require('../integrations/crm/crmStatusMapping').MILESTONE_NOTES.stationOn, ref: code }
        });
      }
    }
  }
  return { id, status: to, prevStatus: proposal.status };
};

exports.transition = async (id, to, opts = {}) => {
  const {
    reason, actorId, actorRole, source = 'user', manualOverride = false, ip,
    isSuperAdmin = false, force = false, pauseAction = false, resumeAction = false, directOnStation = false,
    signatureWithdrawal = false
  } = opts;
  if (!ALL_STATUSES.includes(to)) {
    throw err('Trạng thái không hợp lệ', 400);
  }
  const [rows] = await pool.query(
    `SELECT id, user_id, status, journey_id, custom_data, signed_file_id,
            supplement_deadline_at, transition_deadline_at, countdown_calendar_id, paused_from_status, paused_at
       FROM station_proposals WHERE id = ?`,
    [id]
  );
  if (rows.length === 0) {
    throw err('Không tìm thấy đề xuất', 404);
  }
  const proposal = rows[0];
  const from = proposal.status;
  const isSignatureWithdrawal = signatureWithdrawal === true && from === 'SIGNATURE_PENDING'
    && to === 'PROPOSAL_REPORT_REVIEWING' && source === 'user';
  if (signatureWithdrawal) {
    if (!isSignatureWithdrawal) throw err('Không thể thu hồi cấu hình ký ở trạng thái này', 409);
    const [signed] = await pool.query(
      "SELECT id FROM proposal_signature_configs WHERE proposal_id=? AND status='SIGNED' LIMIT 1", [id]);
    if (signed.length) throw err('Đã có người ký, không thể thu hồi cấu hình', 409);
  }
  const isPauseTransition = pauseAction === true && to === 'PAUSED';
  const isResumeTransition = resumeAction === true
    && from === 'PAUSED'
    && proposal.paused_from_status === to
    && Boolean(proposal.paused_at);
  const isPausedCancellation = from === 'PAUSED' && to === 'CANCELLED';
  const isEmergencyReopen = from === 'CANCELLED' && to === 'PENDING' && source === 'user' && isSuperAdmin === true;
  const forceOverride = force === true && source === 'user' && isSuperAdmin === true;
  const isDirectOnStation = directOnStation === true
    && to === 'DEPLOYING'
    && source === 'user'
    && actorRole === 'SUPER_ADMIN'
    && isSuperAdmin === true;
  if (directOnStation && !isDirectOnStation) {
    throw err('Chỉ SUPER_ADMIN được chuyển trực tiếp đề xuất sang ON trạm', 403);
  }
  if (isDirectOnStation && ['CANCELLED', 'ARCHIVED', 'PAUSED', 'ACTIVE'].includes(from)) {
    throw err(`Không thể chuyển trực tiếp đề xuất từ trạng thái "${from}" sang ON trạm`, 409);
  }
  if (from === to) {
    if (to === 'PAUSED') throw err('Đề xuất đã tạm dừng', 409);
    return { id, status: to, prevStatus: from, unchanged: true };
  }
  if ((from === 'PAUSED' || to === 'PAUSED')
    && !isPauseTransition && !isResumeTransition && !isPausedCancellation) {
    await exports.logActivity({
      proposalId: id, action: 'status_change_denied',
      fromStatus: from, toStatus: to,
      actorId, actorRole, source, ip
    });
    throw err('Đề xuất đang tạm dừng; hãy dùng thao tác tiếp tục để khôi phục trạng thái trước đó', 400);
  }
  if (isPauseTransition && from === 'CANCELLED') {
    throw err('Không thể tạm dừng đề xuất đã kết thúc', 400);
  }
  if (isPauseTransition && (proposal.paused_from_status || proposal.paused_at)) {
    throw err('Đề xuất đã có thông tin tạm dừng chưa được xử lý', 409);
  }
  if (resumeAction && !isResumeTransition) {
    throw err('Không tìm thấy trạng thái cần khôi phục cho đề xuất', 409);
  }
  if (to === 'PRINCIPLE_APPROVED' && !isResumeTransition && from !== to) {
    await exports.logActivity({
      proposalId: id, action: 'status_change_denied',
      fromStatus: from, toStatus: to,
      actorId, actorRole, source, ip
    });
    throw err('Trạng thái "Duyệt chủ trương" đã ngừng sử dụng', 400);
  }
  if (to === 'ACTIVE' && source !== 'system_auto') {
    throw err('Chỉ quy trình ON trạm được chuyển đề xuất sang Hoạt động', 403);
  }
  if (to === 'DEPLOYING' && source !== 'system_auto' && !isDirectOnStation) {
    throw err('Chỉ quy trình ON trạm được chuyển đề xuất sang Đang triển khai', 403);
  }
  const isSignedApproval = from === 'APPROVED' && Boolean(proposal.signed_file_id);
  const isSignedApprovalTarget = to === 'APPROVED' && Boolean(proposal.signed_file_id);
  if (forceOverride && !String(reason || '').trim()) {
    throw err('Ghi đè trạng thái cần nhập lý do', 400);
  }
  const isStationFlowTransition = source === 'system_auto' && ['DEPLOYING', 'ACTIVE', 'CANCELLED'].includes(to);
  if (isSignedApproval && !forceOverride && !isDirectOnStation && !isStationFlowTransition) {
    await exports.logActivity({
      proposalId: id, action: 'status_change_denied',
      fromStatus: from, toStatus: to,
      actorId, actorRole, source, ip
    });
    throw err('Đề xuất đã được Chủ tịch phê duyệt; không thể thay đổi trạng thái', 400);
  }
  if (!forceOverride && !isDirectOnStation) {
    if (!isPauseTransition && !isResumeTransition && !isPausedCancellation
      && !(ALLOWED_TRANSITIONS[from] || []).includes(to) && !isEmergencyReopen && !isSignatureWithdrawal) {
      await exports.logActivity({
        proposalId: id, action: 'status_change_denied',
        fromStatus: from, toStatus: to,
        actorId, actorRole, source, ip
      });
      throw err(`Không thể chuyển trạng thái từ "${from}" sang "${to}"`, 400);
    }
    if (!isResumeTransition && from === 'PENDING' && to === 'REVIEWING' && source === 'user') {
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
  const reasonCarriesMessage = isPauseTransition || isDirectOnStation || REASON_REQUIRED.includes(to)
    || ['INFOR_WAITING', 'PROPOSAL_REPORT_UPDATING', 'PROPOSAL_REPORT_RE_CREATING'].includes(to);
  const cleanReason = forceOverride || isDirectOnStation
    ? String(reason || '').trim()
    : (reasonCarriesMessage ? (String(reason || '').trim() || null) : null);
  if ((forceOverride || isDirectOnStation) && !cleanReason) {
    throw err('Ghi đè trạng thái cần nhập lý do', 400);
  }
  if (!forceOverride && !isDirectOnStation && REASON_REQUIRED.includes(to) && !cleanReason) {
    throw err(to === 'REJECTED' ? 'Vui lòng nhập lý do từ chối' : 'Vui lòng nhập lý do hủy', 400);
  }
  if (isPauseTransition && !cleanReason) {
    throw err('Vui lòng nhập lý do tạm dừng đề xuất', 400);
  }
  const auditReason = cleanReason || (isEmergencyReopen ? String(reason || '').trim() : null);
  const rejectReasonValue = REASON_REQUIRED.includes(to) || (forceOverride && !isDirectOnStation) ? cleanReason : null;

  let statusActivityLogged = false;
  let updateResult;
  if (isPauseTransition || isResumeTransition) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      if (isPauseTransition) {
        [updateResult] = await connection.query(
          `UPDATE station_proposals
              SET status = 'PAUSED', paused_from_status = ?, paused_at = NOW()
            WHERE id = ? AND status = ? AND paused_at IS NULL`,
          [from, id, from]
        );
      } else if (proposal.countdown_calendar_id != null) {
        const [lockedRows] = await connection.query(
          'SELECT * FROM station_proposals WHERE id = ? FOR UPDATE', [id]
        );
        const locked = lockedRows[0];
        if (!locked || locked.status !== 'PAUSED' || locked.paused_from_status !== to || !locked.paused_at) {
          throw err('Trạng thái đề xuất vừa được thay đổi; hãy tải lại danh sách', 409);
        }
        const resumedAt = new Date();
        const supplement = await businessDeadlines.shiftPausedDeadline(
          locked.supplement_deadline_at, locked.paused_at, resumedAt, locked.countdown_calendar_id, connection
        );
        const transition = await businessDeadlines.shiftPausedDeadline(
          locked.transition_deadline_at, locked.paused_at, resumedAt, locked.countdown_calendar_id, connection
        );
        [updateResult] = await connection.query(
          `UPDATE station_proposals
              SET supplement_deadline_at = ?, transition_deadline_at = ?,
                  updated_at = TIMESTAMPADD(SECOND, GREATEST(TIMESTAMPDIFF(SECOND, paused_at, NOW()), 0), updated_at),
                  status = ?, paused_from_status = NULL, paused_at = NULL
            WHERE id = ? AND status = 'PAUSED' AND paused_from_status = ? AND paused_at IS NOT NULL`,
          [supplement, transition, to, id, to]
        );
      } else {
        [updateResult] = await connection.query(
          `UPDATE station_proposals
              SET supplement_deadline_at = CASE
                    WHEN supplement_deadline_at IS NULL THEN NULL
                    ELSE TIMESTAMPADD(SECOND, GREATEST(TIMESTAMPDIFF(SECOND, paused_at, NOW()), 0), supplement_deadline_at)
                  END,
                  transition_deadline_at = CASE
                    WHEN transition_deadline_at IS NULL THEN NULL
                    ELSE TIMESTAMPADD(SECOND, GREATEST(TIMESTAMPDIFF(SECOND, paused_at, NOW()), 0), transition_deadline_at)
                  END,
                  updated_at = TIMESTAMPADD(SECOND, GREATEST(TIMESTAMPDIFF(SECOND, paused_at, NOW()), 0), updated_at),
                  status = ?, paused_from_status = NULL, paused_at = NULL
            WHERE id = ? AND status = 'PAUSED' AND paused_from_status = ? AND paused_at IS NOT NULL`,
          [to, id, to]
        );
      }
      if (updateResult.affectedRows !== 1) {
        throw err('Trạng thái đề xuất vừa được thay đổi; hãy tải lại danh sách', 409);
      }
      await exports.logActivity({
        proposalId: id, action: 'status_change',
        fromStatus: from, toStatus: to, reason: auditReason,
        actorId, actorRole, source, manualOverride, ip,
        connection
      });
      await connection.commit();
      statusActivityLogged = true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } else {
    const deadlines = isSignedApprovalTarget
      ? { supplement: null, transition: null, calendarId: null }
      : await exports.getDeadlineDates(to, pool, { pendingSupplementFallback: false });
    [updateResult] = await pool.query(
      `UPDATE station_proposals
       SET status = ?, reject_reason = ?, reviewed_by = ?, reviewed_at = NOW(), updated_at = NOW(),
           supplement_deadline_at = ?, transition_deadline_at = ?, countdown_calendar_id = ?,
           info_completed_at = NULL,
           paused_from_status = CASE WHEN ? = 1 THEN NULL ELSE paused_from_status END,
           paused_at = CASE WHEN ? = 1 THEN NULL ELSE paused_at END
       WHERE id = ?`,
      [
        to, rejectReasonValue, actorId || null,
        deadlines.supplement, deadlines.transition, deadlines.calendarId,
        isPausedCancellation ? 1 : 0,
        isPausedCancellation ? 1 : 0,
        id
      ]
    );
  }

  if (!isPauseTransition && !isResumeTransition) {
    try {
      const gradingService = require('./proposalGradingService');
      if (to === 'GRADING') await gradingService.syncNoteForProposal(id);
      else if (from === 'GRADING') await gradingService.clearGradingNote(id);
    } catch { /* silent: khong chan chuyen trang thai vi ghi chu danh gia */ }
  }

  try {
    await exports.notifyStepReceivers(id, to, { actorId, reason: cleanReason });
  } catch (error) {
    console.error(`[ProposalNotifications] Failed to notify proposal ${id} after transition to ${to}:`, error);
  }

  // Auto-generate BCĐX from template (best-effort, non-blocking)
  if (to === 'PROPOSAL_REPORT_CREATING') {
    try {
      const gen = require('./proposalReportGenerationService');
      gen.generate({ proposalId: id, user: { id: actorId, role: actorRole }, ip }).catch((e) => {
        console.error(`[ProposalReportGen] Failed for proposal ${id}:`, e.message);
      });
    } catch (e) { console.error('[ProposalReportGen] trigger failed:', e.message); }
  }

  // CRM outbound: notify milestones (best-effort)
  try {
    if (proposal.journey_id) {
      const [leadRows] = await pool.query('SELECT id, external_crm_id FROM leads WHERE journey_id = ? LIMIT 1', [proposal.journey_id]);
      const lead = leadRows[0];
      const crmLeadId = lead && lead.external_crm_id;
      if (crmLeadId) {
        const crmOutboundService = require('./crmOutboundService');
        const crmStatusMapping = require('../integrations/crm/crmStatusMapping');
        const code = notificationService.proposalCode(proposal.custom_data, id);
        const crmActorName = source === 'system_auto'
          ? 'Hệ thống'
          : ((await notificationService.getUserName(actorId)) || 'Hệ thống');
        if (to === 'APPROVED' && proposal.signed_file_id) {
          await crmOutboundService.enqueue({
            eventId: `eg_${lead.id}_signed_${id}`,
            eventType: 'lead.care',
            leadId: lead.id,
            crmLeadId,
            payload: {
              leadId: crmLeadId,
              channel: crmStatusMapping.mapCareValue('channel', ''),
              contact: crmStatusMapping.mapCareValue('contact', ''),
              classify: crmStatusMapping.mapCareValue('classify', ''),
              saleResult: crmStatusMapping.mapCareValue('saleResult', ''),
              reason: '',
              note: crmStatusMapping.MILESTONE_NOTES.signedFileUploaded,
              staff: crmActorName,
              ref: code
            }
          });
        }
        if (to === 'CONTRACT_SIGNED') {
          let value = null;
          try { value = proposal.custom_data ? JSON.parse(proposal.custom_data).tong_gia_tri_chot : null; } catch { value = null; }
          await crmOutboundService.enqueue({
            eventId: `eg_${lead.id}_contract_${id}`,
            eventType: 'lead.result',
            leadId: lead.id,
            crmLeadId,
            payload: { leadId: crmLeadId, status: 'won', value, note: crmStatusMapping.MILESTONE_NOTES.contractSigned, ref: code }
          });
        }
        if (to === 'ACTIVE') {
          await crmOutboundService.enqueue({
            eventId: `eg_${lead.id}_on_${id}`,
            eventType: 'lead.result',
            leadId: lead.id,
            crmLeadId,
            payload: { leadId: crmLeadId, status: 'won', note: crmStatusMapping.MILESTONE_NOTES.stationOn, ref: code }
          });
        }
        // CRM 'lost' = "Trạng thái Đã loại + lý do (reason)" — đề xuất chết báo CRM ngừng chờ.
        if (to === 'CANCELLED' || to === 'REJECTED') {
          const [reasonRows] = await pool.query('SELECT reject_reason FROM station_proposals WHERE id = ? LIMIT 1', [id]);
          const reason = String((reasonRows[0] && reasonRows[0].reject_reason) || '').trim();
          await crmOutboundService.enqueue({
            eventId: `eg_${lead.id}_lost_${id}`,
            eventType: 'lead.result',
            leadId: lead.id,
            crmLeadId,
            payload: {
              leadId: crmLeadId,
              status: 'lost',
              reason,
              note: to === 'CANCELLED' ? crmStatusMapping.MILESTONE_NOTES.proposalCancelled : crmStatusMapping.MILESTONE_NOTES.proposalRejected,
              staff: crmActorName,
              ref: code
            }
          });
        }
        // Thông báo CRM cho mọi lần thay đổi trạng thái đề xuất (best-effort).
        if (from !== to) {
          await crmOutboundService.enqueue({
            eventId: `eg_${lead.id}_status_${id}_${from}_${to}`,
            eventType: 'lead.care',
            leadId: lead.id,
            crmLeadId,
            payload: {
              leadId: crmLeadId,
              channel: crmStatusMapping.mapCareValue('channel', ''),
              contact: crmStatusMapping.mapCareValue('contact', ''),
              classify: crmStatusMapping.mapCareValue('classify', ''),
              saleResult: crmStatusMapping.mapCareValue('saleResult', ''),
              reason: '',
              note: `Đã chuyển đề xuất ${code} từ trạng thái "${from}" sang "${to}"`,
              staff: crmActorName,
              ref: code
            }
          });
        }
      }
    }
  } catch (error) {
    console.error(`[CrmOutbound] Failed to enqueue for proposal ${id} transition to ${to}:`, error.message);
  }

  let stationCreated = null;
  let stationCreateError = null;
  if (!isResumeTransition && to === 'CONTRACT_SIGNED') {
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
    else actorName = (await notificationService.getUserName(actorId)) || 'Hệ thống';
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
        reason: reasonCarriesMessage ? cleanReason : null,
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

  const overrideActive = forceOverride || isEmergencyReopen || isDirectOnStation;
  try {
    const proposalRequestService = require('./proposalRequestService');
    if (!isPauseTransition && !isResumeTransition && to === 'REJECTED' && proposal.user_id) {
      await proposalRequestService.createRequest({
        proposalId: id,
        type: 'UPDATE_INFO',
        description: cleanReason,
        requestedBy: actorId || null,
        previousStatus: from,
        currentStatus: to,
        targetUserId: proposal.user_id
      });
    } else if (!isPauseTransition && !isResumeTransition && from === 'REJECTED' && to === 'PENDING') {
      await proposalRequestService.closeRequests(id, ['UPDATE_INFO', 'SUPPLEMENT'], { resolvedBy: actorId || null });
    }
  } catch { /* silent: khong chan chuyen trang thai vi yeu cau de xuat */ }
  if (!statusActivityLogged) {
    await exports.logActivity({
      proposalId: id, action: 'status_change',
      fromStatus: from, toStatus: to, reason: auditReason,
      actorId, actorRole, source: overrideActive ? 'admin_override' : source,
      manualOverride: manualOverride || overrideActive, ip
    });
  }

  try {
    if (proposal.journey_id) {
      const journeySyncService = require('./journeySyncService');
      await journeySyncService.onProposalTransition(id, {
        from, to, actorId, actorRole,
        source: overrideActive ? 'admin_override' : source, ip
      });
    }
  } catch { /* silent: khong chan chuyen trang thai vi journey */ }

  return {
    id, status: to, prevStatus: from,
    stationCreated: stationCreated ? { id: stationCreated.id, name: stationCreated.name, ma_tram: stationCreated.ma_tram || null } : null,
    stationCreateError
  };
};

exports.transitionOnStation = async (connection, proposalId, toStatus, {
  snapshot = null, actorId = null, actorRole = null, ip = null, stationCode = '',
  directActivation = false, reason: directReason = null
} = {}) => {
  const [rows] = await connection.query(
    `SELECT id, user_id, status, journey_id, custom_data
       FROM station_proposals WHERE id = ? FOR UPDATE`,
    [proposalId]
  );
  if (!rows.length) throw err('Không tìm thấy đề xuất liên quan đến ON trạm', 404);

  const proposal = rows[0];
  const fromStatus = proposal.status;
  let nextStatus;
  let reason;
  let changedFields = null;
  let source = 'user';
  let manualOverride = false;

  if (toStatus === 'ACTIVE') {
    if (!directActivation || actorRole !== 'SUPER_ADMIN') {
      throw err('Chỉ SUPER_ADMIN được đánh dấu ON trạm trực tiếp', 403);
    }
    if (!['APPROVED', 'CONTRACT_SIGNED', 'DEPLOYING'].includes(fromStatus)) {
      throw err(`Không thể chuyển đề xuất sang Hoạt động từ trạng thái "${fromStatus}"`, 409);
    }
    reason = String(directReason || '').trim();
    if (reason.length < 3 || reason.length > 5000) {
      throw err('Vui lòng nhập lý do đánh dấu ON trạm (3–5000 ký tự)', 400);
    }
    nextStatus = 'ACTIVE';
    source = 'admin_override';
    manualOverride = true;
    const [updateResult] = await connection.query(
      `UPDATE station_proposals
          SET status = 'ACTIVE', reject_reason = NULL, reviewed_by = ?, reviewed_at = NOW(),
              supplement_deadline_at = NULL, transition_deadline_at = NULL, info_completed_at = NULL,
              paused_from_status = NULL, paused_at = NULL, updated_at = NOW()
        WHERE id = ? AND status = ?`,
      [actorId, proposalId, fromStatus]
    );
    if (updateResult.affectedRows !== 1) throw err('Trạng thái đề xuất vừa được thay đổi; hãy tải lại', 409);
    await connection.query(
      `UPDATE proposal_requests
          SET status = 'CANCELLED', resolved_by = ?, resolved_at = NOW(),
              resolution_note = 'Đã đánh dấu ON trạm trực tiếp bởi SUPER_ADMIN'
        WHERE proposal_id = ? AND status = 'OPEN'`,
      [actorId, proposalId]
    );
    changedFields = { status: { label: 'Trạng thái đề xuất', old: fromStatus, new: 'ACTIVE' } };
  } else if (toStatus === 'ARCHIVED') {
    if (!ON_STATION_RESTORABLE_STATUSES.includes(fromStatus)) {
      throw err(`Không thể lưu trữ đề xuất ON trạm từ trạng thái "${fromStatus}"`, 409);
    }
    nextStatus = 'ARCHIVED';
    reason = `Hủy ON trạm ${stationCode || `#${proposalId}`}`;
    const [updateResult] = await connection.query(
      `UPDATE station_proposals
          SET status = 'ARCHIVED', reject_reason = NULL, reviewed_by = ?, reviewed_at = NOW(),
              supplement_deadline_at = NULL, transition_deadline_at = NULL, info_completed_at = NULL,
              paused_from_status = NULL, paused_at = NULL, updated_at = NOW()
        WHERE id = ? AND status = ?`,
      [actorId, proposalId, fromStatus]
    );
    if (updateResult.affectedRows !== 1) throw err('Trạng thái đề xuất vừa được thay đổi; hãy tải lại', 409);
    await connection.query(
      `UPDATE proposal_requests
          SET status = 'CANCELLED', resolved_by = ?, resolved_at = NOW(),
              resolution_note = 'Đã hủy ON trạm; đề xuất được lưu trữ'
        WHERE proposal_id = ? AND status = 'OPEN'`,
      [actorId, proposalId]
    );
  } else {
    const restoredStatus = String(toStatus || '').trim();
    if (fromStatus !== 'ARCHIVED' || !ON_STATION_RESTORABLE_STATUSES.includes(restoredStatus)
      || !snapshot || snapshot.proposal_status !== restoredStatus) {
      throw err('Không tìm thấy trạng thái đề xuất hợp lệ để khôi phục ON trạm', 409);
    }
    nextStatus = restoredStatus;
    reason = `Khôi phục ON trạm ${stationCode || `#${proposalId}`}`;
    const [updateResult] = await connection.query(
      `UPDATE station_proposals
          SET status = ?, reject_reason = ?, reviewed_by = ?, reviewed_at = ?,
              supplement_deadline_at = ?, transition_deadline_at = ?, info_completed_at = ?, countdown_calendar_id = ?,
              paused_from_status = ?, paused_at = ?, updated_at = NOW()
        WHERE id = ? AND status = 'ARCHIVED'`,
      [
        nextStatus, snapshot.reject_reason || null, snapshot.reviewed_by || null,
        snapshot.reviewed_at || null, snapshot.supplement_deadline_at || null,
        snapshot.transition_deadline_at || null, snapshot.info_completed_at || null, snapshot.countdown_calendar_id ?? null,
        snapshot.paused_from_status || null, snapshot.paused_at || null, proposalId
      ]
    );
    if (updateResult.affectedRows !== 1) throw err('Trạng thái đề xuất vừa được thay đổi; hãy tải lại', 409);
  }

  await exports.logActivity({
    proposalId,
    action: 'status_change',
    fromStatus,
    toStatus: nextStatus,
    changedFields,
    reason,
    actorId,
    actorRole,
    source,
    manualOverride,
    ip,
    connection
  });

  return { proposal, fromStatus, toStatus: nextStatus, reason, actorId, actorRole, source, manualOverride, ip };
};

exports.completeOnStationTransition = async (transition) => {
  if (!transition) return;
  const { proposal, fromStatus, toStatus, reason, actorId, actorRole, source = 'user', ip } = transition;
  try {
    await exports.notifyStepReceivers(proposal.id, toStatus, { actorId, reason });
  } catch (error) {
    console.error(`[ProposalNotifications] Failed to notify proposal ${proposal.id} after ON station status change:`, error);
  }

  if (proposal.user_id) {
    try {
      const code = notificationService.proposalCode(proposal.custom_data, proposal.id);
      const actorName = (await notificationService.getUserName(actorId)) || 'Hệ thống';
      await notificationService.create({
        userId: proposal.user_id,
        type: toStatus,
        title: notificationService.statusTitle(toStatus),
        message: notificationService.statusMessage({ code, actorName, reason, status: toStatus }),
        entityType: 'station_proposals',
        entityId: proposal.id,
        createdBy: actorId || null
      });
    } catch (error) {
      console.error(`[ProposalNotifications] Failed to notify owner of proposal ${proposal.id}:`, error);
    }
  }

  try {
    if (proposal.journey_id) {
      await require('./journeySyncService').onProposalTransition(proposal.id, {
        from: fromStatus, to: toStatus, actorId, actorRole, source, ip
      });
    }
  } catch { /* do not fail an ON station status change because of journey sync */ }
};

exports.pauseProposal = async (id, opts = {}) => exports.transition(id, 'PAUSED', {
  ...opts,
  pauseAction: true
});

exports.resumeProposal = async (id, opts = {}) => {
  const [rows] = await pool.query(
    'SELECT paused_from_status FROM station_proposals WHERE id = ? AND status = ?',
    [id, 'PAUSED']
  );
  if (rows.length === 0 || !rows[0].paused_from_status) {
    throw err('Đề xuất không ở trạng thái tạm dừng hoặc thiếu trạng thái cần khôi phục', 400);
  }
  return exports.transition(id, rows[0].paused_from_status, {
    ...opts,
    resumeAction: true
  });
};

// ===== Kế hoạch 71 (F) — Tự xác nhận "đủ thông tin" =====

const parseCfg = (cfg) => {
  if (!cfg) return {};
  if (typeof cfg === 'string') { try { return JSON.parse(cfg); } catch { return {}; } }
  return cfg;
};

const isAutoUserField = (fieldDef) => {
  const cfg = parseCfg(fieldDef && fieldDef.source_config);
  return ['area_director', 'center_director'].includes(cfg.auto_user);
};

const isEmptyValue = (v) => v === undefined || v === null || v === ''
  || (Array.isArray(v) && v.length === 0);

// F1 — kiểm tra "đủ thông tin" theo đúng luật form đang dùng (purpose/formId)
exports.checkInfoComplete = async (flatData, opts = {}) => {
  const { purpose = 'view', formId = null } = opts || {};
  const dynamicUtils = require('./dynamicUtils');
  const validators = require('../middlewares/validators');

  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const labelOf = (key) => (fieldDefs.find((f) => f.key === key) || {}).label || key;

  let applicable = new Set();
  try {
    applicable = await validators.getApplicableFieldKeys('station_proposals', flatData, purpose, formId);
  } catch { applicable = new Set(); }

  const missing = new Set();
  for (const f of fieldDefs) {
    if (f.key === 'latitude' || f.key === 'longitude') {
      if (isEmptyValue(flatData[f.key])) missing.add(labelOf(f.key));
      continue;
    }
    const special = isAutoUserField(f);
    if (!f.required && !special) continue;
    if (!special && applicable.size > 0 && !applicable.has(f.key)) continue;
    if (special || f.type === 'user') {
      const value = flatData[f.key];
      const userId = value && typeof value === 'object' ? Number(value.id) : Number(value);
      if (!Number.isInteger(userId) || userId <= 0) missing.add(labelOf(f.key));
    } else if (isEmptyValue(flatData[f.key])) {
      missing.add(labelOf(f.key));
    }
  }
  return { complete: missing.size === 0, missing: [...missing] };
};

// F2 — tự xác nhận khi đủ trường (không throw; dùng cho hook lưu + batch G)
exports.maybeAutoConfirmInfo = async (id, opts = {}) => {
  try {
    const { actorId = null, purpose = 'view', formId = null, ip = null } = opts || {};
    const [rows] = await pool.query(
      'SELECT * FROM station_proposals WHERE id = ?',
      [id]
    );
    if (rows.length === 0) return { confirmed: false, skipped: 'not_found' };
    const row = rows[0];
    if (!row.supplement_deadline_at) return { confirmed: false, skipped: 'not_in_supplement' };
    const suppStatuses = await exports.getEnabledSupplementStatuses();
    if (!suppStatuses.includes(row.status)) return { confirmed: false, skipped: 'not_in_supplement' };
    const already = row.info_completed_at != null;
    if (already && row.status !== 'PENDING') return { confirmed: false, already: true };

    const dynamicUtils = require('./dynamicUtils');
    const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
    const flat = dynamicUtils.mergeData(row, fieldDefs);
    const { complete, missing } = await exports.checkInfoComplete(flat, { purpose, formId });
    if (!complete) return { confirmed: false, missing };

    try {
      const result = await exports.setInfoCompleted(id, true, { actorId, source: 'system_auto', ip });
      return { confirmed: true, movedTo: result.movedTo || null, already };
    } catch (e) {
      console.error(`[ProposalLifecycle] Auto-confirm info failed for proposal #${id}: ${e.message}`);
      return { confirmed: false, missing: [], error: e.message };
    }
  } catch (e) {
    console.error(`[ProposalLifecycle] Auto-confirm info failed for proposal #${id}: ${e.message}`);
    return { confirmed: false, missing: [], error: e.message };
  }
};

const COUNTDOWN_CONFIG_KEY = 'supplement_countdown_config';

const LEGACY_DAY_KEYS = {
  PENDING: 'review_supplement_days',
  REVIEWING: 'review_supplement_days',
  PRINCIPLE_APPROVED: 'principle_supplement_days',
  APPROVED: null,
  ARCHIVED: null
};

// Mỗi trạng thái có thể cấu hình SONG SONG 2 countdown:
//   supplement: quá hạn chưa xác nhận đủ thông tin (info_completed_at) -> hủy đề xuất
//   transition: quá hạn chưa chuyển sang trạng thái tiếp theo -> hủy đề xuất
const COUNTDOWN_KINDS = ['supplement', 'transition'];
const COUNTDOWN_TYPE_LABELS = { supplement: 'Bổ sung thông tin', transition: 'Chuyển trạng thái' };
exports.COUNTDOWN_TYPE_LABELS = COUNTDOWN_TYPE_LABELS;

const DEFAULT_PART = { enabled: false, days: 0, hours: 0, minutes: 0 };

const DEFAULT_COUNTDOWN_RULES = [
  { status: 'PENDING', supplement: { enabled: true, days: 3, hours: 0, minutes: 0 }, transition: { ...DEFAULT_PART } },
  { status: 'REVIEWING', supplement: { enabled: true, days: 3, hours: 0, minutes: 0 }, transition: { ...DEFAULT_PART } },
  { status: 'PRINCIPLE_APPROVED', supplement: { enabled: true, days: 15, hours: 0, minutes: 0 }, transition: { ...DEFAULT_PART } },
  { status: 'APPROVED', supplement: { enabled: false, days: 10, hours: 0, minutes: 0 }, transition: { ...DEFAULT_PART } },
  { status: 'ARCHIVED', supplement: { enabled: false, days: 10, hours: 0, minutes: 0 }, transition: { ...DEFAULT_PART } }
];

const clonePart = (p) => ({ enabled: !!(p && p.enabled), days: Number((p && p.days) || 0), hours: Number((p && p.hours) || 0), minutes: Number((p && p.minutes) || 0) });
const cloneRule = (r) => ({ status: r.status, supplement: clonePart(r.supplement), transition: clonePart(r.transition) });

const clamp = (v, max) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(max, n);
};

const normalizePart = (src, fallback) => {
  const f = fallback || DEFAULT_PART;
  if (!src || typeof src !== 'object') return clonePart(f);
  const days = clamp(src.days, 365);
  const hours = clamp(src.hours, 23);
  const minutes = clamp(src.minutes, 59);
  const hasDuration = days > 0 || hours > 0 || minutes > 0;
  const enabled = src.enabled !== undefined ? src.enabled !== false : !!f.enabled;
  return { enabled: !!enabled && hasDuration, days, hours, minutes };
};

const normalizeRule = (r, fallback) => {
  const fb = fallback || { supplement: DEFAULT_PART, transition: DEFAULT_PART };
  // Tương thích cấu hình cũ (flat days/hours/minutes/enabled) -> đưa hết vào supplement
  const legacySupplement = { enabled: r.enabled, days: r.days, hours: r.hours, minutes: r.minutes };
  const supplementSrc = r.supplement !== undefined ? r.supplement : legacySupplement;
  return {
    status: r.status,
    supplement: normalizePart(supplementSrc, fb.supplement),
    transition: normalizePart(r.transition, fb.transition)
  };
};

const parseRules = (raw) => {
  const map = {};
  (Array.isArray(raw) ? raw : []).forEach((r) => {
    if (!r || !ALL_STATUSES.includes(r.status)) return;
    map[r.status] = r;
  });
  return DEFAULT_COUNTDOWN_RULES.map((d) => (map[d.status] ? normalizeRule(map[d.status], d) : cloneRule(d)));
};

exports.getCountdownConfig = async (executor = pool) => {
  let rules = null;
  let warnHours = 24;
  try {
    const [rows] = await executor.query(
      'SELECT `value` FROM proposal_lifecycle_configs WHERE `key` = ? LIMIT 1',
      [COUNTDOWN_CONFIG_KEY]
    );
    if (rows[0] && rows[0].value) {
      const parsed = JSON.parse(rows[0].value);
      rules = parseRules(parsed.rules);
      if (parsed.warn_hours) warnHours = Math.max(1, Math.min(168, Number(parsed.warn_hours) || 24));
    }
  } catch (error) {
    console.error('[ProposalLifecycle] Failed to load countdown config; using configured defaults:', error.message);
  }

  if (!rules) {
    const [legacy] = await executor.query(
      "SELECT `key`, `value` FROM proposal_lifecycle_configs WHERE `key` IN ('review_supplement_days','principle_supplement_days')"
    ).catch(() => [[]]);
    const legacyMap = {};
    (legacy || []).forEach((r) => { legacyMap[r.key] = r.value; });
    rules = DEFAULT_COUNTDOWN_RULES.map((d) => {
      const key = LEGACY_DAY_KEYS[d.status];
      const v = key ? Number(legacyMap[key]) : NaN;
      const supp = clonePart(d.supplement);
      if (Number.isFinite(v) && v > 0) supp.days = Math.min(365, v);
      return { status: d.status, supplement: supp, transition: clonePart(d.transition) };
    });
  }
  return { warn_hours: warnHours, rules, ...(await exports.getExtendLimits(executor)) };
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

exports.getDeadlineParts = async (status, kind = 'supplement') => {
  const cfg = await exports.getCountdownConfig();
  const rule = cfg.rules.find((r) => r.status === status);
  if (!rule) return null;
  const part = rule[kind] || DEFAULT_PART;
  if (!part.enabled) return null;
  const totalMinutes = (Number(part.days) || 0) * 1440 + (Number(part.hours) || 0) * 60 + (Number(part.minutes) || 0);
  if (totalMinutes <= 0) return null;
  return totalMinutes;
};

exports.getDeadlineMinutes = async (status, kind = 'supplement') => exports.getDeadlineParts(status, kind);

// options.pendingSupplementFallback defaults to true (PENDING: configured supplement or 3 workdays); false preserves a disabled supplement rule during status transitions.
exports.getDeadlineDates = async (status, executor = pool, options = {}) => {
  try {
    return await businessDeadlines.getProposalDeadlineDates(
      status, await exports.getCountdownConfig(executor), executor, options
    );
  } catch (error) {
    console.error(`[ProposalLifecycle] Failed to calculate ${status} business deadlines:`, error.message);
    throw error;
  }
};

const enabledForKind = (rules, kind) => rules
  .filter((r) => r.status !== 'PAUSED' && r[kind] && r[kind].enabled)
  .map((r) => r.status);

// Danh muc status duoc xac nhan/hoan tat thong tin (muc nghiep vu, doc lap voi
// config countdown): PENDING / REVIEWING / PRINCIPLE_APPROVED.
const CONFIRM_STATUSES = ['PENDING', 'REVIEWING', 'PRINCIPLE_APPROVED'];
exports.getConfirmStatuses = () => CONFIRM_STATUSES;

exports.getEnabledCountdownStatuses = async () => {
  const cfg = await exports.getCountdownConfig();
  const set = new Set([...enabledForKind(cfg.rules, 'supplement'), ...enabledForKind(cfg.rules, 'transition')]);
  return [...set];
};

// Chi danh cho kiem tra "xac nhan du thong tin" (setInfoCompleted + ke hoach 71.F/G).
// Neu config tat toan bo countdown bo sung -> fallback ve CONFIRM_STATUSES de tinh
// nang xac nhan van hoat dong. KHONG dung ham nay cho worker/extend deadline.
exports.getEnabledSupplementStatuses = async () => {
  const cfg = await exports.getCountdownConfig();
  const list = enabledForKind(cfg.rules, 'supplement');
  return [...new Set([...list, ...CONFIRM_STATUSES])];
};

exports.getEnabledTransitionStatuses = async () => {
  const cfg = await exports.getCountdownConfig();
  return enabledForKind(cfg.rules, 'transition');
};

exports.getCountdownFlags = async () => {
  const cfg = await exports.getCountdownConfig();
  const map = {};
  cfg.rules.forEach((r) => {
    map[r.status] = {
      supplement: !!(r.supplement && r.supplement.enabled),
      transition: !!(r.transition && r.transition.enabled)
    };
  });
  return map;
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

exports.getExtendLimits = async (executor = pool) => {
  let maxTimes = DEFAULT_EXTEND_MAX_TIMES;
  let maxDaysPerTime = DEFAULT_EXTEND_MAX_DAYS;
  try {
    const [rows] = await executor.query(
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
    'SELECT id, user_id, status, custom_data, supplement_deadline_at, transition_deadline_at, info_completed_at, countdown_calendar_id FROM station_proposals WHERE id = ?',
    [id]
  );
  if (rows.length === 0) {
    throw err('Không tìm thấy đề xuất', 404);
  }
  const proposal = rows[0];
  const enabled = await exports.getEnabledCountdownStatuses();
  const hasAny = proposal.supplement_deadline_at || proposal.transition_deadline_at;
  if (!hasAny || !enabled.includes(proposal.status)) {
    throw err('Đề xuất không trong thời gian countdown', 400);
  }
  const nowMs = Date.now();
  const suppPast = proposal.supplement_deadline_at ? new Date(proposal.supplement_deadline_at).getTime() <= nowMs : true;
  const transPast = proposal.transition_deadline_at ? new Date(proposal.transition_deadline_at).getTime() <= nowMs : true;
  if (suppPast && transPast) {
    throw err('Đề xuất đã quá hạn, không thể gia hạn', 400);
  }
  const usedExtends = await exports.countDeadlineExtends(id);
  if (maxTimes > 0 && usedExtends >= maxTimes) {
    throw err(`Đề xuất đã gia hạn ${usedExtends}/${maxTimes} lần, không thể gia hạn thêm`, 400);
  }
  const oldSuppIso = proposal.supplement_deadline_at ? new Date(proposal.supplement_deadline_at).toISOString() : null;
  const oldTransIso = proposal.transition_deadline_at ? new Date(proposal.transition_deadline_at).toISOString() : null;
  const oldIso = oldSuppIso || oldTransIso;
  const supplement = await businessDeadlines.extendDeadline(
    proposal.supplement_deadline_at, { days: d, hours: h }, proposal.countdown_calendar_id
  );
  const transition = await businessDeadlines.extendDeadline(
    proposal.transition_deadline_at, { days: d, hours: h }, proposal.countdown_calendar_id
  );
  await pool.query(
    `UPDATE station_proposals
     SET supplement_deadline_at = ?,
         transition_deadline_at = ?,
         info_completed_at = NULL, updated_at = NOW()
     WHERE id = ?`,
    [supplement, transition, id]
  );
  const [after] = await pool.query('SELECT supplement_deadline_at, transition_deadline_at FROM station_proposals WHERE id = ?', [id]);
  const newIso = after[0].supplement_deadline_at ? new Date(after[0].supplement_deadline_at).toISOString() : (after[0].transition_deadline_at ? new Date(after[0].transition_deadline_at).toISOString() : null);
  const newSuppIso = after[0].supplement_deadline_at ? new Date(after[0].supplement_deadline_at).toISOString() : null;
  const newTransIso = after[0].transition_deadline_at ? new Date(after[0].transition_deadline_at).toISOString() : null;
  await exports.logActivity({
    proposalId: id, action: 'deadline_extended',
    fromStatus: proposal.status, toStatus: proposal.status,
    changedFields: {
      old_deadline: oldIso, new_deadline: newIso, days: d, hours: h,
      old_supplement_deadline: oldSuppIso, new_supplement_deadline: newSuppIso,
      old_transition_deadline: oldTransIso, new_transition_deadline: newTransIso
    },
    reason: cleanReason, actorId, actorRole, source, ip
  });
  try {
    if (proposal.user_id && Number(actorId) !== Number(proposal.user_id)) {
      await require('./proposalRequestService').createRequest({
        proposalId: id,
        type: 'SUPPLEMENT',
        description: cleanReason,
        requestedBy: actorId || null,
        previousStatus: proposal.status,
        currentStatus: proposal.status,
        targetUserId: proposal.user_id,
        note: `Gia hạn ${d} ngày ${h} giờ`
      });
    }
  } catch { /* silent: khong chan gia han vi yeu cau de xuat */ }
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

exports.notifyStepReceivers = async (id, to, opts = {}) => {
  const { actorId = null, reason = null, includeOwner = false } = opts;
  const stepRecipients = require('./proposalStepRecipients');
  if (!stepRecipients.STEP_RECIPIENT_STATUSES.includes(to)) return [];
  const [rows] = await pool.query(
    `SELECT p.id, p.user_id, p.status, p.custom_data, p.quy_hoach_score, p.phap_ly_score
       FROM station_proposals p WHERE p.id = ?`,
    [id]
  );
  if (rows.length === 0) return [];
  const proposal = rows[0];
  const resolvedRecipients = await stepRecipients.resolveStepRecipients(to, proposal);
  const gradingTasks = await stepRecipients.resolveGradingTasks(to, proposal);
  const recipientIds = resolvedRecipients
    .filter((uid) => includeOwner || Number(uid) !== Number(proposal.user_id));
  const taskRecipientIds = gradingTasks.flatMap((task) => task.userIds)
    .filter((uid) => includeOwner || Number(uid) !== Number(proposal.user_id));
  if (recipientIds.length === 0 && taskRecipientIds.length === 0) {
    if (resolvedRecipients.length === 0 && gradingTasks.length === 0 && to !== 'RE_GRADING') {
      console.warn(`[ProposalNotifications] No eligible task recipients for proposal ${id} at ${to}`);
    }
    return [];
  }
  const code = notificationService.proposalCode(proposal.custom_data, id);
  const actorName = actorId ? ((await notificationService.getUserName(actorId)) || 'Hệ thống') : 'Hệ thống';
  const message = notificationService.statusMessage({
    code, actorName, status: to, actionLabel: 'Người chuyển bước', reason: reason || null
  });
  for (const uid of recipientIds) {
    try {
      await notificationService.create({
        userId: uid,
        type: to,
        title: notificationService.statusTitle(to),
        message,
        entityType: 'station_proposals',
        entityId: id,
        createdBy: actorId || null
      });
    } catch (error) {
      console.error(`[ProposalNotifications] Failed to notify user ${uid} for proposal ${id} at ${to}:`, error);
    }
  }
  for (const task of gradingTasks) {
    const taskMessage = notificationService.statusMessage({
      code,
      actorName,
      status: to,
      actionLabel: `Công việc: Phòng ${task.departmentLabel}`,
      reason: task.type === 'regrade'
        ? `Phòng ${task.departmentLabel} được yêu cầu chấm điểm lại${reason ? ` · ${reason}` : ''}`
        : `Phòng ${task.departmentLabel} chưa có kết quả chấm điểm${reason ? ` · ${reason}` : ''}`
    });
    for (const uid of task.userIds) {
      if (!includeOwner && Number(uid) === Number(proposal.user_id)) continue;
      try {
        await notificationService.create({
          userId: uid,
          type: task.type === 'regrade' ? 'RE_GRADING' : 'GRADING',
          title: task.title,
          message: taskMessage,
          entityType: 'station_proposals',
          entityId: id,
          createdBy: actorId || null
        });
      } catch (error) {
        console.error(`[ProposalNotifications] Failed to notify user ${uid} for ${task.departmentLabel} task on proposal ${id}:`, error);
      }
    }
  }
  return [...new Set([...recipientIds, ...taskRecipientIds])];
};

exports.setInfoCompleted = async (id, completed, opts = {}) => {
  const { actorId, actorRole, source = 'user', ip } = opts;
  const [rows] = await pool.query(
    'SELECT id, user_id, status, custom_data, supplement_deadline_at, transition_deadline_at, info_completed_at, countdown_calendar_id FROM station_proposals WHERE id = ?',
    [id]
  );
  if (rows.length === 0) {
    throw err('Không tìm thấy đề xuất', 404);
  }
  const proposal = rows[0];
  const [ownerRows] = await pool.query('SELECT role FROM users WHERE id = ?', [proposal.user_id]);
  const ownerIsCtv = ownerRows.length > 0 && ownerRows[0].role === 'CTV';
  const supplementStatuses = await exports.getEnabledSupplementStatuses();
  // Đảm bảo PENDING luôn có supplement_deadline_at để cho phép xác nhận duyệt
  if (!proposal.supplement_deadline_at && proposal.status === 'PENDING') {
    const fallback = proposal.transition_deadline_at
      ? { supplement: proposal.transition_deadline_at, calendarId: proposal.countdown_calendar_id }
      : await exports.getDeadlineDates('PENDING');
    await pool.query(
      'UPDATE station_proposals SET supplement_deadline_at = ?, countdown_calendar_id = ? WHERE id = ?',
      [fallback.supplement, fallback.calendarId, id]
    );
    const [refreshed] = await pool.query('SELECT supplement_deadline_at FROM station_proposals WHERE id = ?', [id]);
    proposal.supplement_deadline_at = refreshed[0]?.supplement_deadline_at || null;
  }
  if (!proposal.supplement_deadline_at || !supplementStatuses.includes(proposal.status)) {
    throw err('Đề xuất không trong thời gian bổ sung thông tin', 400);
  }
  const already = proposal.info_completed_at != null;
  const movePendingToGrading = completed && proposal.status === 'PENDING' && !ownerIsCtv;
  if ((completed && already && !movePendingToGrading) || (!completed && !already)) {
    return { id, completed: already, unchanged: true };
  }
  let movedTo = null;
  if (movePendingToGrading) {
    try {
      const result = await exports.transition(id, 'GRADING', { actorId, actorRole, source, ip });
      if (result?.status !== 'GRADING') throw err('Đề xuất chưa được chuyển sang chấm điểm', 409);
      movedTo = 'GRADING';
    } catch (transitionError) {
      let currentStatus = null;
      try {
        const [currentRows] = await pool.query('SELECT status FROM station_proposals WHERE id = ?', [id]);
        currentStatus = currentRows[0]?.status || null;
      } catch { /* giữ lỗi chuyển trạng thái ban đầu */ }
      if (currentStatus !== 'GRADING') throw transitionError;
      movedTo = 'GRADING';
      console.error(`[ProposalLifecycle] Proposal #${id} reached GRADING with a post-transition error: ${transitionError.message}`);
    }
  } else if (completed && !already) {
    await pool.query('UPDATE station_proposals SET info_completed_at = NOW(), updated_at = NOW() WHERE id = ?', [id]);
  } else if (!completed) {
    await pool.query('UPDATE station_proposals SET info_completed_at = NULL, updated_at = NOW() WHERE id = ?', [id]);
  }
  if (!already) {
    const activity = {
      proposalId: id, action: completed ? 'info_completed' : 'info_reopened',
      fromStatus: proposal.status, toStatus: movedTo || proposal.status,
      actorId, actorRole, source, ip
    };
    try {
      await exports.logActivity(activity);
    } catch (activityError) {
      if (!movedTo) throw activityError;
      console.error(`[ProposalLifecycle] Failed to log info completion after proposal #${id} reached GRADING: ${activityError.message}`);
    }
  }
  try {
    const proposalRequestService = require('./proposalRequestService');
    if (completed) {
      await proposalRequestService.closeRequests(id, ['UPDATE_INFO', 'SUPPLEMENT'], { resolvedBy: actorId || null });
    } else if (Number(actorId) !== Number(proposal.user_id)) {
      await proposalRequestService.createRequest({
        proposalId: id,
        type: 'UPDATE_INFO',
        description: 'Yêu cầu mở lại để bổ sung thông tin',
        requestedBy: actorId || null,
        previousStatus: proposal.status,
        currentStatus: proposal.status,
        targetUserId: proposal.user_id
      });
    }
  } catch { /* silent: khong chan thao tac vi yeu cau de xuat */ }
  if (completed && !already) {
    try {
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
    } catch (notificationError) {
      if (!movedTo) throw notificationError;
      console.error(`[ProposalLifecycle] Failed to notify info completion for proposal #${id}: ${notificationError.message}`);
    }
  } else if (!completed) {
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
  return { id, completed: !!completed, unchanged: already && !movedTo, movedTo, waitingManagerApproval: ownerIsCtv && completed && proposal.status === 'PENDING' };
};
