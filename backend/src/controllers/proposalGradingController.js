const proposalGradingService = require('../services/proposalGradingService');
const adminProposalService = require('../services/adminProposalService');

const scopeFor = async (user) => {
  if (!user) return { role: null };
  if (['SUPER_ADMIN', 'ADMIN'].includes(user.role)) {
    return { all: true, gradeRole: proposalGradingService.BOTH_ROLE };
  }
  const department = await proposalGradingService.getUserDepartment(user.id);
  const gradeRole = proposalGradingService.resolveGradingRole(department);
  if (gradeRole) {
    return { all: true, gradeRole, department };
  }
  if (user.role === 'SALES') {
    const branchIds = await adminProposalService.getBranchUserIds(user.id);
    return { role: 'SALES', branchIds, userId: user.id, gradeRole: null };
  }
  if (user.role === 'CTV' || user.role === 'NPP') {
    return { role: user.role, userId: user.id, gradeRole: null };
  }
  return { role: user.role, gradeRole: null };
};

exports.list = async (req, res) => {
  try {
    const { tab = 'all', department = '', search = '', page = 1, limit = 10 } = req.query;
    const scope = await scopeFor(req.user);
    const dept = scope.gradeRole && scope.gradeRole !== proposalGradingService.BOTH_ROLE
      ? scope.gradeRole
      : (['QH', 'PL'].includes(department) ? department : '');
    const result = await proposalGradingService.listProposals({
      tab,
      department: dept,
      search,
      page,
      limit,
      scope
    });
    res.json({
      success: true,
      data: result.proposals,
      pagination: result.pagination,
      meta: { gradeRole: scope.gradeRole || null, department: scope.department || null }
    });
  } catch (error) {
    console.error('List proposal grading error:', error);
    res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.update = async (req, res) => {
  try {
    const scope = await scopeFor(req.user);
    const result = await proposalGradingService.updateGrading({
      id: req.params.id,
      userId: req.user.id,
      userRole: req.user.role,
      gradeRole: scope.gradeRole || null,
      payload: req.body || {}
    });
    let message = 'Đã cập nhật đánh giá';
    if (result.transition && result.transition.status === 'CANCELLED') {
      message = 'Đã cập nhật đánh giá — đề xuất bị hủy vì có điểm 0';
    } else if (result.transition && result.transition.status === 'DESIGNING') {
      message = 'Đã cập nhật đánh giá — đề xuất chuyển sang Đang vẽ Layout';
    } else if (result.transition && result.transition.status === 'GDTTKD_EVALUATING') {
      message = 'Đã cập nhật đánh giá — đề xuất chuyển sang GĐTTKD đánh giá';
    } else if (result.transitionError) {
      message = `Đã lưu điểm nhưng chưa chuyển trạng thái: ${result.transitionError}`;
    }
    res.json({ success: true, data: result, message });
  } catch (error) {
    console.error('Update proposal grading error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Lỗi server'
    });
  }
};
