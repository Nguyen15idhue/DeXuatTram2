const proposalGradingService = require('../services/proposalGradingService');
const adminProposalService = require('../services/adminProposalService');

const scopeFor = async (user) => {
  if (!user) return { role: null };
  if (user.role === 'SUPER_ADMIN') {
    return { all: true, gradeRole: proposalGradingService.BOTH_ROLE };
  }
  const department = await proposalGradingService.getUserDepartment(user.id);
  const gradeRole = proposalGradingService.resolveGradingRole(department);
  if (user.role === 'ADMIN') {
    return { all: true, role: user.role, userId: user.id, gradeRole, department };
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
    const {
      tab = 'all', department = '', search = '', page = 1, limit = 10,
      proposal_status, model, province, region, owner_user_id, manager_user_id, date_from, date_to
    } = req.query;
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
      scope,
      filters: {
        proposalStatus: proposal_status,
        model,
        province,
        region,
        ownerUserId: owner_user_id,
        managerUserId: manager_user_id,
        dateFrom: date_from,
        dateTo: date_to
      }
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

exports.detail = async (req, res) => {
  try {
    const scope = await scopeFor(req.user);
    const data = await proposalGradingService.getProposalDetail(req.params.id, scope);
    res.json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.filterOptions = async (req, res) => {
  try {
    const scope = await scopeFor(req.user);
    const data = await require('../services/proposalRequestService').getFilterOptions(scope);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Proposal grading filter options error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.saveDisplayConfig = async (req, res) => {
  try {
    const fields = await require('../services/dynamicUtils').getFieldDefinitionsByEntity('station_proposals');
    const data = await proposalGradingService.saveDisplayConfig(req.body || {}, fields);
    res.json({ success: true, data, message: 'Đã lưu cấu hình hiển thị' });
  } catch (error) {
    console.error('Save proposal grading display config error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Lỗi server' });
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
    if (result.transitionError) {
      message = `Đã lưu điểm nhưng chưa chuyển trạng thái: ${result.transitionError}`;
    } else if (result.reviewRequestError) {
      message = `Đã lưu điểm và cập nhật trạng thái nhưng không đồng bộ được yêu cầu GĐTTKD: ${result.reviewRequestError}`;
    } else if (result.transition && result.transition.status === 'CANCELLED') {
      message = 'Đã cập nhật đánh giá — đề xuất bị hủy vì có điểm 0';
    } else if (result.transition && result.transition.status === 'DESIGNING') {
      message = 'Đã cập nhật đánh giá — đề xuất chuyển sang Đang vẽ Layout';
    } else if (result.transition && result.transition.status === 'GDTTKD_EVALUATING') {
      message = 'Đã cập nhật đánh giá — đề xuất chuyển sang GĐTTKD đánh giá';
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

exports.requestSupplement = async (req, res) => {
  try {
    const scope = await scopeFor(req.user);
    const data = await proposalGradingService.requestSupplement({
      id: req.params.id,
      user: req.user,
      gradeRole: scope.gradeRole,
      reason: req.body?.reason,
      ip: req.ip
    });
    res.json({ success: true, data, message: 'Đã gửi yêu cầu bổ sung thông tin' });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};
