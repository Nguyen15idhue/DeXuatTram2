const chargingStationService = require('../services/chargingStationService');
const chargingFinanceService = require('../services/chargingFinanceService');

const sendError = (res, error) => {
  console.error('Charging finance error:', error);
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

exports.listStations = async (req, res) => {
  try {
    const { tab = 'need', search = '', page = 1, limit = 20 } = req.query;
    const result = await chargingStationService.listChargingStations({
      stage: 'tai-chinh', tab, search, page, limit, user: req.user
    });
    res.json({ success: true, data: result.items, pagination: result.pagination });
  } catch (error) {
    sendError(res, error);
  }
};

exports.listInvoices = async (req, res) => {
  try {
    const result = await chargingFinanceService.listInvoices(
      req.query.charging_station_id,
      req.user,
      req.query
    );
    res.json({ success: true, data: result.items, pagination: result.pagination });
  } catch (error) {
    sendError(res, error);
  }
};

exports.createInvoice = async (req, res) => {
  try {
    const data = await chargingFinanceService.createInvoice(
      req.params.stationId,
      req.body || {},
      req.user,
      actorOf(req)
    );
    res.status(201).json({ success: true, data, message: 'Đã ghi nhận hóa đơn ON trạm' });
  } catch (error) {
    sendError(res, error);
  }
};

exports.updatePaymentStatus = async (req, res) => {
  try {
    const data = await chargingStationService.updatePaymentStatus(
      req.params.stationId,
      req.body || {},
      req.user,
      actorOf(req)
    );
    res.json({ success: true, data, message: 'Đã cập nhật trạng thái tài chính' });
  } catch (error) {
    sendError(res, error);
  }
};
