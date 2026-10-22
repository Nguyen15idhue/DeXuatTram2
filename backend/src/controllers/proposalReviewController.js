const proposalReviewService = require('../services/proposalReviewService');

const sendError = (res, error) => {
  console.error('Proposal review error:', error);
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Lỗi server'
  });
};

exports.list = async (req, res) => {
  try {
    const {
      tab = 'all',
      reviewRole = '',
      region = '',
      search = '',
      page = 1,
      limit = 10
    } = req.query;
    const result = await proposalReviewService.listReviews({
      user: req.user,
      tab,
      reviewRole,
      region,
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

const runAction = (handler, successMessage) => async (req, res) => {
  try {
    const result = await handler({
      user: req.user,
      id: req.params.id,
      reason: req.body ? req.body.reason : '',
      ip: req.ip
    });
    res.json({ success: true, data: result, message: successMessage });
  } catch (error) {
    sendError(res, error);
  }
};

exports.requestRegrade = runAction(
  proposalReviewService.requestRegrade,
  'Đã tạo yêu cầu chấm điểm lại'
);

exports.toTgd = runAction(
  proposalReviewService.toTgd,
  'Đã trình Tổng giám đốc xem xét'
);

exports.cancel = runAction(
  proposalReviewService.cancelAtGdttkd,
  'Đã hủy đề xuất'
);

exports.approve = runAction(
  proposalReviewService.approveByTgd,
  'Đã duyệt đề xuất và chuyển sang Đang vẽ Layout'
);

exports.reject = runAction(
  proposalReviewService.rejectByTgd,
  'Đã không duyệt đề xuất'
);
