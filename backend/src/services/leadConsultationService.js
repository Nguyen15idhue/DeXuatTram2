const pool = require('../utils/db');
const access = require('./leadAccessService');
const calendarService = require('./businessCalendarService');
const { isGdkv } = require('../constants/salesRanks');

const STATUS = {
  WAITING_ALLOCATION: 'WAITING_ALLOCATION',
  WAITING_FIRST_CONTACT: 'WAITING_FIRST_CONTACT',
  CONSULTING: 'CONSULTING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED'
};
const parse = (value) => typeof value === 'string' ? JSON.parse(value) : (value || {});
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const rowsOf = (value) => Array.isArray(value) ? value : [];
const isEmpty = (value) => value == null || value === ''
  || (typeof value === 'object' && Object.keys(value).length === 0);
const hasContactContent = (row) => row && typeof row === 'object'
  && Object.entries(row).some(([key, value]) =>
    !['at', 'thoi_gian', 'created_at'].includes(key) && !isEmpty(value));
const scalar = (value) => value && typeof value === 'object' && 'id' in value ? String(value.id) : value;
const same = (a, b) => (isEmpty(a) && isEmpty(b))
  || JSON.stringify(scalar(a)) === JSON.stringify(scalar(b))
  || (typeof scalar(a) !== 'object' && typeof scalar(b) !== 'object' && String(scalar(a) ?? '') === String(scalar(b) ?? ''));

const assertUpdateAllowed = async (lead, data, user, executor = pool) => {
  const permissions = await access.permissions(lead, user, executor);
  if (!permissions.can_view) throw fail('Không có quyền xem khách hàng', 403);
  if (!permissions.can_consult && !permissions.can_assign && !permissions.can_write_general) {
    throw fail('Bạn chỉ có quyền xem khách hàng', 403);
  }
  const cd = parse(lead.custom_data);
  const fixed = ['full_name', 'phone', 'email', 'address', 'province', 'ward', 'customer_type', 'source',
    'note', 'customer_classification', 'sales_outcome', 'cskh_note', 'tvbh_note', 'cskh_history', 'tvbh_history', 'assigned_user_id'];
  for (const key of fixed) {
    if (data[key] === undefined || same(data[key], lead[key] ?? cd[key])) continue;
    if (key === 'assigned_user_id') {
      if (!permissions.can_assign) throw fail('Chỉ GĐTTKD và Super Admin được phân bổ GĐKV', 403);
    } else if (['tvbh_history', 'tvbh_note', 'sales_outcome'].includes(key)) {
      if (!permissions.can_consult) throw fail('Không có quyền cập nhật tư vấn khách hàng', 403);
    } else if (!permissions.can_write_general) {
      throw fail('Chỉ Super Admin được sửa thông tin chung và CSKH', 403);
    }
  }
  if (data.sales_outcome && !['SUCCESS', 'FAILED'].includes(data.sales_outcome)) throw fail('Kết quả TVBH không hợp lệ');
  if (data.sales_outcome === 'FAILED' && lead.sales_outcome !== 'FAILED') {
    const history = rowsOf(data.tvbh_history ?? cd.tvbh_history);
    const last = history[history.length - 1] || {};
    if (!String(last.reason || last.ly_do || last.ghi_chu || data.tvbh_note || '').trim()) throw fail('Vui lòng nhập lý do tư vấn thất bại');
  }
  if (data.tvbh_history !== undefined && !Array.isArray(data.tvbh_history)) throw fail('Lịch sử TVBH phải là một danh sách');
};

const onAssignment = async (executor, lead, target, now = new Date()) => {
  if (Number(lead.assigned_user_id) === Number(target?.id)) return;
  const cd = parse(target?.custom_data);
  const assignedGdkv = target && isGdkv(cd.chuc_vu, cd.department);
  const alreadyConsulted = lead.first_contact_at || rowsOf(parse(lead.custom_data).tvbh_history).some(hasContactContent)
    || ['CONSULTING', 'SUCCESS', 'FAILED'].includes(lead.consultation_status);
  if (alreadyConsulted) return;
  if (!assignedGdkv) {
    await executor.query(
      `UPDATE leads SET consultation_status = 'WAITING_ALLOCATION', first_contact_started_at = NULL,
       first_contact_deadline_at = NULL, consultation_calendar_id = NULL WHERE id = ?`, [lead.id]);
    return;
  }
  const calendar = await calendarService.getCalendar(executor);
  const deadline = calendarService.addWorkingMinutes(now, 240, calendar);
  await executor.query(
    `UPDATE leads SET consultation_status = 'WAITING_FIRST_CONTACT', first_contact_started_at = ?,
       first_contact_deadline_at = ?, first_contact_at = NULL, consultation_calendar_id = ?,
       consultation_round = consultation_round + 1 WHERE id = ?`,
    [now, deadline, calendar.id, lead.id]);
};

const afterUpdate = async (executor, lead, patch, now = new Date()) => {
  if (patch.assigned_user_id !== undefined && Number(patch.assigned_user_id) !== Number(lead.assigned_user_id)) {
    const [targets] = patch.assigned_user_id
      ? await executor.query('SELECT id, custom_data FROM users WHERE id = ?', [patch.assigned_user_id]) : [[]];
    await onAssignment(executor, lead, targets[0] || null, now);
  }
  const before = rowsOf(parse(lead.custom_data).tvbh_history);
  const after = rowsOf(patch.tvbh_history);
  const newContact = after.length > before.length && after.slice(before.length).some(hasContactContent);
  const outcome = patch.sales_outcome === undefined ? lead.sales_outcome : patch.sales_outcome;
  const status = ['SUCCESS', 'FAILED'].includes(outcome) ? outcome
    : newContact ? 'CONSULTING' : null;
  if (status) await executor.query(
    `UPDATE leads SET consultation_status = ?, first_contact_at = CASE WHEN ? THEN COALESCE(first_contact_at, ?) ELSE first_contact_at END WHERE id = ?`,
    [status, Boolean(newContact), now, lead.id]);
};

const getTiming = async (lead, now = new Date()) => {
  if (lead.consultation_status !== STATUS.WAITING_FIRST_CONTACT || !lead.first_contact_deadline_at) return null;
  const calendar = await calendarService.getCalendarById(lead.consultation_calendar_id);
  const deadline = new Date(lead.first_contact_deadline_at);
  const remaining = Math.max(0, Math.ceil(calendarService.workingMinutesBetween(now, deadline, calendar)));
  const overdue = deadline.getTime() <= now.getTime();
  return { deadline_at: deadline, remaining_minutes: remaining, warning: !overdue && remaining <= 60, overdue };
};

const backfill = async () => {
  const executor = await pool.getConnection();
  try {
    await executor.beginTransaction();
    const [leads] = await executor.query(
      'SELECT * FROM leads WHERE consultation_status IS NULL ORDER BY id LIMIT 200 FOR UPDATE SKIP LOCKED');
    for (const lead of leads) {
      const history = rowsOf(parse(lead.custom_data).tvbh_history);
      const status = ['SUCCESS', 'FAILED'].includes(lead.sales_outcome) ? lead.sales_outcome
        : history.some(hasContactContent) ? STATUS.CONSULTING : STATUS.WAITING_ALLOCATION;
      await executor.query('UPDATE leads SET consultation_status = ? WHERE id = ? AND consultation_status IS NULL', [status, lead.id]);
      if (status === STATUS.WAITING_ALLOCATION && lead.assigned_user_id) {
        const [[target]] = await executor.query('SELECT id, custom_data FROM users WHERE id = ?', [lead.assigned_user_id]);
        await onAssignment(executor, { ...lead, assigned_user_id: null }, target);
      }
    }
    await executor.commit();
    return leads.length;
  } catch (error) {
    await executor.rollback();
    throw error;
  } finally {
    executor.release();
  }
};

module.exports = { STATUS, assertUpdateAllowed, onAssignment, afterUpdate, getTiming, backfill, same };
