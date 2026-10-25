const proposalRequestService = require('../services/proposalRequestService');
const adminProposalService = require('../services/adminProposalService');
const myProposalService = require('../services/myProposalService');

const scopeFor = async (user) => {
  if (!user) return {};
  if (['SALES', 'NPP'].includes(user.role)) {
    const branchIds = await adminProposalService.getBranchUserIds(user.id);
    const profile = await proposalRequestService.loadUserById(user.id);
    const reviewProfile = await require('../services/proposalReviewService').resolveReviewer({
      id: user.id,
      role: user.role
    });
    return {
      role: user.role,
      branchIds,
      userId: user.id,
      region: reviewProfile.roleKey === 'GDTTKD' ? reviewProfile.region : null,
      department: profile?.department,
      chucVu: profile?.chucVu
    };
  }
  if (user.role === 'CTV') {
    return { role: user.role, userId: user.id };
  }
  return { role: user.role, userId: user.id };
};

exports.list = async (req, res) => {
  try {
    const {
      status = 'OPEN', type = '', search = '', page = 1, limit = 10, my = '',
      work_scope = '', proposal_status = '', model = '', province = '', region = '',
      owner_user_id = '', manager_user_id = '', date_from = '', date_to = ''
    } = req.query;
    const scope = await scopeFor(req.user);
    const result = await proposalRequestService.listRequests({
      status,
      type,
      search,
      page,
      limit,
      scope,
      my: my === '1' || my === 'true' || my === true,
      workScope: work_scope,
      proposalStatus: proposal_status,
      model,
      province,
      region,
      ownerUserId: owner_user_id,
      managerUserId: manager_user_id,
      dateFrom: date_from,
      dateTo: date_to
    });
    res.json({ success: true, data: result.requests, pagination: result.pagination });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    console.error('Admin list proposal requests error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.filterOptions = async (req, res) => {
  try {
    const scope = await scopeFor(req.user);
    const data = await proposalRequestService.getFilterOptions(scope);
    const hasSubordinates = ['SALES', 'NPP'].includes(req.user.role) && (scope.branchIds || []).length > 1;
    res.json({
      success: true,
      data: {
        ...data,
        workScopes: [
          { value: 'mine', label: 'Công việc của tôi' },
          ...(hasSubordinates ? [{ value: 'subordinates', label: 'Công việc của cấp dưới' }] : []),
          { value: 'all', label: 'Tất cả công việc trong phạm vi của tôi' }
        ]
      }
    });
  } catch (error) {
    console.error('Proposal request filter options error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.getUpdateContext = async (req, res) => {
  try {
    const request = await proposalRequestService.getRequestContext(req.params.id, req.user);
    const proposal = await adminProposalService.getProposalWithUser(request.proposal_id);
    const canUpdate = await proposalRequestService.canUpdateProposalForRequest(req.user, request);
    const canComplete = await proposalRequestService.canActOnRequest(req.user, request);
    res.json({ success: true, data: { request, proposal, canUpdate, canComplete } });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    console.error('Get proposal request update context error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.updateProposalForRequest = async (req, res) => {
  try {
    const request = await proposalRequestService.getRequestContext(req.params.id, req.user);
    if (!await proposalRequestService.canUpdateProposalForRequest(req.user, request)) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền cập nhật thay người đề xuất' });
    }
    const result = await myProposalService.updateProposal(
      request.proposal_id,
      request.owner_id,
      req.body || {},
      {
        actorId: req.user.id,
        actorRole: req.user.role,
        ip: req.ip,
        deferRequestCompletion: true,
        requestId: request.id,
        requestType: request.request_type
      }
    );
    res.json({ success: true, data: result, message: 'Đã cập nhật thông tin đề xuất' });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    console.error('Update proposal through request error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.complete = async (req, res) => {
  try {
    const request = await proposalRequestService.getRequestById(req.params.id);
    const result = await proposalRequestService.completeRequest(req.params.id, {
      user: req.user,
      resolutionNote: req.body ? req.body.resolution_note : ''
    });
    let infoCompleted = null;
    if (request
      && Number(request.target_user_id) === Number(request.owner_id)
      && ['UPDATE_INFO', 'SUPPLEMENT'].includes(request.request_type)) {
      infoCompleted = await require('../services/proposalLifecycle').maybeAutoConfirmInfo(
        request.proposal_id,
        { actorId: req.user.id, purpose: 'view', ip: req.ip }
      );
    }
    res.json({ success: true, data: { ...result, infoCompleted }, message: 'Đã đánh dấu yêu cầu hoàn thành' });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Complete proposal request error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.types = async (req, res) => {
  res.json({
    success: true,
    data: proposalRequestService.REQUEST_TYPES.map((value) => ({
      value,
      label: proposalRequestService.REQUEST_TYPE_LABELS[value] || value
    }))
  });
};
