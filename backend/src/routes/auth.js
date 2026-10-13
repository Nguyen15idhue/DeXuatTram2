const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth');
const { validateRegister, validateLogin } = require('../middlewares/validators');
const authController = require('../controllers/authController');

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Đăng ký tài khoản mới
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [full_name, email, phone, password]
 *             properties:
 *               full_name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 example: Nguyen Van A
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               phone:
 *                 type: string
 *                 pattern: '^\d{10}$'
 *                 example: 0912345678
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 example: 123456
 *     responses:
 *       201:
 *         description: Đăng ký thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Đăng ký thành công
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     token:
 *                       type: string
 *       400:
 *         description: Email đã tồn tại hoặc dữ liệu không hợp lệ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/register', validateRegister, authController.register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Đăng nhập bằng email hoặc số điện thoại
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 description: Email hoặc số điện thoại
 *                 example: admin@example.com
 *               password:
 *                 type: string
 *                 example: 123456
 *               remember:
 *                 type: boolean
 *                 description: Ghi nhớ 30 ngày (token hết hạn sau 30 ngày thay vì 12h)
 *                 example: true
 *     responses:
 *       200:
 *         description: Đăng nhập thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Đăng nhập thành công
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     token:
 *                       type: string
 *       400:
 *         description: Email/Số điện thoại hoặc mật khẩu không đúng
 *       403:
 *         description: Tài khoản đã bị khóa
 */
router.post('/login', validateLogin, authController.login);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Lấy thông tin user hiện tại
 *     security:
 *       - bearerAuth: []
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
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       401:
 *         description: Chưa xác thực
 *       404:
 *         description: Không tìm thấy user
 */
router.get('/me', requireAuth, authController.getMe);

/**
 * @swagger
 * /api/auth/profile:
 *   put:
 *     tags: [Auth]
 *     summary: Cập nhật hồ sơ cá nhân (đổi mật khẩu không cần họ tên)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 example: Nguyen Van A
 *                 description: Bắt buộc khi sửa hồ sơ, không cần khi chỉ đổi mật khẩu
 *               phone:
 *                 type: string
 *                 example: 0912345678
 *               current_password:
 *                 type: string
 *                 description: Bắt buộc nếu muốn đổi mật khẩu
 *               new_password:
 *                 type: string
 *                 minLength: 6
 *                 description: Mật khẩu mới (cùng current_password)
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *                 message:
 *                   type: string
 *                   example: Cập nhật hồ sơ thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 */
router.put('/profile', requireAuth, authController.updateProfile);

module.exports = router;
