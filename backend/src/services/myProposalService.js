const pool = require('../utils/db');
const dynamicUtils = require('./dynamicUtils');
const dynamicEngineService = require('./dynamicEngineService');
const dataListService = require('./dataListService');
const addressEnrichment = require('./addressEnrichment');
const notificationService = require('./notificationService');
const { buildColumnFilterWhere } = require('../utils/dynamicFilter');

const MY_PROPOSAL_FIXED_COLUMNS = ['owner_name', 'owner_phone', 'latitude', 'longitude', 'address', 'area', 'land_type', 'description', 'status', 'tracking_code'];

exports.getUserProposals = async (userId, status, search, page, limit, columnFilters) => {
  const offset = (page - 1) * limit;
  let where = ['p.user_id = ?'];
  let params = [userId];

  if (status) {
    where.push('p.status = ?');
    params.push(status);
  }

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
            p.reject_reason, p.custom_data, p.created_at, p.supplement_deadline_at
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

exports.updateProposal = async (id, userId, data, opts = {}) => {
  const [st] = await pool.query('SELECT status FROM station_proposals WHERE id = ? AND user_id = ?', [id, userId]);
  if (st.length === 0 || (st[0].status !== 'PENDING' && st[0].status !== 'REJECTED' && st[0].status !== 'REVIEWING' && st[0].status !== 'PRINCIPLE_APPROVED')) {
    throw Object.assign(new Error('Chỉ có thể chỉnh sửa đề xuất đang ở trạng thái PENDING, REJECTED, REVIEWING hoặc Duyệt chủ trương'), { statusCode: 400 });
  }
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
  const [existing] = await pool.query('SELECT custom_data, contact_1office_code, status, reviewed_by, owner_name, owner_phone, address, area, land_type, description FROM station_proposals WHERE id = ? AND user_id = ?', [id, userId]);
  const current = existing.length > 0 && existing[0].custom_data
    ? (typeof existing[0].custom_data === 'string' ? JSON.parse(existing[0].custom_data) : existing[0].custom_data)
    : {};
  await dynamicUtils.applyAutoUserFields(dynamicData, fieldDefs, userId, null, current);
  await dynamicUtils.resolveTablePrices({ ...fixedData, ...dynamicData }, dynamicData, fieldDefs).catch(() => {});
  const mergedDynamic = { ...current, ...dynamicData };
  const customData = Object.keys(mergedDynamic).length > 0 ? JSON.stringify(mergedDynamic) : null;

  const wasRejected = existing.length > 0 && existing[0].status === 'REJECTED';
  const nextStatus = wasRejected ? 'PENDING' : (existing.length > 0 ? existing[0].status : 'PENDING');
  const reviewerId = existing.length > 0 ? existing[0].reviewed_by : null;

  let resetDeadlineMinutes = null;
  if (wasRejected) {
    try {
      const proposalLifecycle = require('./proposalLifecycle');
      const configured = await proposalLifecycle.getDeadlineMinutes('PENDING');
      resetDeadlineMinutes = Math.max(1, Number(configured) || 4320);
    } catch { resetDeadlineMinutes = 4320; }
  }

  await pool.query(
    `UPDATE station_proposals
     SET owner_name = ?, owner_phone = ?, address = ?, area = ?, land_type = ?, description = ?, custom_data = ?, status = ?, updated_at = NOW()
     ${resetDeadlineMinutes ? ', supplement_deadline_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)' : ''}
     WHERE id = ? AND user_id = ?`,
    resetDeadlineMinutes
      ? [fixedData.owner_name, fixedData.owner_phone, fixedData.address || '', fixedData.area || '', fixedData.land_type || '', fixedData.description || '', customData, nextStatus, resetDeadlineMinutes, id, userId]
      : [fixedData.owner_name, fixedData.owner_phone, fixedData.address || '', fixedData.area || '', fixedData.land_type || '', fixedData.description || '', customData, nextStatus, id, userId]
  );

  if (wasRejected && reviewerId) {
    const code = notificationService.proposalCode(customData, id);
    const actorName = await notificationService.getUserName(userId);
    await notificationService.create({
      userId: reviewerId,
      type: 'RESUBMITTED',
      title: notificationService.statusTitle('RESUBMITTED'),
      message: notificationService.statusMessage({ code, actorName, status: 'RESUBMITTED' }),
      entityType: 'station_proposals',
      entityId: id,
      createdBy: userId
    });
  }

  try {
    const proposalLifecycle = require('./proposalLifecycle');
    const oldFlat = { ...(existing[0] || {}), ...current };
    const newFlat = {
      ...(existing[0] || {}),
      owner_name: fixedData.owner_name !== undefined ? fixedData.owner_name : existing[0].owner_name,
      owner_phone: fixedData.owner_phone !== undefined ? fixedData.owner_phone : existing[0].owner_phone,
      address: fixedData.address !== undefined ? fixedData.address : existing[0].address,
      area: fixedData.area !== undefined ? fixedData.area : existing[0].area,
      land_type: fixedData.land_type !== undefined ? fixedData.land_type : existing[0].land_type,
      description: fixedData.description !== undefined ? fixedData.description : existing[0].description,
      ...mergedDynamic
    };
    const diff = proposalLifecycle.buildDiff(oldFlat, newFlat, fieldDefs);
    if (Object.keys(diff).length > 0) {
      await proposalLifecycle.logActivity({
        proposalId: id, action: 'updated', changedFields: diff,
        fromStatus: existing[0].status, toStatus: nextStatus,
        actorId: userId, actorRole: opts.actorRole || null,
        source: 'user', manualOverride: false, ip: opts.ip || null
      });
    }
    if (wasRejected) {
      await proposalLifecycle.logActivity({
        proposalId: id, action: 'status_change',
        fromStatus: 'REJECTED', toStatus: 'PENDING',
        actorId: userId, actorRole: opts.actorRole || null,
        source: 'user', manualOverride: false, ip: opts.ip || null
      });
    }
  } catch { /* silent: khong chan luu vi log */ }

  const CODE_DRIVERS = ['mo_hinh_dau_tu', 'ma_tinh', 'province'];
  const driversChanged = CODE_DRIVERS.some(k => dynamicData[k] !== undefined && String(dynamicData[k] ?? '') !== String(current[k] ?? ''));
    const codeValid = typeof current.ma_de_xuat === 'string' && /^[A-Z0-9_]+_\d{4}$/.test(current.ma_de_xuat);
  const isLinked = existing.length > 0 && !!existing[0].contact_1office_code;
  const exclude = (!isLinked && (driversChanged || !codeValid)) ? [] : ['ma_de_xuat'];
  const postResults = await dynamicEngineService.computePostFormulas('station_proposals', id, mergedDynamic, userId, null, { excludeKeys: exclude });
  if (Object.keys(postResults).length > 0) {
    const updatedDynamic = { ...mergedDynamic, ...postResults };
    if (postResults.ma_de_xuat) {
      await pool.query('UPDATE station_proposals SET custom_data = ?, tracking_code = ? WHERE id = ?', [JSON.stringify(updatedDynamic), postResults.ma_de_xuat, id]);
    } else {
      await pool.query('UPDATE station_proposals SET custom_data = ? WHERE id = ?', [JSON.stringify(updatedDynamic), id]);
    }
  }
};

exports.deleteProposal = async (id, userId) => {
  await pool.query('DELETE FROM station_proposals WHERE id = ? AND user_id = ?', [id, userId]);
};
