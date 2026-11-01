const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin, requireUserAccountManager } = require('../middlewares/auth');
const { validateCreateUser, validateUpdateUser } = require('../middlewares/validators');
const adminUserController = require('../controllers/adminUserController');

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     tags: [Admin - Users]
 *     summary: Admin lấy danh sách users (phân trang)
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Tìm theo tên, email hoặc SĐT
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
 *                     $ref: '#/components/schemas/User'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 */
router.get('/', requireAuth, requireUserAccountManager, adminUserController.getAll);

/**
 * @swagger
 * /api/admin/users/options/all:
 *   get:
 *     tags: [Admin - Users]
 *     summary: Danh sách user gọn (id, tên, quyền) cho select
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 *       401:
 *         description: Chưa xác thực
 */
router.get('/options/all', requireAuth, adminUserController.getOptions);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   get:
 *     tags: [Admin - Users]
 *     summary: Lấy chi tiết user theo ID (SALES chỉ bản thân + CTV của mình, ADMIN không xem SUPER_ADMIN)
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền
 *       404:
 *         description: Không tìm thấy user
 */
router.get('/:id', requireAuth, requireUserAccountManager, adminUserController.getById);

/**
 * @swagger
 * /api/admin/users:
 *   post:
 *     tags: [Admin - Users]
 *     summary: Tạo user mới trong phạm vi quyền của người gọi
 *     description: NPP chỉ được tạo CTV và tài khoản mới tự động thuộc nhánh của NPP.
 *     security:
 *       - bearerAuth: []
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
 *               role:
 *                 type: string
 *                 enum: [SUPER_ADMIN, ADMIN, SALES, CTV, NPP, MKT]
 *                 default: USER
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, LOCKED]
 *                 default: ACTIVE
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
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Email đã tồn tại
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 */
router.post('/', requireAuth, requireUserAccountManager, validateCreateUser, adminUserController.create);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   put:
 *     tags: [Admin - Users]
 *     summary: Cập nhật user trong phạm vi quyền của người gọi
 *     description: NPP chỉ sửa hồ sơ/mật khẩu CTV trong nhánh; không được khóa, xóa, đổi role hoặc đổi parent.
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
 *             required: [full_name, email, role, status]
 *             properties:
 *               full_name:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               password:
 *                 type: string
 *                 description: Để trống nếu không đổi mật khẩu
 *               role:
 *                 type: string
 *                 enum: [SUPER_ADMIN, ADMIN, SALES, CTV, NPP, MKT]
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, LOCKED]
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: Email đã tồn tại
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 *       404:
 *         description: Không tìm thấy user
 */
router.put('/:id', requireAuth, requireUserAccountManager, validateUpdateUser, adminUserController.update);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   delete:
 *     tags: [Admin - Users]
 *     summary: Admin hoặc SALES xóa user thuộc phạm vi được phép
 *     description: Không thể xóa admin hoặc chính mình
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
 *       400:
 *         description: Không thể xóa admin hoặc chính mình
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 *       404:
 *         description: Không tìm thấy user
 */
router.delete('/:id', requireAuth, requireUserAccountManager, adminUserController.delete);

/**
 * @swagger
 * /api/admin/users/{id}/lock:
 *   patch:
 *     tags: [Admin - Users]
 *     summary: Admin khóa/mở khóa user
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
 *         description: Khóa/mở khóa thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 *       404:
 *         description: Không tìm thấy user
 */
router.patch('/:id/lock', requireAuth, requireAdmin, adminUserController.toggleLock);

/**
 * @swagger
 * /api/admin/users/{id}/role:
 *   patch:
 *     tags: [Admin - Users]
 *     summary: Admin đổi role user
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
 *             required: [role]
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [SUPER_ADMIN, ADMIN, SALES, CTV, NPP, MKT]
 *     responses:
 *       200:
 *         description: Đổi role thành công
 *       400:
 *         description: Role không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 *       404:
 *         description: Không tìm thấy user
 */
router.patch('/:id/role', requireAuth, requireAdmin, adminUserController.changeRole);

/**
 * @swagger
 * /api/admin/users/{id}/password:
 *   patch:
 *     tags: [Admin - Users]
 *     summary: Đổi mật khẩu user trong phạm vi được phép (tự đổi cần mật khẩu cũ old_password)
 *     description: NPP chỉ được đổi mật khẩu tài khoản CTV trong nhánh của mình hoặc tự đổi mật khẩu.
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
  *             required: [password]
  *             properties:
  *               password:
  *                 type: string
  *                 minLength: 6
  *               old_password:
  *                 type: string
  *                 description: Bắt buộc khi tự đổi mật khẩu của chính mình
 *     responses:
 *       200:
 *         description: Đổi mật khẩu thành công
 *       400:
 *         description: Mật khẩu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 *       404:
 *         description: Không tìm thấy user
 */
router.patch('/:id/password', requireAuth, requireUserAccountManager, adminUserController.changePassword);

module.exports = router;
