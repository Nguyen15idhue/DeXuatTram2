const express = require('express');
const router = express.Router();
const { requireAuth, requireProposalInfoManager, requireProposalManager, requireSuperAdmin } = require('../middlewares/auth');
const proposalGradingController = require('../controllers/proposalGradingController');

/**
 * @swagger
 * /api/admin/proposal-grading:
 *   get:
 *     tags: [Proposal Grading]
 *     summary: Danh sách đề xuất cho trang Chấm điểm Quy hoạch và Pháp lý
 *     description: >
 *       tab=all: từ GRADING đến hết status flow (không gồm PENDING);
 *       tab=pending: công việc của phòng chưa chấm hoặc đang được yêu cầu chấm lại;
 *       tab=completed: phần việc đã hoàn thành riêng theo phòng; CANCELLED xuất hiện ở cả hai phòng.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tab
 *         schema:
 *           type: string
 *           enum: [all, pending, completed]
 *           default: all
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *           enum: [QH, PL]
 *         description: Bộ lọc tương thích cho ADMIN/SUPER_ADMIN; UI tự xác định theo phòng ban.
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Tìm theo mã đề xuất, tên pháp nhân, SĐT, địa chỉ, người đề xuất
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
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền
 */
router.get('/', requireAuth, requireProposalInfoManager, proposalGradingController.list);

/**
 * @swagger
 * /api/admin/proposal-grading/filter-options:
 *   get:
 *     tags: [Proposal Grading]
 *     summary: Tùy chọn bộ lọc danh sách chấm điểm
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách người đề xuất, người phụ trách, miền, tỉnh và mô hình trong phạm vi
 */
router.get('/filter-options', requireAuth, requireProposalInfoManager, proposalGradingController.filterOptions);

/**
 * @swagger
 * /api/admin/proposal-grading/{id}:
 *   get:
 *     tags: [Proposal Grading]
 *     summary: Chi tiết đề xuất và cấu hình hiển thị theo bước chấm điểm
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
 *         description: Chi tiết đề xuất
 *       403:
 *         description: Không có quyền
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.get('/:id', requireAuth, requireProposalInfoManager, proposalGradingController.detail);

/**
 * @swagger
 * /api/admin/proposal-grading/display-config:
 *   put:
 *     tags: [Proposal Grading]
 *     summary: Lưu cấu hình trường hiển thị riêng cho chấm điểm và chấm điểm lại
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               grading:
 *                 type: array
 *                 items:
 *                   type: string
 *               regrading:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Đã lưu cấu hình
 *       403:
 *         description: Chỉ SUPER_ADMIN được phép
 */
router.put('/display-config', requireAuth, requireSuperAdmin, proposalGradingController.saveDisplayConfig);

/**
 * @swagger
 * /api/admin/proposal-grading/{id}/request-supplement:
 *   post:
 *     tags: [Proposal Grading]
 *     summary: Yêu cầu người đề xuất bổ sung thông tin khi đề xuất đang ở bước GRADING
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
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Đã tạo yêu cầu bổ sung
 *       400:
 *         description: Đề xuất không ở bước chấm điểm hoặc lý do không hợp lệ
 */
router.post('/:id/request-supplement', requireAuth, requireProposalManager, proposalGradingController.requestSupplement);

/**
 * @swagger
 * /api/admin/proposal-grading/{id}:
 *   put:
 *     tags: [Proposal Grading]
 *     summary: Cập nhật điểm / đánh giá Quy hoạch hoặc Pháp lý
 *     description: >
 *       ADMIN thuộc phòng Quy hoạch chỉ cập nhật quy_hoach_score/quy_hoach_note;
 *       ADMIN thuộc phòng Pháp lý chỉ cập nhật phap_ly_score/phap_ly_note;
 *       SUPER_ADMIN được cập nhật cả hai. Khi chấm lại, chỉ phòng được giao mới được cập nhật.
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
 *             properties:
 *               quy_hoach_score:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 3
 *                 nullable: true
 *               quy_hoach_note:
 *                 type: string
 *                 nullable: true
 *               phap_ly_score:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 3
 *                 nullable: true
 *               phap_ly_note:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc chưa đủ hồ sơ pháp lý
 *       403:
 *         description: Không có quyền cập nhật phòng ban này
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.put('/:id', requireAuth, requireProposalManager, proposalGradingController.update);

module.exports = router;
