const onStationSheetSyncService = require('../services/onStationSheetSyncService');

const sendError = (res, error) => {
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Lỗi đồng bộ Google Sheet trạm ON'
  });
};

exports.status = async (req, res) => {
  try {
    const data = await onStationSheetSyncService.getStatus();
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
};

exports.dailySync = async (req, res) => {
  try {
    const data = await onStationSheetSyncService.startDailySync(req.user.id);
    if (data.message) {
      return res.status(503).json({ success: false, message: data.message, data });
    }
    res.json({
      success: true,
      data,
      message: data.queued === 0
        ? 'Không có trạm ON (đề xuất ACTIVE) để đồng bộ'
        : `Đã xếp ${data.queued} trạm ON vào hàng đợi đồng bộ`
    });
  } catch (error) {
    sendError(res, error);
  }
};

exports.cancel = async (req, res) => {
  try {
    const data = await onStationSheetSyncService.cancelQueuedJobs();
    res.json({
      success: true,
      data,
      message: data.cancelled
        ? `Đã hủy ${data.cancelled} mục đồng bộ`
        : 'Không còn mục đồng bộ đang chờ hoặc thất bại để hủy'
    });
  } catch (error) {
    console.error('[OnStationSheetSync] Cancel failed:', error);
    res.status(500).json({ success: false, message: 'Không thể hủy các mục đồng bộ đang chờ' });
  }
};
