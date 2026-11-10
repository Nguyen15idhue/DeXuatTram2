const express = require('express');
const router = express.Router();
const { requireAuth, requireProposalReportManager, requireProposalInfoManager } = require('../middlewares/auth');
const proposalReportController = require('../controllers/proposalReportController');
const reportDocuments = require('../controllers/proposalReportDocumentController');

/**
 * @swagger
 * /api/admin/proposal-reports:
 *   get:
 *     tags: [Proposal Reports]
 *     summary: Danh sách đề xuất cho trang Lập tờ trình BCĐX
 *     description: >
 *       tab=all: PROPOSAL_REPORT_CREATING, PROPOSAL_REPORT_RE_CREATING, PROPOSAL_REPORT_UPDATING,
 *       PROPOSAL_REPORT_REVIEWING, SIGNATURE_PENDING, APPROVED, CANCELLED; tab=pending:
 *       PROPOSAL_REPORT_CREATING, PROPOSAL_REPORT_RE_CREATING, PROPOSAL_REPORT_UPDATING;
 *       tab=completed: PROPOSAL_REPORT_REVIEWING, SIGNATURE_PENDING,
 *       APPROVED, CANCELLED. Hỗ trợ lọc theo status, model, province, region, owner, manager, date.
 *       Phân quyền theo vai trò: Admin/Super Admin và Back Office xem tất cả;
 *       GĐTTKD xem theo khu vực; SALES xem theo nhánh; CTV/NPP xem đề xuất của mình.
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
 *         name: search
 *         schema:
 *           type: string
 *         description: Tìm mã đề xuất, pháp nhân, SĐT, địa chỉ, người đề xuất
 *       - in: query
 *         name: proposal_status
 *         schema:
 *           type: string
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
 *       - in: query
 *         name: date_to
 *         schema:
 *           type: string
 *           format: date
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
router.get('/', requireAuth, requireProposalReportManager, proposalReportController.list);

/**
 * @swagger
 * /api/admin/proposal-reports/filter-options:
 *   get:
 *     tags: [Proposal Reports]
 *     summary: Tùy chọn bộ lọc đề xuất BCĐX
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/filter-options', requireAuth, requireProposalReportManager, proposalReportController.filterOptions);

/**
 * @swagger
 * /api/admin/proposal-reports/{id}/documents:
 *   get:
 *     tags: [Proposal Reports]
 *     summary: Tài liệu gốc, PDF cố định và lỗi chuyển đổi BCĐX
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     responses:
 *       200: { description: Danh sách tài liệu hiện hành }
 *       403: { description: Ngoài phạm vi đề xuất }
 * /api/admin/proposal-reports/{id}/documents/prepare:
 *   post:
 *     tags: [Proposal Reports]
 *     summary: Chuẩn bị PDF cho tối đa 10 Word/PDF trước khi nộp BCĐX
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [files]
 *             properties:
 *               files: { type: array, items: { type: object, properties: { id: { type: integer } } } }
 *     responses:
 *       200: { description: Kết quả từng file; FAILED có thể thử lại hoặc xác nhận nộp với accept_conversion_failure }
 *       403: { description: Không có quyền nộp }
 * /api/admin/proposal-reports/{id}/documents/{documentId}/convert:
 *   post:
 *     tags: [Proposal Reports]
 *     summary: Thử chuyển Word sang PDF; chặn nếu đã cấu hình hoặc ký
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: path, name: documentId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Trạng thái chuyển đổi; lỗi nằm trong conversion_error }
 *       409: { description: Đã cấu hình ký hoặc sai bước }
 */
router.get('/:id/documents', requireAuth, requireProposalReportManager, reportDocuments.list);
router.post('/:id/documents/prepare', requireAuth, requireProposalReportManager, reportDocuments.prepare);
router.post('/:id/documents/:documentId/convert', requireAuth, requireProposalReportManager, reportDocuments.convert);

/**
 * @swagger
 * /api/admin/proposal-reports/{id}:
 *   get:
 *     tags: [Proposal Reports]
 *     summary: Chi tiết đề xuất trong quy trình lập tờ trình BCĐX
 *     description: Phân quyền xem giống danh sách Lập tờ trình BCĐX; trả dữ liệu form, layout, yêu cầu và lịch sử hoạt động.
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
 *         description: Không có quyền xem
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.get('/:id', requireAuth, requireProposalReportManager, proposalReportController.detail);

/**
 * @swagger
 * /api/admin/proposal-reports/{id}:
 *   put:
 *     tags: [Proposal Reports]
 *     summary: Tải lên file tờ trình BCĐX
 *     description: >
 *       Áp dụng cho đề xuất PROPOSAL_REPORT_CREATING, PROPOSAL_REPORT_RE_CREATING hoặc
 *       PROPOSAL_REPORT_UPDATING.
 *       SUPER_ADMIN, người tạo đề xuất, quản lý trực tiếp hoặc GĐTTKD đúng khu vực được tải lên.
 *       File chỉ nhận Word (.doc, .docx) hoặc PDF.
 *       Bắt buộc gửi chot_so_luong_tru gồm mô hình, số lượng, loại trụ; server tự lấy giá hiện tại,
 *       tính tổng giá trị chốt. Sau khi tải lên, đề xuất chuyển sang PROPOSAL_REPORT_REVIEWING
 *       và thông báo Back Office.
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
 *             required: [files, chot_so_luong_tru]
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *               chot_so_luong_tru:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [mo_hinh, so_luong, loai_tru]
 *                   properties:
 *                     mo_hinh:
 *                       type: string
 *                       enum: [TDT, LK, NQ, NQ_LK]
 *                     so_luong:
 *                       type: integer
 *                       minimum: 1
 *                     loai_tru:
 *                       type: string
 *                     gia_chot:
 *                       type: number
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Sai trạng thái hoặc thiếu file/dữ liệu số lượng trụ chốt
 *       403:
 *         description: Không có quyền
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.put('/:id', requireAuth, requireProposalInfoManager, proposalReportController.upload);
router.post('/:id/generate', requireAuth, requireProposalInfoManager, proposalReportController.generate);

/**
 * @swagger
 * /api/admin/proposal-reports/{id}/request-revision:
 *   put:
 *     tags: [Proposal Reports]
 *     summary: Back Office yêu cầu tạo lại tờ trình BCĐX
 *     description: >
 *       Áp dụng cho đề xuất PROPOSAL_REPORT_REVIEWING. Bắt buộc mô tả nội dung cần tạo lại;
 *       đề xuất chuyển sang PROPOSAL_REPORT_RE_CREATING và tạo Yêu cầu đề xuất loại REVISE_BCDX.
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
 *             required: [description]
 *             properties:
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Sai trạng thái hoặc thiếu mô tả
 *       403:
 *         description: Không có quyền
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.put('/:id/request-revision', requireAuth, requireProposalReportManager, proposalReportController.requestRevision);

module.exports = router;
