const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../utils/db');
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const { validateCreateUser, validateUpdateUser } = require('../middlewares/validators');

// GET /api/admin/users - Danh sách users (with pagination)
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

// POST /api/admin/users - Tạo user mới
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

// PUT /api/admin/users/:id - Sửa user
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
        'UPDATE users SET full_name = ?, email = ?, phone = ?, password = ?, role = ?, status = ? WHERE id = ?',
        [full_name, email, phone || '', hashedPassword, role, status, id]
      );
    } else {
      await pool.query(
        'UPDATE users SET full_name = ?, email = ?, phone = ?, role = ?, status = ? WHERE id = ?',
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

// DELETE /api/admin/users/:id - Xóa user
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

    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ success: true, message: 'Xóa user thành công' });
  } catch (error) {
    console.error('Admin delete user error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// PATCH /api/admin/users/:id/lock - Lock/Unlock user
router.patch('/:id/lock', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await pool.query('SELECT id, status FROM users WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
    }

    const newStatus = existing[0].status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE';
    await pool.query('UPDATE users SET status = ? WHERE id = ?', [newStatus, id]);

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

// PATCH /api/admin/users/:id/role - Đổi role
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

    await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, id]);

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
