const express = require('express');
const { requireAuth } = require('../middlewares/auth');
const pool = require('../utils/db');
const service = require('../services/businessCalendarService');
const router = express.Router();

async function freshUser(id) {
  const [rows] = await pool.query('SELECT id, role, status, custom_data FROM users WHERE id = ?', [id]);
  return rows[0]?.status === 'ACTIVE' ? rows[0] : null;
}

/**
 * @swagger
 * /api/admin/business-calendar:
 *   get:
 *     tags: [Business Calendar]
 *     summary: Lấy phiên bản lịch làm việc toàn hệ thống đang áp dụng
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "{success, data: {id, timezone, weekly, exceptions}, meta: {can_manage}}. Múi giờ Asia/Ho_Chi_Minh; ngày tuần 1–7; ngoại lệ ngày YYYY-MM-DD thay thế toàn bộ ca trong ngày."
 *       401:
 *         description: Chưa đăng nhập
 *       503:
 *         description: Chưa khởi tạo lịch làm việc
 *   put:
 *     tags: [Business Calendar]
 *     summary: Tạo phiên bản lịch bất biến mới (SUPER_ADMIN hoặc Back Office)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [timezone, weekly, exceptions]
 *             properties:
 *               id:
 *                 type: integer
 *                 description: Phiên bản đang chỉnh sửa để kiểm tra xung đột
 *               timezone:
 *                 type: string
 *                 enum: [Asia/Ho_Chi_Minh]
 *               weekly:
 *                 type: object
 *                 description: Đủ khóa 1 (thứ Hai) đến 7 (Chủ nhật); mỗi giá trị là mảng ca [HH:mm, HH:mm], không chồng lấn hoặc qua đêm
 *                 example: {"1": [["07:30", "11:30"], ["13:00", "17:00"]], "2": [["07:30", "11:30"], ["13:00", "17:00"]], "3": [["07:30", "11:30"], ["13:00", "17:00"]], "4": [["07:30", "11:30"], ["13:00", "17:00"]], "5": [["07:30", "11:30"], ["13:00", "17:00"]], "6": [["07:30", "11:30"], ["13:00", "17:00"]], "7": []}
 *               exceptions:
 *                 type: object
 *                 description: Khóa ngày YYYY-MM-DD; mảng rỗng là nghỉ, có ca là làm việc thay lịch tuần
 *                 example: {"2027-01-01": []}
 *     responses:
 *       200:
 *         description: "{success, data: {id, timezone, weekly, exceptions}}. Phiên bản cũ vẫn được giữ nguyên cho các hạn đang chạy."
 *       400:
 *         description: Sai ngày, khung giờ, ca chồng lấn hoặc lịch không có ca làm việc
 *       403:
 *         description: Không có quyền chỉnh sửa
 *       409:
 *         description: Phiên bản đã thay đổi, cần tải lại
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = await freshUser(req.user.id);
    if (!user) return res.status(403).json({ success: false, message: 'Tài khoản không còn hoạt động' });
    const data = await service.getCalendar();
    return res.json({ success: true, data, meta: { can_manage: service.canManageCalendar(user) } });
  } catch (error) {
    console.error('Error getting business calendar:', error);
    return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Lỗi lấy lịch làm việc' });
  }
});

router.put('/', requireAuth, async (req, res) => {
  try {
    const user = await freshUser(req.user.id);
    if (!user || !service.canManageCalendar(user)) return res.status(403).json({ success: false, message: 'Chỉ Super Admin hoặc Back Office được sửa lịch làm việc' });
    const data = await service.saveCalendar(req.body, user.id);
    console.info('Business calendar version created:', { versionId: data.id, actorId: user.id });
    return res.json({ success: true, data, message: 'Đã lưu phiên bản lịch mới' });
  } catch (error) {
    console.error('Error updating business calendar:', error);
    return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Lỗi lưu lịch làm việc' });
  }
});

module.exports = router;
