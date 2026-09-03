const myProposalService = require('../services/myProposalService');

exports.getAll = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 10 } = req.query;
    const result = await myProposalService.getUserProposals(req.user.id, status, search, parseInt(page), parseInt(limit));
    res.json({ success: true, data: result.proposals, pagination: result.pagination });
  } catch (error) {
    console.error('Get my proposals error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { owner_name, owner_phone, address } = req.body;

    if (!owner_name || !owner_phone || !address) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ thông tin bắt buộc' });
    }

    const existing = await myProposalService.getProposalByIdAndUser(id, req.user.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
    }

    if (existing.status !== 'PENDING') {
      return res.status(400).json({ success: false, message: 'Chỉ có thể chỉnh sửa đề xuất đang ở trạng thái PENDING' });
    }

    await myProposalService.updateProposal(id, req.user.id, req.body);
    const proposal = await myProposalService.getProposalById(id);
    res.json({ success: true, data: proposal, message: 'Cập nhật đề xuất thành công' });
  } catch (error) {
    console.error('Update my proposal error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await myProposalService.getProposalByIdAndUser(id, req.user.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
    }

    if (existing.status !== 'PENDING') {
      return res.status(400).json({ success: false, message: 'Chỉ có thể xóa đề xuất đang ở trạng thái PENDING' });
    }

    await myProposalService.deleteProposal(id, req.user.id);
    res.json({ success: true, message: 'Xóa đề xuất thành công' });
  } catch (error) {
    console.error('Delete my proposal error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
