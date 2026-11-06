const express = require('express');
const router = express.Router();
const { requireAuth, requireSuperAdmin } = require('../middlewares/auth');
const crmConfigController = require('../controllers/crmConfigController');

router.get('/config', requireAuth, requireSuperAdmin, crmConfigController.getConfig);
router.post('/sync-now', requireAuth, requireSuperAdmin, crmConfigController.syncNow);
router.get('/outbox', requireAuth, requireSuperAdmin, crmConfigController.listOutbox);
router.post('/outbox/:id/retry', requireAuth, requireSuperAdmin, crmConfigController.retryOutbox);
router.post('/outbox/retry-all', requireAuth, requireSuperAdmin, crmConfigController.retryAllOutbox);
router.post('/test-webhook', requireAuth, requireSuperAdmin, crmConfigController.testWebhook);
router.get('/logs', requireAuth, requireSuperAdmin, crmConfigController.listLogs);
router.get('/logs/export', requireAuth, requireSuperAdmin, crmConfigController.exportLogs);
router.get('/logs/:id', requireAuth, requireSuperAdmin, crmConfigController.getLogDetail);

module.exports = router;
