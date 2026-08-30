const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const { validateCreateStation, validateUpdateStation } = require('../middlewares/validators');
const stationController = require('../controllers/stationController');

/**
 * @swagger
 * /api/stations:
 *   get:
 *     tags: [Stations]
 *     summary: Lấy danh sách trạm (công khai)
 *     description: Tìm kiếm, lọc theo trạng thái, phân trang
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Tìm theo tên hoặc địa chỉ
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, DEPLOYING]
 *         description: Lọc theo trạng thái
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Station'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/', stationController.getAll);

/**
 * @swagger
 * /api/stations/{id}:
 *   get:
 *     tags: [Stations]
 *     summary: Lấy thông tin trạm theo ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID trạm
 *     responses:
 *       200:
 *         description: Thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Station'
 *       404:
 *         description: Không tìm thấy trạm
 */
router.get('/:id', stationController.getById);

/**
 * @swagger
 * /api/stations:
 *   post:
 *     tags: [Stations]
 *     summary: Tạo trạm mới (Admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, latitude, longitude, address]
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 example: Trạm Hà Nội
 *               latitude:
 *                 type: number
 *                 minimum: -90
 *                 maximum: 90
 *                 example: 21.0285
 *               longitude:
 *                 type: number
 *                 minimum: -180
 *                 maximum: 180
 *                 example: 105.8542
 *               address:
 *                 type: string
 *                 example: Quận Hoàn Kiếm, Hà Nội
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, DEPLOYING]
 *                 default: ACTIVE
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Station'
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 */
router.post('/', requireAuth, requireAdmin, validateCreateStation, stationController.create);

/**
 * @swagger
 * /api/stations/{id}:
 *   put:
 *     tags: [Stations]
 *     summary: Cập nhật trạm (Admin)
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
 *             required: [name, latitude, longitude, address, status]
 *             properties:
 *               name:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               address:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, DEPLOYING]
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 *       404:
 *         description: Không tìm thấy trạm
 */
router.put('/:id', requireAuth, requireAdmin, validateUpdateStation, stationController.update);

/**
 * @swagger
 * /api/stations/{id}:
 *   delete:
 *     tags: [Stations]
 *     summary: Xóa trạm (Admin)
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
 *         description: Không tìm thấy trạm
 */
router.delete('/:id', requireAuth, requireAdmin, stationController.delete);

module.exports = router;
