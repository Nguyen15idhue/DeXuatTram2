const service = require('../services/chargingStationDeploymentService');
const access = require('../services/chargingStationAccessService');

const sendError = (res, error) => {
  console.error('[ChargingStationDeployment]', error);
  return res.status(error.statusCode || 500).json({
    success: false, message: error.statusCode ? error.message : 'Lỗi xử lý phần trụ'
  });
};

exports.list = async (req, res) => {
  try {
    await access.assertView(req.params.id, req.user);
    res.json({ success: true, data: await service.getDeployments(req.params.id) });
  } catch (error) { sendError(res, error); }
};

exports.update = async (req, res) => {
  try {
    const data = await service.updatePortion(req.params.id, req.params.deploymentId, req.body, req.user, { ip: req.ip });
    res.json({ success: true, data, message: 'Đã cập nhật phần trụ' });
  } catch (error) { sendError(res, error); }
};

exports.installation = async (req, res) => {
  try {
    const data = await service.updateInstallation(req.params.id, req.body, req.user, { ip: req.ip });
    res.json({ success: true, data, message: 'Đã lưu trạng thái lắp trụ' });
  } catch (error) { sendError(res, error); }
};

exports.onStation = async (req, res) => {
  try {
    const data = await require('../services/chargingStationCompletionService').updateOn(req.params.id, req.body, req.user, { ip: req.ip });
    res.json({ success: true, data, message: 'Đã xác nhận ON các phần trụ' });
  } catch (error) { sendError(res, error); }
};
