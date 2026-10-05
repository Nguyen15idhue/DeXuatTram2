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

module.exports = router;
