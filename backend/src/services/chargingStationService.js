const pool = require('../utils/db');
const stationCodeService = require('./stationCodeService');
const warehouseService = require('./warehouseService');
const {
  STATUS,
  SUB_STATUS_BY_STATUS,
  INITIAL_SUB_STATUS,
  ROLLBACK_SUB_STATUS,
  ALLOWED_TRANSITIONS,
  CONTRACT_FILE_MIME_TYPES,
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
  cms_station_code: 'Mã trạm trên CMS',
  contract_status: 'Trạng thái hợp đồng',
  contract_file_id: 'File hợp đồng',
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

const INFRA_FIELDS = ['infra_power_status', 'infra_site_status'];
const INFRA_FIELD_BY_TYPE = {
  power: 'infra_power_status',
  site: 'infra_site_status'
};

const STAGE_FILTERS = {
  'thong-tin-chung': { sql: '1 = 1', params: [] },
  'xay-dung-ha-tang': {
    sql: "cs.status = ? AND cs.contract_status = 'DONE' AND NOT (cs.infra_power_status = 'DONE' AND cs.infra_site_status = 'DONE')",
    params: [STATUS.ONBOARDING]
  },
  'giao-tru': { sql: 'cs.status = ?', params: [STATUS.DELIVERING] },
  'lap-tru': { sql: 'cs.status = ?', params: [STATUS.INSTALLING] },
  'nghiem-thu': { sql: 'cs.status = ?', params: [STATUS.ACCEPTANCE] },
  'on-tram': { sql: 'cs.status = ?', params: [STATUS.OPERATING] }
};

const CONTRACT_TAB_FILTERS = {
  need: "cs.status = 'ONBOARDING' AND cs.contract_status IN ('NOT', 'DOING')",
  completed: "cs.contract_status = 'DONE'",
  all: '1 = 1'
};

const INFRA_TAB_FILTERS = {
  need: "(COALESCE(cs.infra_power_status, 'NOT') <> 'DONE' OR COALESCE(cs.infra_site_status, 'NOT') <> 'DONE')",
  completed: "cs.infra_power_status = 'DONE' AND cs.infra_site_status = 'DONE'",
  all: '1 = 1'
};

const OVERVIEW_TAB_FILTERS = {
  need: "(cs.status <> 'OPERATING' OR COALESCE(cs.sub_status, '') <> 'ACTIVE')",
  completed: "cs.status = 'OPERATING' AND cs.sub_status = 'ACTIVE'",
  all: '1 = 1'
};

const FINANCE_TAB_FILTERS = {
  need: "cs.payment_status IN ('NOT', 'DOING')",
  completed: "cs.payment_status = 'DONE'",
  all: '1 = 1'
};

const DELIVERY_TAB_FILTERS = {
  requesterNeed: "cs.status IN ('ONBOARDING', 'DELIVERING')",
  backOfficeNeed: "cs.status = 'DELIVERING' AND cs.sub_status IN ('NOT_DELIVERED', 'DELIVERING')",
  completed: "cs.status IN ('INSTALLING', 'ACCEPTANCE', 'OPERATING')",
  requesterAll: "cs.status IN ('ONBOARDING', 'DELIVERING', 'INSTALLING', 'ACCEPTANCE', 'OPERATING')",
  backOfficeAll: "cs.status IN ('DELIVERING', 'INSTALLING', 'ACCEPTANCE', 'OPERATING')"
};

const CHARGING_STATION_STAGE_TAB_FILTERS = {
  'lap-tru': {
    need: "cs.status = 'INSTALLING'",
    completed: "cs.status IN ('ACCEPTANCE', 'OPERATING')",
    all: "cs.status IN ('INSTALLING', 'ACCEPTANCE', 'OPERATING')"
  },
  'nghiem-thu': {
    need: "cs.status = 'ACCEPTANCE'",
    completed: "cs.status = 'OPERATING'",
    all: "cs.status IN ('ACCEPTANCE', 'OPERATING')"
  },
  'on-tram': {
    need: "cs.status = 'OPERATING' AND cs.sub_status = 'CONFIGURING'",
    completed: "cs.status = 'OPERATING' AND cs.sub_status = 'ACTIVE'",
    all: "cs.status = 'OPERATING' AND cs.sub_status IN ('CONFIGURING', 'ACTIVE')"
  }
};

const CS_SELECT = `SELECT cs.id, cs.ma_tram, cs.proposal_id,
    cs.cms_station_code,
    DATE_FORMAT(cs.on_date, '%Y-%m-%d') AS on_date,
    cs.acceptance_file_id, cs.acceptance_user_id,
    DATE_FORMAT(cs.acceptance_date, '%Y-%m-%d') AS acceptance_date,
    cs.status, cs.sub_status, cs.contract_status, cs.contract_file_id,
    cs.infra_power_status, cs.infra_site_status, cs.payment_status,
    DATE_FORMAT(DATE_ADD(cs.created_at, INTERVAL 15 DAY), '%Y-%m-%d %H:%i:%s') AS finance_deadline_at,
    cs.description, cs.note, cs.created_at, cs.updated_at,
    p.ma_de_xuat_gen AS ma_de_xuat,
    p.chot_so_luong_tru,
    COALESCE(NULLIF(p.owner_name, ''), JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.owner_name'))) AS owner_name,
    COALESCE(NULLIF(p.owner_phone, ''), JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.owner_phone'))) AS owner_phone,
    COALESCE(NULLIF(p.address, ''), JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.address'))) AS address,
    JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.mo_hinh_dau_tu')) AS mo_hinh_dau_tu,
    JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.province')) AS province,
    acc.original_name AS acceptance_file_name,
    contract.original_name AS contract_file_name,
    contract.mime_type AS contract_file_mime_type
  FROM charging_stations cs
  JOIN station_proposals p ON p.id = cs.proposal_id
  LEFT JOIN files acc ON acc.id = cs.acceptance_file_id
  LEFT JOIN files contract ON contract.id = cs.contract_file_id`;

const parseJson = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
};

const toText = (value) => (value === null || value === undefined ? '' : String(value));

const normalizeDepartment = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, 'd')
  .toLowerCase();

const isSetupOperationsDepartment = (department) => {
  const normalized = normalizeDepartment(department);
  return normalized.includes('setup') && normalized.includes('van hanh');
};

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

const writeActivity = async (executor, {
  chargingStationId, action, fromStatus, toStatus, changedFields, reason,
  actorId, actorRole, source, ip
}) => {
  await executor.query(
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

const logActivity = (activity) => writeActivity(pool, activity);

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

const buildProposalScope = async (user) => {
  if (!user?.id) return { sql: '1 = 0', params: [] };
  const scope = await require('./proposalReportService').resolveScope(user);
  if (scope.isAdmin || scope.isBackOffice || isSetupOperationsDepartment(scope.department)) {
    return { sql: '1 = 1', params: [] };
  }
  if (scope.roleKey === 'GDTTKD' && scope.region) {
    const pattern = { Bac: '%bac%', Trung: '%trung%', Nam: '%nam%' }[scope.region];
    if (pattern) {
      return {
        sql: "LOWER(CONVERT(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.vung_mien')) USING utf8mb4)) LIKE ?",
        params: [pattern]
      };
    }
  }
  if (scope.role === 'SALES') {
    const branchIds = await require('./adminUserService').getBranchIds(Number(scope.userId));
    if (!branchIds.length) return { sql: '1 = 0', params: [] };
    return {
      sql: `p.user_id IN (${branchIds.map(() => '?').join(',')})`,
      params: branchIds.map(Number)
    };
  }
  return { sql: 'p.user_id = ?', params: [Number(scope.userId)] };
};

const canViewChargingStation = async (id, user) => {
  const scope = await buildProposalScope(user);
  const [rows] = await pool.query(
    `SELECT cs.id
       FROM charging_stations cs
       JOIN station_proposals p ON p.id = cs.proposal_id
      WHERE cs.id = ? AND (${scope.sql})`,
    [normalizeId(id, 'Mã bản ghi'), ...scope.params]
  );
  return rows.length > 0;
};

const assertCanViewChargingStation = async (id, user) => {
  if (!user) return;
  if (!await canViewChargingStation(id, user)) {
    throw err('Không có quyền xem ON trạm này', 403);
  }
};

const assertBackOfficeManager = async (user) => {
  const scope = await require('./proposalReportService').resolveScope(user);
  if (user?.role !== 'SUPER_ADMIN' && !scope.isBackOffice) {
    throw err('Chỉ Back Office hoặc SUPER_ADMIN được cập nhật hạ tầng và hợp đồng', 403);
  }
};

const assertSetupOperationsManager = async (user) => {
  const scope = await require('./proposalReportService').resolveScope(user);
  if (!scope.isAdmin && !isSetupOperationsDepartment(scope.department)) {
    throw err('Chỉ Phòng Setup và Vận hành hoặc quản trị viên được cập nhật lắp đặt, nghiệm thu và cấu hình', 403);
  }
};

const notifyBackOfficeDeliveryReady = async (connection, station, ctx = {}, details = {}) => {
  const [recipients] = await connection.query(
    `SELECT id
       FROM users
      WHERE status = 'ACTIVE'
        AND LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.department')), '')) LIKE '%back office%'`
  );
  if (recipients.length === 0) {
    throw err('Không tìm thấy tài khoản Back Office đang hoạt động để nhận thông báo', 409);
  }

  const code = station.ma_tram || `#${station.id}`;
  const title = details.earlyRequest ? 'Đề xuất giao trụ sớm' : 'Trạm sạc cần giao trụ';
  const message = details.earlyRequest
    ? `Mã trạm: ${code} · Ngày mong muốn: ${details.desiredDate} · Lý do: ${details.reason} · Cần kiểm tra và xử lý giao trụ sớm.`
    : `Mã trạm: ${code} · Trạm đã đủ điều kiện giao trụ. Vui lòng tạo đơn hàng xuất kho.`;
  for (const recipient of recipients) {
    await connection.query(
      `INSERT INTO notifications
        (user_id, type, title, message, entity_type, entity_id, is_read, created_by)
       VALUES (?, 'CHARGING_STATION_DELIVERY_READY', ?, ?, 'charging_stations', ?, 0, ?)`,
      [recipient.id, title, message, station.id, ctx.actorId || null]
    );
  }
};

const notifySetupOperations = async (connection, station, ctx = {}, actionLabel = 'Trạm sạc cần lắp đặt') => {
  const [users] = await connection.query(
    "SELECT id, custom_data FROM users WHERE status = 'ACTIVE'"
  );
  const recipients = users.filter((user) => {
    const customData = parseJson(user.custom_data);
    return isSetupOperationsDepartment(customData.department);
  });
  if (recipients.length === 0) {
    throw err('Không tìm thấy tài khoản Phòng Setup và Vận hành đang hoạt động để nhận thông báo', 409);
  }
  const code = station.ma_tram || `#${station.id}`;
  const title = actionLabel;
  const message = `Mã trạm: ${code} · Trạng thái hiện tại: ${SUB_STATUS_LABELS[station.sub_status] || STATUS_LABELS[station.status] || station.status}.`;
  for (const recipient of recipients) {
    await connection.query(
      `INSERT INTO notifications
        (user_id, type, title, message, entity_type, entity_id, is_read, created_by)
       VALUES (?, 'CHARGING_STATION_INSTALLATION_TASK', ?, ?, 'charging_stations', ?, 0, ?)`,
      [recipient.id, title, message, station.id, ctx.actorId || null]
    );
  }
};

const advanceToDeliveryIfReady = async (connection, station, ctx = {}) => {
  if (
    station.status !== STATUS.ONBOARDING ||
    station.contract_status !== 'DONE' ||
    !['DOING', 'DONE'].includes(station.payment_status) ||
    (station.infra_power_status !== 'DONE' && station.infra_site_status !== 'DONE')
  ) {
    return station;
  }

  const nextStatus = STATUS.DELIVERING;
  const nextSubStatus = INITIAL_SUB_STATUS[nextStatus];
  const changedFields = diffFields(station, { status: nextStatus, sub_status: nextSubStatus });
  await connection.query(
    'UPDATE charging_stations SET status = ?, sub_status = ? WHERE id = ?',
    [nextStatus, nextSubStatus, station.id]
  );
  await writeActivity(connection, {
    chargingStationId: station.id,
    action: 'status_changed',
    fromStatus: station.status,
    toStatus: nextStatus,
    changedFields,
    actorId: ctx.actorId,
    actorRole: ctx.actorRole,
    source: 'system_auto',
    ip: ctx.ip
  });
  const updatedStation = { ...station, status: nextStatus, sub_status: nextSubStatus };
  await notifyBackOfficeDeliveryReady(connection, updatedStation, ctx);
  return updatedStation;
};

const advanceProposalToDeploying = async (proposalId, ctx = {}) => {
  const [rows] = await pool.query(
    'SELECT status FROM station_proposals WHERE id = ?',
    [proposalId]
  );
  if (!rows.length) throw err('Không tìm thấy đề xuất liên quan đến ON trạm', 404);
  if (rows[0].status !== 'CONTRACT_SIGNED') return;
  await require('./proposalLifecycle').transition(proposalId, 'DEPLOYING', {
    actorId: ctx.actorId,
    actorRole: ctx.actorRole,
    source: 'system_auto',
    ip: ctx.ip
  });
};

const listChargingStations = async ({
  stage = '',
  tab = 'need',
  search = '',
  page = 1,
  limit = 20,
  user = null
} = {}) => {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 20));
  const offset = (safePage - 1) * safeLimit;

  const where = [];
  const params = [];
  const scope = await buildProposalScope(user);
  if (stage === 'tai-chinh') {
    const userScope = await require('./proposalReportService').resolveScope(user);
    if (!userScope.isAdmin && !userScope.isBackOffice) {
      throw err('Chỉ Back Office hoặc quản trị viên được xem trang tài chính ON trạm', 403);
    }
    const tabFilter = FINANCE_TAB_FILTERS[tab];
    if (!tabFilter) throw err('Tab tài chính không hợp lệ', 400);
    where.push(tabFilter);
  } else if (stage === 'thong-tin-chung') {
    const tabFilter = OVERVIEW_TAB_FILTERS[tab];
    if (!tabFilter) throw err('Tab thông tin chung không hợp lệ', 400);
    where.push(tabFilter);
  } else if (stage === 'khoi-tao-hop-dong') {
    const tabFilter = CONTRACT_TAB_FILTERS[tab];
    if (!tabFilter) throw err('Tab khởi tạo hợp đồng không hợp lệ', 400);
    where.push(tabFilter);
  } else if (stage === 'xay-dung-ha-tang') {
    const tabFilter = INFRA_TAB_FILTERS[tab];
    if (!tabFilter) throw err('Tab xây dựng hạ tầng không hợp lệ', 400);
    where.push(tabFilter);
  } else if (stage === 'giao-tru') {
    const isBackOfficeView = scope.isAdmin || scope.isBackOffice;
    const tabFilter = tab === 'need'
      ? (isBackOfficeView ? DELIVERY_TAB_FILTERS.backOfficeNeed : DELIVERY_TAB_FILTERS.requesterNeed)
      : tab === 'all'
        ? (isBackOfficeView ? DELIVERY_TAB_FILTERS.backOfficeAll : DELIVERY_TAB_FILTERS.requesterAll)
        : DELIVERY_TAB_FILTERS[tab];
    if (!tabFilter) throw err('Tab giao trụ không hợp lệ', 400);
    where.push(tabFilter);
  } else if (Object.hasOwn(CHARGING_STATION_STAGE_TAB_FILTERS, stage)) {
    const tabFilter = CHARGING_STATION_STAGE_TAB_FILTERS[stage][tab];
    if (!tabFilter) throw err('Tab ON trạm không hợp lệ', 400);
    where.push(tabFilter);
  } else {
    const stageFilter = STAGE_FILTERS[stage] || STAGE_FILTERS['thong-tin-chung'];
    where.push(stageFilter.sql);
    params.push(...stageFilter.params);
  }

  where.push(scope.sql);
  params.push(...scope.params);

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

const getChargingStationTaskCounts = async (user) => {
  const scope = await require('./proposalReportService').resolveScope(user);
  const proposalScope = await buildProposalScope(user);
  const canManageBackOffice = scope.isBackOffice || user?.role === 'SUPER_ADMIN';
  const canManageSetup = scope.isAdmin
    || (!scope.isBackOffice && isSetupOperationsDepartment(scope.department));
  const canManageFinance = scope.isAdmin || scope.isBackOffice;
  const canRequestEarlyDelivery = !scope.isBackOffice || user?.role === 'SUPER_ADMIN';
  const deliveryConditions = [];

  if (canManageBackOffice) {
    deliveryConditions.push(
      "(cs.status = 'DELIVERING' AND cs.sub_status IN ('NOT_DELIVERED', 'DELIVERING'))"
    );
  }
  if (canRequestEarlyDelivery) {
    deliveryConditions.push(`(
      cs.status = 'ONBOARDING'
      AND COALESCE(JSON_LENGTH(p.chot_so_luong_tru), 0) > 0
      AND (
        COALESCE(cs.contract_status, 'NOT') <> 'DONE'
        OR COALESCE(cs.payment_status, 'NOT') NOT IN ('DOING', 'DONE')
        OR COALESCE(cs.infra_site_status, 'NOT') <> 'DONE'
      )
    )`);
  }

  const countExpression = (allowed, condition) => (
    allowed ? `COUNT(CASE WHEN ${condition} THEN cs.id END)` : '0'
  );
  const expressions = [
    `${countExpression(
      canManageBackOffice,
      "cs.status = 'ONBOARDING' AND cs.contract_status IN ('NOT', 'DOING')"
    )} AS contract`,
    `${countExpression(
      canManageBackOffice,
      "cs.status IN ('ONBOARDING', 'DELIVERING') AND (COALESCE(cs.infra_power_status, 'NOT') <> 'DONE' OR COALESCE(cs.infra_site_status, 'NOT') <> 'DONE')"
    )} AS infrastructure`,
    `${deliveryConditions.length
      ? `COUNT(CASE WHEN ${deliveryConditions.join(' OR ')} THEN cs.id END)`
      : '0'} AS delivery`,
    `${countExpression(
      canManageSetup,
      "cs.status = 'INSTALLING'"
    )} AS installation`,
    `${countExpression(
      canManageSetup,
      "cs.status = 'ACCEPTANCE'"
    )} AS acceptance`,
    `${countExpression(
      canManageSetup,
      "cs.status = 'OPERATING' AND cs.sub_status = 'CONFIGURING'"
    )} AS on_station`,
    `${countExpression(
      canManageFinance,
      "cs.payment_status IN ('NOT', 'DOING')"
    )} AS finance`
  ];

  const [rows] = await pool.query(
    `SELECT ${expressions.join(', ')}
       FROM charging_stations cs
       JOIN station_proposals p ON p.id = cs.proposal_id
      WHERE ${proposalScope.sql}`,
    proposalScope.params
  );
  const row = rows[0] || {};
  const counts = {
    contract: Number(row.contract || 0),
    infrastructure: Number(row.infrastructure || 0),
    delivery: Number(row.delivery || 0),
    installation: Number(row.installation || 0),
    acceptance: Number(row.acceptance || 0),
    on_station: Number(row.on_station || 0),
    finance: Number(row.finance || 0)
  };
  const total = counts.contract
    + counts.infrastructure
    + counts.delivery
    + counts.installation
    + counts.acceptance
    + counts.on_station;

  return {
    total,
    counts
  };
};

const getChargingStationDetail = async (id, user = null) => {
  await assertCanViewChargingStation(id, user);
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
  const proposal = await require('./adminProposalService').getProposalWithUser(record.proposal_id);
  const [deliveryExports] = await pool.query(
    `SELECT id, exporter_user_id, export_date, reason, carrier, transport_code, transport_status, total_amount
       FROM warehouse_exports
      WHERE charging_station_id = ?
      ORDER BY id DESC
      LIMIT 1`,
    [record.id]
  );
  let deliveryExport = deliveryExports[0] || null;
  if (deliveryExport) {
    const [exportItems] = await pool.query(
      `SELECT wei.pole_id, wei.quantity, cp.name, cp.charging_type, cp.power_kw
         FROM warehouse_export_items wei
         JOIN charging_poles cp ON cp.id = wei.pole_id
        WHERE wei.export_id = ?
        ORDER BY wei.id`,
      [deliveryExport.id]
    );
    deliveryExport = { ...deliveryExport, items: exportItems };
  }
  return {
    ...record,
    proposal,
    images,
    delivery_export: deliveryExport,
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
  if (INFRA_FIELDS.some((field) => body[field] !== undefined)) {
    throw err('Trạng thái hạ tầng chỉ được cập nhật qua quy trình Xây dựng hạ tầng', 400);
  }
  const stationId = normalizeId(id, 'Mã bản ghi');
  const connection = await pool.getConnection();
  let transactionStarted = false;
  let station;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query(
      'SELECT * FROM charging_stations WHERE id = ? FOR UPDATE',
      [stationId]
    );
    if (rows.length === 0) throw err('Không tìm thấy bản ghi ON trạm', 404);
    const current = rows[0];
    const patch = {};

    if (body.on_date !== undefined) patch.on_date = normalizeDate(body.on_date);
    if (body.acceptance_date !== undefined) patch.acceptance_date = normalizeDate(body.acceptance_date);

    if (body.payment_status !== undefined) {
      throw err('Trạng thái tài chính chỉ được cập nhật trong trang Quản lý tài chính', 400);
    }

    if (body.contract_status !== undefined) {
      throw err('Trạng thái hợp đồng chỉ được cập nhật qua quy trình Khởi tạo hợp đồng', 400);
    }

    if (body.description !== undefined) patch.description = body.description ? String(body.description) : null;
    if (body.note !== undefined) patch.note = body.note ? String(body.note) : null;

    if (body.sub_status !== undefined) {
      if ([STATUS.DELIVERING, STATUS.INSTALLING, STATUS.ACCEPTANCE, STATUS.OPERATING].includes(current.status)) {
        throw err('Trạng thái phụ ở giai đoạn giao/lắp trụ chỉ được cập nhật qua thao tác quy trình', 400);
      }
      patch.sub_status = validateSubStatus(current.status, body.sub_status);
    }

    if (Object.keys(patch).length === 0) throw err('Không có dữ liệu cập nhật', 400);

    const changedFields = diffFields(current, patch);
    if (Object.keys(changedFields).length === 0) {
      station = current;
    } else {
      const keys = Object.keys(patch);
      await connection.query(
        `UPDATE charging_stations SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
        [...keys.map((key) => patch[key]), current.id]
      );

      await writeActivity(connection, {
        chargingStationId: current.id,
        action: 'updated',
        changedFields,
        actorId: ctx.actorId,
        actorRole: ctx.actorRole,
        source: 'user',
        ip: ctx.ip
      });

      station = { ...current, ...patch };
    }

    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return getChargingStationDetail(station.id);
};

const updatePaymentStatus = async (id, { payment_status: nextStatus, reason } = {}, user, ctx = {}) => {
  const scope = await require('./proposalReportService').resolveScope(user);
  if (!scope.isAdmin && !scope.isBackOffice) {
    throw err('Chỉ Back Office hoặc quản trị viên được cập nhật trạng thái tài chính', 403);
  }
  if (!['DOING', 'DONE'].includes(nextStatus)) {
    throw err('Trạng thái tài chính đích không hợp lệ', 400);
  }
  const cleanReason = toText(reason).trim();
  if (!cleanReason) throw err('Vui lòng nhập lý do cập nhật trạng thái tài chính', 400);

  const stationId = normalizeId(id, 'Mã bản ghi');
  await assertCanViewChargingStation(stationId, user);
  const connection = await pool.getConnection();
  let transactionStarted = false;
  let current;
  let proposalId;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query(
      `SELECT id, proposal_id, status, contract_status, infra_power_status,
              infra_site_status, payment_status
         FROM charging_stations
        WHERE id = ? FOR UPDATE`,
      [stationId]
    );
    if (!rows.length) throw err('Không tìm thấy bản ghi ON trạm', 404);
    current = rows[0];
    proposalId = current.proposal_id;

    if (current.payment_status === nextStatus) {
      await connection.commit();
      transactionStarted = false;
    } else {
      const allowed = current.payment_status === 'NOT'
        ? nextStatus === 'DOING'
        : current.payment_status === 'DOING'
          ? nextStatus === 'DONE'
          : current.payment_status === 'DONE' && nextStatus === 'DOING';
      if (!allowed) throw err('Không thể chuyển trạng thái tài chính từ trạng thái hiện tại', 400);

      if (nextStatus === 'DONE') {
        const [invoices] = await connection.query(
          `SELECT id
             FROM charging_station_invoices
            WHERE charging_station_id = ?
              AND invoice_type IN ('DEPOSIT', 'PAYMENT')
            LIMIT 1`,
          [stationId]
        );
        if (!invoices.length) {
          throw err('Cần ghi nhận ít nhất một hóa đơn tiền cọc hoặc thanh toán trước khi hoàn tất tài chính', 409);
        }
      }

      await connection.query(
        'UPDATE charging_stations SET payment_status = ? WHERE id = ?',
        [nextStatus, stationId]
      );
      await writeActivity(connection, {
        chargingStationId: stationId,
        action: 'finance_status_changed',
        changedFields: {
          payment_status: {
            label: FIELD_LABELS.payment_status,
            old: current.payment_status || 'NOT',
            new: nextStatus
          }
        },
        reason: cleanReason,
        actorId: ctx.actorId,
        actorRole: ctx.actorRole,
        source: 'user',
        ip: ctx.ip
      });
      await advanceToDeliveryIfReady(connection, { ...current, payment_status: nextStatus }, ctx);
      await connection.commit();
      transactionStarted = false;
    }
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  if (nextStatus === 'DONE' && proposalId) {
    await advanceProposalToDeploying(proposalId, ctx);
  }
  return getChargingStationDetail(stationId, user);
};

const startContractSigning = async (id, user, ctx = {}) => {
  await assertBackOfficeManager(user);
  const stationId = normalizeId(id, 'Mã bản ghi');
  await assertCanViewChargingStation(stationId, user);
  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query(
      'SELECT id, status, contract_status FROM charging_stations WHERE id = ? FOR UPDATE',
      [stationId]
    );
    if (!rows.length) throw err('Không tìm thấy bản ghi ON trạm', 404);
    const current = rows[0];
    if (current.status !== STATUS.ONBOARDING || current.contract_status !== 'NOT') {
      throw err('Chỉ có thể bắt đầu ký khi trạm đang hoàn thiện thủ tục và hợp đồng chưa ký', 400);
    }

    await connection.query(
      "UPDATE charging_stations SET contract_status = 'DOING' WHERE id = ?",
      [stationId]
    );
    await writeActivity(connection, {
      chargingStationId: stationId,
      action: 'contract_signing_started',
      changedFields: { contract_status: { label: FIELD_LABELS.contract_status, old: 'NOT', new: 'DOING' } },
      actorId: ctx.actorId,
      actorRole: ctx.actorRole,
      source: 'user',
      ip: ctx.ip
    });
    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return getChargingStationDetail(stationId, user);
};

const completeContract = async (id, fileId, user, ctx = {}) => {
  await assertBackOfficeManager(user);
  const stationId = normalizeId(id, 'Mã bản ghi');
  const normalizedFileId = normalizeId(fileId, 'File hợp đồng');
  await assertCanViewChargingStation(stationId, user);
  const connection = await pool.getConnection();
  let transactionStarted = false;
  let proposalId;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query(
      `SELECT id, proposal_id, ma_tram, status, contract_status, contract_file_id, infra_power_status,
              infra_site_status, payment_status
         FROM charging_stations
        WHERE id = ? FOR UPDATE`,
      [stationId]
    );
    if (!rows.length) throw err('Không tìm thấy bản ghi ON trạm', 404);
    const current = rows[0];
    proposalId = current.proposal_id;
    if (current.status !== STATUS.ONBOARDING || current.contract_status !== 'DOING') {
      throw err('Chỉ có thể hoàn tất hợp đồng khi đang ở trạng thái Đang ký hợp đồng', 400);
    }

    const [files] = await connection.query(
      "SELECT id, mime_type, uploaded_by, status FROM files WHERE id = ? AND status <> 'deleted'",
      [normalizedFileId]
    );
    if (!files.length) throw err('Không tìm thấy file hợp đồng', 400);
    const file = files[0];
    if (Number(file.uploaded_by) !== Number(user.id)) {
      throw err('Chỉ được gắn file do chính bạn tải lên', 403);
    }
    if (!CONTRACT_FILE_MIME_TYPES.includes(String(file.mime_type || '').toLowerCase())) {
      throw err('File hợp đồng phải có định dạng PDF hoặc DOCX', 400);
    }

    const nextPaymentStatus = current.payment_status === 'DONE' ? 'DONE' : 'DOING';
    await connection.query(
      "UPDATE charging_stations SET contract_status = 'DONE', contract_file_id = ?, payment_status = ? WHERE id = ?",
      [normalizedFileId, nextPaymentStatus, stationId]
    );
    const contractChanges = {
      contract_status: { label: FIELD_LABELS.contract_status, old: 'DOING', new: 'DONE' },
      contract_file_id: {
        label: FIELD_LABELS.contract_file_id,
        old: current.contract_file_id ? String(current.contract_file_id) : '',
        new: String(normalizedFileId)
      }
    };
    if (current.payment_status !== nextPaymentStatus) {
      contractChanges.payment_status = {
        label: FIELD_LABELS.payment_status,
        old: current.payment_status || 'NOT',
        new: nextPaymentStatus
      };
    }
    await writeActivity(connection, {
      chargingStationId: stationId,
      action: 'contract_completed',
      changedFields: contractChanges,
      actorId: ctx.actorId,
      actorRole: ctx.actorRole,
      source: 'user',
      ip: ctx.ip
    });
    await advanceToDeliveryIfReady(connection, {
      ...current,
      contract_status: 'DONE',
      contract_file_id: normalizedFileId,
      payment_status: nextPaymentStatus
    }, ctx);
    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  await advanceProposalToDeploying(proposalId, ctx);
  return getChargingStationDetail(stationId, user);
};

const updateInfrastructureStatus = async (id, type, action, user, ctx = {}) => {
  await assertBackOfficeManager(user);
  const field = INFRA_FIELD_BY_TYPE[type];
  if (!field) throw err('Loại hạ tầng không hợp lệ', 400);
  if (!['start', 'complete'].includes(action)) throw err('Thao tác hạ tầng không hợp lệ', 400);

  const stationId = normalizeId(id, 'Mã bản ghi');
  await assertCanViewChargingStation(stationId, user);
  const connection = await pool.getConnection();
  let transactionStarted = false;
  let proposalId;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query(
      'SELECT * FROM charging_stations WHERE id = ? FOR UPDATE',
      [stationId]
    );
    if (!rows.length) throw err('Không tìm thấy bản ghi ON trạm', 404);
    const current = rows[0];
    proposalId = current.proposal_id;
    if (![STATUS.ONBOARDING, STATUS.DELIVERING].includes(current.status)) {
      throw err('Chỉ có thể cập nhật hạ tầng khi trạm đang hoàn thiện thủ tục hoặc đang giao hàng', 400);
    }

    const expected = action === 'start' ? 'NOT' : 'DOING';
    const next = action === 'start' ? 'DOING' : 'DONE';
    if (current[field] !== expected) {
      throw err(
        action === 'start'
          ? 'Hạng mục hạ tầng chỉ có thể bắt đầu khi đang ở trạng thái Chưa làm'
          : 'Hạng mục hạ tầng chỉ có thể hoàn tất khi đang ở trạng thái Đang làm',
        400
      );
    }

    await connection.query(`UPDATE charging_stations SET ${field} = ? WHERE id = ?`, [next, stationId]);
    await writeActivity(connection, {
      chargingStationId: stationId,
      action: 'infrastructure_status_changed',
      changedFields: { [field]: { label: FIELD_LABELS[field], old: current[field] || 'NOT', new: next } },
      actorId: ctx.actorId,
      actorRole: ctx.actorRole,
      source: 'user',
      ip: ctx.ip
    });
    await advanceToDeliveryIfReady(connection, { ...current, [field]: next }, ctx);
    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  if (action === 'complete') await advanceProposalToDeploying(proposalId, ctx);
  return getChargingStationDetail(stationId, user);
};

const requestEarlyDelivery = async (id, { desired_delivery_date: desiredDate, reason } = {}, user, ctx = {}) => {
  const stationId = normalizeId(id, 'Mã bản ghi');
  const cleanReason = toText(reason).trim();
  const deliveryDate = normalizeDate(desiredDate);
  if (!cleanReason) throw err('Vui lòng nhập lý do đề xuất giao trụ sớm', 400);
  const scope = await require('./proposalReportService').resolveScope(user);
  if (scope.isBackOffice && user?.role !== 'SUPER_ADMIN') {
    throw err('Thao tác đề xuất giao trụ sớm dành cho người đề xuất và người quản lý phía trên', 403);
  }
  await assertCanViewChargingStation(stationId, user);

  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query(
      `SELECT cs.*, p.chot_so_luong_tru
         FROM charging_stations cs
         JOIN station_proposals p ON p.id = cs.proposal_id
        WHERE cs.id = ?
        FOR UPDATE`,
      [stationId]
    );
    if (!rows.length) throw err('Không tìm thấy bản ghi ON trạm', 404);
    const current = rows[0];
    if (current.status !== STATUS.ONBOARDING) {
      throw err('Chỉ có thể đề xuất giao trụ sớm khi trạm đang hoàn thiện thủ tục', 400);
    }

    const committedRows = parseJson(current.chot_so_luong_tru);
    if (!Array.isArray(committedRows) || committedRows.length === 0) {
      throw err('Đề xuất chưa có số lượng trụ chốt để xuất kho', 409);
    }
    const missingItems = [];
    if (current.contract_status !== 'DONE') missingItems.push('Hợp đồng');
    if (!['DOING', 'DONE'].includes(current.payment_status)) missingItems.push('Tài chính / tiền cọc');
    if (current.infra_site_status !== 'DONE') missingItems.push('Hạ tầng mặt bằng');
    if (missingItems.length === 0) {
      throw err('Trạm đã đủ điều kiện giao trụ; hãy tải lại danh sách để tiếp tục quy trình', 409);
    }

    const nextStatus = STATUS.DELIVERING;
    const nextSubStatus = INITIAL_SUB_STATUS[nextStatus];
    await connection.query(
      'UPDATE charging_stations SET status = ?, sub_status = ? WHERE id = ?',
      [nextStatus, nextSubStatus, stationId]
    );
    await writeActivity(connection, {
      chargingStationId: stationId,
      action: 'early_delivery_requested',
      fromStatus: current.status,
      toStatus: nextStatus,
      changedFields: {
        ...diffFields(current, { status: nextStatus, sub_status: nextSubStatus }),
        desired_delivery_date: { label: 'Ngày mong muốn nhận hàng', old: '', new: deliveryDate },
        missing_items: { label: 'Hạng mục chưa hoàn thành', old: '', new: missingItems.join(', ') }
      },
      reason: cleanReason,
      actorId: ctx.actorId,
      actorRole: ctx.actorRole,
      source: 'user',
      ip: ctx.ip
    });
    await notifyBackOfficeDeliveryReady(
      connection,
      { ...current, status: nextStatus, sub_status: nextSubStatus },
      ctx,
      { earlyRequest: true, desiredDate: deliveryDate, reason: cleanReason }
    );
    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return getChargingStationDetail(stationId, user);
};

const resolveCommittedExportItems = async (connection, proposalId) => {
  const [proposalRows] = await connection.query(
    'SELECT chot_so_luong_tru FROM station_proposals WHERE id = ? FOR UPDATE',
    [proposalId]
  );
  if (!proposalRows.length) throw err('Không tìm thấy đề xuất liên quan', 404);
  const committedRows = parseJson(proposalRows[0].chot_so_luong_tru);
  if (!Array.isArray(committedRows) || committedRows.length === 0) {
    throw err('Đề xuất chưa có số lượng trụ chốt để xuất kho', 409);
  }

  const items = [];
  for (const [index, row] of committedRows.entries()) {
    const poleName = toText(row?.loai_tru).trim();
    const quantity = Number(row?.so_luong);
    if (!poleName || !Number.isInteger(quantity) || quantity <= 0) {
      throw err(`Dòng trụ chốt ${index + 1} không hợp lệ`, 409);
    }
    const [poleRows] = await connection.query(
      'SELECT id FROM charging_poles WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 2',
      [poleName]
    );
    if (poleRows.length !== 1) {
      throw err(
        poleRows.length === 0
          ? `Chưa có loại trụ "${poleName}" trong danh mục kho`
          : `Loại trụ "${poleName}" bị trùng trong danh mục kho`,
        409
      );
    }
    items.push({ pole_id: poleRows[0].id, quantity });
  }
  return items;
};

const createDeliveryExport = async (id, body = {}, user, ctx = {}) => {
  await assertBackOfficeManager(user);
  const stationId = normalizeId(id, 'Mã bản ghi');
  await assertCanViewChargingStation(stationId, user);
  const carrier = toText(body.carrier).trim();
  const transportCode = toText(body.transport_code).trim();
  const transportStatus = toText(body.transport_status || 'SHIPPING').trim().toUpperCase();
  const totalAmount = Number(body.total_amount);
  if (!carrier) throw err('Vui lòng nhập bên vận chuyển', 400);
  if (!transportCode) throw err('Vui lòng nhập mã vận chuyển', 400);
  if (!['PENDING', 'SHIPPING'].includes(transportStatus)) {
    throw err('Trạng thái vận chuyển khi xuất trụ chỉ được Chờ vận chuyển hoặc Đang vận chuyển', 400);
  }
  if (!Number.isFinite(totalAmount) || totalAmount < 0) {
    throw err('Tổng tiền vận chuyển phải là số không âm', 400);
  }

  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query(
      `SELECT cs.*, p.chot_so_luong_tru
         FROM charging_stations cs
         JOIN station_proposals p ON p.id = cs.proposal_id
        WHERE cs.id = ?
        FOR UPDATE`,
      [stationId]
    );
    if (!rows.length) throw err('Không tìm thấy bản ghi ON trạm', 404);
    const current = rows[0];
    if (current.status !== STATUS.DELIVERING || current.sub_status !== 'NOT_DELIVERED') {
      throw err('Chỉ có thể xuất trụ khi trạm đang giao hàng và chưa giao trụ', 400);
    }
    const items = await resolveCommittedExportItems(connection, current.proposal_id);
    const exportId = await warehouseService.createExportWithinTransaction(
      connection,
      {
        export_date: new Date().toISOString(),
        charging_station_id: stationId,
        reason: `Xuất trụ cho trạm ${current.ma_tram || `#${stationId}`}`,
        carrier,
        transport_code: transportCode,
        transport_status: transportStatus,
        total_amount: totalAmount,
        items
      },
      { userId: user.id }
    );
    const nextSubStatus = 'DELIVERING';
    await connection.query(
      'UPDATE charging_stations SET sub_status = ? WHERE id = ?',
      [nextSubStatus, stationId]
    );
    await writeActivity(connection, {
      chargingStationId: stationId,
      action: 'poles_exported',
      fromStatus: current.status,
      toStatus: current.status,
      changedFields: {
        sub_status: { label: FIELD_LABELS.sub_status, old: current.sub_status, new: nextSubStatus },
        warehouse_export_id: { label: 'Mã phiếu xuất kho', old: '', new: String(exportId) },
        carrier: { label: 'Bên vận chuyển', old: '', new: carrier },
        transport_code: { label: 'Mã vận chuyển', old: '', new: transportCode },
        transport_status: { label: 'Trạng thái vận chuyển', old: '', new: transportStatus },
        total_amount: { label: 'Tiền vận chuyển', old: '', new: String(totalAmount) }
      },
      actorId: ctx.actorId,
      actorRole: ctx.actorRole,
      source: 'user',
      ip: ctx.ip
    });
    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return getChargingStationDetail(stationId, user);
};

const confirmDelivery = async (id, user, ctx = {}) => {
  await assertBackOfficeManager(user);
  const stationId = normalizeId(id, 'Mã bản ghi');
  await assertCanViewChargingStation(stationId, user);
  const connection = await pool.getConnection();
  let transactionStarted = false;
  let previousStatus;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query(
      'SELECT * FROM charging_stations WHERE id = ? FOR UPDATE',
      [stationId]
    );
    if (!rows.length) throw err('Không tìm thấy bản ghi ON trạm', 404);
    const current = rows[0];
    if (current.status !== STATUS.DELIVERING || current.sub_status !== 'DELIVERING') {
      throw err('Chỉ có thể xác nhận giao đến nơi khi trụ đang được vận chuyển', 400);
    }
    const [exports] = await connection.query(
      `SELECT id, transport_status
         FROM warehouse_exports
        WHERE charging_station_id = ?
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE`,
      [stationId]
    );
    if (!exports.length) throw err('Không tìm thấy phiếu xuất kho của trạm', 409);
    const exportRecord = exports[0];
    if (!['PENDING', 'SHIPPING'].includes(exportRecord.transport_status)) {
      throw err('Phiếu xuất kho không ở trạng thái đang vận chuyển', 409);
    }
    await connection.query(
      "UPDATE warehouse_exports SET transport_status = 'DELIVERED' WHERE id = ?",
      [exportRecord.id]
    );
    const nextStatus = STATUS.INSTALLING;
    const nextSubStatus = INITIAL_SUB_STATUS[nextStatus];
    await connection.query(
      'UPDATE charging_stations SET status = ?, sub_status = ? WHERE id = ?',
      [nextStatus, nextSubStatus, stationId]
    );
    await writeActivity(connection, {
      chargingStationId: stationId,
      action: 'delivery_confirmed',
      fromStatus: current.status,
      toStatus: nextStatus,
      changedFields: {
        ...diffFields(current, { status: nextStatus, sub_status: nextSubStatus }),
        transport_status: { label: 'Trạng thái vận chuyển', old: exportRecord.transport_status, new: 'DELIVERED' }
      },
      actorId: ctx.actorId,
      actorRole: ctx.actorRole,
      source: 'user',
      ip: ctx.ip
    });
    await notifySetupOperations(
      connection,
      { id: stationId, ma_tram: current.ma_tram, status: nextStatus, sub_status: nextSubStatus },
      ctx,
      'Trạm sạc đã giao đến nơi — cần lắp đặt'
    );
    previousStatus = current.status;
    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  await require('./journeySyncService').onStationStatus(stationId, {
    from: previousStatus,
    to: STATUS.INSTALLING,
    actorId: ctx.actorId,
    actorRole: ctx.actorRole,
    source: 'user',
    ip: ctx.ip
  });
  return getChargingStationDetail(stationId, user);
};

const updateInstallation = async (id, action, user, ctx = {}) => {
  await assertSetupOperationsManager(user);
  const stationId = normalizeId(id, 'Mã bản ghi');
  await assertCanViewChargingStation(stationId, user);
  if (!['start', 'complete'].includes(action)) throw err('Thao tác lắp đặt không hợp lệ', 400);
  const connection = await pool.getConnection();
  let transactionStarted = false;
  let previousStatus;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query(
      'SELECT * FROM charging_stations WHERE id = ? FOR UPDATE',
      [stationId]
    );
    if (!rows.length) throw err('Không tìm thấy bản ghi ON trạm', 404);
    const current = rows[0];
    if (action === 'start') {
      if (current.status !== STATUS.INSTALLING || current.sub_status !== 'NOT_INSTALLED') {
        throw err('Chỉ có thể bắt đầu lắp đặt khi trạm đang ở trạng thái Chưa lắp đặt', 400);
      }
      await connection.query(
        "UPDATE charging_stations SET sub_status = 'INSTALLING' WHERE id = ?",
        [stationId]
      );
      await writeActivity(connection, {
        chargingStationId: stationId,
        action: 'installation_started',
        changedFields: { sub_status: { label: FIELD_LABELS.sub_status, old: current.sub_status, new: 'INSTALLING' } },
        actorId: ctx.actorId,
        actorRole: ctx.actorRole,
        source: 'user',
        ip: ctx.ip
      });
    } else {
      if (current.status !== STATUS.INSTALLING || current.sub_status !== 'INSTALLING') {
        throw err('Chỉ có thể hoàn tất lắp đặt khi trạng thái là Đang lắp đặt', 400);
      }
      const nextStatus = STATUS.ACCEPTANCE;
      const nextSubStatus = INITIAL_SUB_STATUS[nextStatus];
      await connection.query(
        'UPDATE charging_stations SET status = ?, sub_status = ? WHERE id = ?',
        [nextStatus, nextSubStatus, stationId]
      );
      await writeActivity(connection, {
        chargingStationId: stationId,
        action: 'installation_completed',
        fromStatus: current.status,
        toStatus: nextStatus,
        changedFields: diffFields(current, { status: nextStatus, sub_status: nextSubStatus }),
        actorId: ctx.actorId,
        actorRole: ctx.actorRole,
        source: 'user',
        ip: ctx.ip
      });
      await notifySetupOperations(
        connection,
        { id: stationId, ma_tram: current.ma_tram, status: nextStatus, sub_status: nextSubStatus },
        ctx,
        'Trạm sạc cần nghiệm thu'
      );
    }
    previousStatus = current.status;
    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  if (action === 'complete') {
    await require('./journeySyncService').onStationStatus(stationId, {
      from: previousStatus,
      to: STATUS.ACCEPTANCE,
      actorId: ctx.actorId,
      actorRole: ctx.actorRole,
      source: 'user',
      ip: ctx.ip
    });
  }
  return getChargingStationDetail(stationId, user);
};

const updateAcceptanceResult = async (id, result, user, ctx = {}) => {
  await assertSetupOperationsManager(user);
  const stationId = normalizeId(id, 'Mã bản ghi');
  await assertCanViewChargingStation(stationId, user);
  if (!['ACCEPT_FAILED', 'ACCEPT_PASSED'].includes(result)) {
    throw err('Kết quả nghiệm thu không hợp lệ', 400);
  }
  const connection = await pool.getConnection();
  let transactionStarted = false;
  let previousStatus;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query(
      'SELECT * FROM charging_stations WHERE id = ? FOR UPDATE',
      [stationId]
    );
    if (!rows.length) throw err('Không tìm thấy bản ghi ON trạm', 404);
    const current = rows[0];
    if (current.status !== STATUS.ACCEPTANCE) {
      throw err('Chỉ có thể cập nhật kết quả khi trạm đang nghiệm thu', 400);
    }
    if (result === 'ACCEPT_PASSED' && !current.acceptance_file_id) {
      throw err('Vui lòng tải biên bản nghiệm thu trước khi xác nhận đạt', 400);
    }
    const nextStatus = result === 'ACCEPT_PASSED' ? STATUS.OPERATING : STATUS.ACCEPTANCE;
    const nextSubStatus = result === 'ACCEPT_PASSED' ? INITIAL_SUB_STATUS[nextStatus] : result;
    await connection.query(
      'UPDATE charging_stations SET status = ?, sub_status = ? WHERE id = ?',
      [nextStatus, nextSubStatus, stationId]
    );
    await writeActivity(connection, {
      chargingStationId: stationId,
      action: result === 'ACCEPT_PASSED' ? 'acceptance_passed' : 'acceptance_failed',
      fromStatus: current.status,
      toStatus: nextStatus,
      changedFields: diffFields(current, { status: nextStatus, sub_status: nextSubStatus }),
      actorId: ctx.actorId,
      actorRole: ctx.actorRole,
      source: 'user',
      ip: ctx.ip
    });
    if (result === 'ACCEPT_PASSED') {
      await notifySetupOperations(
        connection,
        { id: stationId, ma_tram: current.ma_tram, status: nextStatus, sub_status: nextSubStatus },
        ctx,
        'Nghiệm thu đạt — cần cấu hình ON trạm'
      );
    }
    previousStatus = current.status;
    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  if (result === 'ACCEPT_PASSED') {
    await require('./journeySyncService').onStationStatus(stationId, {
      from: previousStatus,
      to: STATUS.OPERATING,
      actorId: ctx.actorId,
      actorRole: ctx.actorRole,
      source: 'user',
      ip: ctx.ip
    });
  }
  return getChargingStationDetail(stationId, user);
};

const completeConfiguration = async (id, { cms_station_code: cmsStationCode, on_date: onDate } = {}, user, ctx = {}) => {
  await assertSetupOperationsManager(user);
  const stationId = normalizeId(id, 'Mã bản ghi');
  await assertCanViewChargingStation(stationId, user);
  const cleanCmsCode = toText(cmsStationCode).trim();
  const normalizedOnDate = normalizeDate(onDate);
  if (!cleanCmsCode) throw err('Mã trạm trên CMS là bắt buộc', 400);
  const [preflightRows] = await pool.query(
    `SELECT cs.status, cs.sub_status, cs.cms_station_code,
            DATE_FORMAT(cs.on_date, '%Y-%m-%d') AS on_date,
            p.id AS proposal_id, p.status AS proposal_status
       FROM charging_stations cs
       JOIN station_proposals p ON p.id = cs.proposal_id
      WHERE cs.id = ?`,
    [stationId]
  );
  if (!preflightRows.length) throw err('Không tìm thấy bản ghi ON trạm', 404);
  const preflight = preflightRows[0];
  if (
    preflight.status === STATUS.OPERATING
    && preflight.sub_status === 'ACTIVE'
    && preflight.proposal_status === 'ACTIVE'
  ) {
    if (preflight.cms_station_code !== cleanCmsCode || preflight.on_date !== normalizedOnDate) {
      throw err('Trạm đã được kích hoạt với mã CMS và ngày ON khác', 409);
    }
    return getChargingStationDetail(stationId, user);
  }
  if (preflight.status !== STATUS.OPERATING || preflight.sub_status !== 'CONFIGURING') {
    throw err('Chỉ có thể hoàn tất cấu hình khi trạm đang ở trạng thái Đang cấu hình', 400);
  }
  if (!['CONTRACT_SIGNED', 'DEPLOYING', 'ACTIVE'].includes(preflight.proposal_status)) {
    throw err('Đề xuất liên quan không ở trạng thái Ký thành công để chuyển sang Hoạt động', 409);
  }

  await require('./proposalLifecycle').transition(preflight.proposal_id, 'ACTIVE', {
    actorId: ctx.actorId,
    actorRole: ctx.actorRole,
    source: 'system_auto',
    ip: ctx.ip
  });

  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query(
      `SELECT cs.*, DATE_FORMAT(cs.on_date, '%Y-%m-%d') AS activation_on_date,
              p.status AS proposal_status
         FROM charging_stations cs
         JOIN station_proposals p ON p.id = cs.proposal_id
        WHERE cs.id = ?
        FOR UPDATE`,
      [stationId]
    );
    if (!rows.length) throw err('Không tìm thấy bản ghi ON trạm', 404);
    const current = rows[0];
    if (
      current.status === STATUS.OPERATING
      && current.sub_status === 'ACTIVE'
      && current.proposal_status === 'ACTIVE'
      && current.cms_station_code === cleanCmsCode
      && current.activation_on_date === normalizedOnDate
    ) {
      await connection.commit();
      transactionStarted = false;
      return getChargingStationDetail(stationId, user);
    }
    if (current.status !== STATUS.OPERATING || current.sub_status !== 'CONFIGURING') {
      throw err('Trạng thái trạm vừa được thay đổi; hãy tải lại trang', 409);
    }
    if (current.proposal_status !== 'ACTIVE') {
      throw err('Đề xuất chưa được chuyển sang Hoạt động; hãy thử lại thao tác', 409);
    }
    await connection.query(
      "UPDATE charging_stations SET cms_station_code = ?, on_date = ?, sub_status = 'ACTIVE' WHERE id = ?",
      [cleanCmsCode, normalizedOnDate, stationId]
    );
    await writeActivity(connection, {
      chargingStationId: stationId,
      action: 'configuration_completed',
      fromStatus: current.status,
      toStatus: current.status,
      changedFields: {
        sub_status: { label: FIELD_LABELS.sub_status, old: current.sub_status, new: 'ACTIVE' },
        cms_station_code: {
          label: FIELD_LABELS.cms_station_code,
          old: current.cms_station_code || '',
          new: cleanCmsCode
        },
        on_date: { label: FIELD_LABELS.on_date, old: current.on_date || '', new: normalizedOnDate }
      },
      actorId: ctx.actorId,
      actorRole: ctx.actorRole,
      source: 'user',
      ip: ctx.ip
    });
    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  await require('./journeySyncService').onStationStatus(stationId, {
    from: 'CONFIGURING',
    to: 'ACTIVE',
    actorId: ctx.actorId,
    actorRole: ctx.actorRole,
    source: 'user',
    ip: ctx.ip
  });
  return getChargingStationDetail(stationId, user);
};

const changeStatus = async (id, { to_status: toStatus, sub_status: subStatus, reason } = {}, ctx = {}) => {
  if (!Object.values(STATUS).includes(toStatus)) throw err('Trạng thái đích không hợp lệ', 400);
  const stationId = normalizeId(id, 'Mã bản ghi');
  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query(
      'SELECT * FROM charging_stations WHERE id = ? FOR UPDATE',
      [stationId]
    );
    if (!rows.length) throw err('Không tìm thấy bản ghi ON trạm', 404);
    const current = rows[0];
    if (toStatus === current.status) throw err('Bản ghi đã ở trạng thái này', 400);

    const allowedNext = ALLOWED_TRANSITIONS[current.status] || [];
    if (!allowedNext.includes(toStatus)) {
      throw err(`Không thể chuyển từ "${STATUS_LABELS[current.status]}" sang "${STATUS_LABELS[toStatus]}"`, 400);
    }

    const backward = isBackward(current.status, toStatus);
    const cleanReason = toText(reason).trim();
    if (backward && !cleanReason) throw err('Bắt buộc nhập lý do khi lùi bước', 400);
    if (!backward && [STATUS.INSTALLING, STATUS.ACCEPTANCE, STATUS.OPERATING].includes(toStatus)) {
      throw err('Hãy dùng thao tác chuyên biệt của quy trình Giao trụ / Lắp trụ để chuyển bước', 400);
    }

    if (toStatus === STATUS.DELIVERING && (
      current.contract_status !== 'DONE' ||
      current.payment_status !== 'DOING' ||
      (current.infra_power_status !== 'DONE' && current.infra_site_status !== 'DONE')
    )) {
      throw err('Cần hoàn tất hợp đồng, chuyển thanh toán sang Đang làm và hoàn thành ít nhất một hạng mục hạ tầng trước khi giao trụ', 400);
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

    await connection.query(
      'UPDATE charging_stations SET status = ?, sub_status = ? WHERE id = ?',
      [toStatus, nextSub, current.id]
    );

    await writeActivity(connection, {
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
    if (toStatus === STATUS.DELIVERING) {
      await notifyBackOfficeDeliveryReady(connection, { ...current, status: toStatus, sub_status: nextSub }, ctx);
    }

    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return getChargingStationDetail(stationId);
};

const updateAcceptance = async (id, { acceptance_user_id: userId, acceptance_date: date } = {}, user, ctx = {}) => {
  await assertSetupOperationsManager(user);
  await assertCanViewChargingStation(id, user);
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

const setAcceptanceFile = async (id, fileId, user, ctx = {}) => {
  await assertSetupOperationsManager(user);
  await assertCanViewChargingStation(id, user);
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

const addAcceptanceImages = async (id, fileIds = [], user, ctx = {}) => {
  await assertSetupOperationsManager(user);
  await assertCanViewChargingStation(id, user);
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

const removeAcceptanceImage = async (id, fileId, user, ctx = {}) => {
  await assertSetupOperationsManager(user);
  await assertCanViewChargingStation(id, user);
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

exports.STAGES = [...Object.keys(STAGE_FILTERS), 'khoi-tao-hop-dong'];
exports.CONTRACT_TABS = Object.keys(CONTRACT_TAB_FILTERS);
exports.INFRA_TABS = Object.keys(INFRA_TAB_FILTERS);
exports.DELIVERY_TABS = Object.keys(DELIVERY_TAB_FILTERS);
exports.INSTALLATION_TABS = Object.keys(CHARGING_STATION_STAGE_TAB_FILTERS['lap-tru']);
exports.STATUS_LABELS = STATUS_LABELS;
exports.SUB_STATUS_LABELS = SUB_STATUS_LABELS;
exports.listChargingStations = listChargingStations;
exports.getChargingStationTaskCounts = getChargingStationTaskCounts;
exports.getChargingStationDetail = getChargingStationDetail;
exports.canViewChargingStation = canViewChargingStation;
exports.createFromApprovedProposal = createFromApprovedProposal;
exports.updateChargingStation = updateChargingStation;
exports.updatePaymentStatus = updatePaymentStatus;
exports.startContractSigning = startContractSigning;
exports.completeContract = completeContract;
exports.updateInfrastructureStatus = updateInfrastructureStatus;
exports.requestEarlyDelivery = requestEarlyDelivery;
exports.createDeliveryExport = createDeliveryExport;
exports.confirmDelivery = confirmDelivery;
exports.updateInstallation = updateInstallation;
exports.updateAcceptanceResult = updateAcceptanceResult;
exports.completeConfiguration = completeConfiguration;
exports.changeStatus = changeStatus;
exports.updateAcceptance = updateAcceptance;
exports.setAcceptanceFile = setAcceptanceFile;
exports.addAcceptanceImages = addAcceptanceImages;
exports.removeAcceptanceImage = removeAcceptanceImage;
exports.findByProposal = findByProposal;
