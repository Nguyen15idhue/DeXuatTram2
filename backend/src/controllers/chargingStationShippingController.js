const shipping = require('../services/chargingStationShippingService');
const access = require('../services/chargingStationAccessService');

const handler = (method) => async (req, res) => {
  try {
    await access.assertView(req.params.id, req.user);
    const ctx = { actorId: req.user.id, actorRole: req.user.role, ip: req.ip };
    const data = method === 'getSummary'
      ? await shipping.getSummary(req.params.id)
      : method === 'createExport'
        ? await shipping.createExport(req.params.id, req.body, req.user, ctx)
        : await shipping[method](req.params.id, req.params.exportId, req.body, req.user, ctx);
    res.json({ success: true, data });
  } catch (error) {
    console.error('[ChargingStationShipping]', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Không xử lý được giao trụ' });
  }
};

exports.summary = handler('getSummary');
exports.create = handler('createExport');
exports.receive = handler('receive');
exports.requestReturn = handler('requestReturn');
exports.confirmReturn = handler('confirmReturn');
exports.fail = handler('markFailed');
