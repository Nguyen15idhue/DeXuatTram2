const viewService = require('../services/viewService');

exports.getAll = async (req, res) => {
  try {
    const { entity, status, page = 1, limit = 50 } = req.query;
    const result = await viewService.getAllViews(entity, status, parseInt(page), parseInt(limit));
    res.json({ success: true, data: result.views, pagination: result.pagination });
  } catch (error) {
    console.error('Get views error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.getById = async (req, res) => {
  try {
    const view = await viewService.getViewById(req.params.id);
    if (!view) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy view' });
    }
    res.json({ success: true, data: view });
  } catch (error) {
    console.error('Get view error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.create = async (req, res) => {
  try {
    const { entity, name, description, status } = req.body;

    if (!entity || !entity.trim()) {
      return res.status(400).json({ success: false, message: 'Entity không được để trống' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Name không được để trống' });
    }

    const allowedEntities = ['stations', 'station_proposals', 'users'];
    if (!allowedEntities.includes(entity)) {
      return res.status(400).json({ success: false, message: `Entity phải là một trong: ${allowedEntities.join(', ')}` });
    }

    const view = await viewService.createView({
      entity: entity.trim(),
      name: name.trim(),
      description,
      status
    });

    res.status(201).json({ success: true, data: view, message: 'Tạo view thành công' });
  } catch (error) {
    console.error('Create view error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { entity, name, description, status } = req.body;

    const existing = await viewService.getViewById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy view' });
    }

    if (!entity || !entity.trim()) {
      return res.status(400).json({ success: false, message: 'Entity không được để trống' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Name không được để trống' });
    }

    const allowedEntities = ['stations', 'station_proposals', 'users'];
    if (!allowedEntities.includes(entity)) {
      return res.status(400).json({ success: false, message: `Entity phải là một trong: ${allowedEntities.join(', ')}` });
    }

    const view = await viewService.updateView(id, {
      entity: entity.trim(),
      name: name.trim(),
      description,
      status
    });

    res.json({ success: true, data: view, message: 'Cập nhật view thành công' });
  } catch (error) {
    console.error('Update view error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await viewService.getViewById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy view' });
    }

    await viewService.deleteView(id);
    res.json({ success: true, message: 'Xóa view thành công (view_fields tự xóa theo CASCADE)' });
  } catch (error) {
    console.error('Delete view error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
