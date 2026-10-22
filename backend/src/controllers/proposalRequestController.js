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
    const { status = 'OPEN', type = '', search = '', page = 1, limit = 10 } = req.query;
    const scope = await scopeFor(req.user);
    const result = await proposalRequestService.listRequests({
      status,
      type,
      search,
      page,
      limit,
      scope
    });
    res.json({ success: true, data: result.requests, pagination: result.pagination });
  } catch (error) {
    console.error('Admin list proposal requests error:', error);
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
