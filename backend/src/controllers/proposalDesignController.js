const proposalDesignService = require('../services/proposalDesignService');

const sendError = (res, error) => {
  console.error('Proposal layout error:', error);
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Lỗi server'
  });
};

exports.list = async (req, res) => {
  try {
    const { tab = 'all', search = '', page = 1, limit = 10 } = req.query;
    const result = await proposalDesignService.listProposals({
      user: req.user,
      tab,
      search,
      page,
      limit
    });
    res.json({
      success: true,
      data: result.proposals,
      pagination: result.pagination,
      meta: result.meta
    });
  } catch (error) {
    sendError(res, error);
  }
};

exports.update = async (req, res) => {
  try {
    const body = req.body || {};
    const result = await proposalDesignService.updateLayout({
      user: req.user,
      id: req.params.id,
      files: body.files,
      approve: body.approve === true || body.approve === 'true' || body.approve === 1,
      ip: req.ip
    });
    res.json({
      success: true,
      data: result,
      message: result.approved ? 'Đã duyệt bản vẽ layout và chuyển sang lập tờ trình BCĐX' : 'Đã lưu bản vẽ layout'
    });
  } catch (error) {
    sendError(res, error);
  }
};

exports.requestSupplement = async (req, res) => {
  try {
    const result = await proposalDesignService.requestSupplement({
      user: req.user,
      id: req.params.id,
      description: req.body ? req.body.description : '',
      ip: req.ip
    });
    res.json({
      success: true,
      data: result,
      message: `Đã gửi yêu cầu bổ sung thông tin (lần ${result.roundNo})`
    });
  } catch (error) {
    sendError(res, error);
  }
};

exports.cancel = async (req, res) => {
  try {
    const result = await proposalDesignService.cancelProposal({
      user: req.user,
      id: req.params.id,
      reason: req.body ? req.body.reason : '',
      ip: req.ip
    });
    res.json({ success: true, data: result, message: 'Đã hủy đề xuất' });
  } catch (error) {
    sendError(res, error);
  }
};
