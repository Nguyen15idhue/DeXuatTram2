const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth');
const proposalSignatureController = require('../controllers/proposalSignatureController');

/**
 * @swagger
 * /api/admin/proposal-signatures:
 *   get:
 *     tags: [Proposal Signatures]
 *     summary: Danh sách đề xuất cho bước Trình ký
 *     description: >
 *       tab=all: SIGNATURE_PENDING + COMPLETED; tab=pending: SIGNATURE_PENDING (Back Office/Admin/TGD
 *       xem tất cả, người được phân công ký chỉ thấy hồ sơ mình chưa ký);
 *       tab=chairman: SIGNATURE_PENDING đã ký đủ (chờ trình chủ tịch, Back Office);
 *       tab=completed: hồ sơ đã ký đủ hoặc đã hoàn thành.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tab
 *         schema:
 *           type: string
 *           enum: [all, pending, chairman, completed]
 *           default: all
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
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
 */
router.get('/', requireAuth, proposalSignatureController.list);

/**
 * @swagger
 * /api/admin/proposal-signatures/{id}:
 *   get:
 *     tags: [Proposal Signatures]
 *     summary: Chi tiết hồ sơ trình ký (thông tin, số trụ chốt, file BCĐX, danh sách người ký)
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
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.get('/:id', requireAuth, proposalSignatureController.detail);

/**
 * @swagger
 * /api/admin/proposal-signatures/{id}/sign:
 *   post:
 *     tags: [Proposal Signatures]
 *     summary: Ký BCĐX bằng chữ ký số trong hồ sơ cá nhân
 *     description: >
 *       Người được phân công ký nhấn ký: server lấy ảnh chữ ký đã tải trong hồ sơ cá nhân
 *       (signatures) gắn vào ô ký đã cấu hình, ghi nhận thời gian ký và cập nhật trạng thái ghi chú.
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
 *         description: Sai trạng thái hoặc chưa có chữ ký số
 *       403:
 *         description: Không được phân công ký
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.post('/:id/sign', requireAuth, proposalSignatureController.sign);

/**
 * @swagger
 * /api/admin/proposal-signatures/{id}/reject:
 *   post:
 *     tags: [Proposal Signatures]
 *     summary: Từ chối duyệt BCĐX (Tổng giám đốc / Admin)
 *     description: >
 *       Bắt buộc lý do; đề xuất chuyển sang PROPOSAL_REPORT_UPDATING, tạo Yêu cầu đề xuất loại
 *       REVISE_BCDX và thông báo người đề xuất + GĐTTKD đúng khu vực.
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
router.post('/:id/reject', requireAuth, proposalSignatureController.reject);

/**
 * @swagger
 * /api/admin/proposal-signatures/{id}/signed-file:
 *   post:
 *     tags: [Proposal Signatures]
 *     summary: Back Office tải lên file BCĐX đã ký (chủ tịch phê duyệt)
 *     description: >
 *       Chỉ áp dụng khi đã đủ chữ ký; lưu file và chuyển đề xuất sang COMPLETED.
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
 *               files:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Sai trạng thái hoặc chưa đủ chữ ký
 *       403:
 *         description: Không có quyền
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.post('/:id/signed-file', requireAuth, proposalSignatureController.uploadSignedFile);

/**
 * @swagger
 * /api/admin/proposal-signatures/{id}/export:
 *   get:
 *     tags: [Proposal Signatures]
 *     summary: Thông tin file BCĐX để xuất (file đã ký chốt, fallback file BCĐX)
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
 *         description: Chưa có file để xuất
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.get('/:id/export', requireAuth, proposalSignatureController.exportFile);

/**
 * @swagger
 * /api/admin/proposal-signatures/{id}/signature-image/{configId}:
 *   get:
 *     tags: [Proposal Signatures]
 *     summary: Ảnh chữ ký đã áp dụng cho một ô ký
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: configId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Ảnh chữ ký
 *       403:
 *         description: Không có quyền
 *       404:
 *         description: Không tìm thấy chữ ký
 */
router.get('/:id/signature-image/:configId', requireAuth, proposalSignatureController.signatureImage);

module.exports = router;
