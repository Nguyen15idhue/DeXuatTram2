const pool = require('../utils/db');
const { isGdkv, isGdtt } = require('../constants/salesRanks');
const leadService = require('./leadService');
const access = require('./leadAccessService');
const consultation = require('./leadConsultationService');

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const parse = (value) => typeof value === 'string' ? JSON.parse(value) : value || {};

const getSalesCandidates = async (department, conn = pool) => {
  const [rows] = await conn.query(
    "SELECT id, full_name, role, custom_data FROM users WHERE status = 'ACTIVE' ORDER BY id");
  return rows.map((row) => {
    const cd = parse(row.custom_data);
    return { ...row, chuc_vu: cd.chuc_vu || '', department: cd.department || '',
      is_gdtt: isGdtt(cd.chuc_vu, cd.department), is_gdkv: isGdkv(cd.chuc_vu, cd.department) };
  }).filter((row) => row.department === department
    && access.context(row).isBusiness && (row.is_gdtt || row.is_gdkv));
};

const assignInTransaction = async (leadId, targetUserId, actor, opts, conn) => {
  const [[lead]] = await conn.query('SELECT * FROM leads WHERE id = ? FOR UPDATE', [leadId]);
  if (!lead) throw fail('Không tìm thấy khách hàng', 404);
  if (!opts.systemAuto && !(await access.permissions(lead, actor, conn)).can_assign) {
    throw fail('Chỉ GĐTTKD và Super Admin được phân bổ GĐKV trong phạm vi quản lý', 403);
  }
  if (!leadService.isAssignableClassification(lead.customer_classification)) {
    throw fail('Chỉ khách hàng Tiềm năng hoặc Quan tâm mới được phân bổ');
  }
  const targetId = Number(targetUserId);
  if (!Number.isInteger(targetId) || targetId <= 0) throw fail('Người được giao không hợp lệ');
  const [[target]] = await conn.query(
    "SELECT id, full_name, role, status, custom_data FROM users WHERE id = ? AND status = 'ACTIVE'", [targetId]);
  const targetCtx = access.context(target);
  if (!target || !targetCtx.isBusiness || (opts.systemAuto ? !targetCtx.isGdtt : !targetCtx.isGdkv)) {
    throw fail(opts.systemAuto ? 'Không tìm thấy GĐTTKD phù hợp' : 'Chỉ được phân bổ cho GĐKV đang hoạt động');
  }
  if (!opts.systemAuto && actor.role !== 'SUPER_ADMIN' && targetCtx.department !== lead.assigned_department) {
    throw fail('GĐKV phải thuộc cùng phòng ban với khách hàng', 403);
  }
  if (Number(lead.assigned_user_id) === targetId) {
    return { lead, assignment: null };
  }
  await conn.query('UPDATE lead_assignments SET ended_at = NOW() WHERE lead_id = ? AND ended_at IS NULL', [leadId]);
  const [inserted] = await conn.query(
    `INSERT INTO lead_assignments (lead_id, assignee_user_id, assigned_department, assignment_type, assigned_by, reason)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [leadId, targetId, targetCtx.department, opts.systemAuto ? 'auto' : 'manual', actor?.id || null, opts.reason || null]);
  await conn.query(
    `UPDATE leads SET assigned_user_id = ?, assigned_department = ?, assigned_at = NOW(),
     stage = CASE WHEN stage = 'NEW' THEN 'ASSIGNED' ELSE stage END WHERE id = ?`,
    [targetId, targetCtx.department, leadId]);
  await consultation.onAssignment(conn, lead, target);
  await require('./journeyActivityService').log({
    journey_id: lead.journey_id, entity_type: 'lead', entity_id: lead.id, action: 'assigned',
    stage_before: lead.stage, stage_after: lead.stage === 'NEW' ? 'ASSIGNED' : lead.stage,
    changed_fields: { assigned_user_id: { from: lead.assigned_user_id, to: targetId } },
    actor_id: actor?.id || null, actor_role: actor?.role || 'SYSTEM', source: opts.source || 'admin',
    reason: opts.reason || null, ip: opts.ip || null
  }, conn);
  await require('./journeySyncService').recomputeStage(lead.journey_id, conn);
  if (lead.external_crm_id && !opts.skipOutbound) {
    await require('./crmOutboundService').enqueue({
      eventId: `eg_${lead.id}_assign_${inserted.insertId}`, eventType: 'lead.care', leadId: lead.id,
      crmLeadId: lead.external_crm_id, conn,
      payload: { leadId: lead.external_crm_id, channel: 'Hệ thống',
        note: `Giao cho ${targetCtx.isGdtt ? 'GĐTTKD' : 'GĐKV'} ${target.full_name || ''}`,
        staff: target.full_name || '', ref: `EG-${lead.id}` }
    });
  }
  const [[after]] = await conn.query('SELECT * FROM leads WHERE id = ?', [leadId]);
  return { lead: after, assignment: { id: inserted.insertId, lead_id: lead.id, assignee_user_id: targetId,
    assigned_department: targetCtx.department, assignment_type: opts.systemAuto ? 'auto' : 'manual' } };
};

const assignLead = async (leadId, targetUserId, actor, opts = {}) => {
  if (opts.conn) return assignInTransaction(leadId, targetUserId, actor, opts, opts.conn);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await assignInTransaction(leadId, targetUserId, actor, opts, conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
};

const tryAutoRoute = async (lead, actor, opts = {}) => {
  if (!leadService.isAssignableClassification(lead.customer_classification)) return { routed: false };
  if (lead.assigned_user_id) return { routed: true, alreadyAssigned: true };
  const conn = opts.conn || pool;
  const department = await leadService.getRoutingDepartment(lead.region, conn);
  if (!department) return { routed: false, warning: `Chưa có routing cho miền "${lead.region || ''}"` };
  const candidates = (await getSalesCandidates(department, conn)).filter((row) => row.is_gdtt);
  if (!candidates.length) {
    await conn.query('UPDATE leads SET assigned_department = ? WHERE id = ?', [department, lead.id]);
    return { routed: false, department, warning: 'Chưa có GĐTTKD đang hoạt động tại miền' };
  }
  const result = await assignLead(lead.id, candidates[0].id, actor, { ...opts, systemAuto: true, source: opts.source || 'system',
    reason: 'Tự động giao GĐTTKD theo miền' });
  return { routed: true, department, autoAssigned: candidates[0], lead: result.lead };
};

const bulkAssign = async (leadIds, targetUserId, actor, opts = {}) => {
  const ids = [...new Set((leadIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) throw fail('Danh sách khách hàng không hợp lệ');
  const results = [];
  for (const id of ids) {
    try { results.push({ id, success: true, data: await assignLead(id, targetUserId, actor, opts) }); }
    catch (error) {
      if (!error.statusCode) console.error(`[LeadAssignment] #${id}`, error);
      results.push({ id, success: false, message: error.message });
    }
  }
  return { total: ids.length, assigned: results.filter((row) => row.success).length,
    failed: results.filter((row) => !row.success).length, results };
};

const getAssignments = async (leadId) => {
  const [rows] = await pool.query(
    `SELECT a.*, u.full_name AS assignee_name, b.full_name AS assigned_by_name FROM lead_assignments a
     LEFT JOIN users u ON u.id = a.assignee_user_id LEFT JOIN users b ON b.id = a.assigned_by
     WHERE a.lead_id = ? ORDER BY a.started_at DESC, a.id DESC`, [leadId]);
  return rows;
};

module.exports = {
  assignLead, bulkAssign, tryAutoRoute, getAssignments, getSalesCandidates,
  getGdkvCandidates: async (department, conn = pool) => (await getSalesCandidates(department, conn)).filter((row) => row.is_gdkv),
  normalizeClassification: leadService.normalizeClassification, getRoutingDepartment: leadService.getRoutingDepartment
};
