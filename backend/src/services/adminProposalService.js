const pool = require('../utils/db');
const dynamicUtils = require('./dynamicUtils');
const dynamicEngineService = require('./dynamicEngineService');
const dataListService = require('./dataListService');
const addressEnrichment = require('./addressEnrichment');
const notificationService = require('./notificationService');
const { buildColumnFilterWhere } = require('../utils/dynamicFilter');

const PROPOSAL_FIXED_COLUMNS = ['owner_name', 'owner_phone', 'latitude', 'longitude', 'address', 'area', 'land_type', 'description', 'status', 'tracking_code'];

exports.getBranchUserIds = async (salesId) => {
  const adminUserService = require('./adminUserService');
  return adminUserService.getBranchIds(salesId);
};

exports.getAllProposals = async (status, search, page, limit, scope = {}, uuTien, columnFilters) => {
  const offset = (page - 1) * limit;
  const where = [];
  const params = [];

  if (scope.role === 'SALES' && scope.branchIds) {
    if (scope.branchIds.length === 0) {
      return { proposals: [], pagination: { page, limit, total: 0, totalPages: 0 } };
    }
    where.push(`p.user_id IN (${scope.branchIds.map(() => '?').join(',')})`);
    params.push(...scope.branchIds);
  }

  if (status) {
    where.push('p.status = ?');
    params.push(status);
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
            p.contact_1office_code, p.sync_status, p.station_id,
            p.reject_reason, p.reviewed_by, p.reviewed_at,
            u.full_name as user_name, u.email as user_email
    FROM station_proposals p
    LEFT JOIN users u ON p.user_id = u.id
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
  const [proposals] = await pool.query('SELECT id, user_id FROM station_proposals WHERE id = ?', [id]);
  return proposals.length > 0 ? proposals[0] : null;
};

exports.getProposalWithUser = async (id) => {
  const [proposals] = await pool.query(
    `SELECT p.*, u.full_name as user_name FROM station_proposals p LEFT JOIN users u ON p.user_id = u.id WHERE p.id = ?`,
    [id]
  );
  if (proposals.length === 0) return null;
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const merged = dynamicUtils.mergeData(proposals[0], fieldDefs);
  return dynamicUtils.enrichUserFields(merged, fieldDefs);
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
    source: 'user',
    manualOverride: false,
    ip: opts.ip || null,
    isSuperAdmin: opts.isSuperAdmin === true
  });
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

  const [existing] = await pool.query('SELECT user_id, owner_name, owner_phone, address, area, land_type, description, status, custom_data, contact_1office_code FROM station_proposals WHERE id = ?', [id]);
  const current = existing.length > 0 && existing[0].custom_data
    ? (typeof existing[0].custom_data === 'string' ? JSON.parse(existing[0].custom_data) : existing[0].custom_data)
    : {};
  await dynamicUtils.applyAutoUserFields(dynamicData, fieldDefs, existing.length > 0 ? existing[0].user_id : null, null, current);
  const mergedDynamic = { ...current, ...dynamicData };
  const customData = Object.keys(mergedDynamic).length > 0 ? JSON.stringify(mergedDynamic) : null;

  const prev = existing.length > 0 ? existing[0] : {};
  if (fixedData.status !== undefined && existing.length > 0 && fixedData.status !== prev.status) {
    throw Object.assign(new Error('Đổi trạng thái phải dùng PUT /admin/proposals/:id/status'), { statusCode: 400 });
  }
  const next = {
    owner_name: fixedData.owner_name !== undefined ? fixedData.owner_name : prev.owner_name,
    owner_phone: fixedData.owner_phone !== undefined ? fixedData.owner_phone : prev.owner_phone,
    address: fixedData.address !== undefined ? fixedData.address : prev.address,
    area: fixedData.area !== undefined ? fixedData.area : prev.area,
    land_type: fixedData.land_type !== undefined ? fixedData.land_type : prev.land_type,
    description: fixedData.description !== undefined ? fixedData.description : prev.description,
    status: prev.status
  };

  await pool.query(
    `UPDATE station_proposals SET owner_name = ?, owner_phone = ?, address = ?, area = ?, land_type = ?, description = ?, status = ?, custom_data = ?, updated_at = NOW() WHERE id = ?`,
    [next.owner_name, next.owner_phone, next.address, next.area, next.land_type, next.description || '', next.status, customData, id]
  );

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
    }
  } catch { /* silent: khong chan luu vi log */ }

  const CODE_DRIVERS = ['mo_hinh_dau_tu', 'ma_tinh', 'province'];
  const driversChanged = CODE_DRIVERS.some(k => dynamicData[k] !== undefined && String(dynamicData[k] ?? '') !== String(current[k] ?? ''));
    const codeValid = typeof current.ma_de_xuat === 'string' && /^[A-Z0-9_]+_\d{4}$/.test(current.ma_de_xuat);
  const isLinked = existing.length > 0 && !!existing[0].contact_1office_code;
  const exclude = (!isLinked && (driversChanged || !codeValid)) ? [] : ['ma_de_xuat'];
  const postResults = await dynamicEngineService.computePostFormulas('station_proposals', id, mergedDynamic, null, null, { excludeKeys: exclude });
  if (Object.keys(postResults).length > 0) {
    const updatedDynamic = { ...mergedDynamic, ...postResults };
    if (postResults.ma_de_xuat) {
      await pool.query('UPDATE station_proposals SET custom_data = ?, tracking_code = ? WHERE id = ?', [JSON.stringify(updatedDynamic), postResults.ma_de_xuat, id]);
    } else {
      await pool.query('UPDATE station_proposals SET custom_data = ? WHERE id = ?', [JSON.stringify(updatedDynamic), id]);
    }
  }
};
