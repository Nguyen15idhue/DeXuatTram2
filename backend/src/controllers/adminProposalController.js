const adminProposalService = require('../services/adminProposalService');

exports.getAll = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const result = await adminProposalService.getAllProposals(status, parseInt(page), parseInt(limit));
    res.json({ success: true, data: result.proposals, pagination: result.pagination });
  } catch (error) {
    console.error('Admin get proposals error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.delete = async (req, res) => {
  try {
    const existing = await adminProposalService.getProposalById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
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
    const { status } = req.body;
    const validStatuses = ['PENDING', 'REVIEWING', 'APPROVED', 'REJECTED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ' });
    }

    const existing = await adminProposalService.getProposalById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
    }

    await adminProposalService.updateStatus(req.params.id, status);
    const proposal = await adminProposalService.getProposalWithUser(req.params.id);
    res.json({ success: true, data: proposal, message: 'Cập nhật trạng thái thành công' });
  } catch (error) {
    console.error('Admin update status error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
