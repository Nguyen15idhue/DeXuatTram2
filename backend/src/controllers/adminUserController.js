const bcrypt = require('bcryptjs');
const adminUserService = require('../services/adminUserService');

exports.getAll = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', all = '' } = req.query;
    const scope = { role: req.user.role, userId: req.user.id, all: all === '1' };
    const result = await adminUserService.getAllUsers(search, parseInt(page), parseInt(limit), scope);
    res.json({ success: true, data: result.users, pagination: result.pagination });
  } catch (error) {
    console.error('Admin get users error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.create = async (req, res) => {
  try {
    let { full_name, email, phone, password, role, status, custom_data, external_id } = req.body;
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

    if (external_id) {
      const extCheck = await adminUserService.findByExternalId(external_id);
      if (extCheck) {
        return res.status(400).json({ success: false, message: 'Mã ngoài đã tồn tại' });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const user = await adminUserService.createUser(full_name, email, phone, hashedPassword, role, status, custom_data, parentId, external_id || null);
    res.status(201).json({ success: true, data: user, message: 'Tạo user thành công' });
  } catch (error) {
    console.error('Admin create user error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.update = async (req, res) => {
  try {
    let { full_name, email, phone, password, role, status, custom_data, external_id } = req.body;
    const { id } = req.params;
    const editorRole = req.user.role;
    const targetId = parseInt(id);

    const existing = await adminUserService.findById(targetId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
    }

    if (editorRole === 'SALES') {
      const isSelf = targetId === req.user.id;
      const isOwnCtv = existing.parent_id === req.user.id;
      if (!isSelf && !isOwnCtv) {
        return res.status(403).json({ success: false, message: 'Không có quyền truy cập tài nguyên này' });
      }
      role = existing.role;
    } else if (editorRole === 'ADMIN') {
      if (existing.role === 'SUPER_ADMIN') {
        return res.status(403).json({ success: false, message: 'Không có quyền truy cập tài nguyên này' });
      }
      if (role === 'SUPER_ADMIN') {
        return res.status(403).json({ success: false, message: 'Không có quyền truy cập tài nguyên này' });
      }
      if (targetId === req.user.id) {
        role = existing.role;
      } else {
        role = role || existing.role;
      }
    } else {
      if (targetId === req.user.id && role && role !== existing.role) {
        role = existing.role;
      } else {
        role = role || existing.role;
      }
    }

    const emailCheck = await adminUserService.findByEmailExceptId(email, targetId);
    if (emailCheck) {
      return res.status(400).json({ success: false, message: 'Email đã tồn tại' });
    }

    if (external_id) {
      const extCheck = await adminUserService.findByExternalIdExceptId(external_id, targetId);
      if (extCheck) {
        return res.status(400).json({ success: false, message: 'Mã ngoài đã tồn tại' });
      }
    }

    const cd = custom_data !== undefined ? custom_data : existing.custom_data;
    const ext = external_id === undefined ? existing.external_id : (external_id || null);

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'Mật khẩu phải có ít nhất 6 ký tự' });
      }
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      await adminUserService.updateUserWithPassword(targetId, full_name, email, phone, hashedPassword, role, status, cd, ext);
    } else {
      await adminUserService.updateUser(targetId, full_name, email, phone, role, status, cd, ext);
    }

    const user = await adminUserService.findById(targetId);
    res.json({ success: true, data: user, message: 'Cập nhật user thành công' });
  } catch (error) {
    console.error('Admin update user error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    const targetId = parseInt(id);
    const deleterRole = req.user.role;

    const existing = await adminUserService.findByIdWithRole(targetId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
    }

    if (existing.role === 'SUPER_ADMIN' || existing.role === 'ADMIN') {
      return res.status(400).json({ success: false, message: 'Không thể xóa admin' });
    }

    if (targetId === req.user.id) {
      return res.status(400).json({ success: false, message: 'Không thể xóa chính mình' });
    }

    if (deleterRole === 'SALES') {
      const full = await adminUserService.findById(targetId);
      if (!full || full.role !== 'CTV' || full.parent_id !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Không có quyền truy cập tài nguyên này' });
      }
      await adminUserService.deleteUserWithOrphan(targetId, req.user.id);
      return res.json({ success: true, message: 'Xóa user thành công' });
    }

    const full = await adminUserService.findById(targetId);
    const newOwner = full && full.parent_id ? full.parent_id : null;
    await adminUserService.deleteUserWithOrphan(targetId, newOwner);
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

    if (req.user.role === 'SALES') {
      const targetId = parseInt(id);
      const isSelf = targetId === req.user.id;
      const full = await adminUserService.findById(targetId);
      const isOwnCtv = full && full.role === 'CTV' && full.parent_id === req.user.id;
      if (!isSelf && !isOwnCtv) {
        return res.status(403).json({ success: false, message: 'Không có quyền truy cập tài nguyên này' });
      }
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
