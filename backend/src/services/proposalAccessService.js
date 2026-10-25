const pool = require('../utils/db');
const adminProposalService = require('./adminProposalService');
const proposalGradingService = require('./proposalGradingService');
const proposalReviewService = require('./proposalReviewService');
const proposalReportService = require('./proposalReportService');

const WORKFLOW_STATUSES = new Set([...proposalGradingService.DOWNSTREAM_STATUSES, 'CANCELLED']);

const loadAccessRow = async (id) => {
  const [rows] = await pool.query(
    `SELECT id, user_id, status, custom_data,
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
  try {
    const branchIds = await adminProposalService.getBranchUserIds(userId);
    return (branchIds || []).map(Number).includes(Number(ownerId));
  } catch {
    return false;
  }
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

  if (!WORKFLOW_STATUSES.has(proposal.status)) return false;

  const profile = await loadProfile(user.id);
  if (proposalGradingService.resolveGradingRole(profile.department)) return true;
  if (proposalReportService.isBackOffice(profile.department)) return true;

  const roleKey = proposalReviewService.resolveRoleKey({
    role: user.role,
    department: profile.department,
    chucVu: profile.chucVu
  });
  if (roleKey === proposalReviewService.REVIEW_ROLE.TGD) return true;
  if (roleKey === proposalReviewService.REVIEW_ROLE.GDTTKD) {
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
