const express = require('express');
const router = express.Router();
const { requireAuth, requireSuperAdmin } = require('../middlewares/auth');
const automationController = require('../controllers/automationController');

router.use(requireAuth, requireSuperAdmin);

router.get('/', automationController.list);

router.post('/', automationController.create);

router.get('/type/:type', automationController.listByType);

router.get('/sync/versions', automationController.syncVersions);

router.post('/sync/refresh-all', automationController.syncRefreshAll);

router.get('/sync/fields', automationController.syncFields);

router.get('/sync/mappings', automationController.syncMappingsGet);
router.put('/sync/mappings', automationController.syncMappingsPut);
router.delete('/sync/mappings', automationController.syncMappingsDelete);

router.post('/sync/copy-map', automationController.syncCopyMap);

router.post('/sync/auto-match', automationController.syncAutoMatch);

/**
 * @swagger
 * /api/admin/automations/sync/bulk-plan:
 *   post:
 *     summary: Xem trước áp dụng mapping hàng loạt sang nhiều version
 *     tags: [Automations]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/sync/bulk-plan', automationController.syncBulkPlan);

/**
 * @swagger
 * /api/admin/automations/sync/bulk-apply:
 *   post:
 *     summary: Áp dụng mapping hàng loạt (merge) sang nhiều version
 *     tags: [Automations]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/sync/bulk-apply', automationController.syncBulkApply);

router.get('/sync/sheet-headers', automationController.syncSheetHeaders);

router.post('/sync/sheet-column', automationController.syncSheetAddColumn);

router.post('/sync/sheet-column-insert', automationController.syncSheetInsertColumn);

router.post('/sync/test', automationController.syncTest);

router.post('/sync/run', automationController.syncRun);

router.get('/sync/sample-excel', automationController.syncSampleExcel);

router.get('/sync/templates', automationController.syncListTemplates);

router.post('/sync/template-versions', automationController.syncGetTemplateVersions);

router.get('/sync/runs', automationController.syncRuns);

router.get('/sync/runs/:id', automationController.syncRunDetail);

router.get('/:key', automationController.get);

router.put('/:key', automationController.update);

router.post('/:key/test-login', automationController.testLogin);

router.post('/:key/run', automationController.runManual);

router.get('/:key/runs', automationController.runs);

router.get('/:key/runs/:id', automationController.runDetail);

module.exports = router;