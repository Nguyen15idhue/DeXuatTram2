const pool = require('../utils/db');
const dynamicUtils = require('./dynamicUtils');
const dataListService = require('./dataListService');

exports.getAllProposals = async (status, search, page, limit) => {
  const offset = (page - 1) * limit;
  let where = [];
  let params = [];

  if (status) {
    where.push('p.status = ?');
    params.push(status);
  }

  if (search) {
    where.push('(p.owner_name LIKE ? OR p.address LIKE ? OR u.full_name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
  const needsJoin = search;

  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total FROM station_proposals p ${needsJoin ? 'LEFT JOIN users u ON p.user_id = u.id' : ''} ${whereClause}`,
    params
  );
  const total = countResult[0].total;

  const [proposals] = await pool.query(
    `SELECT p.id, p.latitude, p.longitude, p.owner_name, p.owner_phone,
            p.address, p.area, p.land_type, p.description, p.status,
            p.custom_data, p.created_at, u.full_name as user_name, u.email as user_email
    FROM station_proposals p
    LEFT JOIN users u ON p.user_id = u.id
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
  const [proposals] = await pool.query('SELECT id FROM station_proposals WHERE id = ?', [id]);
  return proposals.length > 0 ? proposals[0] : null;
};

exports.getProposalWithUser = async (id) => {
  const [proposals] = await pool.query(
    `SELECT p.*, u.full_name as user_name FROM station_proposals p LEFT JOIN users u ON p.user_id = u.id WHERE p.id = ?`,
    [id]
  );
  if (proposals.length === 0) return null;
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  return dynamicUtils.mergeData(proposals[0], fieldDefs);
};

exports.deleteProposal = async (id) => {
  await pool.query('DELETE FROM station_proposals WHERE id = ?', [id]);
};

exports.updateStatus = async (id, status) => {
  await pool.query('UPDATE station_proposals SET status = ?, updated_at = NOW() WHERE id = ?', [status, id]);
};

exports.updateProposal = async (id, data) => {
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

  const [existing] = await pool.query('SELECT custom_data FROM station_proposals WHERE id = ?', [id]);
  const current = existing.length > 0 && existing[0].custom_data
    ? (typeof existing[0].custom_data === 'string' ? JSON.parse(existing[0].custom_data) : existing[0].custom_data)
    : {};
  const mergedDynamic = { ...current, ...dynamicData };
  const customData = Object.keys(mergedDynamic).length > 0 ? JSON.stringify(mergedDynamic) : null;

  await pool.query(
    `UPDATE station_proposals SET owner_name = ?, owner_phone = ?, address = ?, area = ?, land_type = ?, description = ?, status = ?, custom_data = ?, updated_at = NOW() WHERE id = ?`,
    [fixedData.owner_name, fixedData.owner_phone, fixedData.address, fixedData.area, fixedData.land_type, fixedData.description || '', fixedData.status, customData, id]
  );
};
