const mapConfigService = require('../services/mapConfigService');

exports.getTileProviders = (req, res) => {
  res.json({ success: true, data: mapConfigService.getTileProviders() });
};

exports.getConfig = async (req, res) => {
  try {
    const entity = req.query.entity || 'stations';
    const config = await mapConfigService.getConfig(entity);
    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Error getting map config:', error);
    res.status(500).json({ success: false, message: 'Lỗi lấy cấu hình bản đồ' });
  }
};

exports.createConfig = async (req, res) => {
  try {
    const config = await mapConfigService.createConfig(req.body);
    res.status(201).json({ success: true, data: config, message: 'Tạo cấu hình thành công' });
  } catch (error) {
    console.error('Error creating map config:', error);
    res.status(500).json({ success: false, message: 'Lỗi tạo cấu hình' });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const config = await mapConfigService.updateConfig(req.params.id, req.body);
    if (!config) return res.status(404).json({ success: false, message: 'Không tìm thấy cấu hình' });
    res.json({ success: true, data: config, message: 'Cập nhật thành công' });
  } catch (error) {
    console.error('Error updating map config:', error);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật cấu hình' });
  }
};

exports.deleteConfig = async (req, res) => {
  try {
    const deleted = await mapConfigService.deleteConfig(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Không tìm thấy cấu hình' });
    res.json({ success: true, message: 'Xoá thành công' });
  } catch (error) {
    console.error('Error deleting map config:', error);
    res.status(500).json({ success: false, message: 'Lỗi xoá cấu hình' });
  }
};
