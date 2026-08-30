const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const viewController = require('../controllers/viewController');

/**
 * @swagger
 * /api/views:
 *   get:
 *     tags: [Views]
 *     summary: Lấy danh sách views
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: entity
 *         schema:
 *           type: string
 *           enum: [stations, station_proposals, users]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
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
 *         description: Không có quyền Admin
 */
router.get('/', requireAuth, requireAdmin, viewController.getAll);

/**
 * @swagger
 * /api/views/{id}:
 *   get:
 *     tags: [Views]
 *     summary: Lấy view + fields theo ID (công khai)
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
 *         description: Không tìm thấy view
 */
router.get('/:id', viewController.getById);

/**
 * @swagger
 * /api/views:
 *   post:
 *     tags: [Views]
 *     summary: Tạo view mới
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [entity, name]
 *             properties:
 *               entity:
 *                 type: string
 *                 enum: [stations, station_proposals, users]
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *     responses:
 *       201:
 *         description: Tạo thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 */
router.post('/', requireAuth, requireAdmin, viewController.create);

/**
 * @swagger
 * /api/views/{id}:
 *   put:
 *     tags: [Views]
 *     summary: Cập nhật view
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
 *             required: [entity, name]
 *             properties:
 *               entity:
 *                 type: string
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 *       404:
 *         description: Không tìm thấy
 */
router.put('/:id', requireAuth, requireAdmin, viewController.update);

/**
 * @swagger
 * /api/views/{id}:
 *   delete:
 *     tags: [Views]
 *     summary: Xóa view (CASCADE xóa view_fields)
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
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 *       404:
 *         description: Không tìm thấy
 */
router.delete('/:id', requireAuth, requireAdmin, viewController.delete);

module.exports = router;
