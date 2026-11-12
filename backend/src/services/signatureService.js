const pool = require('../utils/db');
const path = require('path');
const fs = require('fs');
const signatureSnapshots = require('./signatureSnapshotService');

const SIGNATURE_DIR = path.join(__dirname, '../../storage/uploads/signatures');

const getAncestorIds = async (userId) => {
  const ids = [];
  const seen = new Set([Number(userId)]);
  let cur = Number(userId);
  let guard = 0;
  while (cur && guard < 20) {
    guard++;
    try {
      const [rows] = await pool.query('SELECT parent_id FROM users WHERE id = ?', [cur]);
      const pid = rows.length > 0 ? Number(rows[0].parent_id) : 0;
      if (!pid || seen.has(pid)) break;
      seen.add(pid);
      ids.push(pid);
      cur = pid;
    } catch {
      break;
    }
  }
  return ids;
};

const getBranchUserIds = async (salesId) => {
  const ids = [];
  const seen = new Set();
  const frontier = [Number(salesId)];
  while (frontier.length > 0) {
    const id = frontier.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    try {
      const [rows] = await pool.query('SELECT id FROM users WHERE parent_id = ?', [id]);
      rows.forEach((r) => {
        if (!seen.has(r.id)) frontier.push(r.id);
      });
    } catch {
      break;
    }
  }
  return ids;
};

const hasDirectReports = async (userId) => {
  const [rows] = await pool.query('SELECT id FROM users WHERE parent_id = ?', [userId]);
  return rows.length > 0;
};

const isManagerUser = async (requester) => {
  if (!requester) return false;
  if (['SUPER_ADMIN', 'ADMIN'].includes(requester.role)) return true;
  if (['SALES', 'NPP'].includes(requester.role)) return hasDirectReports(requester.id);
  return false;
};

const getScopeUserIds = async (requester) => {
  if (['SUPER_ADMIN', 'ADMIN'].includes(requester.role)) return null;
  if (requester.role === 'SALES') {
    const branchIds = await getBranchUserIds(requester.id);
    const ancestorIds = await getAncestorIds(requester.id);
    return [...new Set([Number(requester.id), ...branchIds, ...ancestorIds])];
  }
  if (['CTV', 'NPP'].includes(requester.role)) {
    const ancestorIds = await getAncestorIds(requester.id);
    return [...new Set([Number(requester.id), ...ancestorIds])];
  }
  return [Number(requester.id)];
};

const canAccessUser = async (requester, userId) => {
  const ids = await getScopeUserIds(requester);
  if (ids === null) return true;
  return ids.includes(Number(userId));
};

const parseChucVu = (customData) => {
  if (!customData) return '';
  let data = customData;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return '';
    }
  }
  if (!data || typeof data !== 'object') return '';
  return data.chuc_vu || '';
};

const mapRow = (row) => ({
  id: row.id,
  user_id: row.user_id,
  file_url: row.file_url,
  created_at: row.created_at,
  updated_at: row.updated_at,
  full_name: row.full_name,
  role: row.role,
  chuc_vu: parseChucVu(row.custom_data),
});

exports.isManagerUser = isManagerUser;

exports.getAll = async (requester) => {
  const scopeIds = await getScopeUserIds(requester);
  let query =
    'SELECT s.id, s.user_id, s.file_url, s.created_at, s.updated_at, u.full_name, u.role, u.custom_data FROM signatures s JOIN users u ON u.id = s.user_id';
  const params = [];
  if (scopeIds !== null) {
    if (scopeIds.length === 0) return [];
    query += ` WHERE u.id IN (${scopeIds.map(() => '?').join(',')})`;
    params.push(...scopeIds);
  }
  query += ' ORDER BY s.updated_at DESC';
  const [rows] = await pool.query(query, params);
  return rows.map(mapRow);
};

exports.getByUserId = async (requester, userId) => {
  const allowed = await canAccessUser(requester, userId);
  if (!allowed) return [];
  const [rows] = await pool.query(
    'SELECT s.id, s.user_id, s.file_url, s.created_at, s.updated_at, u.full_name, u.role, u.custom_data FROM signatures s JOIN users u ON u.id = s.user_id WHERE s.user_id = ? ORDER BY s.updated_at DESC',
    [userId],
  );
  return rows.map(mapRow);
};

exports.upload = async (userId, file) => {
  const relativePath = path.relative(SIGNATURE_DIR, file.path);
  const fileUrl = `/files/signatures/${relativePath.replace(/\\/g, '/')}`;
  let connection;
  let old = [];
  let result;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [users] = await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
    if (!users.length) throw new Error('USER_NOT_FOUND');
    [old] = await connection.query('SELECT id, file_path FROM signatures WHERE user_id = ?', [userId]);
    for (const sig of old) {
      await signatureSnapshots.preserveLegacy(sig.id, connection);
      await connection.query('DELETE FROM signatures WHERE id = ?', [sig.id]);
    }
    [result] = await connection.query('INSERT INTO signatures (user_id, file_path, file_url) VALUES (?, ?, ?)', [
      userId, file.path, fileUrl
    ]);
    await connection.commit();
  } catch (error) {
    if (connection) await connection.rollback();
    removeProfileImage(file.path);
    throw error;
  } finally {
    connection?.release();
  }
  old.forEach(sig => removeProfileImage(sig.file_path));
  return {
    id: result.insertId,
    user_id: userId,
    file_url: fileUrl,
    created_at: new Date(),
    updated_at: new Date(),
  };
};

const removeProfileImage = (filePath) => {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('[Signature] Cannot remove profile image:', error);
  }
};

exports.remove = async (signatureId, requester) => {
  const [rows] = await pool.query('SELECT id, user_id, file_path FROM signatures WHERE id = ?', [signatureId]);
  if (rows.length === 0) throw new Error('NOT_FOUND');
  const sig = rows[0];

  const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(requester.role);
  if (!isAdmin && Number(sig.user_id) !== Number(requester.id)) throw new Error('FORBIDDEN');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [sig.user_id]);
    const [current] = await connection.query('SELECT id FROM signatures WHERE id = ?', [signatureId]);
    if (!current.length) throw new Error('NOT_FOUND');
    await signatureSnapshots.preserveLegacy(signatureId, connection);
    await connection.query('DELETE FROM signatures WHERE id = ?', [signatureId]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  removeProfileImage(sig.file_path);
  return true;
};

exports.getImage = async (signatureId, requester) => {
  const [rows] = await pool.query('SELECT id, user_id, file_path FROM signatures WHERE id = ?', [signatureId]);
  if (rows.length === 0) throw new Error('NOT_FOUND');
  const sig = rows[0];

  const allowed = await canAccessUser(requester, sig.user_id);
  if (!allowed) throw new Error('FORBIDDEN');
  if (!sig.file_path || !fs.existsSync(sig.file_path)) throw new Error('NOT_FOUND');

  return sig;
};

exports.SIGNATURE_DIR = SIGNATURE_DIR;
