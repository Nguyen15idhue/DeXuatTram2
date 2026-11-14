const { createHash } = require('node:crypto');
const pool = require('../utils/db');

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const ENUM_FIELDS = {
  contract_status: ['NOT', 'DOING', 'DONE', 'CANCELLED'],
  infra_power_status: ['NOT', 'DOING', 'DONE'],
  infra_site_status: ['NOT', 'DOING', 'DONE'],
  payment_status: ['NOT_REQUIRED', 'NOT', 'DOING', 'DONE'],
  deposit_status: ['NOT_REQUIRED', 'NOT_RECEIVED', 'RECEIVED', 'REFUND_PENDING', 'REFUNDED']
};
const DATE_FIELDS = ['on_date', 'acceptance_date', 'contract_effective_date', 'contract_expiry_date',
  'infra_power_date', 'infra_site_date'];
const TEXT_FIELDS = ['description', 'note', 'contract_note', 'infra_power_note', 'infra_site_note', 'cms_station_code'];
const DATETIME_FIELDS = ['contract_deadline_at', 'infra_deadline_at', 'finance_deadline_at'];
const FILE_FIELDS = ['contract_file_ids', 'acceptance_file_id', 'image_ids'];
const idOf = (value) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw fail('ID không hợp lệ');
  return id;
};
const dateOf = (value) => {
  if (value === '' || value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1000-01-01'
    || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw fail('Ngày không hợp lệ (YYYY-MM-DD)');
  }
  return value;
};
const assertSuper = (ctx) => {
  if (ctx.actorRole !== 'SUPER_ADMIN') throw fail('Chỉ SUPER_ADMIN được sửa/ghi đè ON trạm', 403);
};
const reasonOf = (value) => {
  const reason = typeof value === 'string' ? value.trim() : '';
  if (reason.length < 3 || reason.length > 5000) throw fail('Lý do bắt buộc từ 3–5000 ký tự');
  return reason;
};
const getEditToken = async (id, executor = pool) => {
  const [rows] = await executor.query('SELECT * FROM charging_stations WHERE id=?', [idOf(id)]);
  if (!rows.length) throw fail('Không tìm thấy ON trạm', 404);
  const [contracts] = await executor.query(
    'SELECT file_id,sort_order FROM charging_station_contract_files WHERE charging_station_id=? ORDER BY id', [id]);
  const [images] = await executor.query(
    'SELECT file_id,sort_order FROM charging_station_images WHERE charging_station_id=? ORDER BY id', [id]);
  return createHash('sha256').update(JSON.stringify([rows[0], contracts, images])).digest('hex');
};
const assertToken = async (id, token, executor) => {
  if (!token || token !== await getEditToken(id, executor)) {
    throw fail('Dữ liệu ON trạm đã thay đổi hoặc thiếu phiên bản; hãy tải lại trước khi lưu', 409);
  }
};
const writeLog = async (connection, stationId, action, current, patch, ctx, reason, extra = {}) => {
  const labels = require('./chargingStationService').FIELD_LABELS;
  const changes = {};
  for (const [key, value] of Object.entries(patch)) {
    if (JSON.stringify(current[key] ?? null) !== JSON.stringify(value ?? null)) {
      changes[key] = { label: labels[key] || key, old: current[key] ?? null, new: value ?? null };
    }
  }
  await connection.query(`INSERT INTO charging_station_activity_logs
    (charging_station_id,action,from_status,to_status,changed_fields,reject_reason,actor_id,actor_role,source,ip)
    VALUES(?,?,?,?,?,?,?,?, 'admin_override',?)`,
  [stationId, action, current.status, patch.status || current.status, JSON.stringify({ ...changes, ...extra }),
    reason, ctx.actorId, ctx.actorRole, ctx.ip || null]);
};
const update = async (id, body, ctx) => {
  assertSuper(ctx);
  const reason = reasonOf(body.reason);
  const allowed = new Set([...Object.keys(ENUM_FIELDS), ...DATE_FIELDS, ...DATETIME_FIELDS, ...TEXT_FIELDS, ...FILE_FIELDS,
    'acceptance_user_id', 'deadline_extension_count', 'sub_status', 'expected_token', 'reason', 'deployment_updates']);
  for (const key of Object.keys(body)) if (!allowed.has(key)) throw fail(`Không được sửa trường ${key}`);
  const patch = {};
  for (const [key, options] of Object.entries(ENUM_FIELDS)) {
    if (body[key] !== undefined) {
      if (!options.includes(body[key])) throw fail(`Giá trị ${key} không hợp lệ`);
      patch[key] = body[key];
    }
  }
  for (const key of DATE_FIELDS) if (body[key] !== undefined) patch[key] = dateOf(body[key]);
  for (const key of DATETIME_FIELDS) if (body[key] !== undefined) {
    const value = body[key];
    if (value === null || value === '') patch[key] = null;
    else {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}[T ](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) {
        throw fail(`${key} phải là ngày giờ hợp lệ`);
      }
      dateOf(value.slice(0, 10));
      patch[key] = value.replace('T', ' ').slice(0, 16) + ':00';
    }
  }
  if (body.deadline_extension_count !== undefined) {
    const count = Number(body.deadline_extension_count);
    if (!Number.isSafeInteger(count) || count < 0 || count > 3) throw fail('Số lần gia hạn phải từ 0 đến 3');
    patch.deadline_extension_count = count;
  }
  for (const key of TEXT_FIELDS) if (body[key] !== undefined) {
    if (body[key] !== null && typeof body[key] !== 'string') throw fail(`${key} phải là văn bản`);
    const value = (body[key] || '').trim();
    if (Buffer.byteLength(value, 'utf8') > (key === 'cms_station_code' ? 100 : 65535)) throw fail(`${key} quá dài`);
    patch[key] = value || null;
  }
  if (body.acceptance_user_id !== undefined) patch.acceptance_user_id = body.acceptance_user_id ? idOf(body.acceptance_user_id) : null;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT * FROM charging_stations WHERE id=? FOR UPDATE', [idOf(id)]);
    if (!rows.length) throw fail('Không tìm thấy ON trạm', 404);
    const current = rows[0];
    await assertToken(id, body.expected_token, connection);
    if (body.sub_status !== undefined) {
      const options = require('../constants/chargingStations').SUB_STATUS_BY_STATUS[current.status] || [];
      const sub = body.sub_status || null;
      if (sub ? !options.includes(sub) : options.length > 0) throw fail('Trạng thái chi tiết không phù hợp quy trình hiện tại');
      patch.sub_status = sub;
    }
    const merged = { ...current, ...patch };
    if (merged.contract_effective_date && merged.contract_expiry_date
      && new Date(merged.contract_effective_date) >= new Date(merged.contract_expiry_date)) {
      throw fail('Ngày hết hạn hợp đồng phải sau ngày hiệu lực');
    }
    if (merged.status === 'OPERATING' && (!merged.cms_station_code || !merged.on_date)) {
      throw fail('Trạm đã ON phải có mã CMS và ngày ON');
    }
    if (patch.acceptance_user_id) {
      const [users] = await connection.query('SELECT id FROM users WHERE id=?', [patch.acceptance_user_id]);
      if (!users.length) throw fail('Người nghiệm thu không tồn tại');
    }
    const collections = {};
    for (const key of FILE_FIELDS) if (body[key] !== undefined) {
      const values = key === 'acceptance_file_id' ? (body[key] ? [body[key]] : []) : body[key];
      if (!Array.isArray(values) || values.length > 100) throw fail(`Danh sách ${key} không hợp lệ`);
      const ids = [...new Set(values.map(idOf))];
      if (ids.length) {
        const [files] = await connection.query("SELECT * FROM files WHERE id IN (?) AND status='active' FOR SHARE", [ids]);
        if (files.length !== ids.length) throw fail('Tệp không tồn tại hoặc không còn hoạt động');
        for (const file of files) {
          const valid = key === 'image_ids' ? file.mime_type.startsWith('image/')
            : key === 'acceptance_file_id' ? file.mime_type === 'application/pdf'
              : ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.mime_type);
          if (!valid) throw fail(`Định dạng tệp không phù hợp: ${file.original_name}`);
        }
      }
      if (key === 'acceptance_file_id') patch.acceptance_file_id = ids[0] || null;
      else {
        const table = key === 'image_ids' ? 'charging_station_images' : 'charging_station_contract_files';
        const [before] = await connection.query(`SELECT file_id FROM ${table} WHERE charging_station_id=? ORDER BY sort_order,id`, [id]);
        collections[key] = { old: before.map(row => row.file_id), new: ids };
        await connection.query(`DELETE FROM ${table} WHERE charging_station_id=?`, [id]);
        if (ids.length) await connection.query(`INSERT INTO ${table}(charging_station_id,file_id,sort_order) VALUES ?`,
          [ids.map((fileId, index) => [id, fileId, index])]);
        if (key === 'contract_file_ids') patch.contract_file_id = ids[0] || null;
      }
    }
    const keys = Object.keys(patch);
    if (body.deployment_updates !== undefined) {
      await require('./chargingStationCompletionService').overridePortions(connection, current, body.deployment_updates,
        { id: ctx.actorId, role: ctx.actorRole }, ctx, reason);
    }
    if (!keys.length && !Object.keys(collections).length && !body.deployment_updates) throw fail('Không có dữ liệu cập nhật');
    if (keys.length) await connection.query(`UPDATE charging_stations SET ${keys.map(key => `${key}=?`).join(',')} WHERE id=?`,
      [...keys.map(key => patch[key]), id]);
    await writeLog(connection, id, 'overview_overridden', current, patch, ctx, reason, collections);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
  return require('./chargingStationService').getChargingStationDetail(id, { id: ctx.actorId, role: ctx.actorRole });
};

module.exports = { update, getEditToken, assertToken, assertSuper, reasonOf, dateOf, writeLog };
