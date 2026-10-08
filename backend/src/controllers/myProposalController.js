const myProposalService = require('../services/myProposalService');
const proximityService = require('../services/proximityService');

exports.duplicates = async (req, res) => {
  try {
    const { min_m = 200, max_m = 2000 } = req.query;
    const result = await proximityService.findDuplicates({ minM: min_m, maxM: max_m, ownUserId: req.user.id });
    res.json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.getAll = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 10, filters } = req.query;
    const result = await myProposalService.getUserProposals(req.user.id, status, search, parseInt(page), parseInt(limit), filters);
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

    if (existing.status !== 'PENDING' && existing.status !== 'REJECTED' && existing.status !== 'REVIEWING' && existing.status !== 'PRINCIPLE_APPROVED') {
      return res.status(400).json({ success: false, message: 'Chỉ có thể chỉnh sửa đề xuất đang ở trạng thái PENDING, REJECTED, REVIEWING hoặc Duyệt chủ trương' });
    }

    const updated = await myProposalService.updateProposal(id, req.user.id, req.body, {
      actorRole: req.user.role || null,
      ip: req.ip || null
    });
    const proposal = await myProposalService.getProposalById(id);
    res.json({ success: true, data: proposal, autoPush: (updated && updated.autoPush) || null, infoCompleted: (updated && updated.infoCompleted) || null, message: 'Cập nhật đề xuất thành công' });
  } catch (error) {
    console.error('Update my proposal error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const setInfoCompleted = async (req, res, completed) => {
  try {
    const existing = await myProposalService.getProposalByIdAndUser(req.params.id, req.user.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
    }
    const proposalLifecycle = require('../services/proposalLifecycle');
    const result = await proposalLifecycle.setInfoCompleted(req.params.id, completed, {
      actorId: req.user.id,
      actorRole: req.user.role || null,
      source: 'user',
      ip: req.ip || null
    });
    const proposal = await myProposalService.getProposalById(req.params.id);
    res.json({
      success: true,
      data: proposal,
      message: completed ? 'Đã xác nhận đủ thông tin' : 'Đã mở lại để bổ sung thông tin',
      unchanged: !!result.unchanged
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Set info completed error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.confirmInfo = async (req, res) => setInfoCompleted(req, res, true);

exports.extendInfo = async (req, res) => {
  try {
    const existing = await myProposalService.getProposalByIdAndUser(req.params.id, req.user.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
    }
    const proposalLifecycle = require('../services/proposalLifecycle');
    const info = await proposalLifecycle.getExtendInfo(req.params.id);
    res.json({ success: true, data: info });
  } catch (error) {
    console.error('Extend info error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.reopenInfo = async (req, res) => setInfoCompleted(req, res, false);

exports.extendDeadline = async (req, res) => {
  try {
    const existing = await myProposalService.getProposalByIdAndUser(req.params.id, req.user.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
    }
    const proposalLifecycle = require('../services/proposalLifecycle');
    const result = await proposalLifecycle.extendDeadline(req.params.id, req.body || {}, {
      actorId: req.user.id,
      actorRole: req.user.role || null,
      source: 'user',
      ip: req.ip || null
    });
    const proposal = await myProposalService.getProposalById(req.params.id);
    res.json({ success: true, data: proposal, extend: result, message: 'Gia hạn thành công' });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Extend deadline error:', error);
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
