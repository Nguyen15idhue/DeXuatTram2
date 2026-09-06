const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set in environment variables');
  process.exit(1);
}

// Middleware: Verify JWT token
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false, 
      message: 'Chưa đăng nhập' 
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ 
      success: false, 
      message: 'Token không hợp lệ hoặc đã hết hạn' 
    });
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
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
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
