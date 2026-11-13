const pool = require('../utils/db');
const adminProposalService = require('./adminProposalService');
const proposalGradingService = require('./proposalGradingService');
const proposalReviewService = require('./proposalReviewService');
const proposalReportService = require('./proposalReportService');

const WORKFLOW_STATUSES = new Set([...proposalGradingService.DOWNSTREAM_STATUSES, 'CANCELLED']);

const loadAccessRow = async (id) => {
  const [rows] = await pool.query(
    `SELECT id, user_id, status, review_level, custom_data,
            CAST(JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.nguoi_phu_trach.id')) AS UNSIGNED) AS nguoi_phu_trach_id,
            CAST(JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.sales_quan_ly.id')) AS UNSIGNED) AS sales_quan_ly_id
     FROM station_proposals WHERE id = ?`,
    [Number(id)]
  );
  return rows[0] || null;
};

const loadProfile = async (userId) => {
  const [rows] = await pool.query('SELECT role, custom_data FROM users WHERE id = ?', [Number(userId)]);
  if (rows.length === 0) return { role: null, department: null, chucVu: null, customData: {} };
  const customData = proposalGradingService.parseCustomData(rows[0].custom_data);
  return {
    role: rows[0].role,
    department: customData.department || null,
    chucVu: customData.chuc_vu || null,
    customData
  };
};

const inBranch = async (userId, ownerId) => {
  if (!ownerId) return false;
  const branchIds = await adminProposalService.getBranchUserIds(userId);
  return (branchIds || []).map(Number).includes(Number(ownerId));
};

const canViewProposal = async (user, proposal) => {
  if (!user || !proposal) return false;
  if (['SUPER_ADMIN', 'ADMIN'].includes(user.role)) return true;

  const ownerId = proposal.user_id === null || proposal.user_id === undefined
    ? null
    : Number(proposal.user_id);
  if (ownerId && ownerId === Number(user.id)) return true;
  if (Number(proposal.nguoi_phu_trach_id) === Number(user.id)) return true;
  if (Number(proposal.sales_quan_ly_id) === Number(user.id)) return true;

  if (user.role === 'CTV') return false;
  if (user.role === 'SALES' && await inBranch(user.id, ownerId)) return true;
  if (user.role === 'NPP' && await inBranch(user.id, ownerId)) return true;

  const profile = await loadProfile(user.id);
  const roleKey = proposalReviewService.resolveRoleKey({
    role: user.role,
    department: profile.department,
    chucVu: profile.chucVu
  });
  if (roleKey === proposalReviewService.REVIEW_ROLE.TGD) return true;

  if (!WORKFLOW_STATUSES.has(proposal.status)) return false;

  if (proposalGradingService.resolveGradingRole(profile.department)) return true;
  if (proposalReportService.isBackOffice(profile.department)) return true;

  if (roleKey === proposalReviewService.REVIEW_ROLE.GDTTKD) {
    if (proposal.review_level !== null && proposal.review_level !== undefined) {
      const scope = await proposalReviewService.resolveReviewer(user);
      if (require('./proposalReviewScope').matches(scope.managementScope, proposal)) return true;
      if (['GDTTKD_EVALUATING', 'RE_GDTTKD_EVALUATING', 'RE_GRADING', 'TGD_REVIEW'].includes(proposal.status)) return false;
    }
    const region = proposalReviewService.resolveRegion(profile.department)
      || proposalReviewService.resolveRegion(profile.customData.vung_mien);
    if (!region) return true;
    const proposalRegion = proposalReviewService.resolveRegion(
      proposalGradingService.parseCustomData(proposal.custom_data).vung_mien
    );
    return !proposalRegion || proposalRegion === region;
  }
  return false;
};

exports.loadAccessRow = loadAccessRow;
exports.canViewProposal = canViewProposal;

const isTgdUser = async (user) => {
  if (!['SALES', 'ADMIN'].includes(user?.role)) return false;
  const profile = await loadProfile(user.id);
  const roleKey = proposalReviewService.resolveRoleKey({
    role: user.role,
    department: profile.department,
    chucVu: profile.chucVu
  });
  return roleKey === proposalReviewService.REVIEW_ROLE.TGD;
};

const canActAsProposalOwner = async (user, proposal) => {
  if (!user || !proposal) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  const ownerId = proposal.user_id === null || proposal.user_id === undefined
    ? null
    : Number(proposal.user_id);
  if (ownerId && ownerId === Number(user.id)) return true;
  if (await isTgdUser(user)) return true;
  if (!['ADMIN', 'SALES', 'NPP'].includes(user.role)) return false;
  const ids = new Set([Number(user.id), ...((await adminProposalService.getBranchUserIds(user.id)) || []).map(Number)]);
  const custom = proposalGradingService.parseCustomData(proposal.custom_data);
  return [ownerId, proposal.nguoi_phu_trach_id ?? custom.nguoi_phu_trach?.id,
    proposal.sales_quan_ly_id ?? custom.sales_quan_ly?.id]
    .some((id) => id && ids.has(Number(id)));
};

const buildOwnerScopeSql = async (user, alias = 'p', { includeTgdGlobal = true } = {}) => {
  if (!user?.id) return { sql: '1 = 0', params: [] };
  if (user.role === 'SUPER_ADMIN' || (includeTgdGlobal && await isTgdUser(user))) {
    return { sql: '1 = 1', params: [] };
  }
  if (['ADMIN', 'SALES', 'NPP'].includes(user.role)) {
    const branchIds = [...new Set([Number(user.id), ...((await adminProposalService.getBranchUserIds(user.id)) || []).map(Number)])];
    const placeholders = branchIds.map(() => '?').join(',');
    return {
      sql: `(${alias}.user_id IN (${placeholders})
        OR CAST(JSON_UNQUOTE(JSON_EXTRACT(${alias}.custom_data, '$.nguoi_phu_trach.id')) AS UNSIGNED) IN (${placeholders})
        OR CAST(JSON_UNQUOTE(JSON_EXTRACT(${alias}.custom_data, '$.sales_quan_ly.id')) AS UNSIGNED) IN (${placeholders}))`,
      params: [...branchIds, ...branchIds, ...branchIds]
    };
  }
  return { sql: `${alias}.user_id = ?`, params: [Number(user.id)] };
};

const buildOwnerMatcher = async (user) => {
  if (!user?.id) return () => false;
  if (user.role === 'SUPER_ADMIN' || await isTgdUser(user)) return () => true;
  if (['ADMIN', 'SALES', 'NPP'].includes(user.role)) {
    const ids = new Set([Number(user.id), ...((await adminProposalService.getBranchUserIds(user.id)) || []).map(Number)]);
    return (ownerId) => ids.has(Number(ownerId));
  }
  return (ownerId) => Number(ownerId) === Number(user.id);
};

exports.isTgdUser = isTgdUser;
exports.canActAsProposalOwner = canActAsProposalOwner;
exports.buildOwnerScopeSql = buildOwnerScopeSql;
exports.buildOwnerMatcher = buildOwnerMatcher;

exports.buildReportTaskScopeSql = async (user, alias = 'p') => {
  const scope = await proposalReportService.resolveScope(user);
  if (scope.role === 'SUPER_ADMIN') return { sql: '1 = 1', params: [] };
  if (scope.roleKey === 'TGD') return { sql: '1 = 0', params: [] };
  if (scope.roleKey === 'GDTTKD') {
    if (!scope.region) return { sql: '1 = 0', params: [] };
    return {
      sql: `LOWER(CONVERT(JSON_UNQUOTE(JSON_EXTRACT(${alias}.custom_data, '$.vung_mien')) USING utf8mb4)) LIKE ?`,
      params: [{ Bac: '%bac%', Trung: '%trung%', Nam: '%nam%' }[scope.region]]
    };
  }
  return buildOwnerScopeSql(user, alias);
};
