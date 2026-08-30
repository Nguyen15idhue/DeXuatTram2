const mapService = require('../services/mapService');

exports.resolveMapUrl = async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, message: 'URL is required' });
    }

    const coords = mapService.parseCoords(url.trim());
    if (coords) {
      return res.json({ success: true, data: coords });
    }

    if (url.includes('maps.app.goo.gl') || url.includes('goo.gl/maps')) {
      const response = await fetch(url.trim(), { redirect: 'follow' });
      const finalUrl = response.url;

      const resolvedCoords = mapService.parseCoords(finalUrl);
      if (resolvedCoords) {
        return res.json({ success: true, data: resolvedCoords });
      }

      return res.status(400).json({ success: false, message: 'Không thể đọc tọa độ từ link rút gọn' });
    }

    return res.status(400).json({ success: false, message: 'Link không hợp lệ hoặc không chứa tọa độ' });
  } catch (error) {
    console.error('Resolve map URL error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server khi xử lý link' });
  }
};
