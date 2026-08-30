const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../utils/db');
const { requireAuth, JWT_SECRET } = require('../middlewares/auth');
const { validateRegister, validateLogin } = require('../middlewares/validators');

// POST /api/auth/register
router.post('/register', validateRegister, async (req, res) => {
  try {
    const { full_name, email, phone, password } = req.body;

    // Check if email exists
    const [existingUsers] = await pool.query(
      'SELECT id FROM users WHERE email = ?', 
      [email]
    );
    
    if (existingUsers.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email đã được sử dụng' 
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert user
    const [result] = await pool.query(
      'INSERT INTO users (full_name, email, phone, password, role, status) VALUES (?, ?, ?, ?, ?, ?)',
      [full_name, email, phone, hashedPassword, 'USER', 'ACTIVE']
    );

    // Generate token
    const token = jwt.sign(
      { 
        id: result.insertId, 
        email, 
        role: 'USER' 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return user info (without password)
    res.status(201).json({
      success: true,
      message: 'Đăng ký thành công',
      data: {
        user: {
          id: result.insertId,
          full_name,
          email,
          phone,
          role: 'USER',
          status: 'ACTIVE'
        },
        token
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi server' 
    });
  }
});

// POST /api/auth/login
router.post('/login', validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const [users] = await pool.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email hoặc password không đúng' 
      });
    }

    const user = users[0];

    // Check if user is locked
    if (user.status === 'LOCKED') {
      return res.status(403).json({ 
        success: false, 
        message: 'Tài khoản đã bị khóa' 
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email hoặc password không đúng' 
      });
    }

    // Generate token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return user info (without password)
    res.json({
      success: true,
      message: 'Đăng nhập thành công',
      data: {
        user: {
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          status: user.status
        },
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi server' 
    });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, full_name, email, phone, role, status, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Không tìm thấy user' 
      });
    }

    res.json({
      success: true,
      data: {
        user: users[0]
      }
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi server' 
    });
  }
});

// PUT /api/auth/profile - User update own profile
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { full_name, phone, current_password, new_password } = req.body;

    if (!full_name) {
      return res.status(400).json({ success: false, message: 'Họ tên là bắt buộc' });
    }

    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
    }

    const user = users[0];

    if (new_password) {
      if (!current_password) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập mật khẩu hiện tại' });
      }
      const isPasswordValid = await bcrypt.compare(current_password, user.password);
      if (!isPasswordValid) {
        return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không đúng' });
      }
      if (new_password.length < 6) {
        return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
      }
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(new_password, salt);
      await pool.query('UPDATE users SET full_name = ?, phone = ?, password = ?, updated_at = NOW() WHERE id = ?',
        [full_name, phone || '', hashedPassword, req.user.id]);
    } else {
      await pool.query('UPDATE users SET full_name = ?, phone = ?, updated_at = NOW() WHERE id = ?',
        [full_name, phone || '', req.user.id]);
    }

    const [updated] = await pool.query(
      'SELECT id, full_name, email, phone, role, status, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    res.json({ success: true, data: updated[0], message: 'Cập nhật hồ sơ thành công' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;
