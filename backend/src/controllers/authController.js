const authService = require('../services/authService');

exports.register = async (req, res) => {
  try {
    const { full_name, email, phone, password } = req.body;

    const existing = await authService.findByEmail(email);
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Email đã được sử dụng'
      });
    }

    const result = await authService.createUser(full_name, email, phone, password);
    const token = authService.generateToken(result.id, email, 'USER');

    res.status(201).json({
      success: true,
      message: 'Đăng ký thành công',
      data: {
        user: {
          id: result.id,
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
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await authService.findByEmail(email);
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Email hoặc password không đúng'
      });
    }

    if (user.status === 'LOCKED') {
      return res.status(403).json({
        success: false,
        message: 'Tài khoản đã bị khóa'
      });
    }

    const isPasswordValid = await authService.comparePassword(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Email hoặc password không đúng'
      });
    }

    const token = authService.generateToken(user.id, user.email, user.role);

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
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await authService.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy user'
      });
    }

    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { full_name, phone, current_password, new_password, avatar } = req.body;

    if (!full_name) {
      return res.status(400).json({ success: false, message: 'Họ tên là bắt buộc' });
    }

    const user = await authService.findByIdFull(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
    }

    let customData = {};
    try {
      customData = user.custom_data ? JSON.parse(user.custom_data) : {};
    } catch { customData = {}; }

    if (avatar !== undefined) {
      customData.avatar = avatar;
    }

    if (new_password) {
      if (!current_password) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập mật khẩu hiện tại' });
      }
      const isPasswordValid = await authService.comparePassword(current_password, user.password);
      if (!isPasswordValid) {
        return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không đúng' });
      }
      if (new_password.length < 6) {
        return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
      }
      await authService.updatePassword(req.user.id, full_name, phone, new_password);
    } else {
      await authService.updateProfile(req.user.id, full_name, phone, customData);
    }

    const updated = await authService.findById(req.user.id);

    res.json({ success: true, data: updated, message: 'Cập nhật hồ sơ thành công' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
