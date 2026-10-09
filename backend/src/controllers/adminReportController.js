const reportService = require('../services/reportService');

exports.getPipeline = async (req, res) => {
  try {
    const data = await reportService.getPipeline(req.query || {}, req.user);
    res.json({ success: true, data, message: 'Lấy báo cáo pipeline thành công' });
  } catch (error) {
    if (error && error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Report pipeline error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server khi lấy báo cáo' });
  }
};

exports.getMetrics = async (req, res) => {
  res.json({ success: true, data: reportService.METRIC_REGISTRY, message: 'Danh sách metric báo cáo' });
};

exports.getLead360 = async (req, res) => {
  try {
    const data = await reportService.getLead360(req.params.id, req.user);
    res.json({ success: true, data, message: 'Lấy báo cáo chi tiết Lead thành công' });
  } catch (error) {
    if (error && error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Report lead360 error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server khi lấy báo cáo Lead' });
  }
};

exports.getConfig = async (req, res) => {
  try {
    const data = await reportService.getDashboardConfig(req.query.dashboard);
    res.json({ success: true, data, message: 'Lấy cấu hình dashboard thành công' });
  } catch (error) {
    console.error('Report config get error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server khi lấy cấu hình' });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const data = await reportService.updateDashboardConfig(req.query.dashboard, req.body && req.body.widgets, req.user && req.user.id);
    res.json({ success: true, data, message: 'Lưu cấu hình dashboard thành công' });
  } catch (error) {
    if (error && error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Report config update error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server khi lưu cấu hình' });
  }
};
