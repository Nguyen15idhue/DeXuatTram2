const dataListService = require('../services/dataListService');

exports.getAll = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const result = await dataListService.getAll(page, limit);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Get data lists error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.getById = async (req, res) => {
  try {
    const data = await dataListService.getById(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Không tìm thấy data list' });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Get data list error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.create = async (req, res) => {
  try {
    const { name, description, columns_config } = req.body;
    if (!name || !columns_config) {
      return res.status(400).json({ success: false, message: 'Thiếu name hoặc columns_config' });
    }
    const data = await dataListService.create({ name, description, columns_config });
    res.status(201).json({ success: true, data, message: 'Tạo data list thành công' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: 'Tên data list đã tồn tại' });
    }
    console.error('Create data list error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.update = async (req, res) => {
  try {
    const data = await dataListService.update(req.params.id, req.body);
    res.json({ success: true, data, message: 'Cập nhật thành công' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: 'Tên data list đã tồn tại' });
    }
    console.error('Update data list error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.remove = async (req, res) => {
  try {
    await dataListService.remove(req.params.id);
    res.json({ success: true, message: 'Xóa data list thành công' });
  } catch (error) {
    console.error('Delete data list error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.addRows = async (req, res) => {
  try {
    const { rows } = req.body;
    if (!rows || !Array.isArray(rows)) {
      return res.status(400).json({ success: false, message: 'Thiếu rows array' });
    }
    const data = await dataListService.addRows(req.params.id, rows);
    res.status(201).json({ success: true, data, message: `Đã thêm ${rows.length} dòng` });
  } catch (error) {
    console.error('Add rows error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.updateRow = async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ success: false, message: 'Thiếu data' });
    const row = await dataListService.updateRow(req.params.id, req.params.rowId, data);
    if (!row) return res.status(404).json({ success: false, message: 'Không tìm thấy row' });
    res.json({ success: true, data: row, message: 'Cập nhật row thành công' });
  } catch (error) {
    console.error('Update row error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.deleteRow = async (req, res) => {
  try {
    await dataListService.deleteRow(req.params.id, req.params.rowId);
    res.json({ success: true, message: 'Xóa row thành công' });
  } catch (error) {
    console.error('Delete row error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
