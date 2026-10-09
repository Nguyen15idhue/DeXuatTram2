const leadService = require('../services/leadService');
const leadAssignmentService = require('../services/leadAssignmentService');

const sendError = (res, error) => {
  if (error.statusCode) {
    return res.status(error.statusCode).json({ success: false, message: error.message });
  }
  console.error('Admin lead error:', error);
  return res.status(500).json({ success: false, message: 'Lỗi server' });
};

exports.getAll = async (req, res) => {
  try {
    const result = await leadService.getLeads(req.query, req.user);
    res.json({
      success: true,
      data: result.leads,
      message: 'Lấy danh sách Lead thành công',
      pagination: result.pagination,
    });
  } catch (error) {
    sendError(res, error);
  }
};

exports.getById = async (req, res) => {
  try {
    const lead = await leadService.getLeadById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy Lead' });
    }
    if (!(await leadService.canAccessLead(lead, req.user))) {
      return res.status(403).json({ success: false, message: 'Không có quyền xem Lead này' });
    }
    const detail = await leadService.getLeadDetail(req.params.id);
    res.json({ success: true, data: detail, message: 'Lấy chi tiết Lead thành công' });
  } catch (error) {
    sendError(res, error);
  }
};

exports.create = async (req, res) => {
  try {
    const lead = await leadService.createLead(req.body || {}, req.user, { source: 'admin', ip: req.ip });
    let routing = null;
    try {
      routing = await leadAssignmentService.tryAutoRoute(lead, req.user);
    } catch (routeErr) {
      routing = { routed: false, warning: routeErr.message || 'Auto-routing thất bại' };
    }
    const finalLead = await leadService.getLeadDetail(lead.id);
    const message = routing && routing.warning
      ? `Tạo Lead thành công. ${routing.warning}`
      : 'Tạo Lead thành công';
    res.status(201).json({ success: true, data: finalLead, message, routing });
  } catch (error) {
    sendError(res, error);
  }
};

exports.update = async (req, res) => {
  try {
    const before = await leadService.getLeadById(req.params.id);
    const lead = await leadService.updateLead(req.params.id, req.body || {}, req.user, { source: 'admin', ip: req.ip });
    let routing = null;
    const changed = before && (
      String(before.customer_classification || '') !== String(lead.customer_classification || '') ||
      String(before.province || '') !== String(lead.province || '')
    );
    if (changed && !lead.assigned_user_id) {
      try {
        routing = await leadAssignmentService.tryAutoRoute(lead, req.user);
      } catch (routeErr) {
        routing = { routed: false, warning: routeErr.message || 'Auto-routing thất bại' };
      }
    }
    const finalLead = await leadService.getLeadDetail(req.params.id);
    const message = routing && routing.warning
      ? `Cập nhật Lead thành công. ${routing.warning}`
      : 'Cập nhật Lead thành công';
    res.json({ success: true, data: finalLead, message, routing });
  } catch (error) {
    sendError(res, error);
  }
};

exports.assign = async (req, res) => {
  try {
    const result = await leadAssignmentService.assignLead(
      req.params.id,
      (req.body || {}).assignee_user_id,
      req.user,
      { reason: (req.body || {}).reason, source: 'admin', ip: req.ip }
    );
    res.json({ success: true, data: result, message: 'Giao Lead thành công' });
  } catch (error) {
    sendError(res, error);
  }
};

exports.journey = async (req, res) => {
  try {
    const lead = await leadService.getLeadById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy Lead' });
    }
    if (!(await leadService.canAccessLead(lead, req.user))) {
      return res.status(403).json({ success: false, message: 'Không có quyền xem Lead này' });
    }
    const journeyActivityService = require('../services/journeyActivityService');
    const [journey, timeline, proposals] = await Promise.all([
      journeyActivityService.getJourney(lead.journey_id),
      journeyActivityService.getTimeline(lead.journey_id, req.query.limit),
      leadService.getJourneyProposals
        ? leadService.getJourneyProposals(lead.journey_id)
        : Promise.resolve([]),
    ]);
    res.json({
      success: true,
      data: { lead, journey, timeline, proposals },
      message: 'Lấy journey của Lead thành công',
    });
  } catch (error) {
    sendError(res, error);
  }
};

exports.createProposal = async (req, res) => {
  try {
    const leadProposalService = require('../services/leadProposalService');
    const result = await leadProposalService.createProposalFromLead(
      req.params.id,
      req.body || {},
      req.user,
      { ip: req.ip, idempotencyKey: req.headers['idempotency-key'] || (req.body || {}).idempotency_key }
    );
    res.status(result.deduped ? 200 : 201).json({
      success: true,
      data: result.proposal,
      message: result.deduped ? 'Đề xuất đã được tạo trước đó (chống trùng)' : 'Tạo đề xuất từ Lead thành công',
      deduped: !!result.deduped,
    });
  } catch (error) {
    sendError(res, error);
  }
};

exports.bulkAssign = async (req, res) => {
  try {
    const body = req.body || {};
    const result = await leadAssignmentService.bulkAssign(
      body.ids,
      body.assignee_user_id,
      req.user,
      { reason: body.reason, source: 'admin', ip: req.ip }
    );
    const message = result.failed > 0
      ? `Đã phân chia ${result.assigned}/${result.total} Lead, ${result.failed} lỗi`
      : `Đã phân chia ${result.assigned} Lead`;
    res.json({ success: true, data: result, message });
  } catch (error) {
    sendError(res, error);
  }
};

exports.assignments = async (req, res) => {
  try {
    const lead = await leadService.getLeadById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy Lead' });
    }
    if (!(await leadService.canAccessLead(lead, req.user))) {
      return res.status(403).json({ success: false, message: 'Không có quyền xem Lead này' });
    }
    const rows = await leadAssignmentService.getAssignments(req.params.id);
    res.json({ success: true, data: rows, message: 'Lấy lịch sử giao Lead thành công' });
  } catch (error) {
    sendError(res, error);
  }
};

exports.remove = async (req, res) => {
  try {
    const result = await leadService.deleteLead(req.params.id, req.user);
    res.json({ success: true, data: result, message: 'Xóa Lead thành công' });
  } catch (error) {
    sendError(res, error);
  }
};

exports.bulkDelete = async (req, res) => {
  try {
    const results = await leadService.bulkDeleteLeads(req.body.ids, req.user);
    res.json({ success: true, data: results, message: `Đã xóa ${results.length} Lead` });
  } catch (error) {
    sendError(res, error);
  }
};
