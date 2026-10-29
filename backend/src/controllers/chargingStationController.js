const chargingStationService = require('../services/chargingStationService');

const sendError = (res, error) => {
  console.error('Charging station error:', error);
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Lỗi server'
  });
};

const actorOf = (req) => ({
  actorId: req.user ? req.user.id : null,
  actorRole: req.user ? req.user.role : null,
  ip: req.ip
});

exports.list = async (req, res) => {
  try {
    const { stage = '', search = '', page = 1, limit = 20 } = req.query;
    const result = await chargingStationService.listChargingStations({ stage, search, page, limit, user: req.user });
    res.json({ success: true, data: result.items, pagination: result.pagination });
  } catch (error) {
    sendError(res, error);
  }
};

exports.detail = async (req, res) => {
  try {
    const data = await chargingStationService.getChargingStationDetail(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
};

exports.update = async (req, res) => {
  try {
    const data = await chargingStationService.updateChargingStation(req.params.id, req.body, actorOf(req));
    res.json({ success: true, data, message: 'Đã cập nhật ON trạm' });
  } catch (error) {
    sendError(res, error);
  }
};

exports.changeStatus = async (req, res) => {
  try {
    const data = await chargingStationService.changeStatus(req.params.id, req.body, actorOf(req));
    res.json({ success: true, data, message: 'Đã chuyển trạng thái' });
  } catch (error) {
    sendError(res, error);
  }
};

exports.updateAcceptance = async (req, res) => {
  try {
    const data = await chargingStationService.updateAcceptance(req.params.id, req.body, actorOf(req));
    res.json({ success: true, data, message: 'Đã cập nhật thông tin nghiệm thu' });
  } catch (error) {
    sendError(res, error);
  }
};

exports.setAcceptanceFile = async (req, res) => {
  try {
    const data = await chargingStationService.setAcceptanceFile(req.params.id, req.body ? req.body.file_id : null, actorOf(req));
    res.json({ success: true, data, message: 'Đã lưu biên bản nghiệm thu' });
  } catch (error) {
    sendError(res, error);
  }
};

exports.addImages = async (req, res) => {
  try {
    const data = await chargingStationService.addAcceptanceImages(req.params.id, req.body ? req.body.file_ids : [], actorOf(req));
    res.json({ success: true, data, message: 'Đã thêm ảnh nghiệm thu' });
  } catch (error) {
    sendError(res, error);
  }
};

exports.removeImage = async (req, res) => {
  try {
    const data = await chargingStationService.removeAcceptanceImage(req.params.id, req.params.fileId, actorOf(req));
    res.json({ success: true, data, message: 'Đã xóa ảnh nghiệm thu' });
  } catch (error) {
    sendError(res, error);
  }
};
