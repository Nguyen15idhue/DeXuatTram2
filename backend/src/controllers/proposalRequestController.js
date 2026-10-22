const proposalRequestService = require('../services/proposalRequestService');
const adminProposalService = require('../services/adminProposalService');

const scopeFor = async (user) => {
  if (!user) return {};
  if (user.role === 'SALES') {
    const branchIds = await adminProposalService.getBranchUserIds(user.id);
    return { role: 'SALES', branchIds, userId: user.id };
  }
  if (user.role === 'CTV' || user.role === 'NPP') {
    return { role: user.role, userId: user.id };
  }
  return { role: user.role };
};

exports.list = async (req, res) => {
  try {
    const { status = 'OPEN', type = '', search = '', page = 1, limit = 10, my = '' } = req.query;
    const scope = await scopeFor(req.user);
    const result = await proposalRequestService.listRequests({
      status,
      type,
      search,
      page,
      limit,
      scope,
      my: my === '1' || my === 'true' || my === true
    });
    res.json({ success: true, data: result.requests, pagination: result.pagination });
  } catch (error) {
    console.error('Admin list proposal requests error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.complete = async (req, res) => {
  try {
    const result = await proposalRequestService.completeRequest(req.params.id, {
      user: req.user,
      resolutionNote: req.body ? req.body.resolution_note : ''
    });
    res.json({ success: true, data: result, message: 'Đã đánh dấu yêu cầu hoàn thành' });
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
