const adminProposalService = require('../services/adminProposalService');
const proximityService = require('../services/proximityService');
const documentService = require('../services/documentService');
const proposalLifecycle = require('../services/proposalLifecycle');
const proposalAccessService = require('../services/proposalAccessService');
const proposalReviewService = require('../services/proposalReviewService');
const proposalProgressService = require('../services/proposalProgressService');

const scopeFor = async (req) => {
  if (req.user.role !== 'SALES' && req.user.role !== 'CTV' && req.user.role !== 'NPP') return { role: req.user.role };
  if (req.user.role === 'SALES' || req.user.role === 'NPP') {
    const branchIds = await adminProposalService.getBranchUserIds(req.user.id);
    return { role: req.user.role, branchIds, userId: req.user.id };
  }
  // CTV: only see their own proposals (where they are the creator)
  return { role: 'CTV', userId: req.user.id };
};

const isAssignee = (proposal, userId) => {
  if (!proposal || !userId) return false;
  return Number(proposal.nguoi_phu_trach_id) === Number(userId)
    || Number(proposal.sales_quan_ly_id) === Number(userId);
};

const denyOutsideBranch = (proposal, scope) => {
  if (scope.role !== 'SALES' && scope.role !== 'CTV') return false;
  if (scope.role === 'SALES') {
    if (scope.branchIds.includes(Number(proposal.user_id))) return false;
    return !isAssignee(proposal, scope.userId);
  }
  // CTV: only allow access to their own proposals (where they are the creator/user_id)
  if (scope.role === 'CTV') {
    return Number(proposal.user_id) !== Number(scope.userId);
  }
  return false;
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
    const { status, statuses, search, page = 1, limit = 10, uu_tien, filters, province, region, department, owner_user_id, manager_user_id, model, date_from, date_to, date_field, lead_link } = req.query;
    const scope = await scopeFor(req);
    const statusList = String(statuses || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => proposalLifecycle.ALL_STATUSES.includes(s));
    const result = await adminProposalService.getAllProposals(status, search, parseInt(page), parseInt(limit), scope, uu_tien, filters, {
      province, region, department, ownerUserId: owner_user_id, managerUserId: manager_user_id, model, dateFrom: date_from, dateTo: date_to, dateField: date_field, leadLink: lead_link,
      statuses: statusList
    });
    res.json({ success: true, data: result.proposals, pagination: result.pagination });
  } catch (error) {
    console.error('Admin get proposals error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.getById = async (req, res) => {
  try {
    const light = await proposalAccessService.loadAccessRow(req.params.id);
    if (!light) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
    }
    const allowed = await proposalAccessService.canViewProposal(req.user, light);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Không có quyền xem đề xuất này' });
    }
    const proposal = await adminProposalService.getProposalWithUser(req.params.id);
    const progress = await proposalProgressService.getProgress(req.params.id);
    res.json({ success: true, data: { ...proposal, progress } });
  } catch (error) {
    console.error('Admin get proposal error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.pushCheck = async (req, res) => {
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
    const syncService = require('../services/syncService');
    const result = await syncService.getPushCheck(proposal || light);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Admin push check error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.completeness = async (req, res) => {
  try {
    const light = await adminProposalService.getProposalById(req.params.id);
    if (!light) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
    }
    const scope = await scopeFor(req);
    if (denyOutsideBranch(light, scope)) {
      return res.status(403).json({ success: false, message: 'Không có quyền xem đề xuất này' });
    }
    const { checkCompleteness } = require('../services/proposalCompleteness');
    const result = await checkCompleteness(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Admin completeness check error:', error);
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
    const { status, reason, force } = req.body;
    const validStatuses = proposalLifecycle.ALL_STATUSES;
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ' });
    }
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    const forceOverride = force === true;
    if (forceOverride && !isSuperAdmin) {
      return res.status(403).json({ success: false, message: 'Chỉ SUPER_ADMIN được ghi đè trạng thái' });
    }
    if (forceOverride && !String(reason || '').trim()) {
      return res.status(400).json({ success: false, message: 'Ghi đè trạng thái cần nhập lý do' });
    }
    if (status === 'PAUSED') {
      return res.status(400).json({ success: false, message: 'Dùng thao tác tạm dừng để ghi lý do và lưu trạng thái trước đó' });
    }
    if (status === 'REJECTED' && !String(reason || '').trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập lý do từ chối' });
    }
    if (status === 'CANCELLED' && !String(reason || '').trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập lý do hủy' });
    }

    const existing = await adminProposalService.getProposalById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
    }
    if (existing.status === 'PAUSED' && status !== 'CANCELLED') {
      return res.status(400).json({ success: false, message: 'Đề xuất đang tạm dừng; chỉ có thể tiếp tục hoặc hủy đề xuất' });
    }
    if (denyOutsideBranch(existing, await scopeFor(req))) {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập tài nguyên này' });
    }

    const result = await adminProposalService.updateStatus(req.params.id, status, {
      reason,
      reviewerId: req.user.id,
      actorRole: req.user.role || null,
      isSuperAdmin,
      force: forceOverride
    });
    const proposal = await adminProposalService.getProposalWithUser(req.params.id);
    res.json({ success: true, data: proposal, autoPush: result.autoPush || null, autoSync: result.autoSync || null, message: 'Cập nhật trạng thái thành công' });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message, errors: error.details || undefined });
    }
    console.error('Admin update status error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const runPauseAction = async (req, res, action) => {
  try {
    const reviewer = await proposalReviewService.resolveReviewer(req.user);
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    if (!isSuperAdmin && !['GDTTKD', 'TGD'].includes(reviewer.roleKey)) {
      return res.status(403).json({ success: false, message: 'Chỉ SUPER_ADMIN, GĐTTKD hoặc Ban Tổng giám đốc được thao tác tạm dừng đề xuất' });
    }

    const existing = await adminProposalService.getProposalById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
    }
    if (!isSuperAdmin && reviewer.roleKey !== 'TGD' && denyOutsideBranch(existing, await scopeFor(req))) {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập tài nguyên này' });
    }

    const options = {
      reason: action === 'pause' ? req.body.reason : null,
      reviewerId: req.user.id,
      actorRole: reviewer.roleKey || req.user.role
    };
    const result = action === 'pause'
      ? await adminProposalService.pauseProposal(req.params.id, options)
      : await adminProposalService.resumeProposal(req.params.id, options);
    const proposal = await adminProposalService.getProposalWithUser(req.params.id);
    res.json({
      success: true,
      data: proposal,
      message: action === 'pause' ? 'Đã tạm dừng đề xuất' : 'Đã tiếp tục đề xuất',
      previousStatus: result.prevStatus,
      status: result.status
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error(`Admin proposal ${action} error:`, error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.pause = (req, res) => runPauseAction(req, res, 'pause');
exports.resume = (req, res) => runPauseAction(req, res, 'resume');

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

    const updated = await adminProposalService.updateProposal(id, req.body, {
      actorId: req.user.id,
      actorRole: req.user.role || null,
      ip: req.ip || null
    });
    const proposal = await adminProposalService.getProposalWithUser(id);
    res.json({ success: true, data: proposal, autoPush: (updated && updated.autoPush) || null, infoCompleted: (updated && updated.infoCompleted) || null, message: 'Cập nhật đề xuất thành công' });
  } catch (error) {
    console.error('Admin update proposal error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.confirmInfoBatch = async (req, res) => {
  try {
    const raw = parseInt(req.body && req.body.limit, 10);
    const limit = Math.min(Math.max(Number.isFinite(raw) ? raw : 500, 1), 2000);
    const report = await adminProposalService.batchAutoConfirm({ limit, actorId: req.user.id });
    res.json({ success: true, data: report, message: 'Đã quét xác nhận đủ thông tin' });
  } catch (error) {
    console.error('Admin confirm-info batch error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const setInfoCompleted = async (req, res, completed) => {
  try {
    const existing = await adminProposalService.getProposalById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
    }
    if (denyOutsideBranch(existing, await scopeFor(req))) {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập tài nguyên này' });
    }
    const proposalLifecycle = require('../services/proposalLifecycle');
    const result = await proposalLifecycle.setInfoCompleted(req.params.id, completed, {
      actorId: req.user.id,
      actorRole: req.user.role || null,
      source: 'user',
      ip: req.ip || null
    });
    const proposal = await adminProposalService.getProposalWithUser(req.params.id);
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
    console.error('Admin set info completed error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.confirmInfo = async (req, res) => setInfoCompleted(req, res, true);

exports.reopenInfo = async (req, res) => setInfoCompleted(req, res, false);

exports.extendDeadline = async (req, res) => {
  try {
    const existing = await adminProposalService.getProposalById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
    }
    if (denyOutsideBranch(existing, await scopeFor(req))) {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập tài nguyên này' });
    }
    const proposalLifecycle = require('../services/proposalLifecycle');
    const result = await proposalLifecycle.extendDeadline(req.params.id, req.body || {}, {
      actorId: req.user.id,
      actorRole: req.user.role || null,
      source: 'user',
      ip: req.ip || null
    });
    const proposal = await adminProposalService.getProposalWithUser(req.params.id);
    res.json({ success: true, data: proposal, extend: result, message: 'Gia hạn thành công' });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Admin extend deadline error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.extendInfo = async (req, res) => {
  try {
    const existing = await adminProposalService.getProposalById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
    }
    if (denyOutsideBranch(existing, await scopeFor(req))) {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập tài nguyên này' });
    }
    const proposalLifecycle = require('../services/proposalLifecycle');
    const info = await proposalLifecycle.getExtendInfo(req.params.id);
    res.json({ success: true, data: info });
  } catch (error) {
    console.error('Admin extend info error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.convertToStation = async (req, res) => {
  try {
    const stationService = require('../services/stationService');
    const existing = await adminProposalService.getProposalById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
    }
    const result = await stationService.convertProposalToStation(req.params.id, {
      name: req.body && req.body.name,
      actorId: req.user.id,
      actorRole: req.user.role || null,
      source: 'user',
      ip: req.ip || null
    });
    res.json({
      success: true,
      data: result.station,
      created: result.created,
      message: result.created ? 'Đã tạo trạm từ đề xuất' : 'Đề xuất đã có trạm liên kết'
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Admin convert to station error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.exportReports = async (req, res) => {
  try {
    // TODO(P58-L2): chỉ cho xuất khi status=Duyệt chủ trương
    let { proposalIds, templateId } = req.body || {};
    if (!Array.isArray(proposalIds)) proposalIds = [];
    proposalIds = [...new Set(proposalIds.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0))].slice(0, 50);
    if (proposalIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Chưa chọn đề xuất' });
    }
    const scope = await scopeFor(req);
    const allowed = [];
    const denied = [];
    for (const pid of proposalIds) {
      const light = await adminProposalService.getProposalById(pid);
      if (!light) { denied.push(pid); continue; }
      if (denyOutsideBranch(light, scope)) { denied.push(pid); continue; }
      allowed.push(pid);
    }
    if (allowed.length === 0) {
      return res.status(403).json({ success: false, message: 'Không có quyền xuất các đề xuất đã chọn' });
    }
    const result = await documentService.exportReports(allowed, { templateId });
    res.setHeader('Content-Type', result.contentType);
    const ascii = result.kind === 'zip' ? 'bao-cao-de-xuat.zip' : 'bao-cao-de-xuat.docx';
    res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(result.filename)}`);
    const skippedAll = [...denied, ...(result.skipped || [])];
    if (skippedAll.length > 0) res.setHeader('X-Report-Skipped', skippedAll.join(','));
    if (result.warnings.length > 0) {
      res.setHeader('X-Report-Warnings', encodeURIComponent(result.warnings.map((w) => `#${w.proposalId} ${w.reason}`).join('; ').slice(0, 500)));
    }
    return res.send(result.buffer);
  } catch (error) {
    if (error.statusCode) {
      const body = { success: false, message: error.message };
      if (error.details) {
        body.generated = error.details.generated || 0;
        body.skipped = error.details.skipped || [];
        body.warnings = error.details.warnings || [];
      }
      return res.status(error.statusCode).json(body);
    }
    console.error('Admin export reports error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
