const pool = require('../utils/db');
const apiConfigService = require('./apiConfigService');
const oneOfficeService = require('./oneOfficeService');

const toStr = (v) => (v === null || v === undefined || String(v).trim() === '') ? null : String(v).trim();

exports.syncFrom1Office = async (apiConfigId) => {
  const config = await apiConfigService.getById(apiConfigId);
  if (!config) {
    throw Object.assign(new Error('Không tìm thấy cấu hình API'), { statusCode: 404 });
  }
  if (config.api_type && config.api_type !== 'personnel') {
    throw Object.assign(new Error('Cấu hình này không phải loại nhân sự'), { statusCode: 400 });
  }

  const lockName = `personnel_sync_${apiConfigId}`;
  const lockConn = await pool.getConnection();
  let locked = false;
  try {
    const [lockRows] = await lockConn.query('SELECT GET_LOCK(?, 0) AS got', [lockName]);
    locked = lockRows[0] && Number(lockRows[0].got) === 1;
    if (!locked) {
      throw Object.assign(new Error('Đang đồng bộ, vui lòng thử lại sau'), { statusCode: 409 });
    }
    return await exports._doSync(apiConfigId, config);
  } finally {
    if (locked) {
      try { await lockConn.query('SELECT RELEASE_LOCK(?)', [lockName]); } catch { /* silent */ }
    }
    lockConn.release();
  }
};

exports._doSync = async (apiConfigId, config) => {
  const system = config.system_key || '1office';
  const baseUrl = config.base_url;

  const users = [];
  let page = 1;
  const limit = 100;
  while (page <= 100) {
    const res = await oneOfficeService.getPersonnelProfiles(apiConfigId, { page, limit });
    if (!res || !res.success || !res.data || !Array.isArray(res.data.users)) {
      const msg = (res && res.data && (res.data.message || res.data.error)) || 'Lỗi lấy danh sách hồ sơ nhân sự 1Office';
      await apiConfigService.markSyncResult(apiConfigId, 'failed', msg);
      throw Object.assign(new Error(msg), { statusCode: 502 });
    }
    users.push(...res.data.users);
    if (res.data.users.length < limit) break;
    page++;
  }

  const conn = await pool.getConnection();
  let inserted = 0;
  let updated = 0;
  let deactivated = 0;
  const seen = [];
  try {
    await conn.beginTransaction();

    for (const u of users) {
      const pid = (u.ID === null || u.ID === undefined) ? '' : String(u.ID);
      if (pid === '') continue;

      const code = toStr(u.code);
      const fullname = toStr(u.name);
      if (code === 'STT' || fullname === 'Họ tên') continue;

      seen.push(pid);

      const [existRows] = await conn.query(
        'SELECT id FROM external_users WHERE `system` = ? AND external_id = ?',
        [system, pid]
      );
      const raw = JSON.stringify(u);
      const rawUserId = Number(u.raw_user_id);
      const contactId = (Number.isInteger(rawUserId) && rawUserId > 0) ? String(rawUserId) : null;
      const username = toStr(u.user_id);
      const departmentId = toStr(u.department_num_id);
      const departmentName = toStr(u.department_id);
      const status = toStr(u.job_status);
      const isActive = status === 'STOP_WORKING' ? 0 : 1;

      if (existRows.length > 0) {
        await conn.query(
          `UPDATE external_users SET
             api_config_id = ?, base_url = ?, contact_id = ?, code = ?, fullname = ?, username = ?,
             department_id = ?, department_name = ?, status = ?, is_active = ?, raw_data = ?, synced_at = NOW()
           WHERE id = ?`,
          [apiConfigId, baseUrl, contactId, code, fullname, username, departmentId, departmentName, status, isActive, raw, existRows[0].id]
        );
        updated++;
      } else {
        await conn.query(
          `INSERT INTO external_users
             (api_config_id, \`system\`, base_url, external_id, contact_id, code, fullname, username,
              department_id, department_name, status, is_active, raw_data, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [apiConfigId, system, baseUrl, pid, contactId, code, fullname, username, departmentId, departmentName, status, isActive, raw]
        );
        inserted++;
      }
    }

    if (seen.length > 0) {
      const placeholders = seen.map(() => '?').join(',');
      const [res] = await conn.query(
        `UPDATE external_users SET is_active = 0, updated_at = NOW()
         WHERE \`system\` = ? AND is_active = 1 AND external_id NOT IN (${placeholders})`,
        [system, ...seen]
      );
      deactivated = res.affectedRows || 0;
    } else {
      const [res] = await conn.query(
        'UPDATE external_users SET is_active = 0, updated_at = NOW() WHERE `system` = ? AND is_active = 1',
        [system]
      );
      deactivated = res.affectedRows || 0;
    }

    await conn.commit();
  } catch (err) {
    try { await conn.rollback(); } catch { /* silent */ }
    conn.release();
    await apiConfigService.markSyncResult(apiConfigId, 'failed', err.message);
    throw err;
  }
  conn.release();

  const message = `Thêm ${inserted}, cập nhật ${updated}, khóa ${deactivated}`;
  await apiConfigService.markSyncResult(apiConfigId, 'success', message);
  return { total: users.length, inserted, updated, deactivated, system };
};
