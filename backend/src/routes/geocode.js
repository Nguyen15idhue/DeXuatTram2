const express = require('express');
const router = express.Router();
const geocodeController = require('../controllers/geocodeController');
const { geocodeLimiter } = require('../middlewares/rateLimits');

/**
 * @swagger
 * /api/geocode/reverse:
 *   post:
 *     tags: [Geocode]
 *     summary: Reverse geocode tọa độ thành địa chỉ
 *     description: Trả địa chỉ phân rã (tỉnh/phường/đường...) từ lat/lng. Public, có rate limit.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               lat: { type: number, example: 21.0285 }
 *               lng: { type: number, example: 105.8542 }
 *     responses:
 *       200:
 *         description: Thành công (found=false nếu không có địa chỉ)
 */
router.post('/reverse', geocodeLimiter, geocodeController.reverse);

/**
 * @swagger
 * /api/geocode/search:
 *   post:
 *     tags: [Geocode]
 *     summary: Tìm địa điểm theo từ khóa (forward geocode, proxy giữ API key)
 *     description: Trả danh sách gợi ý địa chỉ (tối đa 10) từ text. Public, có rate limit. Bias theo tâm bản đồ nếu truyền lat/lng.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text]
 *             properties:
 *               text: { type: string, example: 'Vincom Bà Triệu' }
 *               lat: { type: number, example: 21.0285 }
 *               lng: { type: number, example: 105.8542 }
 *               limit: { type: integer, example: 6 }
 *     responses:
 *       200:
 *         description: Thành công (found=false nếu không có kết quả)
 *       400:
 *         description: text < 3 ký tự
 */
router.post('/search', geocodeLimiter, geocodeController.search);

module.exports = router;
