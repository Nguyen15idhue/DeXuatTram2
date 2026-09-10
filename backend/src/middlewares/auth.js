const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set in environment variables');
  process.exit(1);
}

// Middleware: Verify JWT token + refresh role/status từ DB (chống stale role, enforce LOCKED ngay)
const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Chưa đăng nhập'
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token không hợp lệ hoặc đã hết hạn'
    });
  }

  try {
    const pool = require('../utils/db');
    const [rows] = await pool.query('SELECT id, email, role, status FROM users WHERE id = ?', [decoded.id]);
    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Tài khoản không tồn tại'
      });
    }
    if (rows[0].status === 'LOCKED') {
      return res.status(403).json({
        success: false,
        message: 'Tài khoản đã bị khóa'
      });
    }
    req.user = { id: rows[0].id, email: rows[0].email, role: rows[0].role };
    next();
  } catch (error) {
    console.error('requireAuth DB error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// Middleware: Check admin-level role (ADMIN hoặc SUPER_ADMIN)
const requireAdmin = (req, res, next) => {
  if (!['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Không có quyền truy cập'
    });
  }
  next();
};

// Middleware: Check super admin role (chỉ SUPER_ADMIN - trang cấu hình)
const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Không có quyền truy cập tài nguyên này'
    });
  }
  next();
};

// Middleware: Check quyền quản lý users (ADMIN, SUPER_ADMIN, SALES - sales chỉ tạo CTV, check tiếp ở controller)
const requireUserManager = (req, res, next) => {
  if (!['ADMIN', 'SUPER_ADMIN', 'SALES'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Không có quyền truy cập'
    });
  }
  next();
};

// Optional auth: attach user if token exists, otherwise continue
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch (error) {
      // Invalid token, continue without user
    }
  }
  next();
};

module.exports = { requireAuth, requireAdmin, requireSuperAdmin, requireUserManager, optionalAuth, JWT_SECRET };
