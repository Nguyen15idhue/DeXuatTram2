const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../utils/db');
const { JWT_SECRET } = require('../middlewares/auth');

exports.findByEmail = async (email) => {
  const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  return users.length > 0 ? users[0] : null;
};

const phoneVariants = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const digits = raw.replace(/[^\d]/g, '');
  const set = new Set([raw]);
  if (digits) {
    set.add(digits);
    if (digits.startsWith('84') && digits.length > 9) set.add(`0${digits.slice(2)}`);
    if (digits.startsWith('0')) set.add(digits.slice(1));
  }
  return [...set];
};

exports.findByEmailOrPhone = async (identifier) => {
  const value = String(identifier || '').trim();
  if (!value) return null;
  const phones = phoneVariants(value);
  const placeholders = phones.map(() => '?').join(', ');
  const [users] = await pool.query(
    `SELECT * FROM users WHERE email = ?${phones.length ? ` OR phone IN (${placeholders})` : ''} LIMIT 1`,
    [value, ...phones]
  );
  return users.length > 0 ? users[0] : null;
};

exports.findById = async (id) => {
  const [users] = await pool.query(
    'SELECT id, full_name, email, phone, role, status, parent_id, custom_data, created_at FROM users WHERE id = ?',
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
    [fullName, email, phone || '', hashedPassword, 'CTV', 'ACTIVE']
  );

  return { id: result.insertId };
};

exports.comparePassword = async (password, hashedPassword) => {
  return bcrypt.compare(password, hashedPassword);
};

exports.generateToken = (id, email, role, tokenVersion = 0, remember = false) => {
  const expiresIn = remember ? '30d' : (process.env.JWT_EXPIRES_IN || '12h');
  return jwt.sign({ id, email, role, tokenVersion }, JWT_SECRET, { expiresIn });
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
