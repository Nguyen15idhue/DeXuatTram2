const reportService = require('../services/reportService');
const reportBuilderService = require('../services/reportBuilderService');

const sendErr = (res, error, fallback) => {
  if (error && error.statusCode) {
    return res.status(error.statusCode).json({ success: false, message: error.message });
  }
  console.error(fallback, error);
  res.status(500).json({ success: false, message: 'Lỗi server' });
};

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
    sendErr(res, error, 'Report lead360 error:');
  }
};

exports.exportLead360 = async (req, res) => {
  try {
    const data = await reportService.lead360Csv(req.params.id, req.user);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${data.filename}"`);
    res.send(data.csv);
  } catch (error) {
    sendErr(res, error, 'Report lead360 export error:');
  }
};

exports.exportBuilderWidget = async (req, res) => {
  try {
    const data = await reportService.builderCsv(req.body && req.body.widget, req.user);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${data.filename}"`);
    res.send(data.csv);
  } catch (error) {
    sendErr(res, error, 'Report builder export error:');
  }
};

exports.getBuilderDatasets = async (req, res) => {
  res.json({ success: true, data: reportBuilderService.getCatalog(), message: 'Danh sách dataset builder' });
};

exports.previewBuilderWidget = async (req, res) => {
  try {
    const data = await reportBuilderService.compileWidget(req.body && req.body.widget, req.user);
    res.json({ success: true, data, message: 'Xem trước widget thành công' });
  } catch (error) {
    sendErr(res, error, 'Report builder preview error:');
  }
};

exports.listBuilderDashboards = async (req, res) => {
  try {
    const data = await reportBuilderService.listDashboards();
    res.json({ success: true, data, message: 'Danh sách dashboard tự dựng' });
  } catch (error) {
    sendErr(res, error, 'Report builder list error:');
  }
};

exports.createBuilderDashboard = async (req, res) => {
  try {
    const data = await reportBuilderService.createDashboard(req.body, req.user && req.user.id);
    res.json({ success: true, data, message: 'Tạo dashboard thành công' });
  } catch (error) {
    sendErr(res, error, 'Report builder create error:');
  }
};

exports.getBuilderDashboard = async (req, res) => {
  try {
    const data = await reportBuilderService.getDashboard(req.params.id);
    res.json({ success: true, data, message: 'Chi tiết dashboard' });
  } catch (error) {
    sendErr(res, error, 'Report builder get error:');
  }
};

exports.updateBuilderDashboard = async (req, res) => {
  try {
    const data = await reportBuilderService.updateDashboard(req.params.id, req.body, req.user && req.user.id);
    res.json({ success: true, data, message: 'Lưu dashboard thành công' });
  } catch (error) {
    sendErr(res, error, 'Report builder update error:');
  }
};

exports.deleteBuilderDashboard = async (req, res) => {
  try {
    const data = await reportBuilderService.deleteDashboard(req.params.id);
    res.json({ success: true, data, message: 'Xóa dashboard thành công' });
  } catch (error) {
    sendErr(res, error, 'Report builder delete error:');
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
    const data = await reportService.updateDashboardConfig(req.query.dashboard, req.body && req.body.widgets, req.user && req.user.id, req.body);
    res.json({ success: true, data, message: 'Lưu cấu hình dashboard thành công' });
  } catch (error) {
    if (error && error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Report config update error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server khi lưu cấu hình' });
  }
};
