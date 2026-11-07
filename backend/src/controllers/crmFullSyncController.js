// backend/src/controllers/crmFullSyncController.js
const crmFullSyncService = require('../services/crmFullSyncService');

exports.start = async (req, res) => {
  try {
    const result = await crmFullSyncService.startRun(req.user.id);
    if (result.notConfigured) {
      return res.status(400).json({ success: false, message: result.error });
    }
    if (result.reused) {
      return res.json({
        success: true,
        data: result.run,
        message: `Lần đồng bộ #${result.run.id} đang chạy`,
      });
    }
    return res.status(202).json({
      success: true,
      data: result.run,
      message: 'Đã bắt đầu đồng bộ toàn bộ khách hàng từ CRM',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.status = async (req, res) => {
  try {
    const data = await crmFullSyncService.getStatus();
    res.json({ success: true, data });
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({
        success: false,
        message: 'Bảng crm_full_sync_runs chưa tồn tại — cần chạy migration 218-crm-full-sync-runs.sql',
      });
    }
    res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.runs = async (req, res) => {
  try {
    const limit = req.query.limit || 10;
    const data = await crmFullSyncService.listRuns(limit);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.resume = async (req, res) => {
  try {
    const result = await crmFullSyncService.resumeRun(Number(req.params.id));
    if (result.notFound) return res.status(404).json({ success: false, message: result.error });
    if (result.error) {
      return res.status(result.active ? 409 : 400).json({ success: false, message: result.error, data: result.active || null });
    }
    res.json({ success: true, data: result.run, message: `Đã tiếp tục lần đồng bộ #${result.run.id}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.cancel = async (req, res) => {
  try {
    const result = await crmFullSyncService.cancelRun(Number(req.params.id));
    if (result.notFound) return res.status(404).json({ success: false, message: result.error });
    if (result.error) return res.status(400).json({ success: false, message: result.error });
    res.json({ success: true, data: result.run, message: `Đã hủy lần đồng bộ #${result.run.id}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.exportRun = async (req, res) => {
  try {
    const result = await crmFullSyncService.buildExport(Number(req.params.id));
    if (!result) return res.status(404).json({ success: false, message: 'Không tìm thấy lần đồng bộ' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(Buffer.from(result.buffer));
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};
