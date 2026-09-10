const pool = require('../utils/db');
const dynamicUtils = require('./dynamicUtils');
const dynamicEngineService = require('./dynamicEngineService');
const dataListService = require('./dataListService');

exports.getUserProposals = async (userId, status, search, page, limit) => {
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

  const whereClause = 'WHERE ' + where.join(' AND ');

  const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM station_proposals p ${whereClause}`, params);
  const total = countResult[0].total;

  const [proposals] = await pool.query(
    `SELECT p.id, p.latitude, p.longitude, p.owner_name, p.owner_phone,
            p.address, p.area, p.land_type, p.description, p.status,
            p.custom_data, p.created_at
    FROM station_proposals p
    ${whereClause}
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const merged = proposals.map(p => dynamicUtils.mergeData(p, fieldDefs));

  return {
    proposals: merged,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
};

exports.getProposalById = async (id) => {
  const [proposals] = await pool.query('SELECT * FROM station_proposals WHERE id = ?', [id]);
  if (proposals.length === 0) return null;

  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  return dynamicUtils.mergeData(proposals[0], fieldDefs);
};

exports.getProposalByIdAndUser = async (id, userId) => {
  const [existing] = await pool.query(
    'SELECT id, status FROM station_proposals WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  return existing.length > 0 ? existing[0] : null;
};

exports.updateProposal = async (id, userId, data) => {
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const { fixedData, dynamicData } = dynamicUtils.splitData('station_proposals', data, fieldDefs);
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

  const [existing] = await pool.query('SELECT custom_data, contact_1office_code FROM station_proposals WHERE id = ? AND user_id = ?', [id, userId]);
  const current = existing.length > 0 && existing[0].custom_data
    ? (typeof existing[0].custom_data === 'string' ? JSON.parse(existing[0].custom_data) : existing[0].custom_data)
    : {};
  const mergedDynamic = { ...current, ...dynamicData };
  const customData = Object.keys(mergedDynamic).length > 0 ? JSON.stringify(mergedDynamic) : null;

  await pool.query(
    `UPDATE station_proposals
     SET owner_name = ?, owner_phone = ?, address = ?, area = ?, land_type = ?, description = ?, custom_data = ?, updated_at = NOW()
     WHERE id = ? AND user_id = ?`,
    [fixedData.owner_name, fixedData.owner_phone, fixedData.address || '', fixedData.area || '', fixedData.land_type || '', fixedData.description || '', customData, id, userId]
  );

  const CODE_DRIVERS = ['mo_hinh_dau_tu', 'ma_tinh', 'province'];
  const driversChanged = CODE_DRIVERS.some(k => dynamicData[k] !== undefined && String(dynamicData[k] ?? '') !== String(current[k] ?? ''));
  const codeValid = typeof current.ma_de_xuat === 'string' && /^[A-Z0-9]+_[A-Z0-9]+_\d{4}$/.test(current.ma_de_xuat);
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
