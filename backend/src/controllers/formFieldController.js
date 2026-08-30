const formFieldService = require('../services/formFieldService');
const formService = require('../services/formService');
const fieldDefinitionService = require('../services/fieldDefinitionService');

exports.getFields = async (req, res) => {
  try {
    const { formId } = req.params;

    const form = await formService.getFormById(formId);
    if (!form) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy form' });
    }

    const fields = await formFieldService.getFieldsByFormId(formId);
    res.json({ success: true, data: fields });
  } catch (error) {
    console.error('Get form fields error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.addField = async (req, res) => {
  try {
    const { formId } = req.params;
    const { field_id, order_index, visible, config } = req.body;

    const form = await formService.getFormById(formId);
    if (!form) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy form' });
    }

    if (!field_id) {
      return res.status(400).json({ success: false, message: 'field_id không được để trống' });
    }

    const fieldDef = await fieldDefinitionService.getFieldDefinitionById(field_id);
    if (!fieldDef) {
      return res.status(400).json({ success: false, message: 'Field definition không tồn tại' });
    }

    if (fieldDef.entity !== form.entity) {
      return res.status(400).json({ success: false, message: `Field entity "${fieldDef.entity}" không khớp với form entity "${form.entity}"` });
    }

    const existingFields = await formFieldService.getFieldsByFormId(formId);
    const duplicateField = existingFields.find(f => f.field_id === field_id);
    if (duplicateField) {
      return res.status(400).json({ success: false, message: 'Field đã tồn tại trong form này' });
    }

    const formField = await formFieldService.addFieldToForm(formId, { field_id, order_index, visible, config });
    res.status(201).json({ success: true, data: formField, message: 'Thêm field vào form thành công' });
  } catch (error) {
    console.error('Add form field error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.updateField = async (req, res) => {
  try {
    const { formId, id } = req.params;
    const { order_index, visible, config } = req.body;

    const form = await formService.getFormById(formId);
    if (!form) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy form' });
    }

    const existing = await formFieldService.getFormFieldById(id);
    if (!existing || existing.form_id !== parseInt(formId)) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy field trong form này' });
    }

    const formField = await formFieldService.updateFormField(id, {
      order_index: order_index !== undefined ? order_index : existing.order_index,
      visible,
      config
    });
    res.json({ success: true, data: formField, message: 'Cập nhật field thành công' });
  } catch (error) {
    console.error('Update form field error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.deleteField = async (req, res) => {
  try {
    const { formId, id } = req.params;

    const form = await formService.getFormById(formId);
    if (!form) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy form' });
    }

    const existing = await formFieldService.getFormFieldById(id);
    if (!existing || existing.form_id !== parseInt(formId)) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy field trong form này' });
    }

    await formFieldService.deleteFormField(id);
    res.json({ success: true, message: 'Xóa field khỏi form thành công' });
  } catch (error) {
    console.error('Delete form field error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.reorder = async (req, res) => {
  try {
    const { formId } = req.params;
    const { fields } = req.body;

    const form = await formService.getFormById(formId);
    if (!form) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy form' });
    }

    if (!fields || !Array.isArray(fields)) {
      return res.status(400).json({ success: false, message: 'fields phải là một mảng' });
    }

    const reordered = await formFieldService.reorderFields(formId, fields);
    res.json({ success: true, data: reordered, message: 'Sắp xếp lại field thành công' });
  } catch (error) {
    console.error('Reorder form fields error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
