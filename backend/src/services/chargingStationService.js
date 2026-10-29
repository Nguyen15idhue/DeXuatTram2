const pool = require('../utils/db');
const stationCodeService = require('./stationCodeService');
const {
  STATUS,
  SUB_STATUS_BY_STATUS,
  INITIAL_SUB_STATUS,
  ROLLBACK_SUB_STATUS,
  ALLOWED_TRANSITIONS,
  CONTRACT_STATUSES,
  FLOW_STATUSES,
  IMAGE_MAX_COUNT,
  ACCEPTANCE_PDF_MIME,
  IMAGE_MIME_PREFIX,
  isBackward
} = require('../constants/chargingStations');

const err = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const STATUS_LABELS = {
  ONBOARDING: 'Đang hoàn thiện thủ tục',
  DELIVERING: 'Đang giao hàng',
  INSTALLING: 'Đang lắp đặt',
  ACCEPTANCE: 'Đang nghiệm thu',
  OPERATING: 'Đang hoạt động'
};

const SUB_STATUS_LABELS = {
  NOT_DELIVERED: 'Chưa giao trụ',
  DELIVERING: 'Đang giao trụ',
  DELIVERED: 'Đã giao trụ',
  NOT_INSTALLED: 'Chưa lắp đặt',
  INSTALLING: 'Đang lắp đặt',
  INSTALLED: 'Đã lắp đặt',
  NOT_ACCEPTED: 'Chưa nghiệm thu',
  ACCEPT_FAILED: 'Nghiệm thu không đạt',
  ACCEPT_PASSED: 'Nghiệm thu đạt',
  CONFIGURING: 'Đang cấu hình',
  ACTIVE: 'Đã hoạt động'
};

const FIELD_LABELS = {
  status: 'Trạng thái',
  sub_status: 'Trạng thái phụ',
  on_date: 'Ngày ON thực tế',
  contract_status: 'Trạng thái hợp đồng',
  infra_power_status: 'Hạ tầng điện',
  infra_site_status: 'Hạ tầng mặt bằng',
  payment_status: 'Trạng thái thanh toán',
  description: 'Mô tả',
  note: 'Ghi chú',
  acceptance_user_id: 'Người nghiệm thu',
  acceptance_date: 'Ngày nghiệm thu',
  acceptance_file_id: 'Biên bản nghiệm thu',
  ma_tram: 'Mã trạm',
  proposal_id: 'Đề xuất nguồn'
};

const FLOW_FIELDS = ['infra_power_status', 'infra_site_status', 'payment_status'];

const STAGE_FILTERS = {
  'thong-tin-chung': { sql: '1 = 1', params: [] },
  'khoi-tao-hop-dong': {
    sql: "cs.status = ? AND cs.contract_status = 'NOT'",
    params: [STATUS.ONBOARDING]
  },
  'xay-dung-ha-tang': {
    sql: "cs.status = ? AND cs.contract_status = 'DONE' AND NOT (cs.infra_power_status = 'DONE' AND cs.infra_site_status = 'DONE')",
    params: [STATUS.ONBOARDING]
  },
  'giao-tru': { sql: 'cs.status = ?', params: [STATUS.DELIVERING] },
  'lap-tru': { sql: 'cs.status = ?', params: [STATUS.INSTALLING] },
  'nghiem-thu': { sql: 'cs.status = ?', params: [STATUS.ACCEPTANCE] },
  'on-tram': { sql: 'cs.status = ?', params: [STATUS.OPERATING] }
};

const CS_SELECT = `SELECT cs.id, cs.ma_tram, cs.proposal_id,
    DATE_FORMAT(cs.on_date, '%Y-%m-%d') AS on_date,
    cs.acceptance_file_id, cs.acceptance_user_id,
    DATE_FORMAT(cs.acceptance_date, '%Y-%m-%d') AS acceptance_date,
    cs.status, cs.sub_status, cs.contract_status,
    cs.infra_power_status, cs.infra_site_status, cs.payment_status,
    cs.description, cs.note, cs.created_at, cs.updated_at,
    p.ma_de_xuat_gen AS ma_de_xuat,
    COALESCE(NULLIF(p.owner_name, ''), JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.owner_name'))) AS owner_name,
    COALESCE(NULLIF(p.owner_phone, ''), JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.owner_phone'))) AS owner_phone,
    COALESCE(NULLIF(p.address, ''), JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.address'))) AS address,
    JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.mo_hinh_dau_tu')) AS mo_hinh_dau_tu,
    JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.province')) AS province,
    acc.original_name AS acceptance_file_name
  FROM charging_stations cs
  JOIN station_proposals p ON p.id = cs.proposal_id
  LEFT JOIN files acc ON acc.id = cs.acceptance_file_id`;

const parseJson = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
};

const toText = (value) => (value === null || value === undefined ? '' : String(value));

const normalizeDate = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text))) {
    throw err('Ngày không hợp lệ (định dạng YYYY-MM-DD)', 400);
  }
  return text;
};

const normalizeId = (value, label) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw err(`${label} không hợp lệ`, 400);
  return id;
};

const validateSubStatus = (status, subStatus) => {
  if (subStatus === null || subStatus === undefined || subStatus === '') return null;
  const allowed = SUB_STATUS_BY_STATUS[status] || [];
  if (!allowed.includes(subStatus)) {
    throw err(`Trạng thái phụ "${SUB_STATUS_LABELS[subStatus] || subStatus}" không thuộc "${STATUS_LABELS[status] || status}"`, 400);
  }
  return subStatus;
};

const diffFields = (current, patch) => {
  const changed = {};
  Object.keys(patch).forEach((key) => {
    const oldValue = toText(current[key]);
    const newValue = toText(patch[key]);
    if (oldValue !== newValue) {
      changed[key] = { label: FIELD_LABELS[key] || key, old: oldValue, new: newValue };
    }
  });
  return changed;
};

const logActivity = async ({
  chargingStationId, action, fromStatus, toStatus, changedFields, reason,
  actorId, actorRole, source, ip
}) => {
  await pool.query(
    `INSERT INTO charging_station_activity_logs
      (charging_station_id, action, from_status, to_status, changed_fields, reject_reason, actor_id, actor_role, source, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      chargingStationId, action,
      fromStatus || null, toStatus || null,
      changedFields && Object.keys(changedFields).length > 0 ? JSON.stringify(changedFields) : null,
      reason || null, actorId || null, actorRole || null,
      source || 'user', ip || null
    ]
  );
};

const getRecord = async (id) => {
  const [rows] = await pool.query(`${CS_SELECT} WHERE cs.id = ?`, [id]);
  return rows.length > 0 ? rows[0] : null;
};

const findByProposal = async (proposalId) => {
  const [rows] = await pool.query(`${CS_SELECT} WHERE cs.proposal_id = ?`, [proposalId]);
  return rows.length > 0 ? rows[0] : null;
};

const requireRecord = async (id) => {
  const record = await getRecord(normalizeId(id, 'Mã bản ghi'));
  if (!record) throw err('Không tìm thấy bản ghi ON trạm', 404);
  return record;
};

const getActiveFile = async (fileId) => {
  const [rows] = await pool.query(
    "SELECT id, mime_type, status FROM files WHERE id = ? AND status <> 'deleted'",
    [fileId]
  );
  if (rows.length === 0) throw err(`Không tìm thấy file #${fileId}`, 400);
  return rows[0];
};

const listChargingStations = async ({ stage = '', search = '', page = 1, limit = 20, user = null } = {}) => {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 20));
  const offset = (safePage - 1) * safeLimit;

  const where = [];
  const params = [];
  const stageFilter = STAGE_FILTERS[stage] || STAGE_FILTERS['thong-tin-chung'];
  where.push(stageFilter.sql);
  params.push(...stageFilter.params);

  if (user && user.role === 'SALES') {
    const adminUserService = require('./adminUserService');
    const branchIds = await adminUserService.getBranchIds(user.id);
    const ids = branchIds.length > 0 ? branchIds : [-1];
    where.push(`p.user_id IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
  }

  if (search) {
    const like = `%${String(search).trim()}%`;
    where.push('(cs.ma_tram LIKE ? OR p.ma_de_xuat_gen LIKE ? OR p.owner_name LIKE ? OR p.owner_phone LIKE ? OR p.address LIKE ?)');
    params.push(like, like, like, like, like);
  }

  const whereClause = `WHERE ${where.join(' AND ')}`;
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM charging_stations cs
     JOIN station_proposals p ON p.id = cs.proposal_id
     ${whereClause}`,
    params
  );
  const total = Number(countRows[0] ? countRows[0].total : 0);

  const [rows] = await pool.query(
    `${CS_SELECT} ${whereClause} ORDER BY cs.updated_at DESC, cs.id DESC LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );

  return {
    items: rows,
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) }
  };
};

const getChargingStationDetail = async (id) => {
  const record = await requireRecord(id);
  const [images] = await pool.query(
    `SELECT f.id, f.original_name, f.mime_type, f.size, i.sort_order
     FROM charging_station_images i
     JOIN files f ON f.id = i.file_id
     WHERE i.charging_station_id = ?
     ORDER BY i.sort_order, i.id`,
    [record.id]
  );
  const [timeline] = await pool.query(
    `SELECT l.*, u.full_name AS actor_name
     FROM charging_station_activity_logs l
     LEFT JOIN users u ON u.id = l.actor_id
     WHERE l.charging_station_id = ?
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT 200`,
    [record.id]
  );
  return {
    ...record,
    images,
    timeline: timeline.map((row) => ({ ...row, changed_fields: parseJson(row.changed_fields) }))
  };
};

const createFromApprovedProposal = async (proposalId, { actorId = null, actorRole = null, source = 'user', ip = null } = {}) => {
  const id = normalizeId(proposalId, 'Mã đề xuất');
  const [rows] = await pool.query(
    'SELECT id, signed_file_id, pending_station_code, custom_data FROM station_proposals WHERE id = ?',
    [id]
  );
  if (rows.length === 0) throw err('Không tìm thấy đề xuất', 404);
  const proposal = rows[0];
  if (!proposal.signed_file_id) throw err('Đề xuất chưa có file đã ký', 400);

  const existing = await findByProposal(id);
  if (existing) return { record: existing, created: false };

  let maTram = toText(proposal.pending_station_code).trim() || null;
  if (!maTram) {
    const maTinh = toText(parseJson(proposal.custom_data).ma_tinh).trim();
    if (maTinh) maTram = await stationCodeService.ensureFreshCode(maTinh);
  }

  let insertId;
  try {
    const [result] = await pool.query(
      `INSERT INTO charging_stations
        (ma_tram, proposal_id, status, sub_status, contract_status, infra_power_status, infra_site_status, payment_status)
       VALUES (?, ?, ?, NULL, 'NOT', 'NOT', 'NOT', 'NOT')`,
      [maTram, id, STATUS.ONBOARDING]
    );
    insertId = result.insertId;
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      const duplicated = await findByProposal(id);
      if (duplicated) return { record: duplicated, created: false };
    }
    throw error;
  }

  await logActivity({
    chargingStationId: insertId,
    action: 'created',
    toStatus: STATUS.ONBOARDING,
    changedFields: {
      proposal_id: { label: FIELD_LABELS.proposal_id, old: '', new: String(id) },
      ma_tram: { label: FIELD_LABELS.ma_tram, old: '', new: toText(maTram) }
    },
    actorId,
    actorRole,
    source,
    ip
  });

  return { record: await getRecord(insertId), created: true };
};

const updateChargingStation = async (id, body = {}, ctx = {}) => {
  const current = await requireRecord(id);
  const patch = {};

  if (body.on_date !== undefined) patch.on_date = normalizeDate(body.on_date);
  if (body.acceptance_date !== undefined) patch.acceptance_date = normalizeDate(body.acceptance_date);

  FLOW_FIELDS.forEach((field) => {
    if (body[field] === undefined) return;
    if (!FLOW_STATUSES.includes(body[field])) throw err(`Giá trị ${FIELD_LABELS[field]} không hợp lệ`, 400);
    patch[field] = body[field];
  });

  if (body.contract_status !== undefined) {
    if (!CONTRACT_STATUSES.includes(body.contract_status)) throw err('Trạng thái hợp đồng không hợp lệ', 400);
    patch.contract_status = body.contract_status;
  }

  if (body.description !== undefined) patch.description = body.description ? String(body.description) : null;
  if (body.note !== undefined) patch.note = body.note ? String(body.note) : null;

  if (body.sub_status !== undefined) {
    patch.sub_status = validateSubStatus(current.status, body.sub_status);
  }

  if (Object.keys(patch).length === 0) throw err('Không có dữ liệu cập nhật', 400);

  const changedFields = diffFields(current, patch);
  if (Object.keys(changedFields).length === 0) return getChargingStationDetail(current.id);

  const keys = Object.keys(patch);
  await pool.query(
    `UPDATE charging_stations SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
    [...keys.map((key) => patch[key]), current.id]
  );

  await logActivity({
    chargingStationId: current.id,
    action: 'updated',
    changedFields,
    actorId: ctx.actorId,
    actorRole: ctx.actorRole,
    source: 'user',
    ip: ctx.ip
  });

  return getChargingStationDetail(current.id);
};

const changeStatus = async (id, { to_status: toStatus, sub_status: subStatus, reason } = {}, ctx = {}) => {
  const current = await requireRecord(id);
  if (!Object.values(STATUS).includes(toStatus)) throw err('Trạng thái đích không hợp lệ', 400);
  if (toStatus === current.status) throw err('Bản ghi đã ở trạng thái này', 400);

  const allowedNext = ALLOWED_TRANSITIONS[current.status] || [];
  if (!allowedNext.includes(toStatus)) {
    throw err(`Không thể chuyển từ "${STATUS_LABELS[current.status]}" sang "${STATUS_LABELS[toStatus]}"`, 400);
  }

  const backward = isBackward(current.status, toStatus);
  const cleanReason = toText(reason).trim();
  if (backward && !cleanReason) throw err('Bắt buộc nhập lý do khi lùi bước', 400);

  if (toStatus === STATUS.DELIVERING && current.contract_status !== 'DONE') {
    throw err('Cần ký hợp đồng trước khi chuyển sang Đang giao hàng', 400);
  }
  if (toStatus === STATUS.OPERATING && (current.sub_status !== 'ACCEPT_PASSED' || !current.acceptance_file_id)) {
    throw err('Cần nghiệm thu đạt và có biên bản nghiệm thu trước khi chuyển sang Đang hoạt động', 400);
  }

  let nextSub = null;
  if (subStatus !== undefined && subStatus !== null && subStatus !== '') {
    nextSub = validateSubStatus(toStatus, subStatus);
  } else if (backward) {
    nextSub = ROLLBACK_SUB_STATUS[toStatus] || INITIAL_SUB_STATUS[toStatus];
  } else {
    nextSub = INITIAL_SUB_STATUS[toStatus];
  }

  await pool.query(
    'UPDATE charging_stations SET status = ?, sub_status = ? WHERE id = ?',
    [toStatus, nextSub, current.id]
  );

  await logActivity({
    chargingStationId: current.id,
    action: backward ? 'status_rolled_back' : 'status_changed',
    fromStatus: current.status,
    toStatus,
    changedFields: diffFields(current, { status: toStatus, sub_status: nextSub }),
    reason: cleanReason || null,
    actorId: ctx.actorId,
    actorRole: ctx.actorRole,
    source: 'user',
    ip: ctx.ip
  });

  return getChargingStationDetail(current.id);
};

const updateAcceptance = async (id, { acceptance_user_id: userId, acceptance_date: date } = {}, ctx = {}) => {
  const current = await requireRecord(id);
  const patch = {};

  if (userId !== undefined) {
    if (userId === null || userId === '') {
      patch.acceptance_user_id = null;
    } else {
      const normalized = normalizeId(userId, 'Người nghiệm thu');
      const [users] = await pool.query('SELECT id FROM users WHERE id = ?', [normalized]);
      if (users.length === 0) throw err('Người nghiệm thu không tồn tại', 400);
      patch.acceptance_user_id = normalized;
    }
  }
  if (date !== undefined) patch.acceptance_date = normalizeDate(date);
  if (Object.keys(patch).length === 0) throw err('Không có dữ liệu nghiệm thu', 400);

  const changedFields = diffFields(current, patch);
  if (Object.keys(changedFields).length > 0) {
    const keys = Object.keys(patch);
    await pool.query(
      `UPDATE charging_stations SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
      [...keys.map((key) => patch[key]), current.id]
    );
    await logActivity({
      chargingStationId: current.id,
      action: 'acceptance_updated',
      changedFields,
      actorId: ctx.actorId,
      actorRole: ctx.actorRole,
      source: 'user',
      ip: ctx.ip
    });
  }

  return getChargingStationDetail(current.id);
};

const setAcceptanceFile = async (id, fileId, ctx = {}) => {
  const current = await requireRecord(id);
  const normalizedFileId = normalizeId(fileId, 'File');
  const file = await getActiveFile(normalizedFileId);
  if (file.mime_type !== ACCEPTANCE_PDF_MIME) throw err('Biên bản nghiệm thu phải là file PDF', 400);

  await pool.query(
    'UPDATE charging_stations SET acceptance_file_id = ? WHERE id = ?',
    [normalizedFileId, current.id]
  );
  await logActivity({
    chargingStationId: current.id,
    action: 'acceptance_file_uploaded',
    changedFields: diffFields(current, { acceptance_file_id: normalizedFileId }),
    actorId: ctx.actorId,
    actorRole: ctx.actorRole,
    source: 'user',
    ip: ctx.ip
  });

  return getChargingStationDetail(current.id);
};

const addAcceptanceImages = async (id, fileIds = [], ctx = {}) => {
  const current = await requireRecord(id);
  const ids = [...new Set((Array.isArray(fileIds) ? fileIds : [fileIds]).map((value) => normalizeId(value, 'File')))];
  if (ids.length === 0) throw err('Vui lòng chọn ảnh nghiệm thu', 400);

  for (const fileId of ids) {
    const file = await getActiveFile(fileId);
    if (!String(file.mime_type || '').startsWith(IMAGE_MIME_PREFIX)) {
      throw err(`File #${fileId} không phải là ảnh`, 400);
    }
  }

  const [countRows] = await pool.query(
    'SELECT COUNT(*) AS total FROM charging_station_images WHERE charging_station_id = ?',
    [current.id]
  );
  const existingCount = Number(countRows[0] ? countRows[0].total : 0);
  if (existingCount + ids.length > IMAGE_MAX_COUNT) {
    throw err(`Mỗi bản ghi tối đa ${IMAGE_MAX_COUNT} ảnh nghiệm thu`, 400);
  }

  await pool.query(
    'INSERT IGNORE INTO charging_station_images (charging_station_id, file_id, sort_order) VALUES ?',
    [ids.map((fileId, index) => [current.id, fileId, existingCount + index])]
  );
  await logActivity({
    chargingStationId: current.id,
    action: 'image_added',
    changedFields: { image_count: { label: 'Số ảnh nghiệm thu', old: String(existingCount), new: String(existingCount + ids.length) } },
    actorId: ctx.actorId,
    actorRole: ctx.actorRole,
    source: 'user',
    ip: ctx.ip
  });

  return getChargingStationDetail(current.id);
};

const removeAcceptanceImage = async (id, fileId, ctx = {}) => {
  const current = await requireRecord(id);
  const normalizedFileId = normalizeId(fileId, 'File');
  const [result] = await pool.query(
    'DELETE FROM charging_station_images WHERE charging_station_id = ? AND file_id = ?',
    [current.id, normalizedFileId]
  );
  if (result.affectedRows === 0) throw err('Ảnh nghiệm thu không tồn tại', 404);

  await logActivity({
    chargingStationId: current.id,
    action: 'image_removed',
    changedFields: { file_id: { label: 'Ảnh nghiệm thu', old: String(normalizedFileId), new: '' } },
    actorId: ctx.actorId,
    actorRole: ctx.actorRole,
    source: 'user',
    ip: ctx.ip
  });

  return getChargingStationDetail(current.id);
};

exports.STAGES = Object.keys(STAGE_FILTERS);
exports.STATUS_LABELS = STATUS_LABELS;
exports.SUB_STATUS_LABELS = SUB_STATUS_LABELS;
exports.listChargingStations = listChargingStations;
exports.getChargingStationDetail = getChargingStationDetail;
exports.createFromApprovedProposal = createFromApprovedProposal;
exports.updateChargingStation = updateChargingStation;
exports.changeStatus = changeStatus;
exports.updateAcceptance = updateAcceptance;
exports.setAcceptanceFile = setAcceptanceFile;
exports.addAcceptanceImages = addAcceptanceImages;
exports.removeAcceptanceImage = removeAcceptanceImage;
exports.findByProposal = findByProposal;
