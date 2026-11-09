// backend/src/controllers/crmPartnerController.js
const crmInboundService = require('../services/crmInboundService');

exports.receiveLeads = async (req, res) => {
  const start = Date.now();
  try {
    const events = Array.isArray(req.body && req.body.events) ? req.body.events : [];
    if (events.length === 0) {
      const crmWebhookLogService = require('../services/crmWebhookLogService');
      await crmWebhookLogService.logInbound({ eventId: null, eventType: null, status: 'failed', httpStatus: 400, payload: req.body, error: 'Thiếu events', durationMs: Date.now() - start });
      return res.status(400).json({ success: false, message: 'Thiếu events' });
    }
    if (events.length > 50) {
      const crmWebhookLogService = require('../services/crmWebhookLogService');
      await crmWebhookLogService.logInbound({ eventId: null, eventType: null, status: 'failed', httpStatus: 413, payload: req.body, error: 'Tối đa 50 event mỗi gói', durationMs: Date.now() - start });
      return res.status(413).json({ success: false, message: 'Tối đa 50 event mỗi gói' });
    }
    const result = await crmInboundService.processWebhookEvents(events);
    const crmWebhookLogService = require('../services/crmWebhookLogService');
    for (const ev of events) {
      await crmWebhookLogService.logInbound({
        eventId: ev.id, eventType: ev.type, crmLeadId: ev.data?.id || null,
        status: (result.errors || []).some((e) => e.id === ev.id) ? 'failed' : 'processed',
        httpStatus: 200, payload: ev, response: result, durationMs: Date.now() - start
      });
    }
    return res.status(200).json({
      ok: true,
      success: true,
      received: result.received,
      applied: result.applied,
      duplicate: result.duplicate,
      unchanged: result.unchanged || 0,
      errors: result.errors || []
    });
  } catch (error) {
    const crmWebhookLogService = require('../services/crmWebhookLogService');
    await crmWebhookLogService.logInbound({ eventId: null, eventType: null, status: 'failed', httpStatus: 500, payload: req.body, error: error.message || 'Lỗi server', durationMs: Date.now() - start });
    console.error('CRM inbound webhook error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};
