const pool = require('../utils/db');
const stationCodeService = require('./stationCodeService');
const {
  STATUS,
  SUB_STATUS_BY_STATUS,
  INITIAL_SUB_STATUS,
  ROLLBACK_SUB_STATUS,
  CONTRACT_FILE_MIME_TYPES,
  IMAGE_MAX_COUNT,
  ACCEPTANCE_PDF_MIME,
  IMAGE_MIME_PREFIX,
  isBackward
} = require('../constants/chargingStations');
const readiness = require('./chargingStationReadiness');
const stationAccess = require('./chargingStationAccessService');
const stationWork = require('./chargingStationWorkService');

const err = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const STATUS_LABELS = {
  ONBOARDING: 'Đang hoàn thiện thủ tục',
  DELIVERING: 'Đang giao hàng',
  INSTALLING: 'Đang lắp đặt',
  ACCEPTANCE: 'Đang nghiệm thu',
  CONFIGURING: 'Đang cấu hình',
  OPERATING: 'Đang hoạt động',
  CANCELLED: 'Đã hủy'
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
  NOT_CONFIGURED: 'Chưa cấu hình',
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
  contract_files: 'Các file hợp đồng',
  contract_effective_date: 'Ngày hiệu lực hợp đồng',
  contract_expiry_date: 'Ngày hết hạn hợp đồng',
  contract_note: 'Ghi chú hợp đồng',
  infra_power_status: 'Hạ tầng điện',
  infra_site_status: 'Hạ tầng mặt bằng',
  infra_power_date: 'Ngày thực hiện hạ tầng điện',
  infra_power_note: 'Ghi chú hạ tầng điện',
  infra_site_date: 'Ngày thực hiện hạ tầng mặt bằng',
  infra_site_note: 'Ghi chú hạ tầng mặt bằng',
  payment_status: 'Trạng thái thanh toán',
  deposit_status: 'Trạng thái tiền cọc',
  description: 'Mô tả',
  note: 'Ghi chú',
  acceptance_user_id: 'Người nghiệm thu',
  acceptance_date: 'Ngày nghiệm thu',
  acceptance_file_id: 'Biên bản nghiệm thu',
  ma_tram: 'Mã trạm',
  proposal_id: 'Đề xuất nguồn'
};

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
  'on-tram': { sql: 'cs.status IN (?, ?)', params: [STATUS.CONFIGURING, STATUS.OPERATING] }
};

const CONTRACT_TAB_FILTERS = {
  need: "cs.status = 'ONBOARDING' AND cs.contract_status IN ('NOT', 'DOING')",
  completed: "cs.contract_status = 'DONE'",
  all: '1 = 1'
};

const INFRA_TAB_FILTERS = {
  need: "cs.status <> 'CANCELLED' AND (COALESCE(cs.infra_power_status, 'NOT') <> 'DONE' OR COALESCE(cs.infra_site_status, 'NOT') <> 'DONE')",
  completed: "cs.infra_power_status = 'DONE' AND cs.infra_site_status = 'DONE'",
  all: '1 = 1'
};

const OVERVIEW_TAB_FILTERS = {
  need: "cs.status <> 'CANCELLED' AND (cs.status <> 'OPERATING' OR COALESCE(cs.sub_status, '') <> 'ACTIVE')",
  completed: "cs.status = 'OPERATING' AND cs.sub_status = 'ACTIVE'",
  all: '1 = 1'
};

const FINANCE_PENDING_SQL = "(cs.deposit_status IN ('NOT_RECEIVED', 'REFUND_PENDING') OR COALESCE(cs.payment_status, 'NOT') IN ('NOT', 'DOING'))";
const FINANCE_NEED_SQL = `(cs.status <> 'CANCELLED' AND ${FINANCE_PENDING_SQL})`;
const FINANCE_NOT_REQUIRED_SQL = "(cs.deposit_status = 'NOT_REQUIRED' AND COALESCE(cs.payment_status, 'NOT') = 'NOT_REQUIRED')";
const FINANCE_TAB_FILTERS = {
  need: FINANCE_NEED_SQL,
  completed: `(cs.status <> 'CANCELLED' AND NOT ${FINANCE_PENDING_SQL} AND NOT ${FINANCE_NOT_REQUIRED_SQL})`,
  all: '1 = 1'
};

const DELIVERY_TAB_FILTERS = {
  requesterNeed: "cs.status IN ('ONBOARDING', 'DELIVERING')",
  backOfficeNeed: "cs.status = 'DELIVERING' AND cs.sub_status IN ('NOT_DELIVERED', 'DELIVERING')",
  completed: "cs.status IN ('INSTALLING', 'ACCEPTANCE', 'CONFIGURING', 'OPERATING')",
  requesterAll: "cs.status IN ('ONBOARDING', 'DELIVERING', 'INSTALLING', 'ACCEPTANCE', 'CONFIGURING', 'OPERATING')",
  backOfficeAll: "cs.status IN ('DELIVERING', 'INSTALLING', 'ACCEPTANCE', 'CONFIGURING', 'OPERATING')"
};

const CHARGING_STATION_STAGE_TAB_FILTERS = {
  'lap-tru': {
    need: "cs.status = 'INSTALLING'",
    completed: "cs.status IN ('ACCEPTANCE', 'CONFIGURING', 'OPERATING')",
    all: "cs.status IN ('INSTALLING', 'ACCEPTANCE', 'CONFIGURING', 'OPERATING')"
  },
  'nghiem-thu': {
    need: "cs.status = 'ACCEPTANCE'",
    completed: "cs.status IN ('CONFIGURING', 'OPERATING')",
    all: "cs.status IN ('ACCEPTANCE', 'CONFIGURING', 'OPERATING')"
  },
  'on-tram': {
    need: "cs.status = 'CONFIGURING'",
    completed: "cs.status = 'OPERATING' AND cs.sub_status = 'ACTIVE'",
    all: "cs.status IN ('CONFIGURING', 'OPERATING')"
  }
};

const CS_SELECT = `SELECT cs.id, cs.ma_tram, cs.proposal_id,
    cs.cms_station_code,
    DATE_FORMAT(cs.on_date, '%Y-%m-%d') AS on_date,
    cs.acceptance_file_id, cs.acceptance_user_id,
    DATE_FORMAT(cs.acceptance_date, '%Y-%m-%d') AS acceptance_date,
    cs.status, cs.sub_status, cs.workflow_override, cs.contract_status, cs.contract_file_id,
    DATE_FORMAT(cs.contract_effective_date, '%Y-%m-%d') AS contract_effective_date,
    DATE_FORMAT(cs.contract_expiry_date, '%Y-%m-%d') AS contract_expiry_date,
    cs.contract_note,
    cs.infra_power_status, cs.infra_site_status, cs.payment_status, cs.deposit_status,
    DATE_FORMAT(cs.infra_power_date, '%Y-%m-%d') AS infra_power_date,
    DATE_FORMAT(cs.infra_site_date, '%Y-%m-%d') AS infra_site_date,
    cs.infra_power_note, cs.infra_site_note,
    DATE_FORMAT(cs.contract_deadline_at, '%Y-%m-%d %H:%i:%s') AS contract_deadline_at,
    DATE_FORMAT(cs.infra_deadline_at, '%Y-%m-%d %H:%i:%s') AS infra_deadline_at,
    DATE_FORMAT(cs.finance_deadline_at, '%Y-%m-%d %H:%i:%s') AS finance_deadline_at,
    cs.deadline_extension_count,
    cs.manual_cancelled_at, cs.manual_cancelled_by,
    cs.description, cs.note, cs.created_at, cs.updated_at,
    p.ma_de_xuat_gen AS ma_de_xuat,
    p.status AS proposal_status,
    p.user_id AS proposal_user_id,
    p.chot_so_luong_tru,
    p.tong_gia_tri_chot AS contract_amount,
    (SELECT COALESCE(SUM(CASE WHEN invoice_type = 'DEPOSIT' THEN amount ELSE 0 END), 0) FROM charging_station_invoices WHERE charging_station_id = cs.id) AS deposit_total,
    (SELECT COALESCE(SUM(CASE WHEN invoice_type = 'PAYMENT' THEN amount ELSE 0 END), 0) FROM charging_station_invoices WHERE charging_station_id = cs.id) AS payment_total,
    (SELECT COALESCE(SUM(CASE WHEN invoice_type = 'REFUND' THEN amount ELSE 0 END), 0) FROM charging_station_invoices WHERE charging_station_id = cs.id) AS refund_total,
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
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
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

const assertLegacyStationAction = async (id) => {
  const [rows] = await pool.query(`SELECT id FROM charging_station_deployments WHERE charging_station_id=?
    UNION SELECT id FROM charging_station_commitments WHERE charging_station_id=? LIMIT 1`, [id, id]);
  if (rows.length) throw err('Trạm có tiến độ theo đợt; hãy thao tác trên đúng phần trụ thay vì cập nhật toàn trạm', 409);
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
  return rows.length > 0 ? withReadiness(rows[0]) : null;
};

const findByProposal = async (proposalId) => {
  const [rows] = await pool.query(`${CS_SELECT} WHERE cs.proposal_id = ?`, [proposalId]);
  return rows.length > 0 ? withReadiness(rows[0]) : null;
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
  return stationAccess.buildViewScope(user);
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
  if (!user) throw err('Chưa xác thực', 401);
  if (!await canViewChargingStation(id, user)) {
    throw err('Không có quyền xem ON trạm này', 403);
  }
};

const resolveOnStationStatusManager = async (user) => {
  const scope = await require('./proposalReportService').resolveScope(user);
  if (user?.role === 'SUPER_ADMIN') return scope;
  if (user?.role === 'SALES' && scope.roleKey === 'GDTTKD') return scope;
  throw err('Chỉ SUPER_ADMIN, ADMIN hoặc GĐTTKD được hủy/khôi phục ON trạm', 403);
};

const assertBackOfficeManager = async (user) => {
  await stationAccess.assertBackOffice(user);
};

const assertFinanceManager = async (user, message = 'Chỉ Phòng Tài chính, Back Office hoặc quản trị viên được xử lý tài chính ON trạm') => {
  await stationAccess.assertFinance(user);
  return require('./proposalReportService').resolveScope(user);
};

const withReadiness = (row) => {
  if (!row) return row;
  const result = readiness.evaluateDeliveryReadiness(row, row.mo_hinh_dau_tu);
  return {
    ...row,
    requires_deposit: result.requirements.requiresDeposit,
    requires_payment: result.requirements.requiresPayment,
    delivery_ready: result.ready,
    delivery_missing_items: result.missingLabels,
    deadline_active: readiness.isDeadlineActive(row)
  };
};

const loadInvestmentModel = async (executor, proposalId) => {
  const [rows] = await executor.query(
    "SELECT JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.mo_hinh_dau_tu')) AS model FROM station_proposals WHERE id = ?",
    [proposalId]
  );
  return rows.length ? rows[0].model : null;
};

const getUsersByDepartment = async (executor, predicate) => {
  const [users] = await executor.query("SELECT id, custom_data FROM users WHERE status = 'ACTIVE'");
  return users.filter((user) => predicate(parseJson(user.custom_data).department));
};

const insertNotifications = async (executor, recipients, { type, title, message, stationId, actorId }) => {
  for (const recipient of recipients) {
    await executor.query(
      `INSERT INTO notifications
        (user_id, type, title, message, entity_type, entity_id, is_read, created_by)
       VALUES (?, ?, ?, ?, 'charging_stations', ?, 0, ?)`,
      [recipient.id, type, title, message, stationId, actorId || null]
    );
  }
};

const notifyFinanceTeams = async (executor, station, ctx, { type, title, message }) => {
  const proposalReportService = require('./proposalReportService');
  const recipients = await getUsersByDepartment(
    executor,
    (department) => proposalReportService.isFinanceDepartment(department) || proposalReportService.isBackOffice(department)
  );
  await insertNotifications(executor, recipients, { type, title, message, stationId: station.id, actorId: ctx.actorId });
};

const notifyStationCreated = async (executor, station, ctx, requirements) => {
  const proposalReportService = require('./proposalReportService');
  const code = station.ma_tram || `#${station.id}`;
  const needsFinance = requirements.requiresDeposit || requirements.requiresPayment;
  const backOffice = await getUsersByDepartment(executor, proposalReportService.isBackOffice);
  await insertNotifications(executor, backOffice, {
    type: 'CHARGING_STATION_ONBOARDING_TASK',
    title: 'Trạm sạc mới cần xử lý thủ tục',
    message: `Mã trạm: ${code} · Cần cập nhật ${needsFinance ? 'Hợp đồng, Hạ tầng và Tài chính' : 'Hợp đồng và Hạ tầng'} trong 15 ngày.`,
    stationId: station.id,
    actorId: ctx.actorId
  });
  if (!needsFinance) return;
  const finance = await getUsersByDepartment(executor, proposalReportService.isFinanceDepartment);
  const backOfficeIds = new Set(backOffice.map((user) => user.id));
  await insertNotifications(executor, finance.filter((user) => !backOfficeIds.has(user.id)), {
    type: 'CHARGING_STATION_FINANCE_TASK',
    title: 'Trạm sạc mới cần xử lý tài chính',
    message: `Mã trạm: ${code} · Cần ghi nhận tiền cọc và thanh toán trong 15 ngày.`,
    stationId: station.id,
    actorId: ctx.actorId
  });
};

const assertSetupOperationsManager = async (user) => {
  await stationAccess.assertSetup(user);
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

const advanceToDeliveryIfReady = async (connection, stationRef, ctx = {}) => {
  const [rows] = await connection.query('SELECT * FROM charging_stations WHERE id = ?', [stationRef.id]);
  const station = rows[0];
  if (station && station.status !== 'CANCELLED') await advanceProposalToDeploying(station.proposal_id, ctx, connection);
  if (!station || station.status !== STATUS.ONBOARDING) return stationRef;
  const model = await loadInvestmentModel(connection, station.proposal_id);
  if (!readiness.evaluateDeliveryReadiness(station, model).ready) return station;

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

const PROPOSAL_STATUSES_BEFORE_DEPLOYING = ['APPROVED', 'CONTRACT_SIGNED'];

const advanceProposalToDeploying = async (proposalId, ctx = {}, executor = null) => {
  const connection = executor || await pool.getConnection();
  try {
  if (!executor) await connection.beginTransaction();
  const [rows] = await connection.query(
    `SELECT p.status, cs.contract_status,cs.infra_power_status,cs.infra_site_status,cs.payment_status
       FROM station_proposals p
       LEFT JOIN charging_stations cs ON cs.proposal_id = p.id
      WHERE p.id = ?
      LIMIT 1 FOR UPDATE`,
    [proposalId]
  );
  if (!rows.length) throw err('Không tìm thấy đề xuất liên quan đến ON trạm', 404);
  const row = rows[0];
  if (PROPOSAL_STATUSES_BEFORE_DEPLOYING.includes(row.status)
    && [row.contract_status,row.infra_power_status,row.infra_site_status,row.payment_status].includes('DONE')) {
    await require('./proposalLifecycle').transitionOnStationWithinTransaction(connection, proposalId, 'DEPLOYING', ctx);
  }
  if (!executor) await connection.commit();
  } catch (error) {
    if (!executor) await connection.rollback();
    throw error;
  } finally { if (!executor) connection.release(); }
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
  if (stage === 'tai-chinh') await stationAccess.assertFinanceViewer(user);
  const stageFilter = await stationWork.getFilter(stage || 'thong-tin-chung', tab, user);
  where.push(stageFilter.sql, scope.sql);
  params.push(...stageFilter.params, ...scope.params);

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

  const userScope = await require('./proposalReportService').resolveScope(user);
  const permissions = await stationAccess.permissions(user);
  const ownerMatcher = await require('./proposalAccessService').buildOwnerMatcher(user);
  const canRequestEarly = permissions.request_early;
  const canManageOnStationStatus = user?.role === 'SUPER_ADMIN'
    || (user?.role === 'SALES' && userScope.roleKey === 'GDTTKD');

  return {
    items: await Promise.all(rows.map(async (row) => {
      const record = withReadiness(row);
      const deadlineActive = readiness.isDeadlineActive(record);
      const fulfillment = await require('./chargingStationShippingService').getSummary(row.id, pool, {
        initialize: !!stage && stage !== 'thong-tin-chung', allowReview: true
      });
      const deployments = await require('./chargingStationDeploymentService').getDeployments(row.id);
      return {
        ...record,
        edit_token: user?.role === 'SUPER_ADMIN' ? await require('./chargingStationOverrideService').getEditToken(record.id) : undefined,
        permissions,
        fulfillment,
        deployments,
        installation_status: require('./chargingStationDeploymentService').installationSummary(record, fulfillment.items, deployments, fulfillment.needs_review),
        contract_amount: Number(record.contract_amount) || 0,
        paid_total: (Number(record.deposit_total) || 0) + (Number(record.payment_total) || 0) - (Number(record.refund_total) || 0),
        remaining_amount: Math.max(0, (Number(record.contract_amount) || 0) - ((Number(record.deposit_total) || 0) + (Number(record.payment_total) || 0) - (Number(record.refund_total) || 0))),
        paid_percent: (() => {
          const model = String(record.mo_hinh_dau_tu || '').toUpperCase();
          if (!['LK', 'NQ', 'NQ_LK'].includes(model)) return null;
          const contract = Number(record.contract_amount) || 0;
          const paid = (Number(record.deposit_total) || 0) + (Number(record.payment_total) || 0) - (Number(record.refund_total) || 0);
          if (contract <= 0) return 0;
          return Math.min(100, Math.max(0, Math.round((paid / contract) * 100)));
        })(),
        deadline_active: deadlineActive,
        can_extend_deadline: deadlineActive
          && Number(record.deadline_extension_count || 0) < readiness.MAX_DEADLINE_EXTENSIONS
          && user?.role !== 'ADMIN' && ownerMatcher(record.proposal_user_id),
        can_request_early_delivery: canRequestEarly
          && record.status === STATUS.ONBOARDING
          && !record.delivery_ready
          && ownerMatcher(record.proposal_user_id),
        can_cancel_on_station: canManageOnStationStatus
          && record.status !== 'CANCELLED'
          && ['APPROVED', 'CONTRACT_SIGNED', 'DEPLOYING', 'ACTIVE'].includes(record.proposal_status),
        can_mark_on_station_active: user?.role === 'SUPER_ADMIN'
          && record.status !== 'CANCELLED'
          && ['APPROVED', 'CONTRACT_SIGNED', 'DEPLOYING', 'ACTIVE'].includes(record.proposal_status)
          && !(record.status === STATUS.OPERATING
            && record.sub_status === 'ACTIVE'
            && record.proposal_status === 'ACTIVE'),
        can_restore_on_station: canManageOnStationStatus
          && record.status === 'CANCELLED'
          && Boolean(record.manual_cancelled_at)
          && record.proposal_status === 'ARCHIVED'
      };
    })),
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) }
  };
};

const getChargingStationTaskCounts = async (user) => {
  const proposalScope = await buildProposalScope(user);
  const tasks = await stationWork.actionable(user);
  const expressions = Object.entries(tasks.expressions).map(([key, condition]) =>
    `COUNT(CASE WHEN cs.status<>'CANCELLED' AND (${condition}) THEN cs.id END) AS ${key}`);
  expressions.push(`COUNT(CASE WHEN cs.status<>'CANCELLED' AND NOT ${stationWork.allOperating} THEN cs.id END) AS overview`);
  const [rows] = await pool.query(
    `SELECT ${expressions.join(', ')}
       FROM charging_stations cs
       JOIN station_proposals p ON p.id = cs.proposal_id
      WHERE ${proposalScope.sql}`,
    [...tasks.params, ...proposalScope.params]
  );
  const row = rows[0] || {};
  const counts = {
    overview: Number(row.overview || 0),
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
  const [contractFiles] = await pool.query(
    `SELECT f.id, f.original_name, f.mime_type, f.size
       FROM charging_station_contract_files cf
       JOIN files f ON f.id = cf.file_id
      WHERE cf.charging_station_id = ?
      ORDER BY cf.sort_order, cf.id`,
    [record.id]
  );
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
    contract_files: contractFiles,
    proposal,
    permissions: user ? await stationAccess.permissions(user) : {},
    fulfillment: await require('./chargingStationShippingService').getSummary(record.id, pool, { allowReview: true }),
    deployments: await require('./chargingStationDeploymentService').getDeployments(record.id),
    images,
    delivery_export: deliveryExport,
    timeline: timeline.map((row) => ({ ...row, changed_fields: parseJson(row.changed_fields) })),
    edit_token: user?.role === 'SUPER_ADMIN' ? await require('./chargingStationOverrideService').getEditToken(record.id) : undefined
  };
};

const loadOnStationStatusRow = async (connection, stationId) => {
  const [rows] = await connection.query(
    `SELECT cs.id, cs.proposal_id, cs.ma_tram, cs.status, cs.sub_status,
            cs.manual_cancelled_at, cs.manual_cancelled_by, cs.manual_cancel_snapshot,
            p.user_id, p.custom_data, p.status AS proposal_status, p.reject_reason, p.countdown_calendar_id,
            p.reviewed_by, DATE_FORMAT(p.reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewed_at,
            DATE_FORMAT(p.supplement_deadline_at, '%Y-%m-%d %H:%i:%s') AS supplement_deadline_at,
            DATE_FORMAT(p.transition_deadline_at, '%Y-%m-%d %H:%i:%s') AS transition_deadline_at,
            DATE_FORMAT(p.info_completed_at, '%Y-%m-%d %H:%i:%s') AS info_completed_at,
            p.paused_from_status,
            DATE_FORMAT(p.paused_at, '%Y-%m-%d %H:%i:%s') AS paused_at
       FROM charging_stations cs
       JOIN station_proposals p ON p.id = cs.proposal_id
      WHERE cs.id = ? FOR UPDATE`,
    [stationId]
  );
  return rows[0] || null;
};

const cancelOnStation = async (id, user, ctx = {}) => {
  await resolveOnStationStatusManager(user);
  const stationId = normalizeId(id, 'Mã bản ghi');
  await assertCanViewChargingStation(stationId, user);
  const connection = await pool.getConnection();
  let transactionStarted = false;
  let proposalTransition = null;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const current = await loadOnStationStatusRow(connection, stationId);
    if (!current) throw err('Không tìm thấy bản ghi ON trạm', 404);
    if (ctx.expectedToken) await require('./chargingStationOverrideService').assertToken(stationId, ctx.expectedToken, connection);
    if (current.status === 'CANCELLED') throw err('ON trạm đã ở trạng thái Đã hủy', 409);
    if (current.manual_cancelled_at) throw err('ON trạm đã được hủy thủ công', 409);

    const snapshot = {
      charging_status: current.status,
      charging_sub_status: current.sub_status,
      proposal_status: current.proposal_status,
      reject_reason: current.reject_reason,
      reviewed_by: current.reviewed_by,
      reviewed_at: current.reviewed_at,
      supplement_deadline_at: current.supplement_deadline_at,
      transition_deadline_at: current.transition_deadline_at,
      countdown_calendar_id: current.countdown_calendar_id,
      info_completed_at: current.info_completed_at,
      paused_from_status: current.paused_from_status,
      paused_at: current.paused_at
    };

    const [updateResult] = await connection.query(
      `UPDATE charging_stations
          SET status = 'CANCELLED', sub_status = NULL,
              manual_cancelled_at = NOW(), manual_cancelled_by = ?, manual_cancel_snapshot = ?
        WHERE id = ? AND status = ? AND manual_cancelled_at IS NULL`,
      [user.id, JSON.stringify(snapshot), stationId, current.status]
    );
    if (updateResult.affectedRows !== 1) throw err('ON trạm vừa được thay đổi; hãy tải lại danh sách', 409);

    proposalTransition = await require('./proposalLifecycle').transitionOnStation(
      connection,
      current.proposal_id,
      'ARCHIVED',
      { actorId: user.id, actorRole: user.role, ip: ctx.ip, stationCode: current.ma_tram, reason: ctx.reason }
    );
    await writeActivity(connection, {
      chargingStationId: stationId,
      action: 'manual_cancelled',
      fromStatus: current.status,
      toStatus: 'CANCELLED',
      changedFields: {
        status: { label: 'Trạng thái ON trạm', old: current.status, new: 'CANCELLED' },
        sub_status: { label: 'Trạng thái phụ', old: current.sub_status || '', new: '' }
      },
      reason: ctx.reason || 'Hủy ON trạm; đề xuất được chuyển sang Đã lưu trữ',
      actorId: user.id,
      actorRole: user.role,
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

  await require('./proposalLifecycle').completeOnStationTransition(proposalTransition);
  return getChargingStationDetail(stationId, user);
};

const restoreOnStation = async (id, user, ctx = {}) => {
  await resolveOnStationStatusManager(user);
  const stationId = normalizeId(id, 'Mã bản ghi');
  await assertCanViewChargingStation(stationId, user);
  const connection = await pool.getConnection();
  let transactionStarted = false;
  let proposalTransition = null;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const current = await loadOnStationStatusRow(connection, stationId);
    if (!current) throw err('Không tìm thấy bản ghi ON trạm', 404);
    if (current.status !== 'CANCELLED' || !current.manual_cancelled_at || !current.manual_cancel_snapshot) {
      throw err('Chỉ có thể khôi phục ON trạm đã được hủy thủ công', 409);
    }

    const snapshot = parseJson(current.manual_cancel_snapshot);
    const restoredStatus = String(snapshot.charging_status || '');
    const restoredSubStatus = snapshot.charging_sub_status || null;
    if (!Object.hasOwn(SUB_STATUS_BY_STATUS, restoredStatus)
      || (restoredSubStatus && !(SUB_STATUS_BY_STATUS[restoredStatus] || []).includes(restoredSubStatus))) {
      throw err('Không tìm thấy trạng thái ON trạm hợp lệ để khôi phục', 409);
    }

    proposalTransition = await require('./proposalLifecycle').transitionOnStation(
      connection,
      current.proposal_id,
      snapshot.proposal_status,
      { snapshot, actorId: user.id, actorRole: user.role, ip: ctx.ip, stationCode: current.ma_tram }
    );
    const [updateResult] = await connection.query(
      `UPDATE charging_stations
          SET status = ?, sub_status = ?, manual_cancelled_at = NULL,
              manual_cancelled_by = NULL, manual_cancel_snapshot = NULL
        WHERE id = ? AND status = 'CANCELLED' AND manual_cancelled_at IS NOT NULL`,
      [restoredStatus, restoredSubStatus, stationId]
    );
    if (updateResult.affectedRows !== 1) throw err('ON trạm vừa được thay đổi; hãy tải lại danh sách', 409);

    await writeActivity(connection, {
      chargingStationId: stationId,
      action: 'manual_restored',
      fromStatus: 'CANCELLED',
      toStatus: restoredStatus,
      changedFields: {
        status: { label: 'Trạng thái ON trạm', old: 'CANCELLED', new: restoredStatus },
        sub_status: { label: 'Trạng thái phụ', old: '', new: restoredSubStatus || '' }
      },
      reason: 'Khôi phục ON trạm và trạng thái đề xuất trước khi hủy',
      actorId: user.id,
      actorRole: user.role,
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

  await require('./proposalLifecycle').completeOnStationTransition(proposalTransition);
  return getChargingStationDetail(stationId, user);
};

const createChargingStationFromProposal = async (proposalId, { actorId = null, actorRole = null, source = 'user', ip = null, reason = null } = {}, requireSignedFile = true) => {
  const id = normalizeId(proposalId, 'Mã đề xuất');
  const [rows] = await pool.query(
    'SELECT id, signed_file_id, pending_station_code, custom_data FROM station_proposals WHERE id = ?',
    [id]
  );
  if (rows.length === 0) throw err('Không tìm thấy đề xuất', 404);
  const proposal = rows[0];
  if (requireSignedFile && !proposal.signed_file_id) throw err('Đề xuất chưa có file đã ký', 400);

  const existing = await findByProposal(id);
  if (existing) return { record: existing, created: false };

  let maTram = toText(proposal.pending_station_code).trim() || null;
  if (!maTram) {
    const maTinh = toText(parseJson(proposal.custom_data).ma_tinh).trim();
    if (maTinh) maTram = await stationCodeService.ensureFreshCode(maTinh);
  }

  let insertId;
  const investmentModel = readiness.normalizeInvestmentModel(parseJson(proposal.custom_data).mo_hinh_dau_tu);
  const requirements = readiness.getFinanceRequirements(investmentModel);
  const initialDeposit = requirements.requiresDeposit ? 'NOT_RECEIVED' : 'NOT_REQUIRED';
  const initialPayment = requirements.requiresPayment ? 'NOT' : 'NOT_REQUIRED';
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const deadline = await require('./businessDeadlineService').createDeadline({ days: 15 });
    const [result] = await connection.query(
      `INSERT INTO charging_stations
        (ma_tram, proposal_id, status, sub_status, contract_status, infra_power_status, infra_site_status,
         payment_status, deposit_status, contract_deadline_at, infra_deadline_at, finance_deadline_at, countdown_calendar_id)
       VALUES (?, ?, ?, NULL, 'NOT', 'NOT', 'NOT', ?, ?,
         ?, ?, ?, ?)`,
      [maTram, id, STATUS.ONBOARDING, initialPayment, initialDeposit,
        deadline.date, deadline.date,
        requirements.requiresDeposit || requirements.requiresPayment ? deadline.date : null, deadline.calendarId]
    );
    insertId = result.insertId;
    await connection.query('SAVEPOINT commitment_snapshot');
    try {
      await require('./chargingStationShippingService').ensureCommitments(connection, insertId);
    } catch (snapshotError) {
      if (snapshotError.statusCode !== 409) throw snapshotError;
      await connection.query('ROLLBACK TO SAVEPOINT commitment_snapshot');
      await connection.query('UPDATE charging_stations SET fulfillment_review_required=1 WHERE id=?', [insertId]);
      await writeActivity(connection, {
        chargingStationId: insertId, action: 'fulfillment_review_required',
        reason: snapshotError.message, actorId, actorRole, source, ip
      });
      console.error('[ChargingStation] Cần đối soát trụ chốt:', insertId, snapshotError.message);
    }
    await writeActivity(connection, {
      chargingStationId: insertId,
      action: 'created',
      toStatus: STATUS.ONBOARDING,
      reason,
      changedFields: {
        proposal_id: { label: FIELD_LABELS.proposal_id, old: '', new: String(id) },
        ma_tram: { label: FIELD_LABELS.ma_tram, old: '', new: toText(maTram) }
      },
      actorId, actorRole, source, ip
    });
    await notifyStationCreated(connection, { id: insertId, ma_tram: maTram }, { actorId }, requirements);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      const duplicated = await findByProposal(id);
      if (duplicated) return { record: duplicated, created: false };
    }
    throw error;
  } finally {
    connection.release();
  }

  return { record: await getRecord(insertId), created: true };
};

const createFromApprovedProposal = async (proposalId, opts = {}) => (
  createChargingStationFromProposal(proposalId, opts, true)
);

const createDirectFromProposal = async (proposalId, user, { reason } = {}, ctx = {}) => {
  if (user?.role !== 'SUPER_ADMIN') throw err('Chỉ SUPER_ADMIN được chuyển trực tiếp đề xuất sang ON trạm', 403);
  const cleanReason = String(reason || '').trim();
  if (cleanReason.length < 3 || cleanReason.length > 5000) {
    throw err('Vui lòng nhập lý do chuyển trực tiếp ON trạm (3–5000 ký tự)', 400);
  }

  const id = normalizeId(proposalId, 'Mã đề xuất');
  const [rows] = await pool.query('SELECT id, status FROM station_proposals WHERE id = ?', [id]);
  if (rows.length === 0) throw err('Không tìm thấy đề xuất', 404);
  if (['CANCELLED', 'ARCHIVED', 'PAUSED', 'ACTIVE'].includes(rows[0].status)) {
    throw err(`Không thể chuyển đề xuất từ trạng thái "${rows[0].status}" sang ON trạm`, 409);
  }

  if (rows[0].status !== 'DEPLOYING') {
    await require('./proposalLifecycle').transition(id, 'DEPLOYING', {
      reason: cleanReason,
      actorId: user.id,
      actorRole: user.role,
      source: 'user',
      isSuperAdmin: true,
      directOnStation: true,
      ip: ctx.ip || null
    });
  }

  try {
    const result = await createChargingStationFromProposal(id, {
      actorId: user.id,
      actorRole: user.role,
      source: 'admin_override',
      ip: ctx.ip || null,
      reason: cleanReason
    }, false);
    return { ...result, proposal_status: 'DEPLOYING' };
  } catch (error) {
    throw err(`Đề xuất đã chuyển sang Đang triển khai nhưng chưa tạo được ON trạm. Có thể thử lại. ${error.message}`, error.statusCode || 500);
  }
};

const updateChargingStation = (id, body = {}, ctx = {}) => require('./chargingStationOverrideService').update(id, body, ctx);

const updatePaymentStatus = async (id, { payment_status: nextStatus, reason } = {}, user, ctx = {}) => {
  await assertFinanceManager(user, 'Chỉ Phòng Tài chính, Back Office hoặc quản trị viên được cập nhật trạng thái tài chính');
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
              infra_site_status, payment_status, deposit_status
         FROM charging_stations
        WHERE id = ? FOR UPDATE`,
      [stationId]
    );
    if (!rows.length) throw err('Không tìm thấy bản ghi ON trạm', 404);
    current = rows[0];
    proposalId = current.proposal_id;

    if (current.payment_status === 'NOT_REQUIRED') {
      throw err('Mô hình Tự đầu tư không yêu cầu thanh toán', 400);
    }

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

      if (nextStatus === 'DONE' || current.payment_status === 'NOT') {
        if (!readiness.isDepositReceived(current.deposit_status)) {
          throw err('Chưa có đặt cọc. Vui lòng tạo hóa đơn cọc trước rồi mới cập nhật thanh toán', 409);
        }
        const [invoices] = await connection.query(
          `SELECT id
             FROM charging_station_invoices
            WHERE charging_station_id = ?
              AND invoice_type = 'PAYMENT'
            LIMIT 1`,
          [stationId]
        );
        if (!invoices.length) {
          throw err('Cần ghi nhận ít nhất một hóa đơn thanh toán trước khi cập nhật trạng thái thanh toán', 409);
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
    if (current.status === 'CANCELLED' || current.contract_status !== 'NOT') {
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

const completeContract = async (id, body, user, ctx = {}) => {
  await assertBackOfficeManager(user);
  const stationId = normalizeId(id, 'Mã bản ghi');
  if (!Array.isArray(body.file_ids) || !body.file_ids.length) {
    throw err('Vui lòng chọn ít nhất một file hợp đồng', 400);
  }
  const fileIds = [...new Set(body.file_ids.map(value => normalizeId(value, 'File hợp đồng')))];
  const contractDates = {};
  for (const key of ['contract_effective_date', 'contract_expiry_date']) {
    const value = body[key];
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
      || !normalizeDate(value) || new Date(value).toISOString().slice(0, 10) !== value) {
      throw err(`${FIELD_LABELS[key]} không hợp lệ (YYYY-MM-DD)`, 400);
    }
    contractDates[key] = value;
  }
  if (contractDates.contract_expiry_date <= contractDates.contract_effective_date) {
    throw err('Ngày hết hạn hợp đồng phải sau ngày hiệu lực hợp đồng', 400);
  }
  if (body.contract_note != null && typeof body.contract_note !== 'string') {
    throw err('Ghi chú hợp đồng phải là văn bản', 400);
  }
  const contractNote = (body.contract_note || '').trim();
  if (Buffer.byteLength(contractNote, 'utf8') > 65535) throw err('Ghi chú hợp đồng quá dài', 400);
  const normalizedFileId = fileIds[0];
  await assertCanViewChargingStation(stationId, user);
  const connection = await pool.getConnection();
  let transactionStarted = false;
  let proposalId;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query(
      `SELECT id, proposal_id, ma_tram, status, contract_status, contract_file_id, infra_power_status,
              infra_site_status, payment_status, contract_effective_date, contract_expiry_date, contract_note
         FROM charging_stations
        WHERE id = ? FOR UPDATE`,
      [stationId]
    );
    if (!rows.length) throw err('Không tìm thấy bản ghi ON trạm', 404);
    const current = rows[0];
    proposalId = current.proposal_id;
    if (current.status === 'CANCELLED' || current.contract_status !== 'DOING') {
      throw err('Chỉ có thể hoàn tất hợp đồng khi đang ở trạng thái Đang ký hợp đồng', 400);
    }

    const [files] = await connection.query(
      "SELECT id, mime_type, uploaded_by, status FROM files WHERE id IN (?) AND status <> 'deleted' FOR UPDATE",
      [fileIds]
    );
    if (files.length !== fileIds.length) throw err('Không tìm thấy file hợp đồng', 400);
    for (const file of files) {
      if (Number(file.uploaded_by) !== Number(user.id)) {
        throw err('Chỉ được gắn file do chính bạn tải lên', 403);
      }
      if (!CONTRACT_FILE_MIME_TYPES.includes(String(file.mime_type || '').toLowerCase())) {
        throw err('File hợp đồng phải có định dạng PDF hoặc DOCX', 400);
      }
    }

    await connection.query(
      `UPDATE charging_stations SET contract_status = 'DONE', contract_file_id = ?,
       contract_effective_date = ?, contract_expiry_date = ?, contract_note = ?,
       payment_status=CASE WHEN payment_status='NOT' THEN 'DOING' ELSE payment_status END WHERE id = ?`,
      [normalizedFileId, contractDates.contract_effective_date, contractDates.contract_expiry_date, contractNote || null, stationId]
    );
    await connection.query('DELETE FROM charging_station_contract_files WHERE charging_station_id = ?', [stationId]);
    await connection.query(
      'INSERT INTO charging_station_contract_files (charging_station_id, file_id, sort_order) VALUES ?',
      [fileIds.map((fileId, index) => [stationId, fileId, index])]
    );
    const contractChanges = {
      contract_status: { label: FIELD_LABELS.contract_status, old: 'DOING', new: 'DONE' },
      contract_file_id: {
        label: FIELD_LABELS.contract_file_id,
        old: current.contract_file_id ? String(current.contract_file_id) : '',
        new: String(normalizedFileId)
      }
    };
    contractChanges.contract_files = { label: FIELD_LABELS.contract_files, old: '', new: fileIds.join(', ') };
    for (const [key, value] of Object.entries({ ...contractDates, contract_note: contractNote })) {
      contractChanges[key] = { label: FIELD_LABELS[key], old: toText(current[key]), new: value };
    }
    if (current.payment_status === 'NOT') {
      contractChanges.payment_status = { label: FIELD_LABELS.payment_status, old: 'NOT', new: 'DOING' };
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
      contract_file_id: normalizedFileId
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
  // CRM outbound: notify contract signed
  try {
    const [propRows] = await pool.query('SELECT journey_id, custom_data FROM station_proposals WHERE id = ?', [proposalId]);
    const prop = propRows[0];
    if (prop && prop.journey_id) {
      const [leadRows] = await pool.query('SELECT id, external_crm_id FROM leads WHERE journey_id = ? LIMIT 1', [prop.journey_id]);
      const lead = leadRows[0];
      if (lead && lead.external_crm_id) {
        let value = null;
        try { value = prop.custom_data ? JSON.parse(prop.custom_data).tong_gia_tri_chot : null; } catch { value = null; }
        const crmOutboundService = require('./crmOutboundService');
        const crmStatusMapping = require('../integrations/crm/crmStatusMapping');
        await crmOutboundService.enqueue({
          eventId: `eg_${lead.id}_contract_${proposalId}`,
          eventType: 'lead.result',
          leadId: lead.id,
          crmLeadId: lead.external_crm_id,
          payload: { leadId: lead.external_crm_id, status: 'won', value, note: crmStatusMapping.MILESTONE_NOTES.contractSigned, ref: `EG-${lead.id}` }
        });
      }
    }
  } catch { /* silent */ }
  return getChargingStationDetail(stationId, user);
};

const updateInfrastructureStatus = async (id, type, action, user, ctx = {}) => {
  await assertBackOfficeManager(user);
  const field = INFRA_FIELD_BY_TYPE[type];
  if (!field) throw err('Loại hạ tầng không hợp lệ', 400);
  const isStatusUpdate = action !== null && typeof action === 'object';
  if (!isStatusUpdate && !['start', 'complete'].includes(action)) throw err('Thao tác hạ tầng không hợp lệ', 400);
  const body = isStatusUpdate ? action : {
    status: action === 'start' ? 'DOING' : 'DONE',
    date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
  };
  const statuses = ['NOT', 'DOING', 'DONE'];
  if (!statuses.includes(body.status)) throw err('Trạng thái hạ tầng không hợp lệ', 400);
  if (isStatusUpdate && !statuses.includes(body.expected_status)) throw err('Thiếu trạng thái hạ tầng hiện tại', 400);
  if (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)
    || !normalizeDate(body.date) || new Date(body.date).toISOString().slice(0, 10) !== body.date) {
    throw err('Ngày thực hiện không hợp lệ (YYYY-MM-DD)', 400);
  }
  if (body.note != null && typeof body.note !== 'string') throw err('Ghi chú phải là văn bản', 400);
  const note = (body.note || '').trim();
  if (Buffer.byteLength(note, 'utf8') > 65535) throw err('Ghi chú quá dài', 400);
  const dateField = `infra_${type}_date`;
  const noteField = `infra_${type}_note`;
  const next = body.status;

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
    if (current.status === 'CANCELLED') {
      throw err('Không thể cập nhật hạ tầng của trạm đã hủy', 400);
    }

    if (isStatusUpdate && current[field] !== body.expected_status) {
      throw err('Trạng thái hạ tầng đã thay đổi. Vui lòng tải lại danh sách', 409);
    }
    if (user.role !== 'SUPER_ADMIN' && statuses.indexOf(next) !== statuses.indexOf(current[field]) + 1) {
      throw err('Chỉ được chuyển tuần tự Chưa làm → Đang làm → Đã làm', 400);
    }
    if (!isStatusUpdate && current[field] !== (action === 'start' ? 'NOT' : 'DOING')) {
      throw err('Trạng thái hạ tầng hiện tại không cho phép thao tác này', 400);
    }

    await connection.query(
      `UPDATE charging_stations SET ${field} = ?, ${dateField} = ?, ${noteField} = ? WHERE id = ?`,
      [next, body.date, note || null, stationId]
    );
    await writeActivity(connection, {
      chargingStationId: stationId,
      action: 'infrastructure_status_changed',
      changedFields: {
        [field]: { label: FIELD_LABELS[field], old: current[field] || 'NOT', new: next },
        [dateField]: { label: FIELD_LABELS[dateField], old: normalizeDate(current[dateField]), new: body.date },
        [noteField]: { label: FIELD_LABELS[noteField], old: current[noteField] || '', new: note }
      },
      actorId: ctx.actorId,
      actorRole: ctx.actorRole,
      source: isStatusUpdate && user.role === 'SUPER_ADMIN' && statuses.indexOf(next) !== statuses.indexOf(current[field]) + 1
        ? 'admin_override' : 'user',
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
  if (next === 'DONE') await advanceProposalToDeploying(proposalId, ctx);
  return getChargingStationDetail(stationId, user);
};

const extendOnboardingDeadline = async (id, { reason } = {}, user, ctx = {}) => {
  if (user?.role === 'ADMIN') throw err('ADMIN chỉ được xem ON trạm', 403);
  const stationId = normalizeId(id, 'Mã bản ghi');
  const cleanReason = toText(reason).trim();
  if (!cleanReason) throw err('Vui lòng nhập lý do gia hạn', 400);

  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query(
      `SELECT cs.*, p.user_id AS proposal_user_id,
              JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.mo_hinh_dau_tu')) AS mo_hinh_dau_tu
         FROM charging_stations cs
         JOIN station_proposals p ON p.id = cs.proposal_id
        WHERE cs.id = ?
        FOR UPDATE`,
      [stationId]
    );
    if (!rows.length) throw err('Không tìm thấy bản ghi ON trạm', 404);
    const current = rows[0];
    if (!await require('./proposalAccessService').canActAsProposalOwner(user, { user_id: current.proposal_user_id })) {
      throw err('Chỉ người đề xuất, cấp trên trong nhánh hoặc quản trị viên được gia hạn', 403);
    }
    if (!readiness.isDeadlineActive(current)) {
      if (current.status === STATUS.OPERATING) {
        throw err('Trạm đang hoạt động không còn áp dụng deadline hợp đồng, hạ tầng và tài chính', 400);
      }
      throw err('Trạm không còn đếm hạn 15 ngày (đã có hạng mục hoàn thành, đã giao trụ hoặc đã hủy)', 400);
    }
    if (!current.contract_deadline_at || new Date(current.contract_deadline_at).getTime() <= Date.now()) {
      throw err('Đã quá hạn, không thể gia hạn', 400);
    }
    const used = Number(current.deadline_extension_count || 0);
    if (used >= readiness.MAX_DEADLINE_EXTENSIONS) {
      throw err(`Đã dùng hết ${readiness.MAX_DEADLINE_EXTENSIONS} lượt gia hạn`, 400);
    }

    const days = readiness.DEADLINE_EXTENSION_DAYS;
    const businessDeadlines = require('./businessDeadlineService');
    const contract = await businessDeadlines.extendDeadline(
      current.contract_deadline_at, { days }, current.countdown_calendar_id, connection
    );
    const infra = await businessDeadlines.extendDeadline(
      current.infra_deadline_at, { days }, current.countdown_calendar_id, connection
    );
    const finance = await businessDeadlines.extendDeadline(
      current.finance_deadline_at, { days }, current.countdown_calendar_id, connection
    );
    await connection.query(
      `UPDATE charging_stations
          SET contract_deadline_at = ?,
              infra_deadline_at = ?,
              finance_deadline_at = ?,
              deadline_extension_count = deadline_extension_count + 1
        WHERE id = ?`,
      [contract, infra, finance, stationId]
    );
    await writeActivity(connection, {
      chargingStationId: stationId,
      action: 'deadline_extended',
      changedFields: {
        deadline_extension_count: { label: 'Số lần gia hạn', old: String(used), new: String(used + 1) },
        extended_days: { label: 'Số ngày gia hạn', old: '', new: String(days) }
      },
      reason: cleanReason,
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

// Quá hạn (kể cả gia hạn) mà chưa có mục nào hoàn thành: hủy ON trạm và đề xuất.
const cancelOverdueStations = async () => {
  const [rows] = await pool.query(
    `SELECT cs.id, cs.proposal_id, cs.ma_tram, cs.status, cs.contract_status,
            cs.infra_power_status, cs.infra_site_status, cs.deposit_status, cs.payment_status,
            cs.contract_deadline_at, cs.deadline_extension_count, p.user_id AS owner_id
       FROM charging_stations cs
       JOIN station_proposals p ON p.id = cs.proposal_id
       WHERE ${readiness.deadlineActiveSql('cs', 'p')}
         AND cs.contract_deadline_at IS NOT NULL
         AND cs.contract_deadline_at <= NOW()`
  );
  let cancelled = 0;
  for (const station of rows) {
    const connection = await pool.getConnection();
    let transactionStarted = false;
    try {
      await connection.beginTransaction();
      transactionStarted = true;
      const [result] = await connection.query(
        `UPDATE charging_stations cs
           JOIN station_proposals p ON p.id = cs.proposal_id
            SET cs.status = 'CANCELLED', cs.sub_status = NULL
          WHERE cs.id = ? AND ${readiness.deadlineActiveSql('cs', 'p')}`,
        [station.id]
      );
      if (result.affectedRows !== 1) {
        await connection.rollback();
        transactionStarted = false;
        continue;
      }
      await writeActivity(connection, {
        chargingStationId: station.id,
        action: 'auto_cancelled',
        fromStatus: STATUS.ONBOARDING,
        toStatus: 'CANCELLED',
        reason: 'Quá hạn 15 ngày (đã gồm gia hạn) nhưng chưa hoàn thành hợp đồng, hạ tầng hoặc tài chính',
        actorId: null,
        actorRole: null,
        source: 'system_auto'
      });
      await connection.commit();
      transactionStarted = false;
    } catch (error) {
      if (transactionStarted) await connection.rollback();
      console.error(`[ChargingStation] Không hủy được trạm #${station.id} quá hạn:`, error.message);
      continue;
    } finally {
      connection.release();
    }

    const reason = `Trạm ${station.ma_tram || `#${station.id}`} quá hạn 15 ngày (đã dùng ${Number(station.deadline_extension_count || 0)}/${readiness.MAX_DEADLINE_EXTENSIONS} lượt gia hạn) mà chưa hoàn thành hợp đồng, hạ tầng hoặc tài chính`;
    try {
      await require('./proposalLifecycle').transition(station.proposal_id, 'CANCELLED', {
        reason,
        actorId: null,
        actorRole: null,
        source: 'system_auto'
      });
    } catch (error) {
      console.error(`[ChargingStation] Không hủy được đề xuất ${station.proposal_id} sau khi hủy trạm #${station.id}:`, error.message);
    }
    try {
      const proposalReportService = require('./proposalReportService');
      const backOffice = await getUsersByDepartment(pool, proposalReportService.isBackOffice);
      const recipients = [...backOffice, ...(station.owner_id ? [{ id: station.owner_id }] : [])];
      await insertNotifications(pool, recipients, {
        type: 'CHARGING_STATION_AUTO_CANCELLED',
        title: 'ON trạm và đề xuất đã bị hủy do quá hạn',
        message: reason,
        stationId: station.id,
        actorId: null
      });
    } catch (error) {
      console.error('[ChargingStation] Không gửi được thông báo hủy quá hạn:', error.message);
    }
    cancelled += 1;
  }
  return cancelled;
};

const requestEarlyDelivery = async (id, { desired_delivery_date: desiredDate, reason, accept_missing: acceptMissing } = {}, user, ctx = {}) => {
  const stationId = normalizeId(id, 'Mã bản ghi');
  const cleanReason = toText(reason).trim();
  const deliveryDate = normalizeDate(desiredDate);
  if (!cleanReason) throw err('Vui lòng nhập lý do đề xuất giao trụ sớm', 400);
  if (acceptMissing !== true) throw err('Phải xác nhận cảnh báo các điều kiện chưa hoàn thành', 400);
  if (!(await stationAccess.permissions(user)).request_early) throw err('Không có quyền đề xuất giao trụ sớm', 403);
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
      `SELECT cs.*, p.chot_so_luong_tru, p.user_id AS proposal_user_id,
              JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.mo_hinh_dau_tu')) AS mo_hinh_dau_tu
         FROM charging_stations cs
         JOIN station_proposals p ON p.id = cs.proposal_id
        WHERE cs.id = ?
        FOR UPDATE`,
      [stationId]
    );
    if (!rows.length) throw err('Không tìm thấy bản ghi ON trạm', 404);
    const current = rows[0];
    if (!await require('./proposalAccessService').canActAsProposalOwner(user, { user_id: current.proposal_user_id })) {
      throw err('Thao tác đề xuất giao trụ sớm dành cho người đề xuất và người quản lý phía trên', 403);
    }
    if (current.status !== STATUS.ONBOARDING) {
      throw err('Chỉ có thể đề xuất giao trụ sớm khi trạm đang hoàn thiện thủ tục', 400);
    }

    const shipping = require('./chargingStationShippingService');
    await shipping.ensureCommitments(connection, stationId);
    const summary = await shipping.getSummary(stationId, connection);
    if (!summary.shipping_options.length) {
      throw err('Không còn số trụ phải giao hoặc không có tồn kho phù hợp', 409);
    }

    const { missingLabels: missingItems } = readiness.evaluateDeliveryReadiness(current, current.mo_hinh_dau_tu);

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

const confirmDelivery = async (id, user, ctx = {}) => {
  await assertBackOfficeManager(user);
  throw err('Hãy xác nhận nhận hàng trên từng phiếu và số lượng cụ thể', 409);
};

const updateInstallation = async (id, action, user, ctx = {}) => {
  await assertSetupOperationsManager(user);
  await assertLegacyStationAction(id);
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
  await assertLegacyStationAction(id);
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
    const nextStatus = result === 'ACCEPT_PASSED' ? STATUS.CONFIGURING : STATUS.ACCEPTANCE;
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
      to: STATUS.CONFIGURING,
      actorId: ctx.actorId,
      actorRole: ctx.actorRole,
      source: 'user',
      ip: ctx.ip
    });
  }
  return getChargingStationDetail(stationId, user);
};

const markOnStationActive = async (id, { cms_station_code: cmsStationCode, on_date: onDate, reason, expected_token: expectedToken } = {}, user, ctx = {}) => {
  if (user?.role !== 'SUPER_ADMIN') throw err('Chỉ SUPER_ADMIN được đánh dấu ON trạm trực tiếp', 403);
  const cleanReason = String(reason || '').trim();
  if (cleanReason.length < 3 || cleanReason.length > 5000) {
    throw err('Vui lòng nhập lý do đánh dấu ON trạm (3–5000 ký tự)', 400);
  }

  const stationId = normalizeId(id, 'Mã bản ghi');
  const connection = await pool.getConnection();
  let transactionStarted = false;
  let proposalTransition = null;
  let fromStationStatus = null;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query(
      `SELECT cs.*, DATE_FORMAT(cs.on_date, '%Y-%m-%d') AS current_on_date,
              p.status AS proposal_status
         FROM charging_stations cs
         JOIN station_proposals p ON p.id = cs.proposal_id
        WHERE cs.id = ?
        FOR UPDATE`,
      [stationId]
    );
    if (!rows.length) throw err('Không tìm thấy bản ghi ON trạm', 404);
    const current = rows[0];
    await require('./chargingStationOverrideService').assertToken(stationId, expectedToken, connection);
    fromStationStatus = current.status;

    if (current.status === 'CANCELLED' || ['CANCELLED', 'ARCHIVED', 'PAUSED'].includes(current.proposal_status)) {
      throw err('Không thể đánh dấu ON trạm cho bản ghi đã hủy, lưu trữ hoặc tạm dừng', 409);
    }
    if (!['APPROVED', 'CONTRACT_SIGNED', 'DEPLOYING', 'ACTIVE'].includes(current.proposal_status)) {
      throw err(`Đề xuất đang ở trạng thái "${current.proposal_status}" nên không thể chuyển sang Hoạt động`, 409);
    }
    if (
      current.status === STATUS.OPERATING
      && current.sub_status === 'ACTIVE'
      && current.proposal_status === 'ACTIVE'
      && current.workflow_override
    ) {
      await connection.commit();
      transactionStarted = false;
      return getChargingStationDetail(stationId, user);
    }

    const cleanCmsCode = toText(cmsStationCode).trim() || toText(current.cms_station_code).trim();
    if (!cleanCmsCode) throw err('Mã trạm trên CMS là bắt buộc', 400);
    if (cleanCmsCode.length > 100) throw err('Mã CMS tối đa 100 ký tự', 400);
    const normalizedOnDate = require('./chargingStationOverrideService').dateOf(onDate);
    if (!normalizedOnDate) throw err('Ngày ON trạm là bắt buộc', 400);
    const override = JSON.stringify({
      completed: true, actor_id: user.id, at: new Date().toISOString(), reason: cleanReason,
      previous: { status: current.status, sub_status: current.sub_status,
        contract_status: current.contract_status, infra_power_status: current.infra_power_status,
        infra_site_status: current.infra_site_status, workflow_override: parseJson(current.workflow_override) }
    });

    await connection.query(
      `UPDATE charging_stations
          SET cms_station_code = ?, on_date = ?, status = 'OPERATING', sub_status = 'ACTIVE',
              contract_status='DONE', infra_power_status='DONE', infra_site_status='DONE', workflow_override=?
        WHERE id = ?`,
      [cleanCmsCode, normalizedOnDate, override, stationId]
    );

    const changedFields = {
      status: { label: FIELD_LABELS.status, old: current.status, new: STATUS.OPERATING },
      sub_status: { label: FIELD_LABELS.sub_status, old: current.sub_status || '', new: 'ACTIVE' },
      cms_station_code: { label: FIELD_LABELS.cms_station_code, old: current.cms_station_code || '', new: cleanCmsCode },
      on_date: { label: FIELD_LABELS.on_date, old: current.current_on_date || '', new: normalizedOnDate },
      contract_status: { label: FIELD_LABELS.contract_status, old: current.contract_status, new: 'DONE' },
      infra_power_status: { label: FIELD_LABELS.infra_power_status, old: current.infra_power_status, new: 'DONE' },
      infra_site_status: { label: FIELD_LABELS.infra_site_status, old: current.infra_site_status, new: 'DONE' },
      workflow_override: { label: 'Hoàn tất bằng ghi đè (không đổi kho/tài chính)', old: current.workflow_override, new: JSON.parse(override) }
    };
    await writeActivity(connection, {
      chargingStationId: stationId,
      action: 'manual_marked_active',
      fromStatus: current.status,
      toStatus: STATUS.OPERATING,
      changedFields,
      reason: cleanReason,
      actorId: user.id,
      actorRole: user.role,
      source: 'admin_override',
      ip: ctx.ip
    });

    if (current.proposal_status !== 'ACTIVE') {
      proposalTransition = await require('./proposalLifecycle').transitionOnStation(
        connection,
        current.proposal_id,
        'ACTIVE',
        {
          directActivation: true,
          reason: cleanReason,
          actorId: user.id,
          actorRole: user.role,
          ip: ctx.ip
        }
      );
    }


    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  if (proposalTransition) await require('./proposalLifecycle').completeOnStationTransition(proposalTransition);
  await require('./journeySyncService').onStationStatus(stationId, {
    from: fromStationStatus,
    to: 'ACTIVE',
    actorId: user.id,
    actorRole: user.role,
    source: 'admin_override',
    ip: ctx.ip
  });
  // CRM outbound: notify station ON
  try {
    const [propRows] = await pool.query('SELECT journey_id, custom_data FROM station_proposals WHERE id = ?', [current.proposal_id]);
    const prop = propRows[0];
    if (prop && prop.journey_id) {
      const [leadRows] = await pool.query('SELECT id, external_crm_id FROM leads WHERE journey_id = ? LIMIT 1', [prop.journey_id]);
      const lead = leadRows[0];
      if (lead && lead.external_crm_id) {
        const crmOutboundService = require('./crmOutboundService');
        const crmStatusMapping = require('../integrations/crm/crmStatusMapping');
        let value = null;
        try { value = prop.custom_data ? JSON.parse(prop.custom_data).tong_gia_tri_chot : null; } catch { value = null; }
        await crmOutboundService.enqueue({
          eventId: `eg_${lead.id}_on_${stationId}`,
          eventType: 'lead.result',
          leadId: lead.id,
          crmLeadId: lead.external_crm_id,
          payload: { leadId: lead.external_crm_id, status: 'won', value, note: crmStatusMapping.MILESTONE_NOTES.stationOn, ref: `EG-${lead.id}` }
        });
      }
    }
  } catch { /* silent */ }
  return getChargingStationDetail(stationId, user);
};

const completeConfiguration = async (id, { cms_station_code: cmsStationCode, on_date: onDate } = {}, user, ctx = {}) => {
  await assertSetupOperationsManager(user);
  await assertLegacyStationAction(id);
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
  if (preflight.status !== STATUS.CONFIGURING) {
    throw err('Chỉ có thể hoàn tất cấu hình khi trạm đang ở trạng thái Đang cấu hình', 400);
  }
  if (!['APPROVED', 'CONTRACT_SIGNED', 'DEPLOYING', 'ACTIVE'].includes(preflight.proposal_status)) {
    throw err('Đề xuất liên quan chưa được duyệt BCĐX nên chưa thể chuyển sang Hoạt động', 409);
  }

  await advanceProposalToDeploying(preflight.proposal_id, ctx);
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
    if (current.status !== STATUS.CONFIGURING) {
      throw err('Trạng thái trạm vừa được thay đổi; hãy tải lại trang', 409);
    }
    if (current.proposal_status !== 'ACTIVE') {
      throw err('Đề xuất chưa được chuyển sang Hoạt động; hãy thử lại thao tác', 409);
    }

    await connection.query(
      `UPDATE charging_stations
          SET cms_station_code = ?, on_date = ?, status = 'OPERATING', sub_status = 'ACTIVE'
        WHERE id = ?`,
      [cleanCmsCode, normalizedOnDate, stationId]
    );
    const changedFields = {
      status: { label: FIELD_LABELS.status, old: current.status, new: STATUS.OPERATING },
      sub_status: { label: FIELD_LABELS.sub_status, old: current.sub_status, new: 'ACTIVE' },
      cms_station_code: {
        label: FIELD_LABELS.cms_station_code,
        old: current.cms_station_code || '',
        new: cleanCmsCode
      },
      on_date: { label: FIELD_LABELS.on_date, old: current.on_date || '', new: normalizedOnDate }
    };
    await writeActivity(connection, {
      chargingStationId: stationId,
      action: 'configuration_completed',
      fromStatus: current.status,
      toStatus: STATUS.OPERATING,
      changedFields,
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

const changeStatus = async (id, body = {}, ctx = {}) => {
  const { to_status: toStatus, sub_status: subStatus, reason } = body;
  if (ctx.actorRole !== 'SUPER_ADMIN') throw err('Chỉ SUPER_ADMIN được điều chỉnh trạng thái trực tiếp', 403);
  const overrides = require('./chargingStationOverrideService');
  const cleanReason = overrides.reasonOf(reason);
  if (!body.expected_token) throw err('Thiếu phiên bản dữ liệu; hãy tải lại', 409);
  const actor = { id: ctx.actorId, role: ctx.actorRole };
  if (toStatus === STATUS.OPERATING) return markOnStationActive(id, body, actor, ctx);
  if (toStatus === 'CANCELLED') return cancelOnStation(id, actor, { ...ctx, reason: cleanReason, expectedToken: body.expected_token });
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
    await overrides.assertToken(stationId, body.expected_token, connection);
    if (current.status === 'CANCELLED') throw err('Hãy khôi phục ON trạm trước khi điều chỉnh trạng thái', 409);
    if (toStatus === current.status) throw err('Bản ghi đã ở trạng thái này', 400);
    const backward = isBackward(current.status, toStatus);

    let nextSub = null;
    if (subStatus !== undefined && subStatus !== null && subStatus !== '') {
      nextSub = validateSubStatus(toStatus, subStatus);
    } else if (backward) {
      nextSub = ROLLBACK_SUB_STATUS[toStatus] || INITIAL_SUB_STATUS[toStatus];
    } else {
      nextSub = INITIAL_SUB_STATUS[toStatus];
    }

    await connection.query(
      'UPDATE charging_stations SET status = ?, sub_status = ?, workflow_override = NULL WHERE id = ?',
      [toStatus, nextSub, current.id]
    );

    await writeActivity(connection, {
      chargingStationId: current.id,
      action: backward ? 'status_rolled_back' : 'status_changed',
      fromStatus: current.status,
      toStatus,
      changedFields: diffFields(current, { status: toStatus, sub_status: nextSub, workflow_override: null }),
      reason: cleanReason || null,
      actorId: ctx.actorId,
      actorRole: ctx.actorRole,
      source: 'admin_override',
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
  return getChargingStationDetail(stationId, { id: ctx.actorId, role: ctx.actorRole });
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

  return getChargingStationDetail(current.id, user);
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

  return getChargingStationDetail(current.id, user);
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

  return getChargingStationDetail(current.id, user);
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

  return getChargingStationDetail(current.id, user);
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
exports.cancelOnStation = cancelOnStation;
exports.restoreOnStation = restoreOnStation;
exports.canViewChargingStation = canViewChargingStation;
exports.createFromApprovedProposal = createFromApprovedProposal;
exports.createDirectFromProposal = createDirectFromProposal;
exports.updateChargingStation = updateChargingStation;
exports.updatePaymentStatus = updatePaymentStatus;
exports.startContractSigning = startContractSigning;
exports.completeContract = completeContract;
exports.updateInfrastructureStatus = updateInfrastructureStatus;
exports.requestEarlyDelivery = requestEarlyDelivery;
exports.createDeliveryExport = (...args) => require('./chargingStationShippingService').createExport(...args);
exports.confirmDelivery = confirmDelivery;
exports.markOnStationActive = markOnStationActive;
exports.updateInstallation = updateInstallation;
exports.updateAcceptanceResult = updateAcceptanceResult;
exports.completeConfiguration = completeConfiguration;
exports.changeStatus = changeStatus;
exports.updateAcceptance = updateAcceptance;
exports.setAcceptanceFile = setAcceptanceFile;
exports.addAcceptanceImages = addAcceptanceImages;
exports.removeAcceptanceImage = removeAcceptanceImage;
exports.findByProposal = findByProposal;
exports.assertFinanceManager = assertFinanceManager;
exports.advanceToDeliveryIfReady = advanceToDeliveryIfReady;
exports.advanceProposalToDeploying = advanceProposalToDeploying;
exports.notifyFinanceTeams = notifyFinanceTeams;
exports.writeActivity = writeActivity;
exports.extendOnboardingDeadline = extendOnboardingDeadline;
exports.cancelOverdueStations = cancelOverdueStations;
exports.FIELD_LABELS = FIELD_LABELS;
const getCommittedExportItems = async (id) => {
  return (await require('./chargingStationShippingService').getSummary(normalizeId(id, 'Mã bản ghi'))).pole_requirements;
};

exports.getCommittedExportItems = getCommittedExportItems;
