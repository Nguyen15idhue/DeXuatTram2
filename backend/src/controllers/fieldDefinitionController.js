const fieldDefinitionService = require('../services/fieldDefinitionService');

exports.getAll = async (req, res) => {
  try {
    const { entity, status, page = 1, limit = 50 } = req.query;
    const result = await fieldDefinitionService.getAllFieldDefinitions(entity, status, parseInt(page), parseInt(limit));
    res.json({ success: true, data: result.fieldDefinitions, pagination: result.pagination });
  } catch (error) {
    console.error('Get field definitions error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.getById = async (req, res) => {
  try {
    const field = await fieldDefinitionService.getFieldDefinitionById(req.params.id);
    if (!field) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy field definition' });
    }
    res.json({ success: true, data: field });
  } catch (error) {
    console.error('Get field definition error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.getByEntity = async (req, res) => {
  try {
    const fields = await fieldDefinitionService.getFieldDefinitionsByEntity(req.params.entity);
    res.json({ success: true, data: fields });
  } catch (error) {
    console.error('Get field definitions by entity error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.create = async (req, res) => {
  try {
    const {
      entity, key, label, type, source_type, required, validation, options, formula, placeholder, help_text, status,
      number_format, decimal_places, date_format, timezone,
      source_config, parent_field, option_style, file_config, formula_config
    } = req.body;

    if (!entity || !entity.trim()) {
      return res.status(400).json({ success: false, message: 'Entity không được để trống' });
    }
    if (!key || !key.trim()) {
      return res.status(400).json({ success: false, message: 'Key không được để trống' });
    }
    if (!label || !label.trim()) {
      return res.status(400).json({ success: false, message: 'Label không được để trống' });
    }

    const allowedTypes = ['text', 'textarea', 'number', 'email', 'phone', 'url', 'date', 'datetime', 'boolean', 'select', 'multiselect', 'file', 'formula'];
    if (type && !allowedTypes.includes(type)) {
      return res.status(400).json({ success: false, message: `Type phải là một trong: ${allowedTypes.join(', ')}` });
    }

    const field = await fieldDefinitionService.createFieldDefinition({
      entity: entity.trim(),
      key: key.trim(),
      label: label.trim(),
      type, source_type, required, validation, options, formula, placeholder, help_text, status,
      number_format, decimal_places, date_format, timezone,
      source_config, parent_field, option_style, file_config, formula_config
    });

    res.status(201).json({ success: true, data: field, message: 'Tạo field definition thành công' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: `Field với entity="${req.body.entity}" và key="${req.body.key}" đã tồn tại` });
    }
    console.error('Create field definition error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      entity, key, label, type, source_type, required, validation, options, formula, placeholder, help_text, status,
      number_format, decimal_places, date_format, timezone,
      source_config, parent_field, option_style, file_config, formula_config
    } = req.body;

    const existing = await fieldDefinitionService.getFieldDefinitionById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy field definition' });
    }

    if (!entity || !entity.trim()) {
      return res.status(400).json({ success: false, message: 'Entity không được để trống' });
    }
    if (!key || !key.trim()) {
      return res.status(400).json({ success: false, message: 'Key không được để trống' });
    }
    if (!label || !label.trim()) {
      return res.status(400).json({ success: false, message: 'Label không được để trống' });
    }

    const allowedTypes = ['text', 'textarea', 'number', 'email', 'phone', 'url', 'date', 'datetime', 'boolean', 'select', 'multiselect', 'file', 'formula'];
    if (type && !allowedTypes.includes(type)) {
      return res.status(400).json({ success: false, message: `Type phải là một trong: ${allowedTypes.join(', ')}` });
    }

    const field = await fieldDefinitionService.updateFieldDefinition(id, {
      entity: entity.trim(),
      key: key.trim(),
      label: label.trim(),
      type, source_type, required, validation, options, formula, placeholder, help_text, status,
      number_format, decimal_places, date_format, timezone,
      source_config, parent_field, option_style, file_config, formula_config
    });

    res.json({ success: true, data: field, message: 'Cập nhật field definition thành công' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: `Field với entity="${req.body.entity}" và key="${req.body.key}" đã tồn tại` });
    }
    console.error('Update field definition error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await fieldDefinitionService.getFieldDefinitionById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy field definition' });
    }

    await fieldDefinitionService.deleteFieldDefinition(id);
    res.json({ success: true, message: 'Xóa field definition thành công' });
  } catch (error) {
    console.error('Delete field definition error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['active', 'inactive'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status phải là "active" hoặc "inactive"' });
    }

    const existing = await fieldDefinitionService.getFieldDefinitionById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy field definition' });
    }

    const field = await fieldDefinitionService.updateFieldDefinitionStatus(id, status);
    res.json({ success: true, data: field, message: 'Cập nhật trạng thái thành công' });
  } catch (error) {
    console.error('Update field definition status error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
