const proposalApprovalService = require('../services/proposalApprovalService');

const sendError = (res, error) => {
  console.error('Proposal approval error:', error);
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Lỗi server'
  });
};

exports.list = async (req, res) => {
  try {
    const { tab = 'all', search = '', page = 1, limit = 10 } = req.query;
    const result = await proposalApprovalService.listProposals({
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

exports.getProposal = async (req, res) => {
  try {
    const result = await proposalApprovalService.getProposal({
      user: req.user,
      id: req.params.id
    });
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, error);
  }
};

exports.requestUpdate = async (req, res) => {
  try {
    const result = await proposalApprovalService.requestUpdate({
      user: req.user,
      id: req.params.id,
      description: req.body ? req.body.description : '',
      ip: req.ip
    });
    res.json({
      success: true,
      data: result,
      message: 'Đã yêu cầu cập nhật thông tin đề xuất'
    });
  } catch (error) {
    sendError(res, error);
  }
};

exports.tgdReject = async (req, res) => {
  try {
    const result = await proposalApprovalService.tgdReject({
      user: req.user,
      id: req.params.id,
      reason: req.body ? req.body.reason : '',
      ip: req.ip
    });
    res.json({
      success: true,
      data: result,
      message: 'Đã từ chối duyệt BCĐX và gửi yêu cầu cập nhật lại'
    });
  } catch (error) {
    sendError(res, error);
  }
};

exports.getSignatureConfig = async (req, res) => {
  try {
    const result = await proposalApprovalService.getSignatureConfig({
      user: req.user,
      id: req.params.id
    });
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, error);
  }
};

exports.getSignerCandidates = async (req, res) => {
  try {
    const result = await proposalApprovalService.getSignerCandidates({
      user: req.user,
      id: req.params.id
    });
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, error);
  }
};

exports.configureSignature = async (req, res) => {
  try {
    const body = req.body || {};
    const result = await proposalApprovalService.configureSignature({
      user: req.user,
      id: req.params.id,
      fileId: body.file_id,
      signers: body.signers,
      ip: req.ip
    });
    res.json({
      success: true,
      data: result,
      message: 'Đã cấu hình trình ký BCĐX'
    });
  } catch (error) {
    sendError(res, error);
  }
};
