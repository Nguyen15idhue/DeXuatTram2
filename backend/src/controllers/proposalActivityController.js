const proposalActivityService = require('../services/proposalActivityService');
const adminProposalService = require('../services/adminProposalService');

const scopeFor = async (req) => {
  if (req.user.role !== 'SALES') return { role: req.user.role };
  const branchIds = await adminProposalService.getBranchUserIds(req.user.id);
  return { role: 'SALES', branchIds };
};

exports.getAll = async (req, res) => {
  try {
    const scope = await scopeFor(req);
    const result = await proposalActivityService.list({
      id: req.query.id,
      proposalId: req.query.proposal_id,
      code: req.query.code,
      actor: req.query.actor,
      action: req.query.action,
      source: req.query.source,
      dateFrom: req.query.date_from,
      dateTo: req.query.date_to,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      scope
    });
    res.json({ success: true, data: result.items, pagination: result.pagination });
  } catch (error) {
    console.error('Get proposal activity error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.timeline = async (req, res) => {
  try {
    const light = await adminProposalService.getProposalById(req.params.proposalId);
    if (!light) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
    }
    const scope = await scopeFor(req);
    if (scope.role === 'SALES' && !scope.branchIds.includes(Number(light.user_id))) {
      return res.status(403).json({ success: false, message: 'Không có quyền xem đề xuất này' });
    }
    const items = await proposalActivityService.timeline(req.params.proposalId);
    res.json({ success: true, data: items });
  } catch (error) {
    console.error('Get proposal timeline error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
