const service = require('../services/proposalDocumentRecoveryService');
const handler = method => async (req, res) => {
  try {
    const data = await service[method]({
      ...req.body, user: req.user, id: req.params.id, documentId: req.params.documentId,
      recoveryId: req.params.recoveryId, ip: req.ip
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error('[ProposalRecovery]', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Lỗi phục hồi BCĐX' });
  }
};
module.exports = {
  inspect: handler('inspect'), create: handler('create'), get: handler('get'),
  update: handler('update'), activate: handler('activate')
};
module.exports.image = async (req, res) => {
  try {
    const bytes = await service.image({ user: req.user, id: req.params.id, documentId: req.params.documentId,
      recoveryId: req.params.recoveryId, configId: req.params.configId });
    res.setHeader('Cache-Control', 'private, no-store');
    res.type('image/png').send(bytes);
  } catch (error) {
    console.error('[ProposalRecovery] image', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};
