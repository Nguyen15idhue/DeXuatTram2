const pool = require('../../utils/db');
const reports = require('../proposal/proposalReportService');
const grading = require('../proposal/proposalGradingService');
const proposalAccess = require('../proposal/proposalAccessService');

const error = (message, statusCode = 403) => Object.assign(new Error(message), { statusCode });
const isSetup = (department) => {
  const text = grading.normalizeText(department);
  return text.includes('setup') && text.includes('van hanh');
};

const permissions = async (user) => {
  if (!user?.id) return { back_office: false, setup: false, finance: false, request_early: false };
  if (user.role === 'SUPER_ADMIN') return { back_office: true, setup: true, finance: true, request_early: true };
  const scope = await reports.resolveScope(user);
  const superAdmin = user?.role === 'SUPER_ADMIN';
  const readOnly = user?.role === 'ADMIN';
  return {
    back_office: superAdmin || scope.isBackOffice,
    setup: superAdmin || isSetup(scope.department),
    finance: superAdmin || (!readOnly && (scope.isFinance || scope.isBackOffice)),
    request_early: !readOnly && (superAdmin || !scope.isBackOffice)
  };
};

const buildInfrastructureOwnerScope = async (user) => {
  if (!user?.id) return { sql: '1 = 0', params: [] };
  if (['SUPER_ADMIN', 'ADMIN', 'SALES', 'NPP'].includes(user.role)) {
    return proposalAccess.buildOwnerScopeSql(user, 'p', { includeTgdGlobal: false });
  }
  return {
    sql: `(p.user_id = ?
      OR CAST(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data,'$.nguoi_phu_trach.id')) AS UNSIGNED) = ?
      OR CAST(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data,'$.sales_quan_ly.id')) AS UNSIGNED) = ?)`,
    params: [Number(user.id), Number(user.id), Number(user.id)]
  };
};

const buildInfrastructureTaskScope = async (user, basePermissions) => {
  const base = basePermissions || await permissions(user);
  if (base.setup) return { sql: '1 = 1', params: [] };
  return buildInfrastructureOwnerScope(user);
};

const recordPermissions = async (id, user, basePermissions) => {
  const base = basePermissions || await permissions(user);
  if (user?.role === 'SUPER_ADMIN') return { ...base, infrastructure: true, infrastructure_task: true };
  const scope = await buildInfrastructureTaskScope(user, base);
  const [rows] = await pool.query(`SELECT (${scope.sql}) AS infrastructure_task
    FROM charging_stations cs JOIN station_proposals p ON p.id=cs.proposal_id WHERE cs.id=?`,
  [...scope.params, Number(id)]);
  const infrastructureTask = Boolean(Number(rows[0]?.infrastructure_task));
  return { ...base, infrastructure: base.back_office || infrastructureTask,
    infrastructure_task: infrastructureTask };
};

const assertInfrastructure = async (id, user) => {
  const base = await permissions(user);
  if (base.back_office || base.setup) return;
  if (!(await recordPermissions(id, user, base)).infrastructure) {
    throw error('Chỉ người đề xuất, phụ trách, quản lý hợp lệ, Back Office hoặc Setup/Vận hành được cập nhật hạ tầng');
  }
};

const buildViewScope = async (user) => {
  if (!user?.id) return { sql: '1 = 0', params: [] };
  const scope = await reports.resolveScope(user);
  const departmentScope = !['CTV', 'NPP'].includes(user.role);
  if (scope.isAdmin || (departmentScope && (scope.roleKey === 'TGD' || scope.isBackOffice || scope.isFinance
    || isSetup(scope.department) || grading.resolveGradingRole(scope.department)))) {
    return { sql: '1 = 1', params: [] };
  }
  const params = [Number(user.id), Number(user.id), Number(user.id)];
  const conditions = [
    'p.user_id = ?',
    "CAST(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data,'$.nguoi_phu_trach.id')) AS UNSIGNED) = ?",
    "CAST(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data,'$.sales_quan_ly.id')) AS UNSIGNED) = ?"
  ];
  if (['SALES', 'NPP'].includes(user.role)) {
    const ids = await require('../admin/adminUserService').getBranchIds(Number(user.id));
    if (ids.length) {
      conditions.push(`(p.user_id IN (?)
        OR CAST(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data,'$.nguoi_phu_trach.id')) AS UNSIGNED) IN (?)
        OR CAST(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data,'$.sales_quan_ly.id')) AS UNSIGNED) IN (?))`);
      params.push(ids.map(Number), ids.map(Number), ids.map(Number));
    }
  }
  if (departmentScope && scope.roleKey === 'GDTTKD') {
    if (!scope.region) return { sql: '1 = 1', params: [] };
    const pattern = { Bac: '%bac%', Trung: '%trung%', Nam: '%nam%' }[scope.region];
    if (pattern) {
      conditions.push(`(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data,'$.vung_mien')),'') = ''
        OR LOWER(CONVERT(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data,'$.vung_mien')) USING utf8mb4)) LIKE ?)`);
      params.push(pattern);
    }
  }
  return { sql: `(${conditions.join(' OR ')})`, params };
};

const assertView = async (id, user) => {
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw error('Mã ON trạm không hợp lệ', 400);
  const scope = await buildViewScope(user);
  const [rows] = await pool.query(`SELECT cs.id FROM charging_stations cs
    JOIN station_proposals p ON p.id=cs.proposal_id WHERE cs.id=? AND (${scope.sql})`,
  [Number(id), ...scope.params]);
  if (!rows.length) throw error('Không có quyền xem ON trạm này');
};

const requirePermission = (key, message) => async (user) => {
  if (!(await permissions(user))[key]) throw error(message);
};
const assertFinanceViewer = async (user) => {
  if (['SUPER_ADMIN', 'ADMIN'].includes(user?.role)) return { isAdmin: true };
  const scope = await reports.resolveScope(user);
  if (!(scope.isAdmin || scope.isFinance || scope.isBackOffice)) throw error('Không có quyền xem tài chính ON trạm');
  return scope;
};
const assertOwner = async (user, ownerId) => {
  if (!(await permissions(user)).request_early
    || !await proposalAccess.canActAsProposalOwner(user, { user_id: ownerId })) {
    throw error('Chỉ người đề xuất hoặc cấp trên trong phạm vi được thực hiện');
  }
};

module.exports = {
  permissions, buildViewScope, assertView, assertOwner, assertFinanceViewer, isSetup,
  buildInfrastructureOwnerScope, buildInfrastructureTaskScope, recordPermissions, assertInfrastructure,
  assertBackOffice: requirePermission('back_office', 'Chỉ Back Office hoặc SUPER_ADMIN được thao tác'),
  assertSetup: requirePermission('setup', 'Chỉ Phòng Setup và Vận hành hoặc SUPER_ADMIN được thao tác'),
  assertFinance: requirePermission('finance', 'Chỉ Phòng Tài chính, Back Office hoặc SUPER_ADMIN được thao tác')
};
