const express = require('express');
const router = express.Router();

const PATTERNS = [
  /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
  /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
  /\/maps\/place\/[^/]*\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
  /\/maps\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
  /[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
  /\/maps\?.*center=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
  /google\.com\/maps\?q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
  /!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/,
];

function parseCoords(url) {
  for (const pattern of PATTERNS) {
    const match = url.match(pattern);
    if (match && match[1] && match[2]) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }
  }
  return null;
}

/**
 * @swagger
 * /api/map/resolve-map-url:
 *   post:
 *     tags: [Map Utils]
 *     summary: Giải mã link Google Maps thành tọa độ
 *     description: Hỗ trợ link Google Maps đầy đủ, link rút gọn (maps.app.goo.gl)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url]
 *             properties:
 *               url:
 *                 type: string
 *                 example: https://www.google.com/maps/place/.../@21.0285,105.8542,17z
 *     responses:
 *       200:
 *         description: Thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     lat:
 *                       type: number
 *                       example: 21.0285
 *                     lng:
 *                       type: number
 *                       example: 105.8542
 *       400:
 *         description: URL không hợp lệ hoặc không chứa tọa độ
 */
router.post('/resolve-map-url', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, message: 'URL is required' });
    }

    const trimmed = url.trim();

    const coords = parseCoords(trimmed);
    if (coords) {
      return res.json({ success: true, data: coords });
    }

    if (trimmed.includes('maps.app.goo.gl') || trimmed.includes('goo.gl/maps')) {
      const response = await fetch(trimmed, { redirect: 'follow' });
      const finalUrl = response.url;

      const resolvedCoords = parseCoords(finalUrl);
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
});

module.exports = router;
