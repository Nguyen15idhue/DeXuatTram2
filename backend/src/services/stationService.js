const pool = require('../utils/db');

exports.getAllStations = async (search, status, page, limit) => {
  const offset = (page - 1) * limit;
  let where = [];
  let params = [];

  if (search) {
    where.push('(name LIKE ? OR address LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (status) {
    where.push('status = ?');
    params.push(status);
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

  const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM stations ${whereClause}`, params);
  const total = countResult[0].total;

  const [stations] = await pool.query(
    `SELECT id, name, latitude, longitude, address, status, description, created_at FROM stations ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    stations,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
};

exports.getStationById = async (id) => {
  const [stations] = await pool.query('SELECT * FROM stations WHERE id = ?', [id]);
  return stations.length > 0 ? stations[0] : null;
};

exports.createStation = async (name, latitude, longitude, address, status, description) => {
  const [result] = await pool.query(
    'INSERT INTO stations (name, latitude, longitude, address, status, description) VALUES (?, ?, ?, ?, ?, ?)',
    [name, latitude, longitude, address, status || 'ACTIVE', description || '']
  );
  const [station] = await pool.query('SELECT * FROM stations WHERE id = ?', [result.insertId]);
  return station[0];
};

exports.updateStation = async (id, name, latitude, longitude, address, status, description) => {
  await pool.query(
    'UPDATE stations SET name = ?, latitude = ?, longitude = ?, address = ?, status = ?, description = ?, updated_at = NOW() WHERE id = ?',
    [name, latitude, longitude, address, status, description || '', id]
  );
};

exports.deleteStation = async (id) => {
  await pool.query('DELETE FROM stations WHERE id = ?', [id]);
};
