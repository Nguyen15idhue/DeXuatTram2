const pool = require('../utils/db');
const dynamicUtils = require('./dynamicUtils');

const USER_SELECT = 'SELECT id, full_name, email, phone, role, status, parent_id, external_id, custom_data, created_at FROM users';

exports.getAncestorIds = async (userId) => {
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
    } catch { break; }
  }
  return ids;
};

exports.getBranchIds = async (userId) => {
  const ids = [];
  const seen = new Set();
  let frontier = [Number(userId)];
  while (frontier.length > 0) {
    const id = frontier.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    try {
      const [rows] = await pool.query('SELECT id FROM users WHERE parent_id = ?', [id]);
      rows.forEach(r => { if (!seen.has(r.id)) frontier.push(r.id); });
    } catch { /* silent */ }
  }
  return ids;
};

exports.getAllUsers = async (search, page, limit, scope = {}) => {
  const where = [];
  const params = [];
  let ancestorSet = null;

  if (scope.role === 'SALES' && scope.userId) {
    const branchIds = await exports.getBranchIds(scope.userId);
    const ancestorIds = await exports.getAncestorIds(scope.userId);
    ancestorSet = new Set(ancestorIds);
    const ids = [...new Set([...branchIds, ...ancestorIds])];
    if (ids.length === 0) {
      return { users: [], pagination: { page, limit, total: 0, totalPages: 0 } };
    }
    where.push(`(id IN (${ids.map(() => '?').join(',')}))`);
    params.push(...ids);
  }

  if (scope.role && scope.role !== 'SUPER_ADMIN') {
    where.push(`role <> 'SUPER_ADMIN'`);
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
      `${USER_SELECT} ${whereClause} ORDER BY role, created_at DESC LIMIT 5000`,
      params
    );
    const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('users');
    const merged = users.map(u => dynamicUtils.mergeData(u, fieldDefs));
    if (ancestorSet) merged.forEach(u => { u._scope = ancestorSet.has(Number(u.id)) ? 'ancestor' : 'branch'; });
    return { users: merged, pagination: { page: 1, limit: total, total, totalPages: 1 } };
  }

  const offset = (page - 1) * limit;
  const [users] = await pool.query(
    `${USER_SELECT} ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('users');
  const merged = users.map(u => dynamicUtils.mergeData(u, fieldDefs));
  if (ancestorSet) merged.forEach(u => { u._scope = ancestorSet.has(Number(u.id)) ? 'ancestor' : 'branch'; });

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

const USER_OPTION_META = `id, full_name, role,
  JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.chuc_vu')) AS chuc_vu,
  JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.department')) AS department`;

const CHUC_VU_GDKV_OPT = 'Giám đốc Khu vực';
const CHUC_VU_GDTT_OPT = 'Giám đốc Trung tâm Kinh doanh';

exports.getUserOptions = async (scope = {}, poolType = null) => {
  const role = scope.role;
  const userId = scope.userId;

  if (poolType === 'gdkv' || poolType === 'gdtt') {
    const targetChucVu = poolType === 'gdkv' ? CHUC_VU_GDKV_OPT : CHUC_VU_GDTT_OPT;
    const group = targetChucVu;

    if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
      const roleFilter = role === 'SUPER_ADMIN'
        ? `role IN ('SALES','ADMIN','SUPER_ADMIN')`
        : `role IN ('SALES','ADMIN')`;
      const [rows] = await pool.query(`SELECT ${USER_OPTION_META} FROM users
        WHERE status = 'ACTIVE' AND ${roleFilter} ORDER BY full_name`, []);
      const isPrimary = (r) => r.role === 'SALES' && r.chuc_vu === targetChucVu;
      return [
        ...rows.filter(isPrimary).map(r => ({ ...r, group })),
        ...rows.filter(r => !isPrimary(r)).map(r => ({ ...r, group: 'Khác' })),
      ];
    }

    if (role === 'SALES' && userId) {
      const [meRows] = await pool.query(
        `SELECT ${USER_OPTION_META} FROM users WHERE id = ? LIMIT 1`, [userId]
      );
      const me = meRows[0] || {};
      if (poolType === 'gdkv' && me.chuc_vu === CHUC_VU_GDKV_OPT) {
        return [{ id: me.id, full_name: me.full_name, role: me.role, chuc_vu: me.chuc_vu, department: me.department, group }];
      }
      const dept = me.department || null;
      if (!dept) return [];
      const [rows] = await pool.query(
        `SELECT ${USER_OPTION_META} FROM users
         WHERE status = 'ACTIVE' AND role = 'SALES'
           AND JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.chuc_vu')) = ?
           AND JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.department')) = ?
         ORDER BY full_name`,
        [targetChucVu, dept]
      );
      return rows.map(r => ({ ...r, group }));
    }

    if (['CTV', 'NPP'].includes(role) && userId) {
      const ancestorIds = await exports.getAncestorIds(userId);
      const ids = [...new Set([Number(userId), ...ancestorIds])];
      if (ids.length === 0) return [];
      const [rows] = await pool.query(
        `SELECT ${USER_OPTION_META} FROM users
         WHERE status = 'ACTIVE' AND id IN (${ids.map(() => '?').join(',')})
         ORDER BY full_name`,
        ids
      );
      return rows.map(r => ({ ...r, group: null }));
    }
  }

  const where = [`status = 'ACTIVE'`];
  const params = [];
  if (role === 'SALES' && userId) {
    const branchIds = await exports.getBranchIds(userId);
    const ancestorIds = await exports.getAncestorIds(userId);
    const ids = [...new Set([...branchIds, ...ancestorIds])];
    if (ids.length === 0) return [];
    where.push(`(id IN (${ids.map(() => '?').join(',')}))`);
    params.push(...ids);
  } else if (role && ['CTV', 'NPP'].includes(role) && userId) {
    const ancestorIds = await exports.getAncestorIds(userId);
    const ids = [...new Set([Number(userId), ...ancestorIds])];
    where.push(`(id IN (${ids.map(() => '?').join(',')}))`);
    params.push(...ids);
  }
  if (role && role !== 'SUPER_ADMIN') {
    where.push(`role <> 'SUPER_ADMIN'`);
  }
  const [rows] = await pool.query(
    `SELECT id, full_name, role FROM users WHERE ${where.join(' AND ')} ORDER BY full_name`,
    params
  );
  return rows;
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

exports.updateUser = async (id, fullName, email, phone, role, status, customData, externalId, parentId) => {
  const cd = (customData !== undefined && customData !== null)
    ? (typeof customData === 'object' ? JSON.stringify(customData) : customData)
    : null;
  await pool.query(
    'UPDATE users SET full_name = ?, email = ?, phone = ?, role = ?, status = ?, custom_data = ?, external_id = ?, parent_id = ?, updated_at = NOW() WHERE id = ?',
    [fullName, email, phone || '', role, status, cd, externalId === undefined ? null : externalId, parentId !== undefined ? parentId : null, id]
  );
};

exports.updateUserWithPassword = async (id, fullName, email, phone, hashedPassword, role, status, customData, externalId, parentId) => {
  const cd = (customData !== undefined && customData !== null)
    ? (typeof customData === 'object' ? JSON.stringify(customData) : customData)
    : null;
  await pool.query(
    'UPDATE users SET full_name = ?, email = ?, phone = ?, password = ?, role = ?, status = ?, custom_data = ?, external_id = ?, parent_id = ?, token_version = token_version + 1, updated_at = NOW() WHERE id = ?',
    [fullName, email, phone || '', hashedPassword, role, status, cd, externalId === undefined ? null : externalId, parentId !== undefined ? parentId : null, id]
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

exports.getExternalMappings = async (userId) => {
  const [rows] = await pool.query(
    'SELECT id, user_id, `system`, external_id, created_at, updated_at FROM user_external_map WHERE user_id = ? ORDER BY `system`',
    [userId]
  );
  return rows;
};

exports.setExternalMapping = async (userId, system, externalId) => {
  const sys = String(system || '').trim();
  const ext = String(externalId || '').trim();
  if (!sys) {
    throw Object.assign(new Error('System không được để trống'), { statusCode: 400 });
  }
  if (!ext) {
    throw Object.assign(new Error('External ID không được để trống'), { statusCode: 400 });
  }
  const user = await exports.findById(userId);
  if (!user) {
    throw Object.assign(new Error('Không tìm thấy user'), { statusCode: 404 });
  }
  const [conflict] = await pool.query(
    'SELECT user_id FROM user_external_map WHERE `system` = ? AND external_id = ? AND user_id != ? LIMIT 1',
    [sys, ext, userId]
  );
  if (conflict.length > 0) {
    throw Object.assign(new Error('External ID đã được gán cho user khác trong hệ này'), { statusCode: 400 });
  }
  try {
    await pool.query(
      'INSERT INTO user_external_map (user_id, `system`, external_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE external_id = VALUES(external_id)',
      [userId, sys, ext]
    );
  } catch (err) {
    if (err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062)) {
      throw Object.assign(new Error('External ID đã được gán cho user khác trong hệ này'), { statusCode: 400 });
    }
    throw err;
  }
  const [rows] = await pool.query(
    'SELECT id, user_id, `system`, external_id, created_at, updated_at FROM user_external_map WHERE user_id = ? AND `system` = ?',
    [userId, sys]
  );
  return rows[0] || null;
};

exports.deleteExternalMapping = async (userId, system) => {
  const sys = String(system || '').trim();
  if (!sys) {
    throw Object.assign(new Error('System không được để trống'), { statusCode: 400 });
  }
  const [result] = await pool.query(
    'DELETE FROM user_external_map WHERE user_id = ? AND `system` = ?',
    [userId, sys]
  );
  return result.affectedRows > 0;
};

exports.findUserByExternal = async (system, externalId) => {
  const sys = String(system || '').trim();
  const ext = String(externalId || '').trim();
  if (!sys || !ext) return null;
  const [rows] = await pool.query(
    'SELECT user_id FROM user_external_map WHERE `system` = ? AND external_id = ? LIMIT 1',
    [sys, ext]
  );
  return rows.length > 0 ? rows[0] : null;
};

exports.findExternalByUser = async (userId, system) => {
  const sys = String(system || '').trim();
  if (!sys) return null;
  const [rows] = await pool.query(
    'SELECT external_id FROM user_external_map WHERE user_id = ? AND `system` = ? LIMIT 1',
    [userId, sys]
  );
  return rows.length > 0 ? rows[0].external_id : null;
};
