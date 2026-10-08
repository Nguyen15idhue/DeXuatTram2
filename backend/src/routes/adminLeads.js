const express = require('express');
const router = express.Router();
const { requireAuth, requireLeadManager } = require('../middlewares/auth');
const adminLeadController = require('../controllers/adminLeadController');

/**
 * @swagger
 * /api/admin/leads:
 *   get:
 *     tags: [Leads]
 *     summary: Lấy danh sách Lead (phân trang server-side)
 *     description: |
 *       Phân quyền theo contract docs/8/mkt/04 — SUPER_ADMIN/ADMIN thấy toàn bộ,
 *       MKT thấy Lead do mình tạo, SALES thấy theo scope (GĐTT: phòng ban đã phân,
 *       GĐKV: Lead được giao trực tiếp), CTV/NPP bị 403.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Tìm theo họ tên, SĐT hoặc mã Lead
 *       - in: query
 *         name: stage
 *         schema:
 *           type: string
 *         description: Lọc theo stage
 *       - in: query
 *         name: source
 *         schema:
 *           type: string
 *         description: Lọc theo nguồn Lead
 *       - in: query
 *         name: province
 *         schema:
 *           type: string
 *         description: Lọc theo tỉnh
 *       - in: query
 *         name: region
 *         schema:
 *           type: string
 *         description: Lọc theo vùng miền
 *       - in: query
 *         name: assigned_user_id
 *         schema:
 *           type: integer
 *         description: Lọc theo người được giao
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Thành công
 *       403:
 *         description: Không có quyền truy cập
 */
router.get('/', requireAuth, requireLeadManager, adminLeadController.getAll);

module.exports = router;
