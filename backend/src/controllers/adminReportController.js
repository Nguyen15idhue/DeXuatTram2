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
