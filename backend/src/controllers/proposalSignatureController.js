const proposalSignatureService = require('../services/proposalSignatureService');

const sendError = (res, error) => {
  console.error('Proposal signature error:', error);
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Lỗi server'
  });
};

exports.list = async (req, res) => {
  try {
    const { tab = 'all', search = '', page = 1, limit = 10 } = req.query;
    const result = await proposalSignatureService.listProposals({
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

exports.detail = async (req, res) => {
  try {
    const result = await proposalSignatureService.getDetail({
      user: req.user,
      id: req.params.id
    });
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, error);
  }
};

exports.sign = async (req, res) => {
  try {
    const result = await proposalSignatureService.sign({
      user: req.user,
      id: req.params.id,
      ip: req.ip
    });
    res.json({ success: true, data: result, message: 'Đã ký BCĐX' });
  } catch (error) {
    sendError(res, error);
  }
};

exports.reject = async (req, res) => {
  try {
    const result = await proposalSignatureService.reject({
      user: req.user,
      id: req.params.id,
      reason: req.body ? req.body.reason : '',
      ip: req.ip
    });
    res.json({
      success: true,
      data: result,
      message: 'Đã từ chối duyệt và gửi yêu cầu cập nhật lại BCĐX'
    });
  } catch (error) {
    sendError(res, error);
  }
};

exports.uploadSignedFile = async (req, res) => {
  try {
    const body = req.body || {};
    const result = await proposalSignatureService.uploadSignedFile({
      user: req.user,
      id: req.params.id,
      files: body.files,
      ip: req.ip
    });
    res.json({
      success: true,
      data: result,
      message: 'Đã tải lên file BCĐX chủ tịch phê duyệt'
    });
  } catch (error) {
    sendError(res, error);
  }
};

exports.exportFile = async (req, res) => {
  try {
    const result = await proposalSignatureService.getExportFile({
      user: req.user,
      id: req.params.id
    });
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, error);
  }
};

exports.signatureImage = async (req, res) => {
  try {
    const filePath = await proposalSignatureService.getSignatureImagePath({
      user: req.user,
      id: req.params.id,
      configId: req.params.configId
    });
    res.sendFile(filePath);
  } catch (error) {
    sendError(res, error);
  }
};
