const express = require('express');
const router = express.Router();
const { publicDataLimiter } = require('../middlewares/rateLimits');
const dataListService = require('../services/dataListService');

/**
 * @swagger
 * /api/data-lists/{id}:
 *   get:
 *     tags: [Data Lists]
 *     summary: Đọc data list (public, cho form)
 *     description: Chỉ đọc columns + rows, không cần đăng nhập. Dùng cho select lấy dữ liệu từ Data List ở form public.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Thành công
 *       404:
 *         description: Không tìm thấy data list
 */
router.get('/:id', publicDataLimiter, async (req, res) => {
  try {
    const data = await dataListService.getById(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Không tìm thấy data list' });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Get public data list error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;
