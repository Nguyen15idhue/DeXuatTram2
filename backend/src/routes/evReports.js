const express = require('express');
const router = express.Router();
const { requireAuth, requireUserManager, optionalAuth } = require('../middlewares/auth');
const { guestSubmitLimiter, guestTrackLimiter } = require('../middlewares/rateLimits');
const { validateCreateEvReport, validateUpdateEvReport } = require('../middlewares/validators');
const evReportController = require('../controllers/evReportController');

/**
 * @swagger
 * /api/ev-reports:
 *   get:
 *     tags: [EvReports]
 *     summary: Lấy danh sách điểm sạc do khách chia sẻ (công khai, rút gọn)
 *     description: Hiển thị trên bản đồ. Không trả tên/SĐT khi chưa đăng nhập; có token thì trả thêm full_name/phone để hiện trong popup marker.
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/', optionalAuth, evReportController.getAll);

/**
 * @swagger
 * /api/ev-reports/{id}:
 *   get:
 *     tags: [EvReports]
 *     summary: Lấy thông tin điểm sạc theo ID (công khai, rút gọn)
 *     description: Không trả tên/SĐT khi chưa đăng nhập; có token thì trả thêm full_name/phone.
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
 *         description: Không tìm thấy vị trí chia sẻ
 */
router.get('/:id', optionalAuth, evReportController.getById);

/**
 * @swagger
 * /api/ev-reports/guest:
 *   post:
 *     tags: [EvReports]
 *     summary: Khách nặc danh gửi vị trí sạc xe điện (không cần đăng nhập)
 *     description: Không ảnh, không tracking code. 1 SĐT gửi được nhiều record. SĐT bắt buộc ở validator.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [full_name, phone, latitude, longitude, hang_xe]
 *             properties:
 *               full_name:
 *                 type: string
 *                 example: Nguyen Van A
 *               phone:
 *                 type: string
 *                 pattern: '^\d{10}$'
 *                 example: 0912345678
 *               latitude:
 *                 type: number
 *                 minimum: -90
 *                 maximum: 90
 *               longitude:
 *                 type: number
 *                 minimum: -180
 *                 maximum: 180
 *               hang_xe:
 *                 type: string
 *                 example: VinFast
 *               province:
 *                 type: string
 *               ward:
 *                 type: string
 *               address:
 *                 type: string
 *               captcha_token:
 *                 type: string
 *     responses:
 *       201:
 *         description: Gửi thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       429:
 *         description: Quá nhiều yêu cầu
 */
router.post('/guest', guestSubmitLimiter, validateCreateEvReport, evReportController.createGuest);

/**
 * @swagger
 * /api/ev-reports/check-nearby-public:
 *   post:
 *     tags: [EvReports]
 *     summary: Kiểm tra trùng vị trí (public, chỉ cảnh báo mềm, không chặn)
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
router.post('/check-nearby-public', guestTrackLimiter, evReportController.checkNearbyPublic);

/**
 * @swagger
 * /api/ev-reports/admin/list:
 *   get:
 *     tags: [EvReports]
 *     summary: Danh sách vị trí sạc cho quản trị (full, gồm PII)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/admin/list', requireAuth, requireUserManager, evReportController.adminList);

/**
 * @swagger
 * /api/ev-reports/admin/{id}:
 *   get:
 *     tags: [EvReports]
 *     summary: Chi tiết điểm sạc cho quản trị (full)
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
 *         description: Không tìm thấy vị trí chia sẻ
 */
router.get('/admin/:id', requireAuth, requireUserManager, evReportController.adminGetById);

/**
 * @swagger
 * /api/ev-reports/admin/{id}:
 *   put:
 *     tags: [EvReports]
 *     summary: Sửa nội dung điểm sạc (quản trị)
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
router.put('/admin/:id', requireAuth, requireUserManager, validateUpdateEvReport, evReportController.adminUpdate);

/**
 * @swagger
 * /api/ev-reports/admin/{id}:
 *   delete:
 *     tags: [EvReports]
 *     summary: Xóa điểm sạc (quản trị)
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
router.delete('/admin/:id', requireAuth, requireUserManager, evReportController.adminDelete);

/**
 * @swagger
 * /api/ev-reports/admin/{id}/create-proposal:
 *   post:
 *     tags: [EvReports]
 *     summary: Tạo đề xuất trạm từ điểm sạc (prefill tọa độ + liên hệ)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       201:
 *         description: Tạo đề xuất thành công
 */
router.post('/admin/:id/create-proposal', requireAuth, requireUserManager, evReportController.adminCreateProposal);

module.exports = router;
