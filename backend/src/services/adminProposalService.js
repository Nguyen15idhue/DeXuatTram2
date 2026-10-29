const pool = require('../utils/db');
const dynamicUtils = require('./dynamicUtils');
const dynamicEngineService = require('./dynamicEngineService');
const dataListService = require('./dataListService');
const addressEnrichment = require('./addressEnrichment');
const notificationService = require('./notificationService');
const { buildColumnFilterWhere } = require('../utils/dynamicFilter');

const PROPOSAL_FIXED_COLUMNS = ['owner_name', 'owner_phone', 'latitude', 'longitude', 'address', 'area', 'land_type', 'description', 'status', 'tracking_code', 'note', 'review_level', 'quy_hoach_score', 'quy_hoach_note', 'phap_ly_score', 'phap_ly_note', 'ngay_du_kien_on'];

exports.getBranchUserIds = async (salesId) => {
  const adminUserService = require('./adminUserService');
  return adminUserService.getBranchIds(salesId);
};

exports.getAllProposals = async (status, search, page, limit, scope = {}, uuTien, columnFilters, extra = {}) => {
  const offset = (page - 1) * limit;
  const where = [];
  const params = [];

  if (scope.role === 'SALES' && scope.branchIds) {
    if (scope.branchIds.length === 0 && !scope.userId) {
      return { proposals: [], pagination: { page, limit, total: 0, totalPages: 0 } };
    }
    const ors = [];
    if (scope.branchIds.length > 0) {
      ors.push(`p.user_id IN (${scope.branchIds.map(() => '?').join(',')})`);
      params.push(...scope.branchIds);
    }
    if (scope.userId) {
      ors.push(`(CAST(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.nguoi_phu_trach.id')) AS UNSIGNED) = ? OR CAST(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.sales_quan_ly.id')) AS UNSIGNED) = ?)`);
      params.push(Number(scope.userId), Number(scope.userId));
    }
    where.push('(' + ors.join(' OR ') + ')');
  }

  if (scope.role === 'NPP' && scope.branchIds) {
    if (scope.branchIds.length === 0) where.push('1 = 0');
    else {
      where.push(`p.user_id IN (${scope.branchIds.map(() => '?').join(',')})`);
      params.push(...scope.branchIds.map(Number));
    }
  }

  // CTV: only see their own proposals (where they are the creator/user_id)
  if (scope.role === 'CTV' && scope.userId) {
    where.push('p.user_id = ?');
    params.push(Number(scope.userId));
  }

  if (status) {
    where.push('p.status = ?');
    params.push(status);
  }

  if (Array.isArray(extra.statuses) && extra.statuses.length > 0) {
    where.push(`p.status IN (${extra.statuses.map(() => '?').join(',')})`);
    params.push(...extra.statuses);
  }
  if (extra.signedApprovalOnly) {
    where.push("(p.status <> 'APPROVED' OR p.signed_file_id IS NOT NULL)");
  }

  if (uuTien) {
    where.push("JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.loai_uu_tien')) = ?");
    params.push(String(uuTien));
  }

  if (search) {
    const like = `%${search}%`;
    const ors = ['p.owner_name LIKE ?', 'p.address LIKE ?', 'u.full_name LIKE ?', 'p.tracking_code LIKE ?', 'p.ma_de_xuat_gen LIKE ?'];
    const orsParams = [like, like, like, like, like];
    const digits = String(search).replace(/[^0-9]/g, '');
    if (/^[0-9]{4,}$/.test(digits)) {
      ors.push('p.owner_phone LIKE ?');
      orsParams.push(`%${digits}%`);
    }
    where.push('(' + ors.join(' OR ') + ')');
    params.push(...orsParams);
  }

  if (columnFilters) {
    const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
    const { clauses, params: filterParams } = buildColumnFilterWhere({
      filters: columnFilters,
      fieldDefs,
      fixedColumns: PROPOSAL_FIXED_COLUMNS,
      alias: 'p'
    });
    where.push(...clauses);
    params.push(...filterParams);
  }

  if (extra.leadLink === 'yes') { where.push('p.journey_id IS NOT NULL'); }
  else if (extra.leadLink === 'no') { where.push('p.journey_id IS NULL'); }
  if (extra.province) { where.push("JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.province')) = ?"); params.push(extra.province); }
  if (extra.region) { where.push("JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.vung_mien')) = ?"); params.push(extra.region); }
  if (extra.model) { where.push("JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.mo_hinh_dau_tu')) = ?"); params.push(extra.model); }
  if (extra.department) { where.push("JSON_UNQUOTE(JSON_EXTRACT(u.custom_data, '$.department')) = ?"); params.push(extra.department); }
  if (extra.ownerUserId) { where.push('p.user_id = ?'); params.push(Number(extra.ownerUserId)); }
  if (extra.managerUserId) {
    const branchIds = await require('./adminUserService').getBranchIds(Number(extra.managerUserId));
    if (branchIds.length === 0) where.push('1 = 0');
    else {
      where.push(`p.user_id IN (${branchIds.map(() => '?').join(',')})`);
      params.push(...branchIds.map(Number));
    }
  }
  const dateField = extra.dateField === 'updated_at' ? 'p.updated_at' : 'p.created_at';
  if (extra.dateFrom) { where.push(`${dateField} >= ?`); params.push(`${String(extra.dateFrom).slice(0, 10)} 00:00:00`); }
  if (extra.dateTo) { where.push(`${dateField} <= ?`); params.push(`${String(extra.dateTo).slice(0, 10)} 23:59:59`); }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total FROM station_proposals p LEFT JOIN users u ON p.user_id = u.id ${whereClause}`,
    params
  );
  const total = countResult[0].total;

  const [proposals] = await pool.query(
    `SELECT p.id, p.latitude, p.longitude, p.owner_name, p.owner_phone,
            p.address, p.area, p.land_type, p.description, p.status,
            p.custom_data, p.created_at, p.user_id,
            p.station_id, p.signed_file_id,
            p.reject_reason, p.reviewed_by, p.reviewed_at, p.supplement_deadline_at, p.transition_deadline_at, p.info_completed_at,
            p.paused_from_status, p.paused_at,
            p.review_level, p.quy_hoach_score, p.quy_hoach_note, p.phap_ly_score, p.phap_ly_note,
            p.pending_station_code, p.note, p.chot_so_luong_tru, p.tong_gia_tri_chot,
            u.full_name as user_name, u.email as user_email,
            JSON_UNQUOTE(JSON_EXTRACT(u.custom_data, '$.department')) AS owner_department,
            u.parent_id AS manager_user_id, manager.full_name AS manager_name,
            p.journey_id,
            l.id AS lead_id, l.lead_code AS lead_code
    FROM station_proposals p
    LEFT JOIN users u ON p.user_id = u.id
    LEFT JOIN users manager ON manager.id = u.parent_id
    LEFT JOIN leads l ON l.journey_id = p.journey_id AND l.deleted_at IS NULL
    ${whereClause}
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const merged = proposals.map(p => dynamicUtils.mergeData(p, fieldDefs));
  const enriched = await dynamicUtils.enrichUserFieldsMany(merged, fieldDefs);

  return {
    proposals: enriched,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
};

exports.getProposalById = async (id) => {
  const [proposals] = await pool.query(
    `SELECT id, user_id, status,
            CAST(JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.nguoi_phu_trach.id')) AS UNSIGNED) AS nguoi_phu_trach_id,
            CAST(JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.sales_quan_ly.id')) AS UNSIGNED) AS sales_quan_ly_id
     FROM station_proposals WHERE id = ?`, [id]);
  return proposals.length > 0 ? proposals[0] : null;
};

exports.getProposalWithUser = async (id) => {
  const [proposals] = await pool.query(
    `SELECT p.*, u.full_name as user_name,
            l.id AS lead_id, l.lead_code AS lead_code
       FROM station_proposals p
       LEFT JOIN users u ON p.user_id = u.id
       LEFT JOIN leads l ON l.journey_id = p.journey_id AND l.deleted_at IS NULL
      WHERE p.id = ?`,
    [id]
  );
  if (proposals.length === 0) return null;
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const merged = dynamicUtils.mergeData(proposals[0], fieldDefs);
  return dynamicUtils.enrichUserFields(merged, fieldDefs);
};

const userFieldId = (v) => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'object') {
    const id = v.id ?? v.user_id ?? v.value;
    return id === undefined || id === null || String(id).trim() === '' ? null : Number(id);
  }
  return String(v).trim() === '' ? null : Number(v);
};

exports.deleteProposal = async (id) => {
  await pool.query('DELETE FROM station_proposals WHERE id = ?', [id]);
  await notificationService.removeByEntity('station_proposals', id);
};

exports.updateStatus = async (id, status, opts = {}) => {
  const proposalLifecycle = require('./proposalLifecycle');
  return proposalLifecycle.transition(id, status, {
    reason: opts.reason,
    actorId: opts.reviewerId || null,
    actorRole: opts.actorRole || null,
    source: 'user',
    manualOverride: opts.force === true,
    ip: opts.ip || null,
    isSuperAdmin: opts.isSuperAdmin === true,
    force: opts.force === true
  });
};

exports.pauseProposal = async (id, opts = {}) => {
  const proposalLifecycle = require('./proposalLifecycle');
  return proposalLifecycle.pauseProposal(id, {
    reason: opts.reason,
    actorId: opts.reviewerId || null,
    actorRole: opts.actorRole || null,
    source: 'user',
    ip: opts.ip || null
  });
};

exports.resumeProposal = async (id, opts = {}) => {
  const proposalLifecycle = require('./proposalLifecycle');
  return proposalLifecycle.resumeProposal(id, {
    actorId: opts.reviewerId || null,
    actorRole: opts.actorRole || null,
    source: 'user',
    ip: opts.ip || null
  });
};

exports.batchAutoConfirm = async ({ limit = 500, actorId = null } = {}) => {
  const proposalLifecycle = require('./proposalLifecycle');
  const suppStatuses = await proposalLifecycle.getEnabledSupplementStatuses();
  const report = { checked: 0, confirmed: 0, incomplete: 0, already: 0, failed: 0, hasMore: false, missingSamples: [] };
  if (!suppStatuses || suppStatuses.length === 0) return report;

  const placeholders = suppStatuses.map(() => '?').join(', ');
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS n FROM station_proposals
     WHERE info_completed_at IS NULL AND supplement_deadline_at IS NOT NULL
       AND status IN (${placeholders})`,
    suppStatuses
  );
  const total = countRows[0] ? countRows[0].n : 0;

  const [rows] = await pool.query(
    `SELECT id, ma_de_xuat_gen AS code FROM station_proposals
     WHERE info_completed_at IS NULL AND supplement_deadline_at IS NOT NULL
       AND status IN (${placeholders})
     ORDER BY id ASC LIMIT ?`,
    [...suppStatuses, limit]
  );

  report.checked = rows.length;
  report.hasMore = total > rows.length;

  for (const r of rows) {
    try {
      const res = await proposalLifecycle.maybeAutoConfirmInfo(r.id, { actorId, purpose: 'view' });
      if (res.confirmed) report.confirmed++;
      else if (res.already) report.already++;
      else if (res.error) report.failed++;
      else {
        report.incomplete++;
        if (report.missingSamples.length < 10) {
          report.missingSamples.push({ id: r.id, code: r.code || null, missing: res.missing || [] });
        }
      }
    } catch { report.failed++; }
  }
  return report;
};

exports.updateProposal = async (id, data, opts = {}) => {
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const { fixedData, dynamicData } = dynamicUtils.splitData('station_proposals', data, fieldDefs);
  await addressEnrichment.enrichDynamicData({ dynamicData, fixedData }).catch(() => {});
  if (dynamicData.province !== undefined && dynamicData.province !== null && String(dynamicData.province).trim() !== '') {
    await dataListService.applyDiaGioi(dynamicData);
  }

  const postKeys = new Set(fieldDefs.filter(f => {
    if (f.type !== 'formula' || !f.formula_config) return false;
    try {
      const fc = typeof f.formula_config === 'string' ? JSON.parse(f.formula_config) : f.formula_config;
      return fc.compute_mode === 'post';
    } catch { return false; }
  }).map(f => f.key));
  Object.keys(dynamicData).forEach(k => { if (postKeys.has(k)) delete dynamicData[k]; });
  if (dynamicData.nguoi_phu_trach !== undefined && dynamicData.sales_quan_ly === undefined) {
    dynamicData.sales_quan_ly = dynamicData.nguoi_phu_trach;
  }

  const [existing] = await pool.query('SELECT user_id, latitude, longitude, owner_name, owner_phone, address, area, land_type, description, status, custom_data, note, chot_so_luong_tru FROM station_proposals WHERE id = ?', [id]);
  const current = existing.length > 0 && existing[0].custom_data
    ? (typeof existing[0].custom_data === 'string' ? JSON.parse(existing[0].custom_data) : existing[0].custom_data)
    : {};
  await dynamicUtils.applyAutoUserFields(dynamicData, fieldDefs, existing.length > 0 ? existing[0].user_id : null, null, current);
  await dynamicUtils.resolveTablePrices({ ...fixedData, ...dynamicData }, dynamicData, fieldDefs).catch(() => {});
  const mergedDynamic = { ...current, ...dynamicData };
  const customData = Object.keys(mergedDynamic).length > 0 ? JSON.stringify(mergedDynamic) : null;

  const prev = existing.length > 0 ? existing[0] : {};
  if (fixedData.status !== undefined && existing.length > 0 && fixedData.status !== prev.status) {
    throw Object.assign(new Error('Đổi trạng thái phải dùng PUT /admin/proposals/:id/status'), { statusCode: 400 });
  }
  const next = {
    latitude: fixedData.latitude !== undefined ? fixedData.latitude : prev.latitude,
    longitude: fixedData.longitude !== undefined ? fixedData.longitude : prev.longitude,
    owner_name: fixedData.owner_name !== undefined ? fixedData.owner_name : prev.owner_name,
    owner_phone: fixedData.owner_phone !== undefined ? fixedData.owner_phone : prev.owner_phone,
    address: fixedData.address !== undefined ? fixedData.address : prev.address,
    area: fixedData.area !== undefined ? fixedData.area : prev.area,
    land_type: fixedData.land_type !== undefined ? fixedData.land_type : prev.land_type,
    description: fixedData.description !== undefined ? fixedData.description : prev.description,
    note: fixedData.note !== undefined ? fixedData.note : prev.note,
    chot_so_luong_tru: fixedData.chot_so_luong_tru !== undefined ? fixedData.chot_so_luong_tru : prev.chot_so_luong_tru,
    status: prev.status
  };

  await pool.query(
    `UPDATE station_proposals SET latitude = ?, longitude = ?, owner_name = ?, owner_phone = ?, address = ?, area = ?, land_type = ?, description = ?, note = ?, chot_so_luong_tru = ?, status = ?, custom_data = ?, updated_at = NOW() WHERE id = ?`,
    [next.latitude, next.longitude, next.owner_name, next.owner_phone, next.address, next.area, next.land_type, next.description || '', next.note ?? null, dynamicUtils.toJsonParam(next.chot_so_luong_tru), next.status, customData, id]
  );

  try {
    const oldAssignee = userFieldId(current.nguoi_phu_trach) || userFieldId(current.sales_quan_ly);
    const newAssignee = userFieldId(mergedDynamic.nguoi_phu_trach) || userFieldId(mergedDynamic.sales_quan_ly);
    if (newAssignee && newAssignee !== oldAssignee) {
      const code = notificationService.proposalCode(mergedDynamic, id);
      const actorName = opts.actorId ? await notificationService.getUserName(opts.actorId) : 'Hệ thống';
      await notificationService.create({
        userId: newAssignee,
        type: 'ASSIGNED',
        title: 'Đề xuất được giao cho bạn',
        message: `Mã đề xuất: ${code} · Người giao: ${actorName}`,
        entityType: 'station_proposals',
        entityId: id,
        createdBy: opts.actorId || null
      });
    }
  } catch { /* silent */ }

  try {
    const proposalLifecycle = require('./proposalLifecycle');
    const oldFlat = { ...prev, ...current };
    const newFlat = { ...next, ...mergedDynamic };
    const diff = proposalLifecycle.buildDiff(oldFlat, newFlat, fieldDefs);
    if (Object.keys(diff).length > 0) {
      await proposalLifecycle.logActivity({
        proposalId: id, action: 'updated', changedFields: diff,
        fromStatus: prev.status || null, toStatus: next.status || null,
        actorId: opts.actorId || null, actorRole: opts.actorRole || null,
        source: 'user', manualOverride: false, ip: opts.ip || null
      });
      const journeySyncService = require('./journeySyncService');
      await journeySyncService.onProposalUpdated(id, {
        changedFields: diff, actorId: opts.actorId || null, actorRole: opts.actorRole || null,
        source: 'user', ip: opts.ip || null
      });
    }
  } catch { /* silent: khong chan luu vi log */ }

  const CODE_DRIVERS = ['mo_hinh_dau_tu', 'ma_tinh', 'province'];
  const driversChanged = CODE_DRIVERS.some(k => dynamicData[k] !== undefined && String(dynamicData[k] ?? '') !== String(current[k] ?? ''));
    const codeValid = typeof current.ma_de_xuat === 'string' && /^[A-Z0-9_]+_\d{4}$/.test(current.ma_de_xuat);
  const exclude = (driversChanged || !codeValid) ? [] : ['ma_de_xuat'];
  const postResults = await dynamicEngineService.computePostFormulas('station_proposals', id, mergedDynamic, null, null, { excludeKeys: exclude });
  const finalDynamic = { ...mergedDynamic, ...postResults };
  let filesRenamed = 0;
  try {
    const fileService = require('./fileService');
    filesRenamed = await fileService.renameProposalFiles({
      dynamicData: finalDynamic,
      fieldDefs,
      maDeXuat: finalDynamic.ma_de_xuat || current.ma_de_xuat || `DX${id}`
    });
  } catch { /* silent: khong chan luu vi rename */ }
  if (Object.keys(postResults).length > 0) {
    if (postResults.ma_de_xuat) {
      await pool.query('UPDATE station_proposals SET custom_data = ?, tracking_code = ? WHERE id = ?', [JSON.stringify(finalDynamic), postResults.ma_de_xuat, id]);
    } else {
      await pool.query('UPDATE station_proposals SET custom_data = ? WHERE id = ?', [JSON.stringify(finalDynamic), id]);
    }
  } else if (filesRenamed > 0) {
    await pool.query('UPDATE station_proposals SET custom_data = ? WHERE id = ?', [JSON.stringify(finalDynamic), id]);
  }

  let infoCompleted = null;
  try {
    const proposalLifecycle = require('./proposalLifecycle');
    infoCompleted = await proposalLifecycle.maybeAutoConfirmInfo(id, {
      actorId: opts.actorId || null, purpose: 'view', ip: opts.ip || null
    });
  } catch { infoCompleted = null; }

  return { infoCompleted };
};
