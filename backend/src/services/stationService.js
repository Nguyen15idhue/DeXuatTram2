const pool = require('../utils/db');
const dynamicUtils = require('./dynamicUtils');
const dynamicEngineService = require('./dynamicEngineService');
const dataListService = require('./dataListService');

exports.getAllStations = async (search, status, page, limit) => {
  const offset = (page - 1) * limit;
  let where = [];
  let params = [];

  if (search) {
    where.push('(s.name LIKE ? OR s.address LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (status) {
    where.push('s.status = ?');
    params.push(status);
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

  const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM stations s ${whereClause}`, params);
  const total = countResult[0].total;

  const [stations] = await pool.query(
    `SELECT s.id, s.name, s.latitude, s.longitude, s.address, s.status, s.description,
            s.custom_data, s.created_at
     FROM stations s ${whereClause} ORDER BY s.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('stations');
  const merged = stations.map(s => dynamicUtils.mergeData(s, fieldDefs));

  return {
    stations: merged,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
};

exports.getStationById = async (id) => {
  const [stations] = await pool.query('SELECT * FROM stations WHERE id = ?', [id]);
  if (stations.length === 0) return null;

  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('stations');
  return dynamicUtils.mergeData(stations[0], fieldDefs);
};

exports.createStation = async (data) => {
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('stations');
  const { fixedData, dynamicData } = dynamicUtils.splitData('stations', data, fieldDefs);
  await dataListService.applyDiaGioi(dynamicData);

  const customData = Object.keys(dynamicData).length > 0 ? JSON.stringify(dynamicData) : null;

  const conn = await pool.getConnection();
  let recordId;
  let postResults = {};
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      'INSERT INTO stations (name, latitude, longitude, address, status, description, custom_data) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [fixedData.name, fixedData.latitude, fixedData.longitude, fixedData.address, fixedData.status || 'ACTIVE', fixedData.description || '', customData]
    );

    recordId = result.insertId;

    postResults = await dynamicEngineService.computePostFormulas('stations', recordId, dynamicData, null, null, { connection: conn });
    if (Object.keys(postResults).length > 0) {
      const updatedDynamic = { ...dynamicData, ...postResults };
      const updatedCustomData = JSON.stringify(updatedDynamic);
      await conn.query('UPDATE stations SET custom_data = ? WHERE id = ?', [updatedCustomData, recordId]);
    }

    await conn.commit();
  } catch (err) {
    try { await conn.rollback(); } catch { /* silent */ }
    throw err;
  } finally {
    conn.release();
  }

  const [station] = await pool.query('SELECT * FROM stations WHERE id = ?', [recordId]);
  const finalData = dynamicUtils.mergeData(station[0], fieldDefs);
  if (Object.keys(postResults).length > 0) {
    Object.assign(finalData, postResults);
  }
  return finalData;
};

exports.updateStation = async (id, data) => {
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('stations');
  const { fixedData, dynamicData } = dynamicUtils.splitData('stations', data, fieldDefs);
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

  const [existing] = await pool.query('SELECT custom_data FROM stations WHERE id = ?', [id]);
  const current = existing.length > 0 && existing[0].custom_data
    ? (typeof existing[0].custom_data === 'string' ? JSON.parse(existing[0].custom_data) : existing[0].custom_data)
    : {};
  const mergedDynamic = { ...current, ...dynamicData };
  const customData = Object.keys(mergedDynamic).length > 0 ? JSON.stringify(mergedDynamic) : null;

  await pool.query(
    'UPDATE stations SET name = ?, latitude = ?, longitude = ?, address = ?, status = ?, description = ?, custom_data = ?, updated_at = NOW() WHERE id = ?',
    [fixedData.name, fixedData.latitude, fixedData.longitude, fixedData.address || '', fixedData.status || 'ACTIVE', fixedData.description || '', customData, id]
  );
};

exports.deleteStation = async (id) => {
  await pool.query('DELETE FROM stations WHERE id = ?', [id]);
};
