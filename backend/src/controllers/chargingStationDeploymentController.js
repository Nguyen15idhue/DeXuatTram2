const service = require('../services/chargingStationDeploymentService');
const access = require('../services/chargingStationAccessService');

const sendError = (res, error) => res.status(error.statusCode || 500).json({
  success: false, message: error.statusCode ? error.message : 'Lỗi xử lý phần trụ'
});

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
