const express = require('express');
const router = express.Router();
const { requireAuth, requireUserManager } = require('../middlewares/auth');
const proposalReviewController = require('../controllers/proposalReviewController');

/**
 * @swagger
 * /api/admin/proposal-reviews:
 *   get:
 *     tags: [Proposal Reviews]
 *     summary: Danh sách đề xuất cho trang Yêu cầu chấm điểm lại
 *     description: >
 *       tab=all: đề xuất có Mức độ xem xét khác null;
 *       tab=pending: đề xuất cần cấp của người dùng xử lý (GĐTTKD theo miền,
 *       Quy hoạch/Pháp lý với RE_GRADING, Tổng giám đốc với TGD_REVIEW);
 *       tab=completed: lọc theo vai trò (GĐTTKD: khác null, QH/PL: mức 2, TGĐ: mức 3).
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
 *         name: reviewRole
 *         schema:
 *           type: string
 *           enum: [GDTTKD, QH, PL, TGD]
 *         description: Chỉ ADMIN/SUPER_ADMIN dùng để xem thay một vai trò xử lý
 *       - in: query
 *         name: region
 *         schema:
 *           type: string
 *           enum: [Bac, Trung, Nam]
 *         description: Lọc miền khi ADMIN/SUPER_ADMIN xem thay GĐTTKD
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Tìm mã đề xuất, pháp nhân, SĐT, địa chỉ, người đề xuất
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
router.get('/', requireAuth, requireUserManager, proposalReviewController.list);

/**
 * @swagger
 * /api/admin/proposal-reviews/{id}/request-regrade:
 *   put:
 *     tags: [Proposal Reviews]
 *     summary: GĐTTKD yêu cầu Quy hoạch và Pháp lý chấm điểm lại
 *     description: Chỉ áp dụng cho đề xuất GDTTKD_EVALUATING. Bắt buộc nhập lý do.
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
 *         description: Thành công
 *       400:
 *         description: Sai trạng thái hoặc thiếu lý do
 *       403:
 *         description: Không có quyền / ngoài miền phụ trách
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.put('/:id/request-regrade', requireAuth, requireUserManager, proposalReviewController.requestRegrade);

/**
 * @swagger
 * /api/admin/proposal-reviews/{id}/to-tgd:
 *   put:
 *     tags: [Proposal Reviews]
 *     summary: GĐTTKD trình Tổng giám đốc xem xét
 *     description: Chỉ áp dụng cho đề xuất RE_GDTTKD_EVALUATING. Bắt buộc nhập lý do.
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
 *         description: Thành công
 *       400:
 *         description: Sai trạng thái hoặc thiếu lý do
 *       403:
 *         description: Không có quyền / ngoài miền phụ trách
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.put('/:id/to-tgd', requireAuth, requireUserManager, proposalReviewController.toTgd);

/**
 * @swagger
 * /api/admin/proposal-reviews/{id}/cancel:
 *   put:
 *     tags: [Proposal Reviews]
 *     summary: GĐTTKD xác nhận hủy đề xuất
 *     description: Áp dụng cho GDTTKD_EVALUATING hoặc RE_GDTTKD_EVALUATING. Bắt buộc nhập lý do.
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
 *         description: Thành công
 *       400:
 *         description: Sai trạng thái hoặc thiếu lý do
 *       403:
 *         description: Không có quyền / ngoài miền phụ trách
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.put('/:id/cancel', requireAuth, requireUserManager, proposalReviewController.cancel);

/**
 * @swagger
 * /api/admin/proposal-reviews/{id}/approve:
 *   put:
 *     tags: [Proposal Reviews]
 *     summary: Tổng giám đốc duyệt đề xuất
 *     description: Chỉ áp dụng cho đề xuất TGD_REVIEW. Bắt buộc nhập lý do; chuyển sang DESIGNING.
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
 *         description: Thành công
 *       400:
 *         description: Sai trạng thái hoặc thiếu lý do
 *       403:
 *         description: Không có quyền
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.put('/:id/approve', requireAuth, requireUserManager, proposalReviewController.approve);

/**
 * @swagger
 * /api/admin/proposal-reviews/{id}/reject:
 *   put:
 *     tags: [Proposal Reviews]
 *     summary: Tổng giám đốc không duyệt đề xuất
 *     description: Chỉ áp dụng cho đề xuất TGD_REVIEW. Bắt buộc nhập lý do; chuyển sang CANCELLED.
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
 *         description: Thành công
 *       400:
 *         description: Sai trạng thái hoặc thiếu lý do
 *       403:
 *         description: Không có quyền
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.put('/:id/reject', requireAuth, requireUserManager, proposalReviewController.reject);

module.exports = router;
