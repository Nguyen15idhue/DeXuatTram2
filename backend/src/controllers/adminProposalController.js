const adminProposalService = require('../services/adminProposalService');
const proximityService = require('../services/proximityService');

const scopeFor = async (req) => {
  if (req.user.role !== 'SALES') return { role: req.user.role };
  const branchIds = await adminProposalService.getBranchUserIds(req.user.id);
  return { role: 'SALES', branchIds };
};

const denyOutsideBranch = (proposal, scope) => {
  return scope.role === 'SALES' && !scope.branchIds.includes(Number(proposal.user_id));
};

exports.duplicates = async (req, res) => {
  try {
    const { min_m = 200, max_m = 2000 } = req.query;
    const scope = await scopeFor(req);
    const result = await proximityService.findDuplicates({
      minM: min_m,
      maxM: max_m,
      branchUserIds: scope.role === 'SALES' ? scope.branchIds : null
    });
    res.json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.getAll = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 10 } = req.query;
    const scope = await scopeFor(req);
    const result = await adminProposalService.getAllProposals(status, search, parseInt(page), parseInt(limit), scope);
    res.json({ success: true, data: result.proposals, pagination: result.pagination });
  } catch (error) {
    console.error('Admin get proposals error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.getById = async (req, res) => {
  try {
    const light = await adminProposalService.getProposalById(req.params.id);
    if (!light) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
    }
    const scope = await scopeFor(req);
    if (denyOutsideBranch(light, scope)) {
      return res.status(403).json({ success: false, message: 'Không có quyền xem đề xuất này' });
    }
    const proposal = await adminProposalService.getProposalWithUser(req.params.id);
    res.json({ success: true, data: proposal });
  } catch (error) {
    console.error('Admin get proposal error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.delete = async (req, res) => {
  try {
    const existing = await adminProposalService.getProposalById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
    }
    if (denyOutsideBranch(existing, await scopeFor(req))) {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập tài nguyên này' });
    }
    await adminProposalService.deleteProposal(req.params.id);
    res.json({ success: true, message: 'Xóa đề xuất thành công' });
  } catch (error) {
    console.error('Admin delete proposal error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status, reason } = req.body;
    const validStatuses = ['PENDING', 'REVIEWING', 'APPROVED', 'REJECTED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ' });
    }
    if (status === 'REJECTED' && !String(reason || '').trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập lý do từ chối' });
    }

    const existing = await adminProposalService.getProposalById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
    }
    if (denyOutsideBranch(existing, await scopeFor(req))) {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập tài nguyên này' });
    }

    await adminProposalService.updateStatus(req.params.id, status, { reason, reviewerId: req.user.id });
    const proposal = await adminProposalService.getProposalWithUser(req.params.id);
    res.json({ success: true, data: proposal, message: 'Cập nhật trạng thái thành công' });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Admin update status error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await adminProposalService.getProposalById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
    }
    if (denyOutsideBranch(existing, await scopeFor(req))) {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập tài nguyên này' });
    }

    await adminProposalService.updateProposal(id, req.body);
    const proposal = await adminProposalService.getProposalWithUser(id);
    res.json({ success: true, data: proposal, message: 'Cập nhật đề xuất thành công' });
  } catch (error) {
    console.error('Admin update proposal error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
