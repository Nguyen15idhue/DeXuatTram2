const pool = require('../utils/db');
const dynamicUtils = require('./dynamicUtils');

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

exports.createStation = async (name, latitude, longitude, address, status, description) => {
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('stations');
  const { fixedData, dynamicData } = dynamicUtils.splitData('stations', { name, latitude, longitude, address, status, description }, fieldDefs);

  const customData = Object.keys(dynamicData).length > 0 ? JSON.stringify(dynamicData) : null;

  const [result] = await pool.query(
    'INSERT INTO stations (name, latitude, longitude, address, status, description, custom_data) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [fixedData.name, fixedData.latitude, fixedData.longitude, fixedData.address, fixedData.status || 'ACTIVE', fixedData.description || '', customData]
  );
  const [station] = await pool.query('SELECT * FROM stations WHERE id = ?', [result.insertId]);
  return dynamicUtils.mergeData(station[0], fieldDefs);
};

exports.updateStation = async (id, name, latitude, longitude, address, status, description) => {
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('stations');
  const { fixedData, dynamicData } = dynamicUtils.splitData('stations', { name, latitude, longitude, address, status, description }, fieldDefs);

  const customData = Object.keys(dynamicData).length > 0 ? JSON.stringify(dynamicData) : null;

  await pool.query(
    'UPDATE stations SET name = ?, latitude = ?, longitude = ?, address = ?, status = ?, description = ?, custom_data = ?, updated_at = NOW() WHERE id = ?',
    [fixedData.name, fixedData.latitude, fixedData.longitude, fixedData.address, fixedData.status, fixedData.description || '', customData, id]
  );
};

exports.deleteStation = async (id) => {
  await pool.query('DELETE FROM stations WHERE id = ?', [id]);
};
