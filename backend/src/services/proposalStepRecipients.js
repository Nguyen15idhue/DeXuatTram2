const pool = require('../utils/db');

const parseCustomData = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
};

const loadActiveUsers = async () => {
  const [rows] = await pool.query("SELECT id, role, custom_data FROM users WHERE status = 'ACTIVE'");
  return rows.map((row) => {
    const custom = parseCustomData(row.custom_data);
    return {
      id: Number(row.id),
      role: row.role,
      department: custom.department || null,
      chucVu: custom.chuc_vu || null,
      customData: custom
    };
  });
};

const proposalRegion = (proposal) => {
  const proposalReviewService = require('./proposalReviewService');
  const custom = parseCustomData(proposal.custom_data);
  return proposalReviewService.resolveRegion(custom.vung_mien);
};

const gradingUsers = async (filter) => {
  const gradingService = require('./proposalGradingService');
  const users = await loadActiveUsers();
  return users
    .filter((u) => {
      const role = gradingService.resolveGradingRole(u.department);
      return role !== null && (filter === 'ANY' || role === filter);
    })
    .map((u) => u.id);
};

const gdttkdOfRegion = async (proposal) => {
  const proposalReportService = require('./proposalReportService');
  return proposalReportService.findGdttkdIdsByRegion(proposalRegion(proposal));
};

const backOfficeUsers = async () => {
  const proposalReportService = require('./proposalReportService');
  const users = await loadActiveUsers();
  const ids = users
    .filter((u) => proposalReportService.isBackOffice(u.department))
    .map((u) => u.id);
  if (ids.length > 0) return ids;
  return users.filter((u) => ['SUPER_ADMIN', 'ADMIN'].includes(u.role)).map((u) => u.id);
};

const ownerAncestors = async (proposal) => {
  if (!proposal.user_id) return [];
  const adminUserService = require('./adminUserService');
  return adminUserService.getAncestorIds(proposal.user_id);
};

// Cac buoc co service tu gui thong bao rieng (RE_GRADING, TGD_REVIEW, RE_CREATING,
// PROPOSAL_REPORT_CREATING khi duyet layout, ...) KHONG nam o day de tranh gui trung.
const RESOLVERS = {
  GRADING: () => gradingUsers('ANY'),
  DESIGNING: () => gradingUsers('QH'),
  GDTTKD_EVALUATING: (proposal) => gdttkdOfRegion(proposal),
  RE_GDTTKD_EVALUATING: (proposal) => gdttkdOfRegion(proposal),
  INFOR_WAITING: (proposal) => ownerAncestors(proposal),
  PROPOSAL_REPORT_CREATING: async (proposal) => {
    const proposalReportService = require('./proposalReportService');
    const regional = await gdttkdOfRegion(proposal);
    const ancestors = proposal.user_id ? await proposalReportService.findGdttkdAncestorIds(proposal.user_id) : [];
    return [...regional, ...ancestors];
  },
  PROPOSAL_REPORT_REVIEWING: () => backOfficeUsers(),
  SIGNATURE_PENDING: () => backOfficeUsers(),
  CANCELLED: (proposal) => gdttkdOfRegion(proposal)
};

exports.STEP_RECIPIENT_STATUSES = Object.keys(RESOLVERS);

exports.resolveStepRecipients = async (status, proposal) => {
  const resolver = RESOLVERS[status];
  if (!resolver) return [];
  const ids = await resolver(proposal);
  return [...new Set(ids.map(Number).filter(Boolean))];
};

exports.proposalRegion = proposalRegion;
