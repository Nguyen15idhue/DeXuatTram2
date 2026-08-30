const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth');
const { validateCreateProposal } = require('../middlewares/validators');
const proposalController = require('../controllers/proposalController');

/**
 * @swagger
 * /api/proposals:
 *   get:
 *     tags: [Proposals]
 *     summary: Lấy danh sách đề xuất (công khai)
 *     description: Hiển thị trên bản đồ, không phân trang
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
 *                     $ref: '#/components/schemas/Proposal'
 */
router.get('/', proposalController.getAll);

/**
 * @swagger
 * /api/proposals/{id}:
 *   get:
 *     tags: [Proposals]
 *     summary: Lấy thông tin đề xuất theo ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
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
 *                   $ref: '#/components/schemas/Proposal'
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.get('/:id', proposalController.getById);

/**
 * @swagger
 * /api/proposals:
 *   post:
 *     tags: [Proposals]
 *     summary: Tạo đề xuất mới
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [latitude, longitude, owner_name, owner_phone, address]
 *             properties:
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
 *               owner_name:
 *                 type: string
 *                 example: Nguyen Van A
 *               owner_phone:
 *                 type: string
 *                 pattern: '^\d{10}$'
 *                 example: 0912345678
 *               address:
 *                 type: string
 *                 example: Quận Hoàn Kiếm, Hà Nội
 *               area:
 *                 type: string
 *                 example: 100m2
 *               land_type:
 *                 type: string
 *                 example: Dân cư
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
 *                   $ref: '#/components/schemas/Proposal'
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 */
router.post('/', requireAuth, validateCreateProposal, proposalController.create);

module.exports = router;
