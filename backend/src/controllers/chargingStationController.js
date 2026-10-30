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
    const { stage = '', tab = 'need', search = '', page = 1, limit = 20 } = req.query;
    const result = await chargingStationService.listChargingStations({ stage, tab, search, page, limit, user: req.user });
    res.json({ success: true, data: result.items, pagination: result.pagination });
  } catch (error) {
    sendError(res, error);
  }
};

exports.taskCounts = async (req, res) => {
  try {
    const data = await chargingStationService.getChargingStationTaskCounts(req.user);
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
};

exports.detail = async (req, res) => {
  try {
    const data = await chargingStationService.getChargingStationDetail(req.params.id, req.user);
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
};

exports.startContract = async (req, res) => {
  try {
    const data = await chargingStationService.startContractSigning(req.params.id, req.user, actorOf(req));
    res.json({ success: true, data, message: 'Đã chuyển hợp đồng sang trạng thái Đang ký' });
  } catch (error) {
    sendError(res, error);
  }
};

exports.completeContract = async (req, res) => {
  try {
    const data = await chargingStationService.completeContract(
      req.params.id,
      req.body ? req.body.file_id : null,
      req.user,
      actorOf(req)
    );
    res.json({ success: true, data, message: 'Đã hoàn tất hợp đồng và chuyển trạng thái thanh toán sang Đang làm' });
  } catch (error) {
    sendError(res, error);
  }
};

exports.startInfrastructure = async (req, res) => {
  try {
    const data = await chargingStationService.updateInfrastructureStatus(
      req.params.id,
      req.params.type,
      'start',
      req.user,
      actorOf(req)
    );
    res.json({ success: true, data, message: 'Đã chuyển hạng mục sang trạng thái Đang làm' });
  } catch (error) {
    sendError(res, error);
  }
};

exports.completeInfrastructure = async (req, res) => {
  try {
    const data = await chargingStationService.updateInfrastructureStatus(
      req.params.id,
      req.params.type,
      'complete',
      req.user,
      actorOf(req)
    );
    res.json({ success: true, data, message: 'Đã xác nhận hoàn thành hạng mục hạ tầng' });
  } catch (error) {
    sendError(res, error);
  }
};

exports.requestEarlyDelivery = async (req, res) => {
  try {
    const data = await chargingStationService.requestEarlyDelivery(
      req.params.id,
      req.body || {},
      req.user,
      actorOf(req)
    );
    res.json({ success: true, data, message: 'Đã gửi đề xuất giao trụ sớm cho Back Office' });
  } catch (error) {
    sendError(res, error);
  }
};

exports.createDeliveryExport = async (req, res) => {
  try {
    const data = await chargingStationService.createDeliveryExport(
      req.params.id,
      req.body || {},
      req.user,
      actorOf(req)
    );
    res.json({ success: true, data, message: 'Đã tạo phiếu xuất kho và chuyển trạng thái sang Đang giao trụ' });
  } catch (error) {
    sendError(res, error);
  }
};

exports.confirmDelivery = async (req, res) => {
  try {
    const data = await chargingStationService.confirmDelivery(req.params.id, req.user, actorOf(req));
    res.json({ success: true, data, message: 'Đã xác nhận giao trụ đến nơi và chuyển sang bước lắp đặt' });
  } catch (error) {
    sendError(res, error);
  }
};

exports.startInstallation = async (req, res) => {
  try {
    const data = await chargingStationService.updateInstallation(req.params.id, 'start', req.user, actorOf(req));
    res.json({ success: true, data, message: 'Đã chuyển trạng thái sang Đang lắp đặt' });
  } catch (error) {
    sendError(res, error);
  }
};

exports.completeInstallation = async (req, res) => {
  try {
    const data = await chargingStationService.updateInstallation(req.params.id, 'complete', req.user, actorOf(req));
    res.json({ success: true, data, message: 'Đã hoàn tất lắp đặt và chuyển sang nghiệm thu' });
  } catch (error) {
    sendError(res, error);
  }
};

exports.updateAcceptanceResult = async (req, res) => {
  try {
    const data = await chargingStationService.updateAcceptanceResult(
      req.params.id,
      req.body ? req.body.result : null,
      req.user,
      actorOf(req)
    );
    const message = req.body?.result === 'ACCEPT_PASSED'
      ? 'Đã xác nhận nghiệm thu đạt; trạm chuyển sang cấu hình'
      : 'Đã ghi nhận nghiệm thu không đạt';
    res.json({ success: true, data, message });
  } catch (error) {
    sendError(res, error);
  }
};

exports.completeConfiguration = async (req, res) => {
  try {
    const data = await chargingStationService.completeConfiguration(
      req.params.id,
      req.body || {},
      req.user,
      actorOf(req)
    );
    res.json({ success: true, data, message: 'Đã hoàn tất cấu hình; trạm và đề xuất đã chuyển sang Hoạt động' });
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
    const data = await chargingStationService.updateAcceptance(req.params.id, req.body, req.user, actorOf(req));
    res.json({ success: true, data, message: 'Đã cập nhật thông tin nghiệm thu' });
  } catch (error) {
    sendError(res, error);
  }
};

exports.setAcceptanceFile = async (req, res) => {
  try {
    const data = await chargingStationService.setAcceptanceFile(req.params.id, req.body ? req.body.file_id : null, req.user, actorOf(req));
    res.json({ success: true, data, message: 'Đã lưu biên bản nghiệm thu' });
  } catch (error) {
    sendError(res, error);
  }
};

exports.addImages = async (req, res) => {
  try {
    const data = await chargingStationService.addAcceptanceImages(req.params.id, req.body ? req.body.file_ids : [], req.user, actorOf(req));
    res.json({ success: true, data, message: 'Đã thêm ảnh nghiệm thu' });
  } catch (error) {
    sendError(res, error);
  }
};

exports.removeImage = async (req, res) => {
  try {
    const data = await chargingStationService.removeAcceptanceImage(req.params.id, req.params.fileId, req.user, actorOf(req));
    res.json({ success: true, data, message: 'Đã xóa ảnh nghiệm thu' });
  } catch (error) {
    sendError(res, error);
  }
};
