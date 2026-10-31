const chargingStationCareService = require('../services/chargingStationCareService');

const sendError = (res, error) => {
  console.error('Charging station care error:', error);
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
    const data = await chargingStationCareService.listCareLogs(req.params.id);
    res.json({ success: true, data });
  } catch (error) { sendError(res, error); }
};

exports.create = async (req, res) => {
  try {
    const data = await chargingStationCareService.createCareLog(req.params.id, req.body, actorOf(req));
    res.status(201).json({ success: true, data, message: 'Đã thêm lịch sử chăm sóc' });
  } catch (error) { sendError(res, error); }
};

exports.update = async (req, res) => {
  try {
    const data = await chargingStationCareService.updateCareLog(req.params.id, req.body, actorOf(req));
    res.json({ success: true, data, message: 'Đã cập nhật lịch sử chăm sóc' });
  } catch (error) { sendError(res, error); }
};

exports.remove = async (req, res) => {
  try {
    await chargingStationCareService.deleteCareLog(req.params.id);
    res.json({ success: true, message: 'Đã xóa lịch sử chăm sóc' });
  } catch (error) { sendError(res, error); }
};
