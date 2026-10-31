const pool = require('../utils/db');

const err = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const toInt = (value, label) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw err(`${label} không hợp lệ`, 400);
  return n;
};

const normalizeDateTime = (value) => {
  if (!value) throw err('Thời gian là bắt buộc', 400);
  const date = new Date(String(value).trim().replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) throw err('Thời gian không hợp lệ', 400);
  return date.toISOString().slice(0, 19).replace('T', ' ');
};

const listCareLogs = async (chargingStationId) => {
  const id = toInt(chargingStationId, 'ON trạm');
  const [rows] = await pool.query(
    `SELECT c.id, c.charging_station_id, c.employee_user_id, c.contact_time, c.content, c.created_at, c.updated_at,
            u.full_name AS employee_name,
            cs.ma_tram
     FROM charging_station_care_logs c
     JOIN charging_stations cs ON cs.id = c.charging_station_id
     LEFT JOIN users u ON u.id = c.employee_user_id
     WHERE c.charging_station_id = ?
     ORDER BY c.contact_time DESC, c.id DESC`,
    [id]
  );
  return rows;
};

const createCareLog = async (chargingStationId, data = {}, ctx = {}) => {
  const id = toInt(chargingStationId, 'ON trạm');
  const [stationRows] = await pool.query('SELECT id, ma_tram FROM charging_stations WHERE id = ?', [id]);
  if (stationRows.length === 0) throw err('Không tìm thấy ON trạm', 404);

  const employeeUserId = data.employee_user_id ? toInt(data.employee_user_id, 'Nhân viên') : null;
  if (employeeUserId) {
    const [userRows] = await pool.query('SELECT id FROM users WHERE id = ? AND status = "ACTIVE"', [employeeUserId]);
    if (userRows.length === 0) throw err('Nhân viên không tồn tại hoặc đã khóa', 400);
  }
  const content = String(data.content || '').trim();
  if (!content) throw err('Nội dung liên hệ là bắt buộc', 400);
  const contactTime = normalizeDateTime(data.contact_time);

  const [result] = await pool.query(
    `INSERT INTO charging_station_care_logs (charging_station_id, employee_user_id, contact_time, content, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [id, employeeUserId, contactTime, content, ctx.actorId || null]
  );
  const [rows] = await pool.query(
    `SELECT c.*, u.full_name AS employee_name, cs.ma_tram
     FROM charging_station_care_logs c
     JOIN charging_stations cs ON cs.id = c.charging_station_id
     LEFT JOIN users u ON u.id = c.employee_user_id
     WHERE c.id = ?`,
    [result.insertId]
  );
  return rows[0];
};

const updateCareLog = async (id, data = {}, ctx = {}) => {
  const logId = toInt(id, 'Lịch sử chăm sóc');
  const [rows] = await pool.query('SELECT * FROM charging_station_care_logs WHERE id = ?', [logId]);
  if (rows.length === 0) throw err('Không tìm thấy lịch sử chăm sóc', 404);

  const patch = {};
  if (data.employee_user_id !== undefined) {
    if (data.employee_user_id === null || data.employee_user_id === '') {
      patch.employee_user_id = null;
    } else {
      const userId = toInt(data.employee_user_id, 'Nhân viên');
      const [userRows] = await pool.query('SELECT id FROM users WHERE id = ? AND status = "ACTIVE"', [userId]);
      if (userRows.length === 0) throw err('Nhân viên không tồn tại hoặc đã khóa', 400);
      patch.employee_user_id = userId;
    }
  }
  if (data.contact_time !== undefined) patch.contact_time = normalizeDateTime(data.contact_time);
  if (data.content !== undefined) {
    const content = String(data.content || '').trim();
    if (!content) throw err('Nội dung liên hệ là bắt buộc', 400);
    patch.content = content;
  }

  if (Object.keys(patch).length === 0) throw err('Không có dữ liệu cập nhật', 400);
  const keys = Object.keys(patch);
  await pool.query(
    `UPDATE charging_station_care_logs SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
    [...keys.map((key) => patch[key]), logId]
  );
  const [updated] = await pool.query(
    `SELECT c.*, u.full_name AS employee_name, cs.ma_tram
     FROM charging_station_care_logs c
     JOIN charging_stations cs ON cs.id = c.charging_station_id
     LEFT JOIN users u ON u.id = c.employee_user_id
     WHERE c.id = ?`,
    [logId]
  );
  return updated[0];
};

const deleteCareLog = async (id) => {
  const logId = toInt(id, 'Lịch sử chăm sóc');
  const [result] = await pool.query('DELETE FROM charging_station_care_logs WHERE id = ?', [logId]);
  if (result.affectedRows === 0) throw err('Không tìm thấy lịch sử chăm sóc', 404);
  return true;
};

exports.listCareLogs = listCareLogs;
exports.createCareLog = createCareLog;
exports.updateCareLog = updateCareLog;
exports.deleteCareLog = deleteCareLog;
