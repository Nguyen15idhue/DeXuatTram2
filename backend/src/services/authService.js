const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../utils/db');
const { JWT_SECRET } = require('../middlewares/auth');

exports.findByEmail = async (email) => {
  const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  return users.length > 0 ? users[0] : null;
};

exports.findById = async (id) => {
  const [users] = await pool.query(
    'SELECT id, full_name, email, phone, role, status, custom_data, created_at FROM users WHERE id = ?',
    [id]
  );
  return users.length > 0 ? users[0] : null;
};

exports.findByIdFull = async (id) => {
  const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  return users.length > 0 ? users[0] : null;
};

exports.createUser = async (fullName, email, phone, password) => {
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const [result] = await pool.query(
    'INSERT INTO users (full_name, email, phone, password, role, status) VALUES (?, ?, ?, ?, ?, ?)',
    [fullName, email, phone, hashedPassword, 'CTV', 'ACTIVE']
  );

  return { id: result.insertId };
};

exports.comparePassword = async (password, hashedPassword) => {
  return bcrypt.compare(password, hashedPassword);
};

exports.generateToken = (id, email, role, tokenVersion = 0) => {
  return jwt.sign({ id, email, role, tokenVersion }, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '12h' });
};

exports.updateProfile = async (id, fullName, phone, customData) => {
  const customDataJson = customData ? JSON.stringify(customData) : null;
  await pool.query(
    'UPDATE users SET full_name = ?, phone = ?, custom_data = ?, updated_at = NOW() WHERE id = ?',
    [fullName, phone || '', customDataJson, id]
  );
};

exports.updatePassword = async (id, fullName, phone, newPassword) => {
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newPassword, salt);
  await pool.query(
    'UPDATE users SET full_name = ?, phone = ?, password = ?, token_version = token_version + 1, updated_at = NOW() WHERE id = ?',
    [fullName, phone || '', hashedPassword, id]
  );
};
