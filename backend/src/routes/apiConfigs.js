const express = require('express');
const router = express.Router();
const { requireAuth, requireSuperAdmin } = require('../middlewares/auth');
const apiConfigController = require('../controllers/apiConfigController');

/**
 * @swagger
 * /api/admin/api-configs:
 *   get:
 *     tags: [API Configs]
 *     summary: Lấy danh sách cấu hình API
 *     description: SUPER_ADMIN xem tất cả. Phân trang, search, filter theo is_active.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search theo tên hoặc mô tả
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *         description: Filter theo trạng thái active
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền SUPER_ADMIN
 */
router.get('/', requireAuth, requireSuperAdmin, apiConfigController.getAll);

/**
 * @swagger
 * /api/admin/api-configs/{id}:
 *   get:
 *     tags: [API Configs]
 *     summary: Lấy chi tiết cấu hình API theo ID
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
 *       404:
 *         description: Không tìm thấy
 */
router.get('/:id', requireAuth, requireSuperAdmin, apiConfigController.getById);

/**
 * @swagger
 * /api/admin/api-configs/{id}/1office-users:
 *   get:
 *     tags: [API Configs]
 *     summary: Lấy danh sách user 1Office (phân trang, cần admin token)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Thiếu admin token
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền SUPER_ADMIN
 *       404:
 *         description: Không tìm thấy cấu hình
 *       502:
 *         description: Lỗi 1Office
 */
router.get('/:id/1office-users', requireAuth, requireSuperAdmin, apiConfigController.get1OfficeUsers);

/**
 * @swagger
 * /api/admin/api-configs:
 *   post:
 *     tags: [API Configs]
 *     summary: Tạo cấu hình API mới
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, base_url, auth_config]
 *             properties:
 *               name:
 *                 type: string
 *                 description: Tên cấu hình (unique)
 *               base_url:
 *                 type: string
 *                 format: uri
 *                 description: "Base URL của API (VD: https://egr.1office.vn)"
 *               auth_type:
 *                 type: string
 *                 enum: [token, basic, oauth2, api_key]
 *                 default: token
 *               auth_config:
 *                 type: object
 *                 description: "Thông tin xác thực (VD: { token: 'xxx' })"
 *               description:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Tạo thành công
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc duplicate name
 */
router.post('/', requireAuth, requireSuperAdmin, apiConfigController.create);

/**
 * @swagger
 * /api/admin/api-configs/{id}:
 *   put:
 *     tags: [API Configs]
 *     summary: Cập nhật cấu hình API
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               base_url:
 *                 type: string
 *               auth_type:
 *                 type: string
 *               auth_config:
 *                 type: object
 *               description:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       404:
 *         description: Không tìm thấy
 */
router.put('/:id', requireAuth, requireSuperAdmin, apiConfigController.update);

/**
 * @swagger
 * /api/admin/api-configs/{id}:
 *   delete:
 *     tags: [API Configs]
 *     summary: Xóa cấu hình API
 *     description: "Xóa cấu hình và cascade xóa field_mappings liên quan"
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
 *         description: Xóa thành công
 *       404:
 *         description: Không tìm thấy
 */
router.delete('/:id', requireAuth, requireSuperAdmin, apiConfigController.remove);

/**
 * @swagger
 * /api/admin/api-configs/{id}/test:
 *   post:
 *     tags: [API Configs]
 *     summary: Test kết nối API với cấu hình hiện tại
 *     description: "Gửi request test đến API, trả về status và response_time"
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
 *         description: Kết quả test (connected/failed)
 *       404:
 *         description: Không tìm thấy cấu hình
 */
router.post('/:id/test', requireAuth, requireSuperAdmin, apiConfigController.testConnection);

module.exports = router;
