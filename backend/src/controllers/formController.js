const formService = require('../services/formService');

exports.getAll = async (req, res) => {
  try {
    const { entity, status, page = 1, limit = 50 } = req.query;
    const result = await formService.getAllForms(entity, status, parseInt(page), parseInt(limit));
    res.json({ success: true, data: result.forms, pagination: result.pagination });
  } catch (error) {
    console.error('Get forms error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.getById = async (req, res) => {
  try {
    const form = await formService.getFormById(req.params.id);
    if (!form) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy form' });
    }
    res.json({ success: true, data: form });
  } catch (error) {
    console.error('Get form error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.create = async (req, res) => {
  try {
    const { entity, name, description, status, layout_config } = req.body;

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

    const form = await formService.createForm({
      entity: entity.trim(),
      name: name.trim(),
      description,
      status,
      layout_config
    });

    res.status(201).json({ success: true, data: form, message: 'Tạo form thành công' });
  } catch (error) {
    console.error('Create form error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { entity, name, description, status, layout_config } = req.body;

    const existing = await formService.getFormById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy form' });
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

    const form = await formService.updateForm(id, {
      entity: entity.trim(),
      name: name.trim(),
      description,
      status,
      layout_config
    });

    res.json({ success: true, data: form, message: 'Cập nhật form thành công' });
  } catch (error) {
    console.error('Update form error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await formService.getFormById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy form' });
    }

    await formService.deleteForm(id);
    res.json({ success: true, message: 'Xóa form thành công (form_fields tự xóa theo CASCADE)' });
  } catch (error) {
    console.error('Delete form error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
