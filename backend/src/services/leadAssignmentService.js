const pool = require('../utils/db');
const { isGdkv, isGdtt } = require('../constants/salesRanks');
const leadService = require('./leadService');

// Dùng chung từ leadService (một nguồn duy nhất, tránh lệch).
const normalizeClassification = (...args) => leadService.normalizeClassification(...args);
const getRoutingDepartment = (...args) => leadService.getRoutingDepartment(...args);

const parseCustomData = (val) => {
  if (!val) return {};
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return {}; }
};

const getGdkvCandidates = async (department, conn = pool) => {
  const [rows] = await conn.query(
    "SELECT id, full_name, custom_data FROM users WHERE status = 'ACTIVE' AND role = 'SALES'"
  );
  return rows
    .map((r) => {
      const cd = parseCustomData(r.custom_data);
      return { id: r.id, full_name: r.full_name, chuc_vu: cd.chuc_vu || '', department: cd.department || '' };
    })
    .filter((u) => String(u.department) === String(department) && isGdkv(u.chuc_vu, u.department));
};

const canAssign = async (lead, actor) => {
  if (actor.role === 'SUPER_ADMIN' || actor.role === 'ADMIN' || actor.role === 'MKT') return true;
  if (actor.role === 'SALES') {
    const [rows] = await pool.query('SELECT custom_data FROM users WHERE id = ?', [actor.id]);
    const cd = parseCustomData(rows[0] && rows[0].custom_data);
    const department = cd.department || '';
    if (department && isGdtt(cd.chuc_vu, department)) {
      if (!lead.assigned_department) return true;
      return String(lead.assigned_department) === String(department);
    }
  }
  return false;
};

exports.assignLead = async (leadId, targetUserId, actor, opts = {}) => {
  const lead = await leadService.getLeadById(leadId);
  if (!lead) {
    const err = new Error('Không tìm thấy Lead');
    err.statusCode = 404;
    throw err;
  }
  if (!(await canAssign(lead, actor))) {
    const err = new Error('Không có quyền giao Lead này');
    err.statusCode = 403;
    throw err;
  }

  const targetId = Number(targetUserId);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    const err = new Error('Người được giao không hợp lệ');
    err.statusCode = 400;
    throw err;
  }
  const [trows] = await pool.query(
    'SELECT id, full_name, role, status, custom_data FROM users WHERE id = ? LIMIT 1',
    [targetId]
  );
  const target = trows[0];
  if (!target || target.status !== 'ACTIVE') {
    const err = new Error('Người được giao không tồn tại hoặc đã khóa');
    err.statusCode = 400;
    throw err;
  }
  if (target.role !== 'SALES') {
    const err = new Error('Chỉ giao Lead cho SALES');
    err.statusCode = 400;
    throw err;
  }
  const tcd = parseCustomData(target.custom_data);
  if (!isGdkv(tcd.chuc_vu, tcd.department || '')) {
    const err = new Error('Chỉ giao Lead cho Giám đốc Khu vực (GĐKV)');
    err.statusCode = 400;
    throw err;
  }

  const adminLevel = ['SUPER_ADMIN', 'ADMIN', 'MKT'].includes(actor.role);
  let department = lead.assigned_department;
  if (adminLevel) {
    // ADMIN/SUPER/MKT được giao cho GĐKV bất kỳ → gán phòng ban theo GĐKV được chọn.
    department = tcd.department || department;
  } else {
    if (!department && lead.region) {
      department = await getRoutingDepartment(lead.region);
    }
    if (!department) {
      const err = new Error('Lead chưa có phòng ban (thiếu routing theo vùng)');
      err.statusCode = 400;
      throw err;
    }
    if (String(tcd.department || '') !== String(department)) {
      const err = new Error(`GĐKV phải thuộc "${department}"`);
      err.statusCode = 400;
      throw err;
    }
  }
  if (!department) {
    const err = new Error('Không xác định được phòng ban của GĐKV');
    err.statusCode = 400;
    throw err;
  }

  const conn = (opts && opts.conn) || pool;
  const type = opts.type === 'auto' ? 'auto' : 'manual';
  await conn.query(
    'UPDATE lead_assignments SET ended_at = NOW() WHERE lead_id = ? AND ended_at IS NULL',
    [leadId]
  );
  const [ares] = await conn.query(
    `INSERT INTO lead_assignments (lead_id, assignee_user_id, assigned_department, assignment_type, assigned_by, reason)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [leadId, targetId, department, type, actor.id, opts.reason ? String(opts.reason).slice(0, 255) : null]
  );
  const stagePatch = lead.stage === 'NEW' ? ', stage = \'ASSIGNED\'' : '';
  await conn.query(
    `UPDATE leads SET assigned_user_id = ?, assigned_department = ?, assigned_at = NOW()${stagePatch} WHERE id = ?`,
    [targetId, department, leadId]
  );
  const journeyActivityService = require('./journeyActivityService');
  await journeyActivityService.log({
    journey_id: lead.journey_id,
    entity_type: 'lead',
    entity_id: leadId,
    action: 'assigned',
    stage_before: lead.stage,
    stage_after: lead.stage === 'NEW' ? 'ASSIGNED' : lead.stage,
    changed_fields: { assigned_user_id: { from: lead.assigned_user_id, to: targetId } },
    actor_id: actor.id,
    actor_role: actor.role,
    source: opts.source || 'admin',
    reason: opts.reason ? String(opts.reason).slice(0, 255) : null,
    ip: opts.ip || null,
  }, conn);
  const journeySyncService = require('./journeySyncService');
  await journeySyncService.recomputeStage(lead.journey_id, conn);
  return {
    assignment: { id: ares.insertId, lead_id: Number(leadId), assignee_user_id: targetId, assigned_department: department, assignment_type: type },
    lead: await leadService.getLeadById(leadId),
  };
};

exports.bulkAssign = async (leadIds, targetUserId, actor, opts = {}) => {
  const list = [...new Set((leadIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (list.length === 0) {
    const err = new Error('Danh sách Lead không hợp lệ');
    err.statusCode = 400;
    throw err;
  }
  const results = [];
  let ok = 0;
  let failed = 0;
  for (const lid of list) {
    try {
      const r = await exports.assignLead(lid, targetUserId, actor, { reason: opts.reason, source: opts.source, ip: opts.ip });
      results.push({ id: lid, success: true, assigned_department: r.assignment.assigned_department });
      ok++;
    } catch (e) {
      results.push({ id: lid, success: false, error: e.message || 'Lỗi giao Lead' });
      failed++;
    }
  }
  return { total: list.length, assigned: ok, failed, results };
};

exports.tryAutoRoute = async (lead, actor) => {
  const code = normalizeClassification(lead.customer_classification);
  if (code !== 'TIEM_NANG') return { routed: false };
  const department = await getRoutingDepartment(lead.region);
  if (!department) {
    return { routed: false, warning: `Không tìm thấy routing cho vùng "${lead.region || ''}" — Lead đã tạo nhưng chưa giao phòng ban` };
  }
  if (lead.assigned_user_id && String(lead.assigned_department || '') === String(department)) {
    return { routed: true, department, alreadyAssigned: true };
  }
  await pool.query(
    'UPDATE leads SET assigned_department = ?' + (lead.stage === 'NEW' ? ", stage = 'ASSIGNED'" : '') + ' WHERE id = ?',
    [department, lead.id]
  );
  const candidates = await getGdkvCandidates(department);
  if (candidates.length === 1) {
    const sysActor = { id: actor.id, role: actor.role };
    const result = await exports.assignLead(lead.id, candidates[0].id, sysActor, { type: 'auto', reason: 'Tự động theo routing vùng' });
    return { routed: true, department, autoAssigned: candidates[0], lead: result.lead };
  }
  const fresh = await leadService.getLeadById(lead.id);
  return {
    routed: true,
    department,
    suggestions: candidates,
    lead: fresh,
    warning: candidates.length === 0
      ? `Đã gán phòng ban "${department}" nhưng chưa có GĐKV nào — cần giao tay`
      : `Đã gán phòng ban "${department}" — có ${candidates.length} GĐKV, cần chọn tay`,
  };
};

exports.getAssignments = async (leadId) => {
  const [rows] = await pool.query(
    `SELECT a.*, u.full_name AS assignee_name, b.full_name AS assigned_by_name
       FROM lead_assignments a
       LEFT JOIN users u ON u.id = a.assignee_user_id
       LEFT JOIN users b ON b.id = a.assigned_by
      WHERE a.lead_id = ?
      ORDER BY a.started_at DESC, a.id DESC`,
    [leadId]
  );
  return rows;
};

exports.normalizeClassification = normalizeClassification;
exports.getRoutingDepartment = getRoutingDepartment;
exports.getGdkvCandidates = getGdkvCandidates;
