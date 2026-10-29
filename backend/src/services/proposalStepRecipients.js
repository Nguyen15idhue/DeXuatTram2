const pool = require('../utils/db');

const parseCustomData = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
};

const loadActiveUsers = async () => {
  const [rows] = await pool.query("SELECT id, role, parent_id, custom_data FROM users WHERE status = 'ACTIVE'");
  return rows.map((row) => {
    const custom = parseCustomData(row.custom_data);
    return {
      id: Number(row.id),
      role: row.role,
      parentId: row.parent_id ? Number(row.parent_id) : null,
      department: custom.department || null,
      chucVu: custom.chuc_vu || null,
      customData: custom
    };
  });
};

const proposalRegion = (proposal) => {
  const proposalReviewService = require('./proposalReviewService');
  return proposalReviewService.resolveRegion(parseCustomData(proposal.custom_data).vung_mien);
};

const userCanGrade = (user, department) => {
  const gradingService = require('./proposalGradingService');
  if (user.role === 'SUPER_ADMIN') return true;
  return user.role === 'ADMIN' && gradingService.resolveGradingRole(user.department) === department;
};

const gradingUsers = async (proposal, departments, { requireMissingScore = true } = {}) => {
  const gradingService = require('./proposalGradingService');
  const custom = parseCustomData(proposal.custom_data);
  const legalDocsComplete = gradingService.getLegalDocsState(custom).complete;
  const requestedDepartments = new Set(departments);
  const users = await loadActiveUsers();

  return users
    .filter((user) => {
      const userDepartments = ['QH', 'PL'].filter((department) => (
        requestedDepartments.has(department) && userCanGrade(user, department)
      ));
      return userDepartments.some((department) => {
        if (department === 'PL' && !legalDocsComplete) return false;
        if (!requireMissingScore) return true;
        const score = department === 'QH' ? proposal.quy_hoach_score : proposal.phap_ly_score;
        return score === null || score === undefined;
      });
    })
    .map((user) => user.id);
};

const reviewUsers = async (proposal, roleKeys) => {
  const proposalReviewService = require('./proposalReviewService');
  const requestedRoles = new Set(roleKeys);
  const region = proposalRegion(proposal);
  const users = await loadActiveUsers();

  return users
    .filter((user) => {
      if (user.role === 'SUPER_ADMIN') return true;
      if (!['ADMIN', 'SALES'].includes(user.role)) return false;
      const roleKey = proposalReviewService.resolveRoleKey({
        role: user.role,
        department: user.department,
        chucVu: user.chucVu
      });
      if (!requestedRoles.has(roleKey)) return false;
      if (roleKey === proposalReviewService.REVIEW_ROLE.GDTTKD) {
        const userRegion = proposalReviewService.resolveRegion(user.department)
          || proposalReviewService.resolveRegion(user.customData.vung_mien);
        return !!region && userRegion === region;
      }
      return true;
    })
    .map((user) => user.id);
};

const layoutUsers = async () => {
  const designService = require('./proposalDesignService');
  const users = await loadActiveUsers();
  return users
    .filter((user) => ['ADMIN', 'SUPER_ADMIN'].includes(user.role)
      || (user.role === 'SALES'
        && designService.resolveDesignRole(user.department) === designService.LAYOUT_ROLE))
    .map((user) => user.id);
};

const reportUploadUsers = async (proposal) => {
  const proposalReviewService = require('./proposalReviewService');
  const region = proposalRegion(proposal);
  const users = await loadActiveUsers();
  const ownerId = Number(proposal.user_id) || null;
  const owner = users.find((user) => user.id === ownerId);

  return users
    .filter((user) => {
      if (user.role === 'SUPER_ADMIN') return true;
      if (ownerId && user.id === ownerId) return true;
      if (owner && owner.parentId === user.id) return true;

      const roleKey = proposalReviewService.resolveRoleKey({
        role: user.role,
        department: user.department,
        chucVu: user.chucVu
      });
      if (roleKey !== proposalReviewService.REVIEW_ROLE.GDTTKD || !region) return false;
      const userRegion = proposalReviewService.resolveRegion(user.department)
        || proposalReviewService.resolveRegion(user.customData.vung_mien);
      return userRegion === region;
    })
    .map((user) => user.id);
};

const reportReviewUsers = async () => {
  const reportService = require('./proposalReportService');
  const users = await loadActiveUsers();
  return users
    .filter((user) => ['ADMIN', 'SUPER_ADMIN'].includes(user.role)
      || (['SALES', 'CTV', 'NPP'].includes(user.role)
        && reportService.isBackOffice(user.department)))
    .map((user) => user.id);
};

const resolveGradingTasks = async (status, proposal) => {
  const taskDepartments = new Map();
  const scoreByDepartment = {
    QH: proposal.quy_hoach_score,
    PL: proposal.phap_ly_score
  };

  if (status === 'RE_GRADING') {
    const [requests] = await pool.query(
      `SELECT target_department, target_title FROM proposal_requests
       WHERE proposal_id = ? AND request_type = 'RE_GRADE' AND status = 'OPEN'`,
      [proposal.id]
    );
    requests.forEach((request) => {
      const department = String(request.target_department || '').trim().toUpperCase();
      const title = String(request.target_title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (department === 'QH' || title.includes('quy hoach') || title.includes('hai phong')) taskDepartments.set('QH', 'regrade');
      if (department === 'PL' || title.includes('phap ly') || title.includes('hai phong')) taskDepartments.set('PL', 'regrade');
    });
  }

  if (['GRADING', 'GDTTKD_EVALUATING', 'RE_GDTTKD_EVALUATING', 'RE_GRADING'].includes(status)) {
    ['QH', 'PL'].forEach((department) => {
      if (scoreByDepartment[department] === null || scoreByDepartment[department] === undefined) {
        if (!taskDepartments.has(department)) taskDepartments.set(department, 'grading');
      }
    });
  }

  const taskLabels = {
    QH: 'Quy hoạch',
    PL: 'Pháp lý'
  };
  const tasks = [];
  for (const [department, taskType] of taskDepartments) {
    const userIds = await gradingUsers(proposal, [department], {
      requireMissingScore: taskType !== 'regrade'
    });
    if (userIds.length === 0) continue;
    tasks.push({
      department,
      departmentLabel: taskLabels[department],
      type: taskType,
      userIds,
      title: taskType === 'regrade'
        ? `Đề xuất cần chấm điểm lại – Phòng ${taskLabels[department]}`
        : `Đề xuất cần hoàn tất chấm điểm – Phòng ${taskLabels[department]}`
    });
  }
  return tasks;
};

const resolveStepRecipients = async (status, proposal) => {
  switch (status) {
    case 'PENDING':
    case 'REJECTED':
    case 'INFOR_WAITING':
      return proposal.user_id ? [Number(proposal.user_id)] : [];
    case 'GRADING':
    case 'RE_GRADING':
      return [];
    case 'GDTTKD_EVALUATING':
    case 'RE_GDTTKD_EVALUATING':
      return reviewUsers(proposal, [require('./proposalReviewService').REVIEW_ROLE.GDTTKD]);
    case 'TGD_REVIEW':
      return reviewUsers(proposal, [require('./proposalReviewService').REVIEW_ROLE.TGD]);
    case 'DESIGNING':
      return layoutUsers();
    case 'PROPOSAL_REPORT_CREATING':
    case 'PROPOSAL_REPORT_RE_CREATING':
    case 'PROPOSAL_REPORT_UPDATING':
      return reportUploadUsers(proposal);
    case 'PROPOSAL_REPORT_REVIEWING':
      return reportReviewUsers();
    default:
      return [];
  }
};

exports.STEP_RECIPIENT_STATUSES = [
  'PENDING', 'REJECTED', 'GRADING', 'GDTTKD_EVALUATING', 'RE_GDTTKD_EVALUATING',
  'RE_GRADING', 'TGD_REVIEW', 'DESIGNING', 'INFOR_WAITING',
  'PROPOSAL_REPORT_CREATING', 'PROPOSAL_REPORT_RE_CREATING',
  'PROPOSAL_REPORT_REVIEWING', 'PROPOSAL_REPORT_UPDATING'
];

exports.resolveStepRecipients = async (status, proposal) => {
  const ids = await resolveStepRecipients(status, proposal);
  return [...new Set(ids.map(Number).filter(Boolean))];
};

exports.resolveGradingTasks = resolveGradingTasks;
exports.proposalRegion = proposalRegion;
