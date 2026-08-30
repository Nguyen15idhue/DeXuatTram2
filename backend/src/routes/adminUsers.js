const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../utils/db');
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const { validateCreateUser, validateUpdateUser } = require('../middlewares/validators');

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
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = [];
    let params = [];

    if (search) {
      where.push('(full_name LIKE ? OR email LIKE ? OR phone LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const countQuery = `SELECT COUNT(*) as total FROM users ${whereClause}`;
    const [countResult] = await pool.query(countQuery, params);
    const total = countResult[0].total;

    const dataQuery = `SELECT id, full_name, email, phone, role, status, created_at FROM users ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const [users] = await pool.query(dataQuery, [...params, parseInt(limit), offset]);

    res.json({
      success: true,
      data: users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Admin get users error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

/**
 * @swagger
 * /api/admin/users:
 *   post:
 *     tags: [Admin - Users]
 *     summary: Admin tạo user mới
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
 *                 enum: [USER, ADMIN]
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
router.post('/', requireAuth, requireAdmin, validateCreateUser, async (req, res) => {
  try {
    const { full_name, email, phone, password, role, status } = req.body;

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Email đã tồn tại' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const [result] = await pool.query(
      'INSERT INTO users (full_name, email, phone, password, role, status) VALUES (?, ?, ?, ?, ?, ?)',
      [full_name, email, phone || '', hashedPassword, role || 'USER', status || 'ACTIVE']
    );

    const [user] = await pool.query(
      'SELECT id, full_name, email, phone, role, status, created_at FROM users WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({ success: true, data: user[0], message: 'Tạo user thành công' });
  } catch (error) {
    console.error('Admin create user error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

/**
 * @swagger
 * /api/admin/users/{id}:
 *   put:
 *     tags: [Admin - Users]
 *     summary: Admin cập nhật user
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
 *                 enum: [USER, ADMIN]
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
router.put('/:id', requireAuth, requireAdmin, validateUpdateUser, async (req, res) => {
  try {
    const { full_name, email, phone, password, role, status } = req.body;
    const { id } = req.params;

    const [existing] = await pool.query('SELECT id FROM users WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
    }

    const [emailCheck] = await pool.query('SELECT id FROM users WHERE email = ? AND id != ?', [email, id]);
    if (emailCheck.length > 0) {
      return res.status(400).json({ success: false, message: 'Email đã tồn tại' });
    }

    if (password) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      await pool.query(
        'UPDATE users SET full_name = ?, email = ?, phone = ?, password = ?, role = ?, status = ?, updated_at = NOW() WHERE id = ?',
        [full_name, email, phone || '', hashedPassword, role, status, id]
      );
    } else {
      await pool.query(
        'UPDATE users SET full_name = ?, email = ?, phone = ?, role = ?, status = ?, updated_at = NOW() WHERE id = ?',
        [full_name, email, phone || '', role, status, id]
      );
    }

    const [user] = await pool.query(
      'SELECT id, full_name, email, phone, role, status, created_at FROM users WHERE id = ?',
      [id]
    );

    res.json({ success: true, data: user[0], message: 'Cập nhật user thành công' });
  } catch (error) {
    console.error('Admin update user error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

/**
 * @swagger
 * /api/admin/users/{id}:
 *   delete:
 *     tags: [Admin - Users]
 *     summary: Admin xóa user
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
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await pool.query('SELECT id, role FROM users WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
    }

    if (existing[0].role === 'ADMIN') {
      return res.status(400).json({ success: false, message: 'Không thể xóa admin' });
    }

    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ success: false, message: 'Không thể xóa chính mình' });
    }

    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ success: true, message: 'Xóa user thành công' });
  } catch (error) {
    console.error('Admin delete user error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

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
router.patch('/:id/lock', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await pool.query('SELECT id, status FROM users WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
    }

    const newStatus = existing[0].status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE';
    await pool.query('UPDATE users SET status = ?, updated_at = NOW() WHERE id = ?', [newStatus, id]);

    const [user] = await pool.query(
      'SELECT id, full_name, email, phone, role, status, created_at FROM users WHERE id = ?',
      [id]
    );

    res.json({ success: true, data: user[0], message: newStatus === 'LOCKED' ? 'Đã khóa tài khoản' : 'Đã mở khóa tài khoản' });
  } catch (error) {
    console.error('Admin lock user error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

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
 *                 enum: [USER, ADMIN]
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
router.patch('/:id/role', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['USER', 'ADMIN'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Role không hợp lệ' });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
    }

    await pool.query('UPDATE users SET role = ?, updated_at = NOW() WHERE id = ?', [role, id]);

    const [user] = await pool.query(
      'SELECT id, full_name, email, phone, role, status, created_at FROM users WHERE id = ?',
      [id]
    );

    res.json({ success: true, data: user[0], message: 'Đổi role thành công' });
  } catch (error) {
    console.error('Admin change role error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;
