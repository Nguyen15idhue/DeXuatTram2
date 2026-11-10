const TIMEZONE = 'Asia/Ho_Chi_Minh';
const MINUTE = 60000;
const DAY = 86400000;
const OFFSET = 7 * 60 * MINUTE;
const MAX_TRAVERSAL_DAYS = 36600;
const pool = { query: (...args) => require('../utils/db').query(...args) };

function invalid(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseJson(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function timeMinutes(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw invalid('Giờ phải có dạng HH:mm trong khoảng 00:00–23:59');
  }
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

function windows(value, label) {
  if (!Array.isArray(value) || value.length > 48) throw invalid(`${label}: danh sách ca làm việc không hợp lệ`);
  const result = value.map(window => {
    if (!Array.isArray(window) || window.length !== 2) throw invalid(`${label}: mỗi ca phải có giờ bắt đầu và kết thúc`);
    if (timeMinutes(window[0]) >= timeMinutes(window[1])) throw invalid(`${label}: giờ bắt đầu phải trước giờ kết thúc, không qua đêm`);
    return [...window];
  }).sort((a, b) => a[0].localeCompare(b[0]));
  for (let i = 1; i < result.length; i++) {
    if (result[i][0] < result[i - 1][1]) throw invalid(`${label}: các ca làm việc bị chồng lấn`);
  }
  return result;
}

function validDateKey(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || key < '0100-01-01' || key > '9999-12-31') return false;
  const date = new Date(`${key}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === key;
}

function validateCalendar(input) {
  if (!object(input) || input.timezone !== TIMEZONE) throw invalid(`Múi giờ bắt buộc là ${TIMEZONE}`);
  if (!object(input.weekly) || Object.keys(input.weekly).length !== 7 ||
      Object.keys(input.weekly).some(key => !/^[1-7]$/.test(key))) {
    throw invalid('Lịch tuần phải có đủ các ngày từ 1 đến 7');
  }
  const weekly = {};
  for (let day = 1; day <= 7; day++) weekly[day] = windows(input.weekly[day], `Ngày ${day}`);
  if (!Object.values(weekly).some(value => value.length)) throw invalid('Lịch tuần phải có ít nhất một ca làm việc');
  if (!object(input.exceptions) || Object.keys(input.exceptions).length > 3660) throw invalid('Danh sách ngoại lệ không hợp lệ hoặc quá 3660 ngày');
  const exceptions = {};
  for (const [key, value] of Object.entries(input.exceptions)) {
    if (!validDateKey(key)) throw invalid(`Ngày ngoại lệ không hợp lệ: ${key}`);
    exceptions[key] = windows(value, key);
  }
  return { timezone: TIMEZONE, weekly, exceptions };
}

function canManageCalendar(user) {
  if (!user) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  let custom;
  try { custom = parseJson(user.custom_data); } catch { return false; }
  const department = String(custom?.department || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');
  return department.includes('backoffice');
}

function fromRow(row) {
  const value = validateCalendar({ timezone: row.timezone, weekly: parseJson(row.weekly), exceptions: parseJson(row.exceptions) });
  return { id: row.id, ...value };
}

async function getCalendar(executor = pool) {
  const [rows] = await executor.query(
    'SELECT v.id, v.timezone, v.weekly, v.exceptions FROM business_calendar_config c JOIN business_calendar_versions v ON v.id = c.active_version_id WHERE c.id = 1'
  );
  if (!rows.length) throw invalid('Chưa có cấu hình lịch làm việc; cần chạy migration 222', 503);
  return fromRow(rows[0]);
}

async function getCalendarById(id, executor = pool) {
  if (!/^[1-9]\d*$/.test(String(id))) throw invalid('Phiên bản lịch không hợp lệ');
  const [rows] = await executor.query('SELECT id, timezone, weekly, exceptions FROM business_calendar_versions WHERE id = ?', [id]);
  if (!rows.length) throw invalid('Không tìm thấy phiên bản lịch làm việc', 404);
  return fromRow(rows[0]);
}

async function saveCalendar(input, actorId) {
  const calendar = validateCalendar(input);
  const connection = await require('../utils/db').getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT active_version_id FROM business_calendar_config WHERE id = 1 FOR UPDATE');
    if (!rows.length) throw invalid('Chưa có cấu hình lịch làm việc; cần chạy migration 222', 503);
    if (input.id !== undefined && String(input.id) !== String(rows[0].active_version_id)) {
      throw invalid('Lịch đã được cập nhật bởi người khác. Vui lòng tải lại trang.', 409);
    }
    const [result] = await connection.query(
      'INSERT INTO business_calendar_versions (timezone, weekly, exceptions, created_by) VALUES (?, ?, ?, ?)',
      [calendar.timezone, JSON.stringify(calendar.weekly), JSON.stringify(calendar.exceptions), actorId]
    );
    await connection.query('UPDATE business_calendar_config SET active_version_id = ? WHERE id = 1', [result.insertId]);
    await connection.commit();
    return { id: result.insertId, ...calendar };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function timestamp(input) {
  if (!(input instanceof Date) && typeof input !== 'number' &&
      !(typeof input === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(input))) {
    throw invalid('Thời điểm phải là Date, timestamp hoặc ISO có múi giờ');
  }
  if (typeof input === 'string' && !validDateKey(input.slice(0, 10))) throw invalid('Ngày không hợp lệ');
  const value = new Date(input).getTime();
  if (!Number.isFinite(value)) throw invalid('Thời điểm không hợp lệ');
  const local = new Date(value + OFFSET);
  if (local.getUTCFullYear() < 100 || local.getUTCFullYear() > 9999) throw invalid('Thời điểm nằm ngoài phạm vi năm 0100–9999');
  return value;
}

function localDay(value) {
  return Math.floor((value + OFFSET) / DAY) * DAY - OFFSET;
}

function dayWindows(day, calendar) {
  const date = new Date(day + OFFSET);
  const key = date.toISOString().slice(0, 10);
  if (!validDateKey(key)) throw invalid('Vượt phạm vi ngày của lịch làm việc');
  const list = Object.prototype.hasOwnProperty.call(calendar.exceptions, key)
    ? calendar.exceptions[key] : calendar.weekly[date.getUTCDay() || 7];
  return list.map(([start, end]) => [day + timeMinutes(start) * MINUTE, day + timeMinutes(end) * MINUTE]);
}

function addWorkingMinutes(start, minutes, input) {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) throw invalid('Số phút làm việc phải là số hữu hạn không âm');
  const calendar = validateCalendar(input);
  let cursor = timestamp(start);
  if (minutes === 0) return new Date(cursor);
  let remaining = minutes * MINUTE;
  for (let count = 0, day = localDay(cursor); count < MAX_TRAVERSAL_DAYS; count++, day += DAY) {
    for (const [from, to] of dayWindows(day, calendar)) {
      const position = Math.max(cursor, from);
      if (position >= to) continue;
      if (remaining <= to - position) return new Date(position + remaining);
      remaining -= to - position;
    }
    cursor = day + DAY;
  }
  throw invalid(`Vượt giới hạn duyệt ${MAX_TRAVERSAL_DAYS} ngày làm việc`);
}

// Signed fractional working minutes: reversing start/end negates the result.
function workingMinutesBetween(start, end, input) {
  const calendar = validateCalendar(input);
  let from = timestamp(start);
  let to = timestamp(end);
  const sign = from <= to ? 1 : -1;
  if (sign < 0) [from, to] = [to, from];
  const firstDay = localDay(from);
  const lastDay = localDay(to);
  if ((lastDay - firstDay) / DAY >= MAX_TRAVERSAL_DAYS) throw invalid(`Vượt giới hạn duyệt ${MAX_TRAVERSAL_DAYS} ngày làm việc`);
  let duration = 0;
  for (let day = firstDay; day <= lastDay; day += DAY) {
    for (const [begin, finish] of dayWindows(day, calendar)) {
      duration += Math.max(0, Math.min(to, finish) - Math.max(from, begin));
    }
  }
  return sign * duration / MINUTE;
}

function addWorkingDays(start, days, calendar) {
  if (typeof days !== 'number' || !Number.isFinite(days) || days < 0) throw invalid('Số ngày làm việc phải là số hữu hạn không âm');
  return addWorkingMinutes(start, days * 480, calendar);
}

module.exports = {
  TIMEZONE, MAX_TRAVERSAL_DAYS, validateCalendar, canManageCalendar,
  getCalendar, getCalendarById, saveCalendar, addWorkingMinutes, workingMinutesBetween, addWorkingDays
};
