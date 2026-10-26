const proposalReportService = require('../services/proposalReportService');

const sendError = (res, error) => {
  console.error('Proposal report error:', error);
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Lỗi server'
  });
};

exports.list = async (req, res) => {
  try {
    const {
      tab = 'all', search = '', page = 1, limit = 10,
      proposal_status, model, province, region, owner_user_id, manager_user_id, date_from, date_to
    } = req.query;
    const result = await proposalReportService.listProposals({
      user: req.user,
      tab,
      search,
      page,
      limit,
      filters: {
        proposalStatus: proposal_status,
        model,
        province,
        region,
        ownerUserId: owner_user_id,
        managerUserId: manager_user_id,
        dateFrom: date_from,
        dateTo: date_to
      }
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

exports.filterOptions = async (req, res) => {
  try {
    const data = await proposalReportService.getFilterOptions(req.user);
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
};

exports.detail = async (req, res) => {
  try {
    const data = await proposalReportService.getProposalDetail({ user: req.user, id: req.params.id });
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
};

exports.upload = async (req, res) => {
  try {
    const body = req.body || {};
    const result = await proposalReportService.uploadReport({
      user: req.user,
      id: req.params.id,
      files: body.files,
      chotSoLuongTru: body.chot_so_luong_tru,
      ip: req.ip
    });
    res.json({
      success: true,
      data: result,
      message: 'Đã tải lên tờ trình BCĐX và chuyển sang duyệt BCĐX'
    });
  } catch (error) {
    sendError(res, error);
  }
};

exports.requestRevision = async (req, res) => {
  try {
    const result = await proposalReportService.requestRevision({
      user: req.user,
      id: req.params.id,
      description: req.body ? req.body.description : '',
      ip: req.ip
    });
    res.json({
      success: true,
      data: result,
      message: 'Đã yêu cầu tạo lại tờ trình BCĐX'
    });
  } catch (error) {
    sendError(res, error);
  }
};
