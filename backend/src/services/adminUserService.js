const pool = require('../utils/db');
const dynamicUtils = require('./dynamicUtils');

const USER_SELECT = 'SELECT id, full_name, email, phone, role, status, parent_id, external_id, custom_data, created_at FROM users';

exports.getAllUsers = async (search, page, limit, scope = {}) => {
  const where = [];
  const params = [];

  if (scope.role === 'SALES' && scope.userId) {
    where.push('(id = ? OR parent_id = ?)');
    params.push(scope.userId, scope.userId);
  }

  if (search) {
    const like = `%${search}%`;
    const ors = ['full_name LIKE ?', 'email LIKE ?', 'phone LIKE ?', 'external_id LIKE ?'];
    const orsParams = [like, like, like, like];
    const digits = String(search).replace(/[^0-9]/g, '');
    if (/^[0-9]{4,}$/.test(digits) && `%${digits}%` !== like) {
      ors.push('phone LIKE ?');
      orsParams.push(`%${digits}%`);
    }
    where.push('(' + ors.join(' OR ') + ')');
    params.push(...orsParams);
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

  const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM users ${whereClause}`, params);
  const total = countResult[0].total;

  if (scope.all) {
    const [users] = await pool.query(
      `${USER_SELECT} ${whereClause} ORDER BY role, created_at DESC`,
      params
    );
    const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('users');
    const merged = users.map(u => dynamicUtils.mergeData(u, fieldDefs));
    return { users: merged, pagination: { page: 1, limit: total, total, totalPages: 1 } };
  }

  const offset = (page - 1) * limit;
  const [users] = await pool.query(
    `${USER_SELECT} ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('users');
  const merged = users.map(u => dynamicUtils.mergeData(u, fieldDefs));

  return {
    users: merged,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
};

exports.findByEmail = async (email) => {
  const [users] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  return users.length > 0 ? users[0] : null;
};

exports.findByEmailExceptId = async (email, id) => {
  const [users] = await pool.query('SELECT id FROM users WHERE email = ? AND id != ?', [email, id]);
  return users.length > 0 ? users[0] : null;
};

exports.findByExternalId = async (externalId) => {
  const [users] = await pool.query('SELECT id FROM users WHERE external_id = ?', [externalId]);
  return users.length > 0 ? users[0] : null;
};

exports.findByExternalIdExceptId = async (externalId, id) => {
  const [users] = await pool.query('SELECT id FROM users WHERE external_id = ? AND id != ?', [externalId, id]);
  return users.length > 0 ? users[0] : null;
};

exports.findById = async (id) => {
  const [users] = await pool.query(`${USER_SELECT} WHERE id = ?`, [id]);
  return users.length > 0 ? users[0] : null;
};

exports.findByIdWithRole = async (id) => {
  const [users] = await pool.query('SELECT id, role FROM users WHERE id = ?', [id]);
  return users.length > 0 ? users[0] : null;
};

exports.findByIdWithStatus = async (id) => {
  const [users] = await pool.query('SELECT id, status FROM users WHERE id = ?', [id]);
  return users.length > 0 ? users[0] : null;
};

exports.createUser = async (fullName, email, phone, hashedPassword, role, status, customData, parentId = null, externalId = null) => {
  const cd = (customData && typeof customData === 'object') ? JSON.stringify(customData) : null;
  const [result] = await pool.query(
    'INSERT INTO users (full_name, email, phone, password, role, status, custom_data, parent_id, external_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [fullName, email, phone || '', hashedPassword, role || 'CTV', status || 'ACTIVE', cd, parentId, externalId]
  );
  const [user] = await pool.query(`${USER_SELECT} WHERE id = ?`, [result.insertId]);
  return user[0];
};

exports.updateUser = async (id, fullName, email, phone, role, status, customData, externalId) => {
  const cd = (customData !== undefined && customData !== null)
    ? (typeof customData === 'object' ? JSON.stringify(customData) : customData)
    : null;
  await pool.query(
    'UPDATE users SET full_name = ?, email = ?, phone = ?, role = ?, status = ?, custom_data = ?, external_id = ?, updated_at = NOW() WHERE id = ?',
    [fullName, email, phone || '', role, status, cd, externalId === undefined ? null : externalId, id]
  );
};

exports.updateUserWithPassword = async (id, fullName, email, phone, hashedPassword, role, status, customData, externalId) => {
  const cd = (customData !== undefined && customData !== null)
    ? (typeof customData === 'object' ? JSON.stringify(customData) : customData)
    : null;
  await pool.query(
    'UPDATE users SET full_name = ?, email = ?, phone = ?, password = ?, role = ?, status = ?, custom_data = ?, external_id = ?, token_version = token_version + 1, updated_at = NOW() WHERE id = ?',
    [fullName, email, phone || '', hashedPassword, role, status, cd, externalId === undefined ? null : externalId, id]
  );
};

exports.deleteUser = async (id) => {
  await pool.query('DELETE FROM users WHERE id = ?', [id]);
};

exports.deleteUserWithOrphan = async (id, newOwnerId) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE station_proposals SET user_id = ? WHERE user_id = ?', [newOwnerId, id]);
    await conn.query('DELETE FROM users WHERE id = ?', [id]);
    await conn.commit();
  } catch (err) {
    try { await conn.rollback(); } catch { /* silent */ }
    throw err;
  } finally {
    conn.release();
  }
};

exports.updateStatus = async (id, status) => {
  await pool.query('UPDATE users SET status = ?, updated_at = NOW() WHERE id = ?', [status, id]);
};

exports.updateRole = async (id, role) => {
  await pool.query('UPDATE users SET role = ?, updated_at = NOW() WHERE id = ?', [role, id]);
};

exports.updatePassword = async (id, hashedPassword) => {
  await pool.query('UPDATE users SET password = ?, token_version = token_version + 1, updated_at = NOW() WHERE id = ?', [hashedPassword, id]);
};
