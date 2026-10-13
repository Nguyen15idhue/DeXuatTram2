const mapService = require('../services/mapService');

const SHORT_LINK_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl']);
const RESOLVED_HOSTS = new Set(['www.google.com', 'google.com', 'maps.google.com', 'maps.app.goo.gl']);

exports.resolveMapUrl = async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string' || url.length > 2000) {
      return res.status(400).json({ success: false, message: 'URL is required' });
    }

    const input = url.trim();
    const coords = mapService.parseCoords(input);
    if (coords) {
      return res.json({ success: true, data: coords });
    }

    let parsed;
    try {
      parsed = new URL(input);
    } catch {
      return res.status(400).json({ success: false, message: 'Link không hợp lệ hoặc không chứa tọa độ' });
    }
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !SHORT_LINK_HOSTS.has(parsed.hostname)) {
      return res.status(400).json({ success: false, message: 'Link không hợp lệ hoặc không chứa tọa độ' });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let finalUrl;
    try {
      const response = await fetch(input, { redirect: 'follow', signal: controller.signal });
      finalUrl = response.url;
      try { await response.arrayBuffer(); } catch { /* silent */ }
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return res.status(400).json({ success: false, message: 'Hết thời gian đọc link rút gọn' });
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    try {
      const finalHost = new URL(finalUrl).hostname;
      if (!RESOLVED_HOSTS.has(finalHost)) {
        return res.status(400).json({ success: false, message: 'Không thể đọc tọa độ từ link rút gọn' });
      }
    } catch {
      return res.status(400).json({ success: false, message: 'Không thể đọc tọa độ từ link rút gọn' });
    }

    const resolvedCoords = mapService.parseCoords(finalUrl);
    if (resolvedCoords) {
      return res.json({ success: true, data: resolvedCoords });
    }

    return res.status(400).json({ success: false, message: 'Không thể đọc tọa độ từ link rút gọn' });
  } catch (error) {
    console.error('Resolve map URL error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server khi xử lý link' });
  }
};
