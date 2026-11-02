const proposalSheetSyncService = require('../services/proposalSheetSyncService');

const sendError = (res, error) => {
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Lỗi đồng bộ Google Sheets'
  });
};

exports.status = async (req, res) => {
  try {
    const data = await proposalSheetSyncService.getStatus();
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
};

exports.dailySync = async (req, res) => {
  try {
    const data = await proposalSheetSyncService.startDailySync(req.user.id);
    res.status(data.status === 'SUCCESS' ? 200 : 202).json({
      success: true,
      data,
      message: data.alreadyRunning
        ? 'Một lượt đồng bộ cuối ngày đang chạy'
          : data.total_count === 0
            ? 'Không có đề xuất hoặc mục hàng đợi để đối soát'
            : `Đã xếp ${data.total_count} đề xuất và mục hàng đợi vào lượt đối soát`
    });
  } catch (error) {
    sendError(res, error);
  }
};
