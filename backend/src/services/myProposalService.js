const pool = require('../utils/db');
const dynamicUtils = require('./dynamicUtils');
const dynamicEngineService = require('./dynamicEngineService');
const dataListService = require('./dataListService');
const addressEnrichment = require('./addressEnrichment');
const notificationService = require('./notificationService');
const { buildColumnFilterWhere } = require('../utils/dynamicFilter');

const MY_PROPOSAL_FIXED_COLUMNS = ['owner_name', 'owner_phone', 'latitude', 'longitude', 'address', 'area', 'land_type', 'description', 'status', 'tracking_code', 'note'];

exports.getUserProposals = async (userId, status, search, page, limit, columnFilters, extra = {}) => {
  const offset = (page - 1) * limit;
  let where = ['p.user_id = ?'];
  let params = [userId];

  if (status) {
    where.push('p.status = ?');
    params.push(status);
  }

  if (extra.uuTien) {
    where.push("JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.loai_uu_tien')) = ?");
    params.push(String(extra.uuTien));
  }
  const dateField = extra.dateField === 'updated_at' ? 'p.updated_at' : 'p.created_at';
  if (extra.dateFrom) { where.push(`${dateField} >= ?`); params.push(`${String(extra.dateFrom).slice(0, 10)} 00:00:00`); }
  if (extra.dateTo) { where.push(`${dateField} <= ?`); params.push(`${String(extra.dateTo).slice(0, 10)} 23:59:59`); }

  if (search) {
    const like = `%${search}%`;
    const ors = ['p.owner_name LIKE ?', 'p.address LIKE ?', 'p.tracking_code LIKE ?', 'p.ma_de_xuat_gen LIKE ?'];
    const orsParams = [like, like, like, like];
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
      fixedColumns: MY_PROPOSAL_FIXED_COLUMNS,
      alias: 'p'
    });
    where.push(...clauses);
    params.push(...filterParams);
  }

  const whereClause = 'WHERE ' + where.join(' AND ');

  const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM station_proposals p ${whereClause}`, params);
  const total = countResult[0].total;

  const [proposals] = await pool.query(
    `SELECT p.id, p.latitude, p.longitude, p.owner_name, p.owner_phone,
            p.address, p.area, p.land_type, p.description, p.status,
            p.reject_reason, p.custom_data, p.created_at, p.supplement_deadline_at, p.transition_deadline_at, p.info_completed_at,
            p.pending_station_code, p.note, p.chot_so_luong_tru, p.tong_gia_tri_chot
    FROM station_proposals p
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
  const [proposals] = await pool.query('SELECT * FROM station_proposals WHERE id = ?', [id]);
  if (proposals.length === 0) return null;

  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const merged = dynamicUtils.mergeData(proposals[0], fieldDefs);
  return dynamicUtils.enrichUserFields(merged, fieldDefs);
};

exports.getProposalByIdAndUser = async (id, userId) => {
  const [existing] = await pool.query(
    'SELECT id, status FROM station_proposals WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  return existing.length > 0 ? existing[0] : null;
};

const assertOwnerEditable = (status) => {
  const proposalLifecycle = require('./proposalLifecycle');
  if (proposalLifecycle.OWNER_EDITABLE_STATUSES.includes(status)) return;
  const step = proposalLifecycle.STATUS_STEP_LABELS[status];
  const where = step ? `Đề xuất đang ở khâu ${step}` : `Đề xuất đang ở trạng thái ${status}`;
  throw Object.assign(
    new Error(`${where}, bạn chưa thể chỉnh sửa. Chỉ được cập nhật khi phòng ban phụ trách yêu cầu bổ sung thông tin.`),
    { statusCode: 403 }
  );
};

const notifyBackOfficeOfOwnerUpdate = async (id, ownerId, actorId, customData) => {
  const notificationService = require('./notificationService');
  const stepRecipients = require('./proposalStepRecipients');
  const ids = await stepRecipients.resolveStepRecipients('PROPOSAL_REPORT_REVIEWING', { id, user_id: ownerId, custom_data: customData });
  const code = notificationService.proposalCode(customData, id);
  const actorName = (await notificationService.getUserName(actorId)) || 'Người cập nhật';
  const message = notificationService.statusMessage({ code, actorName, status: 'PROPOSAL_REPORT_REVIEWING', actionLabel: 'Người cập nhật' });
  for (const uid of ids) {
    if (Number(uid) === Number(actorId)) continue;
    try {
      await notificationService.create({
        userId: uid,
        type: 'PROPOSAL_UPDATED',
        title: 'Người đề xuất đã cập nhật thông tin đề xuất',
        message,
        entityType: 'station_proposals',
        entityId: id,
        createdBy: actorId
      });
    } catch { /* silent */ }
  }
};

exports.updateProposal = async (id, userId, data, opts = {}) => {
  const actorId = Number(opts.actorId) || Number(userId);
  const [st] = await pool.query('SELECT status FROM station_proposals WHERE id = ? AND user_id = ?', [id, userId]);
  if (st.length === 0) {
    throw Object.assign(new Error('Không tìm thấy đề xuất'), { statusCode: 404 });
  }
  let gradingSupplementUpdate = false;
  if (opts.deferRequestCompletion && opts.requestId && opts.requestType === 'SUPPLEMENT'
    && ['GRADING', 'RE_GRADING'].includes(st[0].status)) {
    const request = await require('./proposalRequestService').getRequestById(opts.requestId);
    gradingSupplementUpdate = !!request
      && Number(request.proposal_id) === Number(id)
      && Number(request.owner_id) === Number(userId)
      && request.request_type === 'SUPPLEMENT'
      && request.status === 'OPEN';
  }
  if (!gradingSupplementUpdate) assertOwnerEditable(st[0].status);
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
  const [existing] = await pool.query('SELECT latitude, longitude, custom_data, contact_1office_code, status, reviewed_by, owner_name, owner_phone, address, area, land_type, description, note, chot_so_luong_tru FROM station_proposals WHERE id = ? AND user_id = ?', [id, userId]);
  const current = existing.length > 0 && existing[0].custom_data
    ? (typeof existing[0].custom_data === 'string' ? JSON.parse(existing[0].custom_data) : existing[0].custom_data)
    : {};
  await dynamicUtils.applyAutoUserFields(dynamicData, fieldDefs, userId, null, current);
  await dynamicUtils.resolveTablePrices({ ...fixedData, ...dynamicData }, dynamicData, fieldDefs).catch(() => {});
  const mergedDynamic = { ...current, ...dynamicData };
  const customData = Object.keys(mergedDynamic).length > 0 ? JSON.stringify(mergedDynamic) : null;

  const wasRejected = existing.length > 0 && existing[0].status === 'REJECTED';
  const wasWaitingInfo = existing.length > 0 && existing[0].status === 'INFOR_WAITING';
  const nextStatus = wasRejected
    ? 'PENDING'
    : (wasWaitingInfo ? 'DESIGNING' : (existing.length > 0 ? existing[0].status : 'PENDING'));
  const reviewerId = existing.length > 0 ? existing[0].reviewed_by : null;

  let resetDeadlineMinutes = null;
  let resetTransitionMinutes = null;
  if (wasRejected) {
    try {
      const proposalLifecycle = require('./proposalLifecycle');
      const configured = await proposalLifecycle.getDeadlineMinutes('PENDING', 'supplement');
      resetDeadlineMinutes = Math.max(1, Number(configured) || 4320);
      const tConf = await proposalLifecycle.getDeadlineMinutes('PENDING', 'transition');
      resetTransitionMinutes = tConf ? Math.max(1, Number(tConf)) : null;
    } catch { resetDeadlineMinutes = 4320; }
  }

  const prevRow = existing.length > 0 ? existing[0] : {};
  const nextLat = fixedData.latitude !== undefined ? fixedData.latitude : prevRow.latitude;
  const nextLng = fixedData.longitude !== undefined ? fixedData.longitude : prevRow.longitude;
  const nextNote = fixedData.note !== undefined ? fixedData.note : prevRow.note;
  const nextPole = fixedData.chot_so_luong_tru !== undefined ? fixedData.chot_so_luong_tru : prevRow.chot_so_luong_tru;
  await pool.query(
    `UPDATE station_proposals
     SET latitude = ?, longitude = ?, owner_name = ?, owner_phone = ?, address = ?, area = ?, land_type = ?, description = ?, note = ?, chot_so_luong_tru = ?, custom_data = ?, status = ?, updated_at = NOW()
     ${resetDeadlineMinutes ? ', supplement_deadline_at = DATE_ADD(NOW(), INTERVAL ? MINUTE), transition_deadline_at = DATE_ADD(NOW(), INTERVAL ? MINUTE), info_completed_at = NULL' : ''}
     WHERE id = ? AND user_id = ?`,
    resetDeadlineMinutes
      ? [nextLat, nextLng, fixedData.owner_name, fixedData.owner_phone, fixedData.address || '', fixedData.area || '', fixedData.land_type || '', fixedData.description || '', nextNote ?? null, dynamicUtils.toJsonParam(nextPole), customData, nextStatus, resetDeadlineMinutes, resetTransitionMinutes, id, userId]
      : [nextLat, nextLng, fixedData.owner_name, fixedData.owner_phone, fixedData.address || '', fixedData.area || '', fixedData.land_type || '', fixedData.description || '', nextNote ?? null, dynamicUtils.toJsonParam(nextPole), customData, nextStatus, id, userId]
  );

  if (wasRejected && reviewerId) {
    const code = notificationService.proposalCode(customData, id);
    const actorName = await notificationService.getUserName(actorId);
    await notificationService.create({
      userId: reviewerId,
      type: 'RESUBMITTED',
      title: notificationService.statusTitle('RESUBMITTED'),
      message: notificationService.statusMessage({ code, actorName, status: 'RESUBMITTED' }),
      entityType: 'station_proposals',
      entityId: id,
      createdBy: actorId
    });
  }

  if (existing.length > 0 && ['PROPOSAL_REPORT_UPDATING', 'PROPOSAL_REPORT_RE_CREATING'].includes(existing[0].status)) {
    try {
      await notifyBackOfficeOfOwnerUpdate(id, userId, actorId, mergedDynamic);
    } catch { /* silent: khong chan luu vi thong bao */ }
  }

  try {
    const proposalLifecycle = require('./proposalLifecycle');
    const oldFlat = { ...(existing[0] || {}), ...current };
    const newFlat = {
      ...(existing[0] || {}),
      latitude: nextLat !== undefined ? nextLat : existing[0].latitude,
      longitude: nextLng !== undefined ? nextLng : existing[0].longitude,
      owner_name: fixedData.owner_name !== undefined ? fixedData.owner_name : existing[0].owner_name,
      owner_phone: fixedData.owner_phone !== undefined ? fixedData.owner_phone : existing[0].owner_phone,
      address: fixedData.address !== undefined ? fixedData.address : existing[0].address,
      area: fixedData.area !== undefined ? fixedData.area : existing[0].area,
      land_type: fixedData.land_type !== undefined ? fixedData.land_type : existing[0].land_type,
      description: fixedData.description !== undefined ? fixedData.description : existing[0].description,
      note: nextNote,
      chot_so_luong_tru: nextPole,
      ...mergedDynamic
    };
    const diff = proposalLifecycle.buildDiff(oldFlat, newFlat, fieldDefs);
    if (Object.keys(diff).length > 0) {
      await proposalLifecycle.logActivity({
        proposalId: id, action: 'updated', changedFields: diff,
        fromStatus: existing[0].status, toStatus: nextStatus,
        actorId, actorRole: opts.actorRole || null,
        source: 'user', manualOverride: false, ip: opts.ip || null
      });
      const journeySyncService = require('./journeySyncService');
      await journeySyncService.onProposalUpdated(id, {
        changedFields: diff, actorId, actorRole: opts.actorRole || null,
        source: 'user', ip: opts.ip || null
      });
    }
    if (wasRejected) {
      await proposalLifecycle.logActivity({
        proposalId: id, action: 'status_change',
        fromStatus: 'REJECTED', toStatus: 'PENDING',
        actorId, actorRole: opts.actorRole || null,
        source: 'user', manualOverride: false, ip: opts.ip || null
      });
    }
    if (wasWaitingInfo) {
      if (!opts.deferRequestCompletion) {
        await require('./proposalRequestService').closeRequests(id, ['LAYOUT_SUPPLEMENT'], { resolvedBy: actorId });
      }
      await proposalLifecycle.logActivity({
        proposalId: id, action: 'status_change',
        fromStatus: 'INFOR_WAITING', toStatus: 'DESIGNING',
        actorId, actorRole: opts.actorRole || null,
        source: 'user', manualOverride: false, ip: opts.ip || null
      });
      await require('./proposalDesignService').notifyInfoSupplemented({ proposalId: id, actorId });
    }
  } catch { /* silent: khong chan luu vi log */ }

  const CODE_DRIVERS = ['mo_hinh_dau_tu', 'ma_tinh', 'province'];
  const driversChanged = CODE_DRIVERS.some(k => dynamicData[k] !== undefined && String(dynamicData[k] ?? '') !== String(current[k] ?? ''));
    const codeValid = typeof current.ma_de_xuat === 'string' && /^[A-Z0-9_]+_\d{4}$/.test(current.ma_de_xuat);
  const isLinked = existing.length > 0 && !!existing[0].contact_1office_code;
  const exclude = (!isLinked && (driversChanged || !codeValid)) ? [] : ['ma_de_xuat'];
  const postResults = await dynamicEngineService.computePostFormulas('station_proposals', id, mergedDynamic, userId, null, { excludeKeys: exclude });
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
  if (!opts.deferRequestCompletion) {
    try {
      const proposalLifecycle = require('./proposalLifecycle');
      infoCompleted = await proposalLifecycle.maybeAutoConfirmInfo(id, {
        actorId, purpose: 'view', ip: opts.ip || null
      });
    } catch { infoCompleted = null; }
  }

  let autoPush = null;
  try {
    const proposalLifecycle = require('./proposalLifecycle');
    autoPush = await proposalLifecycle.autoPushOnUpdate(id, actorId);
  } catch { autoPush = null; }
  return { autoPush, infoCompleted };
};

exports.deleteProposal = async (id, userId) => {
  const [st] = await pool.query('SELECT status FROM station_proposals WHERE id = ? AND user_id = ?', [id, userId]);
  if (st.length === 0) return;
  if (!['PENDING', 'REJECTED'].includes(st[0].status)) {
    throw Object.assign(new Error('Chỉ được xóa đề xuất đang ở trạng thái đang đề xuất hoặc bị từ chối'), { statusCode: 403 });
  }
  await pool.query('DELETE FROM station_proposals WHERE id = ? AND user_id = ?', [id, userId]);
};
