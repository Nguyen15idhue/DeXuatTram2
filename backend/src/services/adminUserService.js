const pool = require('../utils/db');

const USER_SELECT = 'SELECT id, full_name, email, phone, role, status, created_at FROM users';

exports.getAllUsers = async (search, page, limit) => {
  const offset = (page - 1) * limit;
  let where = [];
  let params = [];

  if (search) {
    where.push('(full_name LIKE ? OR email LIKE ? OR phone LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

  const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM users ${whereClause}`, params);
  const total = countResult[0].total;

  const [users] = await pool.query(
    `${USER_SELECT} ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    users,
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

exports.createUser = async (fullName, email, phone, hashedPassword, role, status) => {
  const [result] = await pool.query(
    'INSERT INTO users (full_name, email, phone, password, role, status) VALUES (?, ?, ?, ?, ?, ?)',
    [fullName, email, phone || '', hashedPassword, role || 'USER', status || 'ACTIVE']
  );
  const [user] = await pool.query(`${USER_SELECT} WHERE id = ?`, [result.insertId]);
  return user[0];
};

exports.updateUser = async (id, fullName, email, phone, role, status) => {
  await pool.query(
    'UPDATE users SET full_name = ?, email = ?, phone = ?, role = ?, status = ?, updated_at = NOW() WHERE id = ?',
    [fullName, email, phone || '', role, status, id]
  );
};

exports.updateUserWithPassword = async (id, fullName, email, phone, hashedPassword, role, status) => {
  await pool.query(
    'UPDATE users SET full_name = ?, email = ?, phone = ?, password = ?, role = ?, status = ?, updated_at = NOW() WHERE id = ?',
    [fullName, email, phone || '', hashedPassword, role, status, id]
  );
};

exports.deleteUser = async (id) => {
  await pool.query('DELETE FROM users WHERE id = ?', [id]);
};

exports.updateStatus = async (id, status) => {
  await pool.query('UPDATE users SET status = ?, updated_at = NOW() WHERE id = ?', [status, id]);
};

exports.updateRole = async (id, role) => {
  await pool.query('UPDATE users SET role = ?, updated_at = NOW() WHERE id = ?', [role, id]);
};
