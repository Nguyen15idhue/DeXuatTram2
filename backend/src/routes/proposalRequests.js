const express = require('express');
const router = express.Router();
const { requireAuth, requireProposalInfoManager } = require('../middlewares/auth');
const { validateUpdateProposal } = require('../middlewares/validators');
const proposalRequestController = require('../controllers/proposalRequestController');

/**
 * @swagger
 * /api/admin/proposal-requests:
 *   get:
 *     tags: [Proposal Requests]
 *     summary: Danh sách yêu cầu đề xuất (tab "Đề xuất cần thực hiện")
 *     description: ADMIN/SUPER xem toàn bộ; SALES/NPP xem theo nhánh được phép; CTV chỉ xem yêu cầu của mình.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [OPEN, DONE, CANCELLED]
 *           default: OPEN
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [UPDATE_INFO, SUPPLEMENT, RE_GRADE, REVISE_BCDX, TGD_REVIEW, OTHER]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Tìm theo mã đề xuất, tên người đề xuất, mô tả yêu cầu
 *       - in: query
 *         name: my
 *         schema:
 *           type: string
 *           enum: ['1']
 *         description: Nếu =1, chỉ lấy yêu cầu giao cho chính mình (theo target_user_id hoặc loại yêu cầu khớp phòng ban/chức vụ)
 *       - in: query
 *         name: work_scope
 *         schema:
 *           type: string
 *           enum: [mine, subordinates, all]
 *           default: mine
 *         description: Phạm vi công việc; cấp quản lý chỉ thấy cấp dưới trong nhánh, GĐTTKD còn thấy yêu cầu theo miền.
 *       - in: query
 *         name: proposal_status
 *         schema:
 *           type: string
 *         description: Lọc theo trạng thái đề xuất đang được yêu cầu xử lý.
 *       - in: query
 *         name: model
 *         schema:
 *           type: string
 *       - in: query
 *         name: province
 *         schema:
 *           type: string
 *       - in: query
 *         name: region
 *         schema:
 *           type: string
 *       - in: query
 *         name: owner_user_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: manager_user_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: date_from
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày tạo yêu cầu từ ngày này.
 *       - in: query
 *         name: date_to
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày tạo yêu cầu đến ngày này.
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
router.get('/', requireAuth, requireProposalInfoManager, proposalRequestController.list);

/**
 * @swagger
 * /api/admin/proposal-requests/types:
 *   get:
 *     tags: [Proposal Requests]
 *     summary: Danh mục loại yêu cầu đề xuất
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/types', requireAuth, requireProposalInfoManager, proposalRequestController.types);
/**
 * @swagger
 * /api/admin/proposal-requests/filter-options:
 *   get:
 *     tags: [Proposal Requests]
 *     summary: Danh sách giá trị lọc trong phạm vi người dùng được xem
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 *       403:
 *         description: Không có quyền
 */
router.get('/filter-options', requireAuth, requireProposalInfoManager, proposalRequestController.filterOptions);

/**
 * @swagger
 * /api/admin/proposal-requests/{id}/update-context:
 *   get:
 *     tags: [Proposal Requests]
 *     summary: Lấy thông tin yêu cầu và đề xuất để cập nhật
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
 *         description: Không có quyền xử lý yêu cầu
 */
router.get('/:id/update-context', requireAuth, requireProposalInfoManager, proposalRequestController.getUpdateContext);

/**
 * @swagger
 * /api/admin/proposal-requests/{id}/proposal:
 *   put:
 *     tags: [Proposal Requests]
 *     summary: Cập nhật đề xuất theo yêu cầu, có ghi nhận actor thực tế
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
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       403:
 *         description: Không có quyền cập nhật thay người đề xuất
 */
router.put('/:id/proposal', requireAuth, requireProposalInfoManager, validateUpdateProposal, proposalRequestController.updateProposalForRequest);

/**
 * @swagger
 * /api/admin/proposal-requests/{id}/complete:
 *   post:
 *     tags: [Proposal Requests]
 *     summary: Đánh dấu yêu cầu đã hoàn thành (kèm ghi chú kết quả)
 *     description: SUPER_ADMIN xử lý toàn hệ thống; ADMIN xử lý việc được giao; người tạo, cấp trên hợp lệ hoặc người nhận theo phòng ban có thể xử lý trong phạm vi. Yêu cầu phải đang OPEN, bắt buộc có resolution_note.
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
 *             required: [resolution_note]
 *             properties:
 *               resolution_note:
 *                 type: string
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Yêu cầu đã xử lý hoặc thiếu ghi chú
 *       403:
 *         description: Không có quyền
 */
router.post('/:id/complete', requireAuth, requireProposalInfoManager, proposalRequestController.complete);

module.exports = router;
