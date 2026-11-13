const pool = require('../utils/db');
const access = require('./chargingStationAccessService');
const grading = require('./proposalGradingService');

const err = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const toInt = (value) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw err('Mã bản ghi không hợp lệ', 400);
  return id;
};
const normalizeDateTime = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)
    || Number(value.slice(0, 4)) < 1000) {
    throw err('Thời gian cập nhật không hợp lệ', 400);
  }
  const text = value.length === 16 ? `${value}:00` : value;
  const date = new Date(`${text}Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 19) !== text) {
    throw err('Thời gian cập nhật không hợp lệ', 400);
  }
  return text.replace('T', ' ');
};
const payload = (data = {}) => {
  if (!data || typeof data !== 'object') throw err('Dữ liệu tiến độ không hợp lệ', 400);
  if (typeof data.content !== 'string' || !data.content.trim()) throw err('Nội dung chăm sóc là bắt buộc', 400);
  const content = data.content.trim();
  if (Buffer.byteLength(content, 'utf8') > 65535) throw err('Nội dung chăm sóc quá dài', 400);
  return { content, contact_time: normalizeDateTime(data.contact_time) };
};
const canCreate = async (id, user) => {
  if (user.role === 'SUPER_ADMIN') return true;
  const [rows] = await pool.query(
    `SELECT p.user_id, CAST(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data,'$.nguoi_phu_trach.id')) AS UNSIGNED) AS assignee_id
     FROM charging_stations cs JOIN station_proposals p ON p.id=cs.proposal_id WHERE cs.id=?`, [id]);
  if (!rows.length) throw err('Không tìm thấy ON trạm', 404);
  const row = rows[0];
  if (Number(row.assignee_id) === Number(user.id)) return true;
  if (user.role === 'SALES' && Number(row.user_id) === Number(user.id)) return true;
  const [profiles] = await pool.query('SELECT custom_data FROM users WHERE id=?', [user.id]);
  const department = grading.normalizeText(grading.parseCustomData(profiles[0]?.custom_data).department);
  if (department.includes('setup') && department.includes('van hanh')) return true;
  if (!row.user_id) return false;
  const [ancestors] = await pool.query(
    `WITH RECURSIVE ancestors AS (
       SELECT parent_id AS id FROM users WHERE id=? AND parent_id IS NOT NULL
       UNION DISTINCT
       SELECT u.parent_id FROM users u JOIN ancestors a ON u.id=a.id WHERE u.parent_id IS NOT NULL
     ) SELECT id FROM ancestors WHERE id=?`, [row.user_id, user.id]);
  return Number(row.user_id) !== Number(user.id) && ancestors.length > 0;
};
const permissions = async (id, user) => {
  await access.assertView(toInt(id), user);
  return { create: await canCreate(id, user), manage: user.role === 'SUPER_ADMIN' };
};
const SELECT_LOGS = `SELECT c.id,c.charging_station_id,c.employee_user_id,c.created_by,
  DATE_FORMAT(c.contact_time,'%Y-%m-%dT%H:%i:%s') AS contact_time,c.content,c.created_at,c.updated_at,
  u.full_name AS updater_name, cs.ma_tram
  FROM charging_station_care_logs c JOIN charging_stations cs ON cs.id=c.charging_station_id
  LEFT JOIN users u ON u.id=c.created_by`;
const listCareLogs = async (id, user) => {
  const rights = await permissions(id, user);
  const [rows] = await pool.query(`${SELECT_LOGS} WHERE c.charging_station_id=? ORDER BY c.contact_time DESC,c.id DESC`, [id]);
  return { rows, permissions: rights };
};
const audit = (connection, stationId, action, oldValue, newValue, user, ctx) => connection.query(
  `INSERT INTO charging_station_activity_logs
   (charging_station_id,action,changed_fields,actor_id,actor_role,source,ip)
   VALUES (?,?,?,?,?,'user',?)`,
  [stationId, action, JSON.stringify({ progress: { label: 'Tiến độ ON trạm', old: oldValue, new: newValue } }),
    user.id, user.role, ctx.ip || null]);

const createCareLog = async (id, data, user, ctx = {}) => {
  id = toInt(id);
  const rights = await permissions(id, user);
  if (!rights.create) throw err('Không có quyền thêm tiến độ ON trạm này', 403);
  const value = payload(data);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [insert] = await connection.query(
      `INSERT INTO charging_station_care_logs (charging_station_id,employee_user_id,contact_time,content,created_by)
       VALUES (?,?,?,?,?)`, [id, user.id, value.contact_time, value.content, user.id]);
    await audit(connection, id, 'progress_created', null, { id: insert.insertId, ...value, created_by: user.id }, user, ctx);
    await connection.commit();
    return { id: insert.insertId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
};
const mutate = async (id, data, user, ctx, remove) => {
  if (user.role !== 'SUPER_ADMIN') throw err('Chỉ SUPER_ADMIN được sửa/xóa dòng tiến độ', 403);
  id = toInt(id);
  const [rows] = await pool.query('SELECT charging_station_id FROM charging_station_care_logs WHERE id=?', [id]);
  if (!rows.length) throw err('Không tìm thấy dòng tiến độ', 404);
  await access.assertView(rows[0].charging_station_id, user);
  const value = remove ? null : payload(data);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [current] = await connection.query('SELECT * FROM charging_station_care_logs WHERE id=? FOR UPDATE', [id]);
    if (!current.length) throw err('Không tìm thấy dòng tiến độ', 404);
    if (remove) await connection.query('DELETE FROM charging_station_care_logs WHERE id=?', [id]);
    else await connection.query('UPDATE charging_station_care_logs SET contact_time=?,content=? WHERE id=?',
      [value.contact_time, value.content, id]);
    await audit(connection, current[0].charging_station_id, remove ? 'progress_deleted' : 'progress_updated', current[0], value, user, ctx);
    await connection.commit();
    return { id };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
};
const getUpdater = async (id, user) => {
  id = toInt(id);
  const [logs] = await pool.query('SELECT charging_station_id,created_by FROM charging_station_care_logs WHERE id=?', [id]);
  if (!logs.length) throw err('Không tìm thấy dòng tiến độ', 404);
  await access.assertView(logs[0].charging_station_id, user);
  const [users] = await pool.query('SELECT id,full_name,role,custom_data FROM users WHERE id=?', [logs[0].created_by]);
  if (!users.length) throw err('Tài khoản người cập nhật không còn tồn tại', 404);
  const custom = grading.parseCustomData(users[0].custom_data);
  return { id: users[0].id, full_name: users[0].full_name, role: users[0].role,
    department: custom.department || '', chuc_vu: custom.chuc_vu || '' };
};
module.exports = { listCareLogs, createCareLog, permissions, getUpdater,
  updateCareLog: (id, data, user, ctx = {}) => mutate(id, data, user, ctx, false),
  deleteCareLog: (id, user, ctx = {}) => mutate(id, null, user, ctx, true) };
