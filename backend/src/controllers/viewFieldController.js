const viewFieldService = require('../services/viewFieldService');
const viewService = require('../services/viewService');
const fieldDefinitionService = require('../services/fieldDefinitionService');

exports.getFields = async (req, res) => {
  try {
    const { viewId } = req.params;

    const view = await viewService.getViewById(viewId);
    if (!view) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy view' });
    }

    const fields = await viewFieldService.getFieldsByViewId(viewId);
    res.json({ success: true, data: fields });
  } catch (error) {
    console.error('Get view fields error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.addField = async (req, res) => {
  try {
    const { viewId } = req.params;
    const { field_id, order_index, visible, width, sortable, filterable, config } = req.body;

    const view = await viewService.getViewById(viewId);
    if (!view) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy view' });
    }

    if (!field_id) {
      return res.status(400).json({ success: false, message: 'field_id không được để trống' });
    }

    const fieldDef = await fieldDefinitionService.getFieldDefinitionById(field_id);
    if (!fieldDef) {
      return res.status(400).json({ success: false, message: 'Field definition không tồn tại' });
    }

    if (fieldDef.entity !== view.entity) {
      return res.status(400).json({ success: false, message: `Field entity "${fieldDef.entity}" không khớp với view entity "${view.entity}"` });
    }

    const existingFields = await viewFieldService.getFieldsByViewId(viewId);
    const duplicateField = existingFields.find(f => f.field_id === field_id);
    if (duplicateField) {
      return res.status(400).json({ success: false, message: 'Field đã tồn tại trong view này' });
    }

    const viewField = await viewFieldService.addFieldToView(viewId, { field_id, order_index, visible, width, sortable, filterable, config });
    res.status(201).json({ success: true, data: viewField, message: 'Thêm field vào view thành công' });
  } catch (error) {
    console.error('Add view field error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.updateField = async (req, res) => {
  try {
    const { viewId, id } = req.params;
    const { order_index, visible, width, sortable, filterable, config } = req.body;

    const view = await viewService.getViewById(viewId);
    if (!view) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy view' });
    }

    const existing = await viewFieldService.getViewFieldById(id);
    if (!existing || existing.view_id !== parseInt(viewId)) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy field trong view này' });
    }

    const viewField = await viewFieldService.updateViewField(id, {
      order_index: order_index !== undefined ? order_index : existing.order_index,
      visible,
      width,
      sortable,
      filterable,
      config
    });
    res.json({ success: true, data: viewField, message: 'Cập nhật field thành công' });
  } catch (error) {
    console.error('Update view field error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.deleteField = async (req, res) => {
  try {
    const { viewId, id } = req.params;

    const view = await viewService.getViewById(viewId);
    if (!view) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy view' });
    }

    const existing = await viewFieldService.getViewFieldById(id);
    if (!existing || existing.view_id !== parseInt(viewId)) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy field trong view này' });
    }

    await viewFieldService.deleteViewField(id);
    res.json({ success: true, message: 'Xóa field khỏi view thành công' });
  } catch (error) {
    console.error('Delete view field error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.reorder = async (req, res) => {
  try {
    const { viewId } = req.params;
    const { fields } = req.body;

    const view = await viewService.getViewById(viewId);
    if (!view) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy view' });
    }

    if (!fields || !Array.isArray(fields)) {
      return res.status(400).json({ success: false, message: 'fields phải là một mảng' });
    }

    const reordered = await viewFieldService.reorderFields(viewId, fields);
    res.json({ success: true, data: reordered, message: 'Sắp xếp lại field thành công' });
  } catch (error) {
    console.error('Reorder view fields error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
