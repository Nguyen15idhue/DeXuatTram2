// backend/src/controllers/crmPartnerController.js
const crmInboundService = require('../services/crmInboundService');

exports.receiveLeads = async (req, res) => {
  try {
    const events = Array.isArray(req.body && req.body.events) ? req.body.events : [];
    if (events.length === 0) {
      return res.status(400).json({ success: false, message: 'Thiếu events' });
    }
    if (events.length > 50) {
      return res.status(413).json({ success: false, message: 'Tối đa 50 event mỗi gói' });
    }
    const result = await crmInboundService.processWebhookEvents(events);
    return res.status(200).json({
      success: true,
      received: result.received,
      applied: result.applied,
      duplicate: result.duplicate,
      unchanged: result.unchanged || 0,
      errors: result.errors || []
    });
  } catch (error) {
    console.error('CRM inbound webhook error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};
