const express = require('express');
const router = express.Router();
const { requireAuth, requireSuperAdmin } = require('../middlewares/auth');
const automationController = require('../controllers/automationController');

router.use(requireAuth, requireSuperAdmin);

/**
 * @swagger
 * /api/admin/automations:
 *   get:
 *     tags: [Admin - Automations]
 *     summary: Danh sách automation gán quy trình vào dự án (SUPER_ADMIN, không trả password)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/', automationController.list);

/**
 * @swagger
 * /api/admin/automations/auto_assign_process:
 *   get:
 *     tags: [Admin - Automations]
 *     summary: Chi tiết automation (trả password_set, không trả password thô)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/auto_assign_process', automationController.get);

/**
 * @swagger
 * /api/admin/automations/auto_assign_process:
 *   put:
 *     tags: [Admin - Automations]
 *     summary: Lưu cấu hình automation (password/api_token vắng = giữ cũ)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *               project_code:
 *                 type: string
 *               retry_max:
 *                 type: integer
 *               retry_interval_s:
 *                 type: integer
 *               find_timeout_s:
 *                 type: integer
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *               api_token:
 *                 type: string
 *               note:
 *                 type: string
 *     responses:
 *       200:
 *         description: Thành công
 */
router.put('/auto_assign_process', automationController.update);

/**
 * @swagger
 * /api/admin/automations/auto_assign_process/test-login:
 *   post:
 *     tags: [Admin - Automations]
 *     summary: Test đăng nhập 1Office (dùng saved nếu body vắng, không lưu gì)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *               api_token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Thành công
 */
router.post('/auto_assign_process/test-login', automationController.testLogin);

/**
 * @swagger
 * /api/admin/automations/auto_assign_process/run:
 *   post:
 *     tags: [Admin - Automations]
 *     summary: Chạy thủ công theo mã đề xuất (tối đa timeout/retries đã cấu hình)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [proposal_code]
 *             properties:
 *               proposal_code:
 *                 type: string
 *     responses:
 *       200:
 *         description: Thành công
 */
router.post('/auto_assign_process/run', automationController.runManual);

/**
 * @swagger
 * /api/admin/automations/auto_assign_process/runs:
 *   get:
 *     tags: [Admin - Automations]
 *     summary: Lịch sử chạy automation (phân trang, lọc status)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/auto_assign_process/runs', automationController.runs);

/**
 * @swagger
 * /api/admin/automations/auto_assign_process/runs/{id}:
 *   get:
 *     tags: [Admin - Automations]
 *     summary: Chi tiết 1 lượt chạy (request/response JSON)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/auto_assign_process/runs/:id', automationController.runDetail);

/**
 * @swagger
 * /api/admin/automations/{key}:
 *   put:
 *     tags: [Admin - Automations]
 *     summary: Lưu cấu hình automation theo key (auto_assign_process, sync_process_report)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thành công
 */
router.put('/:key', automationController.updateByKey);

/**
 * @swagger
 * /api/admin/automations/sync/fields:
 *   get:
 *     tags: [Admin - Automations]
 *     summary: Cây field 1Office theo version (có user_name suy ra, cache 24h)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: version
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: refresh
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/sync/fields', automationController.syncFields);

/**
 * @swagger
 * /api/admin/automations/sync/versions:
 *   get:
 *     tags: [Admin - Automations]
 *     summary: Danh sách version đã cache cây field
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/sync/versions', automationController.syncVersions);

/**
 * @swagger
 * /api/admin/automations/sync/refresh-all:
 *   post:
 *     tags: [Admin - Automations]
 *     summary: Quét lại toàn bộ version từ 1Office (dùng khi cache trống)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 */
router.post('/sync/refresh-all', automationController.syncRefreshAll);

/**
 * @swagger
 * /api/admin/automations/sync/mappings:
 *   get:
 *     tags: [Admin - Automations]
 *     summary: Danh sách mapping Sheet theo version
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: version
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thành công
 *   put:
 *     tags: [Admin - Automations]
 *     summary: Lưu mapping Sheet theo version (mảng items)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: version
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/sync/mappings', automationController.syncMappingsGet);
router.put('/sync/mappings', automationController.syncMappingsPut);
router.delete('/sync/mappings', automationController.syncMappingsDelete);

/**
 * @swagger
 * /api/admin/automations/sync/mappings:
 *   delete:
 *     tags: [Admin - Automations]
 *     summary: Xóa mapping (1 version hoặc tất cả với version=all)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: version
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thành công
 */

/**
 * @swagger
 * /api/admin/automations/sync/copy-map:
 *   post:
 *     tags: [Admin - Automations]
 *     summary: Copy mapping từ version cũ sang version mới
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 */
router.post('/sync/copy-map', automationController.syncCopyMap);

/**
 * @swagger
 * /api/admin/automations/sync/auto-match:
 *   post:
 *     tags: [Admin - Automations]
 *     summary: Tự động map bộ trường cần thiết của version (bỏ qua field đã map)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 */
router.post('/sync/auto-match', automationController.syncAutoMatch);

/**
 * @swagger
 * /api/admin/automations/sync/sheet-headers:
 *   get:
 *     tags: [Admin - Automations]
 *     summary: Đọc header dòng 1 của tab Sheet (Get mới nhất)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tab
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/sync/sheet-headers', automationController.syncSheetHeaders);

/**
 * @swagger
 * /api/admin/automations/sync/sheet-column:
 *   post:
 *     tags: [Admin - Automations]
 *     summary: Thêm 1 cột header mới vào tab Sheet
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 */
router.post('/sync/sheet-column', automationController.syncSheetAddColumn);

/**
 * @swagger
 * /api/admin/automations/sync/test:
 *   post:
 *     tags: [Admin - Automations]
 *     summary: Test đồng bộ dry-run (preview, không ghi Sheet)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 */
router.post('/sync/test', automationController.syncTest);

/**
 * @swagger
 * /api/admin/automations/sync/run:
 *   post:
 *     tags: [Admin - Automations]
 *     summary: Đồng bộ tay lên Sheet
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 */
router.post('/sync/run', automationController.syncRun);

/**
 * @swagger
 * /api/admin/automations/sync/sample-excel:
 *   get:
 *     tags: [Admin - Automations]
 *     summary: Xuất Excel mẫu từ mapping (3 quy trình thật)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: version
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/sync/sample-excel', automationController.syncSampleExcel);

/**
 * @swagger
 * /api/admin/automations/sync/runs:
 *   get:
 *     tags: [Admin - Automations]
 *     summary: Lịch sử chạy đồng bộ Sheet
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/sync/runs', automationController.syncRuns);

/**
 * @swagger
 * /api/admin/automations/sync/runs/{id}:
 *   get:
 *     tags: [Admin - Automations]
 *     summary: Chi tiết 1 lượt đồng bộ
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/sync/runs/:id', automationController.syncRunDetail);

/**
 * @swagger
 * /api/admin/automations/{key}:
 *   get:
 *     tags: [Admin - Automations]
 *     summary: Chi tiết automation theo key
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/:key', automationController.getByKeyRoute);

module.exports = router;
