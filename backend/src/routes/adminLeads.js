const express = require('express');
const router = express.Router();
const { requireAuth, requireLeadManager, requireLeadWriter } = require('../middlewares/auth');
const { validateCreateLead, validateUpdateLead } = require('../middlewares/validators');
const adminLeadController = require('../controllers/adminLeadController');

/**
 * @swagger
 * /api/admin/leads/assignee-options:
 *   get:
 *     tags: [Leads]
 *     summary: Danh sách GĐTTKD/GĐKV trong phạm vi khách hàng
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Danh sách nhân sự }
 *       403: { description: Không có quyền Quản lý khách hàng }
 */
router.get('/assignee-options', requireAuth, requireLeadManager, adminLeadController.assigneeOptions);

/**
 * @swagger
 * /api/admin/leads:
 *   get:
 *     tags: [Leads]
 *     summary: Lấy danh sách Lead (phân trang server-side)
 *     description: |
 *       Super Admin, TGĐ và Phòng Công nghệ và Quy hoạch xem toàn bộ.
 *       Nhân sự Kinh doanh ba miền xem theo cây quản lý; GĐTTKD theo phòng ban.
 *       ADMIN/MKT không có quyền mặc định, phải thuộc chức danh/phòng ban cho phép.
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
 *         name: consultation_status
 *         schema:
 *           type: string
 *           enum: [WAITING_ALLOCATION, WAITING_FIRST_CONTACT, CONSULTING, SUCCESS, FAILED]
 *         description: Lọc theo trạng thái tư vấn; response có permissions và consultation_timing
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

/**
 * @swagger
 * /api/admin/leads/bulk-delete:
 *   post:
 *     tags: [Leads]
 *     summary: Xóa mềm nhiều Lead (1 API call, transaction)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids]
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       200:
 *         description: Thành công
 *       403:
 *         description: Ngoài scope
 *       409:
 *         description: Lead đã có đề xuất liên kết
 */
router.post('/bulk-delete', requireAuth, requireLeadWriter, adminLeadController.bulkDelete);

/**
 * @swagger
 * /api/admin/leads/bulk-assign:
 *   post:
 *     tags: [Leads]
  *     summary: Phân bổ nhiều khách hàng Tiềm năng/Quan tâm cho một GĐKV
  *     description: Chỉ Super Admin hoặc GĐTTKD trong phạm vi quản lý; GĐTTKD chỉ giao trong phòng ban mình.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids, assignee_user_id]
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *               assignee_user_id:
 *                 type: integer
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Kết quả từng Lead
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       403:
 *         description: Không có quyền
 */
router.post('/bulk-assign', requireAuth, requireLeadManager, adminLeadController.bulkAssign);

/**
 * @swagger
 * /api/admin/leads/{id}:
 *   get:
 *     tags: [Leads]
 *     summary: Chi tiết Lead (kiểm tra scope item-level, ngoài scope 403)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Thành công
 *       403:
 *         description: Ngoài scope
 *       404:
 *         description: Không tìm thấy
 *   put:
 *     tags: [Leads]
 *     summary: Cập nhật Lead (không cho đổi stage/journey qua PUT)
 *     description: |
 *       GĐKV được giao, cấp trên và Super Admin cập nhật TVBH/kết quả trong phạm vi.
 *       CN&QH chỉ đọc; thông tin chung và CSKH chỉ Super Admin. Thất bại bắt buộc có lý do.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       403:
 *         description: Ngoài scope
 *   delete:
 *     tags: [Leads]
 *     summary: Xóa mềm Lead (chặn khi đã có Proposal liên kết)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Thành công
 *       403:
 *         description: Ngoài scope
 *       409:
 *         description: Lead đã có đề xuất liên kết
 */
/**
 * @swagger
 * /api/admin/leads/{id}/assign:
 *   post:
 *     tags: [Leads]
 *     summary: Phân bổ khách hàng cho GĐKV (ghi lịch sử, đóng assignment cũ)
 *     description: |
 *       Chỉ khách hàng Tiềm năng/Quan tâm được giao cho GĐKV đang hoạt động.
 *       Chỉ Super Admin và GĐTTKD được phân bổ; GĐTTKD chỉ giao GĐKV cùng phòng ban.
 *       Giao lần đầu hoặc giao lại trước khi tư vấn bắt đầu hạn 240 phút làm việc.
 *       GĐTTKD chỉ nhận qua auto-routing nội bộ, không qua endpoint phân bổ thủ công.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [assignee_user_id]
 *             properties:
 *               assignee_user_id:
 *                 type: integer
 *                 description: ID người dùng ACTIVE có chức danh GĐKV thuộc kinh doanh ba miền
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Target không hợp lệ
 *       403:
 *         description: Không có quyền giao
 */
router.post('/:id/assign', requireAuth, requireLeadManager, adminLeadController.assign);

/**
 * @swagger
 * /api/admin/leads/{id}/assignments:
 *   get:
 *     tags: [Leads]
 *     summary: Lịch sử giao Lead
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Thành công
 *       403:
 *         description: Ngoài scope
 */
router.get('/:id/assignments', requireAuth, requireLeadManager, adminLeadController.assignments);

/**
 * @swagger
 * /api/admin/leads/{id}/journey:
 *   get:
 *     tags: [Leads]
 *     summary: Journey của Lead (lead + journey + timeline + proposals)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 200
 *     responses:
 *       200:
 *         description: Thành công
 *       403:
 *         description: Ngoài scope
 */
/**
 * @swagger
 * /api/admin/leads/{id}/create-proposal:
 *   post:
 *     tags: [Leads]
 *     summary: Tạo đề xuất từ Lead (prefill + gắn journey, chống trùng)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: header
 *         name: Idempotency-Key
 *         schema:
 *           type: string
 *         description: Khóa chống submit trùng (tùy chọn)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [latitude, longitude]
 *             properties:
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               description:
 *                 description: Nội dung khác của đề xuất (prefill tự điền từ Lead khi để trống)
 *                 type: object
 *     responses:
 *       201:
 *         description: Tạo thành công
 *       400:
 *         description: Thiếu tọa độ
 *       403:
 *         description: Ngoài scope
 *       422:
 *         description: Lead chưa TVBH thành công
 */
router.post('/:id/create-proposal', requireAuth, requireLeadManager, adminLeadController.createProposal);

router.get('/:id/journey', requireAuth, requireLeadManager, adminLeadController.journey);

router.get('/:id', requireAuth, requireLeadManager, adminLeadController.getById);
router.put('/:id', requireAuth, requireLeadManager, validateUpdateLead, adminLeadController.update);
router.delete('/:id', requireAuth, requireLeadWriter, adminLeadController.remove);


/**
 * @swagger
 * /api/admin/leads:
 *   post:
 *     tags: [Leads]
 *     summary: Tạo Lead (tự tạo business_journeys + journey_code + mã Lead)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Tạo thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 */
router.post('/', requireAuth, requireLeadWriter, validateCreateLead, adminLeadController.create);

module.exports = router;
