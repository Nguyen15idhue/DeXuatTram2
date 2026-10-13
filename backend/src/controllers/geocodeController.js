const geocodeService = require('../services/geocodeService');

exports.reverse = async (req, res) => {
  try {
    const lat = parseFloat(req.body.lat);
    const lng = parseFloat(req.body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ success: false, message: 'Tọa độ không hợp lệ' });
    }
    const data = await geocodeService.reverse(lat, lng);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error reverse geocoding:', error.message);
    res.json({ success: true, data: { found: false, error: true } });
  }
};

exports.search = async (req, res) => {
  try {
    const text = String((req.body && req.body.text) || '').trim();
    if (text.length < 3) {
      return res.status(400).json({ success: false, message: 'Nhập tối thiểu 3 ký tự' });
    }
    const data = await geocodeService.forward(text, {
      lat: req.body.lat,
      lng: req.body.lng,
      limit: req.body.limit,
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error forward geocoding:', error.message);
    res.json({ success: true, data: { found: false, results: [], error: true } });
  }
};

exports.getConfig = async (req, res) => {
  try {
    const config = await geocodeService.getConfig();
    if (!config) return res.status(404).json({ success: false, message: 'Không tìm thấy cấu hình geocode' });
    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Error getting geocode config:', error);
    res.status(500).json({ success: false, message: 'Lỗi lấy cấu hình geocode' });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const config = await geocodeService.updateConfig(req.body);
    if (!config) return res.status(404).json({ success: false, message: 'Không tìm thấy cấu hình geocode' });
    res.json({ success: true, data: config, message: 'Cập nhật thành công' });
  } catch (error) {
    console.error('Error updating geocode config:', error);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật cấu hình geocode' });
  }
};

exports.test = async (req, res) => {
  try {
    const lat = req.body.lat !== undefined ? parseFloat(req.body.lat) : 21.0285;
    const lng = req.body.lng !== undefined ? parseFloat(req.body.lng) : 105.8542;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ success: false, message: 'Tọa độ không hợp lệ' });
    }
    const config = await geocodeService.getConfig();
    if (!config || !config.api_key) {
      return res.status(400).json({ success: false, message: 'Chưa cấu hình API key geocode' });
    }
    const data = await geocodeService.reverse(lat, lng);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error testing geocode:', error.message);
    res.status(500).json({ success: false, message: `Lỗi test geocode: ${error.message}` });
  }
};
