const express = require('express');
const router = express.Router();
const mapController = require('../controllers/mapController');

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
router.post('/resolve-map-url', mapController.resolveMapUrl);

module.exports = router;
