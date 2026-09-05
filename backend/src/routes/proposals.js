const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth');
const { guestSubmitLimiter, guestTrackLimiter } = require('../middlewares/rateLimits');
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

/**
 * @swagger
 * /api/proposals/check-nearby:
 *   post:
 *     tags: [Proposals]
 *     summary: Kiểm tra điểm trùng vị trí trong bán kính cho trước
 *     description: So tọa độ với toàn bộ trạm và đề xuất (trừ REJECTED). Dùng khi điền form, chặn lưu nếu quá gần.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [latitude, longitude]
 *             properties:
 *               latitude:
 *                 type: number
 *                 example: 21.0285
 *               longitude:
 *                 type: number
 *                 example: 105.8542
 *               radius_m:
 *                 type: number
 *                 default: 200
 *                 description: Bán kính kiểm tra (m, tối đa 5000)
 *               exclude_id:
 *                 type: integer
 *                 description: Bỏ qua đề xuất có id này (khi sửa)
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 */
router.post('/check-nearby', requireAuth, proposalController.checkNearby);

/**
 * @swagger
 * /api/proposals/guest:
 *   post:
 *     tags: [Proposals]
 *     summary: Khách vãng lai gửi đề xuất (không cần đăng nhập)
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
 *               longitude:
 *                 type: number
 *               owner_name:
 *                 type: string
 *               owner_phone:
 *                 type: string
 *               address:
 *                 type: string
 *               captcha_token:
 *                 type: string
 *     responses:
 *       201:
 *         description: Gửi thành công, trả tracking_code + ma_de_xuat
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       429:
 *         description: Quá nhiều yêu cầu
 */
router.post('/guest', guestSubmitLimiter, validateCreateProposal, proposalController.createGuest);

/**
 * @swagger
 * /api/proposals/check-nearby-public:
 *   post:
 *     tags: [Proposals]
 *     summary: Kiểm tra trùng vị trí (public, cho form guest)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [latitude, longitude]
 *             properties:
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               radius_m:
 *                 type: number
 *                 default: 200
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 */
router.post('/check-nearby-public', guestTrackLimiter, proposalController.checkNearbyPublic);

/**
 * @swagger
 * /api/proposals/track/{code}:
 *   get:
 *     tags: [Proposals]
 *     summary: Tra cứu đề xuất bằng tracking code (public)
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thành công
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.get('/track/:code', guestTrackLimiter, proposalController.trackByCode);

module.exports = router;
