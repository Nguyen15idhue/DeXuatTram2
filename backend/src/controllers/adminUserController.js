const bcrypt = require('bcryptjs');
const adminUserService = require('../services/adminUserService');

exports.getAll = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const result = await adminUserService.getAllUsers(search, parseInt(page), parseInt(limit));
    res.json({ success: true, data: result.users, pagination: result.pagination });
  } catch (error) {
    console.error('Admin get users error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.create = async (req, res) => {
  try {
    let { full_name, email, phone, password, role, status, custom_data } = req.body;
    const creatorRole = req.user.role;

    const validRoles = ['SUPER_ADMIN', 'ADMIN', 'SALES', 'CTV'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Role không hợp lệ' });
    }

    let parentId = null;
    if (creatorRole === 'SALES') {
      if (role && role !== 'CTV') {
        return res.status(403).json({ success: false, message: 'Không có quyền truy cập tài nguyên này' });
      }
      role = 'CTV';
      parentId = req.user.id;
    } else if (creatorRole === 'ADMIN') {
      if (role === 'SUPER_ADMIN') {
        return res.status(403).json({ success: false, message: 'Không có quyền truy cập tài nguyên này' });
      }
      role = role || 'CTV';
    } else {
      role = role || 'CTV';
    }

    const existing = await adminUserService.findByEmail(email);
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email đã tồn tại' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const user = await adminUserService.createUser(full_name, email, phone, hashedPassword, role, status, custom_data, parentId);
    res.status(201).json({ success: true, data: user, message: 'Tạo user thành công' });
  } catch (error) {
    console.error('Admin create user error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.update = async (req, res) => {
  try {
    const { full_name, email, phone, password, role, status, custom_data } = req.body;
    const { id } = req.params;

    const existing = await adminUserService.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
    }

    const emailCheck = await adminUserService.findByEmailExceptId(email, id);
    if (emailCheck) {
      return res.status(400).json({ success: false, message: 'Email đã tồn tại' });
    }

    const cd = custom_data !== undefined ? custom_data : existing.custom_data;

    if (password) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      await adminUserService.updateUserWithPassword(id, full_name, email, phone, hashedPassword, role, status, cd);
    } else {
      await adminUserService.updateUser(id, full_name, email, phone, role, status, cd);
    }

    const user = await adminUserService.findById(id);
    res.json({ success: true, data: user, message: 'Cập nhật user thành công' });
  } catch (error) {
    console.error('Admin update user error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await adminUserService.findByIdWithRole(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
    }

    if (existing.role === 'SUPER_ADMIN' || existing.role === 'ADMIN') {
      return res.status(400).json({ success: false, message: 'Không thể xóa admin' });
    }

    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ success: false, message: 'Không thể xóa chính mình' });
    }

    await adminUserService.deleteUser(id);
    res.json({ success: true, message: 'Xóa user thành công' });
  } catch (error) {
    console.error('Admin delete user error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.toggleLock = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await adminUserService.findByIdWithStatus(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
    }

    const newStatus = existing.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE';
    await adminUserService.updateStatus(id, newStatus);

    const user = await adminUserService.findById(id);
    res.json({ success: true, data: user, message: newStatus === 'LOCKED' ? 'Đã khóa tài khoản' : 'Đã mở khóa tài khoản' });
  } catch (error) {
    console.error('Admin lock user error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.changeRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['SUPER_ADMIN', 'ADMIN', 'SALES', 'CTV'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Role không hợp lệ' });
    }

    const existing = await adminUserService.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
    }

    if (role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập tài nguyên này' });
    }

    if (existing.role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập tài nguyên này' });
    }

    await adminUserService.updateRole(id, role);
    const user = await adminUserService.findById(id);
    res.json({ success: true, data: user, message: 'Đổi role thành công' });
  } catch (error) {
    console.error('Admin change role error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Mật khẩu phải có ít nhất 6 ký tự' });
    }

    const existing = await adminUserService.findByIdWithRole(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
    }

    if (existing.role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập tài nguyên này' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    await adminUserService.updatePassword(id, hashedPassword);
    const user = await adminUserService.findById(id);
    res.json({ success: true, data: user, message: 'Đổi mật khẩu thành công' });
  } catch (error) {
    console.error('Admin change password error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
