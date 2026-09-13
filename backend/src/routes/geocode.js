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

module.exports = router;
