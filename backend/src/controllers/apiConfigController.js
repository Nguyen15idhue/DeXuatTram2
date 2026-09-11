const apiConfigService = require('../services/apiConfigService');
const oneOfficeService = require('../services/oneOfficeService');

exports.getAll = async (req, res) => {
  try {
    const { search, is_active, page = 1, limit = 50 } = req.query;
    const isActive = is_active !== undefined ? is_active === 'true' || is_active === '1' : null;
    const result = await apiConfigService.getAll(search, isActive, parseInt(page), parseInt(limit));
    res.json({ success: true, data: result.configs, pagination: result.pagination });
  } catch (error) {
    console.error('Get api configs error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.getById = async (req, res) => {
  try {
    const config = await apiConfigService.getById(req.params.id);
    if (!config) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy cấu hình API' });
    }
    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Get api config error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.get1OfficeUsers = async (req, res) => {
  try {
    const { page = 1, limit = 100 } = req.query;
    const result = await oneOfficeService.getUsers(req.params.id, { page, limit });
    if (!result.success) {
      return res.status(502).json({ success: false, message: result.error || 'Lỗi 1Office', data: result.data });
    }
    res.json({
      success: true,
      data: result.data.users,
      pagination: { page: result.data.page, limit: result.data.limit, total: result.data.total }
    });
  } catch (error) {
    console.error('Get 1Office users error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.create = async (req, res) => {
  try {
    const { name, base_url, auth_type, auth_config, description, is_active } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Tên cấu hình không được để trống' });
    }
    if (!base_url || !base_url.trim()) {
      return res.status(400).json({ success: false, message: 'Base URL không được để trống' });
    }
    if (!auth_config) {
      return res.status(400).json({ success: false, message: 'Auth config không được để trống' });
    }

    try {
      new URL(base_url.trim());
    } catch {
      return res.status(400).json({ success: false, message: 'Base URL không hợp lệ' });
    }

    const config = await apiConfigService.create({
      name, base_url, auth_type, auth_config, description, is_active,
      created_by: req.user.id
    });

    res.status(201).json({ success: true, data: config, message: 'Tạo cấu hình API thành công' });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Create api config error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, base_url, auth_type, auth_config, description, is_active } = req.body;

    if (name !== undefined && (!name || !name.trim())) {
      return res.status(400).json({ success: false, message: 'Tên cấu hình không được để trống' });
    }
    if (base_url !== undefined && (!base_url || !base_url.trim())) {
      return res.status(400).json({ success: false, message: 'Base URL không được để trống' });
    }
    if (base_url) {
      try {
        new URL(base_url.trim());
      } catch {
        return res.status(400).json({ success: false, message: 'Base URL không hợp lệ' });
      }
    }

    const config = await apiConfigService.update(id, {
      name, base_url, auth_type, auth_config, description, is_active
    });

    res.json({ success: true, data: config, message: 'Cập nhật cấu hình API thành công' });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Update api config error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await apiConfigService.getById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy cấu hình API' });
    }

    await apiConfigService.remove(id);
    res.json({ success: true, message: 'Xóa cấu hình API thành công' });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Delete api config error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.testConnection = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await apiConfigService.testConnection(id);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Test connection error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
