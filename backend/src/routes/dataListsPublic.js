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

/**
 * @swagger
 * /api/data-lists/{id}/children:
 *   get:
 *     tags: [Data Lists]
 *     summary: Lấy options con theo giá trị cha (cascading select, public cho form)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: column
 *         required: true
 *         schema:
 *           type: string
 *         description: Cột cần lấy options
 *       - in: query
 *         name: parent_column
 *         required: true
 *         schema:
 *           type: string
 *         description: Cột cha để lọc
 *       - in: query
 *         name: parent_value
 *         required: true
 *         schema:
 *           type: string
 *         description: Giá trị cha để lọc
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Thiếu tham số hoặc cột không tồn tại
 *       404:
 *         description: Không tìm thấy data list
 */
router.get('/:id/children', publicDataLimiter, async (req, res) => {
  try {
    const { column, parent_column, parent_value } = req.query;
    if (!column || !parent_column || parent_value === undefined) {
      return res.status(400).json({ success: false, message: 'Thiếu column, parent_column hoặc parent_value' });
    }
    const data = await dataListService.getById(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Không tìm thấy data list' });
    const cols = Array.isArray(data.columns_config) ? data.columns_config : [];
    const keys = new Set(cols.map(c => c.key));
    if (!keys.has(column) || !keys.has(parent_column)) {
      return res.status(400).json({ success: false, message: 'Cột không tồn tại trong data list' });
    }
    const seen = new Set();
    const options = [];
    for (const row of data.rows || []) {
      const d = row.data || {};
      if (String(d[parent_column] ?? '') !== String(parent_value)) continue;
      const v = d[column];
      if (v === null || v === undefined || v === '' || seen.has(v)) continue;
      seen.add(v);
      options.push({ value: v, label: v });
    }
    res.json({ success: true, data: { options } });
  } catch (error) {
    console.error('Get data list children error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;
