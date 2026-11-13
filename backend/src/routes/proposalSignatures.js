const express = require('express');
const router = express.Router();
const { requireAuth, requireSuperAdmin } = require('../middlewares/auth');
const proposalSignatureController = require('../controllers/proposalSignatureController');

/**
 * @swagger
 * /api/admin/proposal-signatures:
 *   get:
 *     tags: [Proposal Signatures]
 *     summary: Danh sách đề xuất cho bước Trình ký
 *     description: >
 *       tab=all: giữ phạm vi xem, bổ sung hồ sơ đã đủ chữ ký/đã upload chủ tịch cho Tài chính và Kế toán.
 *       tab=pending: còn chữ ký cá nhân; Back Office/Tài chính/SUPER_ADMIN thêm hồ sơ đủ chữ ký chờ upload.
 *       tab=chairman: hồ sơ được phân công ký đã đủ chữ ký chờ upload, SUPER_ADMIN xem tất cả; Back Office/Tài chính trả rỗng.
 *       tab=completed: đã ký hết tài liệu cá nhân được giao; Back Office/Tài chính/SUPER_ADMIN thêm hồ sơ APPROVED có file chủ tịch.
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
 *         name: sign_status
 *         description: Lọc kết quả ký (PENDING/DOING/DONE/CEO_SIGNED)
 *         schema:
 *           type: string
 *           enum: [PENDING, DOING, DONE, CEO_SIGNED]
 *       - in: query
 *         name: my_status
 *         description: my_pending = còn tài liệu cần ký; my_signed = đã ký hết tài liệu được giao
 *         schema:
 *           type: string
 *           enum: [my_pending, my_signed]
 *       - in: query
 *         name: mo_hinh
 *         description: Lọc theo mô hình đầu tư (NQ/TDT/LK/NQ_LK)
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               document_id:
 *                 type: integer
 *               file_id:
 *                 type: integer
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
 * /api/admin/proposal-signatures/{id}/complete-signing:
 *   post:
 *     tags: [Proposal Signatures]
 *     summary: SUPER_ADMIN xác nhận hoàn tất ký, kể cả chưa cấu hình người ký
 *     description: Giữ SIGNATURE_PENDING, ghi nhận DONE và log lý do; không chèn ảnh chữ ký. Back Office vẫn tải file đã ký để kết thúc.
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
 *                 maxLength: 2000
 *     responses:
 *       200:
 *         description: Đã hoàn tất khâu ký
 *       400:
 *         description: Sai trạng thái hoặc thiếu lý do
 *       403:
 *         description: Chỉ SUPER_ADMIN
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.post('/:id/complete-signing', requireAuth, requireSuperAdmin, proposalSignatureController.completeSigning);

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
 * /api/admin/proposal-signatures/{id}/request-rework:
 *   post:
 *     tags: [Proposal Signatures]
 *     summary: Yêu cầu làm lại BCĐX (Back Office / TGĐ / Admin)
 *     description: >
 *       Bắt buộc lý do; đề xuất chuyển về PROPOSAL_REPORT_UPDATING, tạo Yêu cầu đề xuất loại
 *       REVISE_BCDX cho người đề xuất và thông báo người đề xuất + các cấp trên + GĐTTKD khu vực.
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
router.post('/:id/request-rework', requireAuth, proposalSignatureController.requestRework);

/**
 * @swagger
 * /api/admin/proposal-signatures/{id}/signed-file:
 *   post:
 *     tags: [Proposal Signatures]
 *     summary: Back Office, Tài chính và Kế toán hoặc SUPER_ADMIN tải lên file BCĐX chủ tịch đã ký
 *     description: >
 *       Chỉ Back Office/Tài chính và Kế toán/SUPER_ADMIN, khi đủ chữ ký. Danh sách chung 1-20 file,
 *       tối đa 10MB/file: JPEG/PNG/GIF/WEBP/DOC/DOCX/PDF. Giữ file đầu tiên tương thích,
 *       không ánh xạ file chung theo BCĐX gốc; lưu danh sách, trạng thái và nhật ký cùng transaction.
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
 *                 minItems: 1
 *                 maxItems: 20
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *               documents:
 *                 deprecated: true
 *                 description: Payload cũ; file_id được chuyển thành danh sách chung, không yêu cầu khớp BCĐX gốc
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [document_id, file_id]
 *                   properties:
 *                     document_id:
 *                       type: integer
 *                     file_id:
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
 *       - in: query
 *         name: document_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: all
 *         description: Xuất các tài liệu BCĐX hiện hành thành một file ZIP (1 để bật)
 *         schema:
 *           type: string
 *           enum: ['1']
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
 * /api/admin/proposal-signatures/{id}/signed-document:
 *   get:
 *     tags: [Proposal Signatures]
 *     summary: Tải tài liệu BCĐX đã đóng các chữ ký đã thực hiện
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: document_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: all
 *         description: Tải mọi tài liệu BCĐX hiện hành trong ZIP (1 để bật)
 *         schema:
 *           type: string
 *           enum: ['1']
 *     responses:
 *       200:
 *         description: File PDF hoặc DOCX có chữ ký đã đóng lên tài liệu
 *       400:
 *         description: Không có file hoặc định dạng không hỗ trợ
 *       403:
 *         description: Không có quyền xem tài liệu
 */
router.get('/:id/signed-document', requireAuth, proposalSignatureController.downloadSignedDocument);
const recoveryController = require('../controllers/proposalDocumentRecoveryController');
/**
 * @swagger
 * /api/admin/proposal-signatures/{id}/documents/{documentId}/recovery:
 *   get:
 *     tags: [Proposal Signatures]
 *     summary: SUPER_ADMIN kiểm tra điều kiện và lịch sử phục hồi DOCX
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: path, name: documentId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Nguồn DOCX, người ký và lịch sử }
 *       409: { description: Chưa ký đủ hoặc đã upload chủ tịch }
 *   post:
 *     tags: [Proposal Signatures]
 *     summary: Tạo lượt phục hồi từ DOCX (chạy nền) hoặc PDF tải lên (không gọi converter), bắt buộc lý do
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: path, name: documentId, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string, maxLength: 2000 }
 *               input_method: { type: string, enum: [DOCX_CONVERT, PDF_UPLOAD], default: DOCX_CONVERT }
 *               uploaded_pdf_file_id: { type: integer, description: Bắt buộc với PDF_UPLOAD; PDF không mật khẩu ≤10MB chưa chèn chữ ký }
 *     responses:
 *       200: { description: DOCX tạo lượt PENDING; PDF hợp lệ tạo DRAFT có PDF nền riêng, giữ cấu hình ký và file gốc }
 *       400: { description: PDF hỏng, mã hóa, quá 10MB hoặc đã đóng dấu chữ ký }
 *       403: { description: Chỉ SUPER_ADMIN }
 * /api/admin/proposal-signatures/{id}/documents/{documentId}/recovery/{recoveryId}:
 *   get:
 *     tags: [Proposal Signatures]
 *     summary: Trạng thái convert, PDF xem trước và nguồn ảnh đã chụp
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: path, name: documentId, required: true, schema: { type: integer } }
 *       - { in: path, name: recoveryId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Trạng thái và bản nháp }
 *   put:
 *     tags: [Proposal Signatures]
 *     summary: Dựng PDF xem trước với vị trí riêng và ảnh thay thế có lý do, không sửa chữ ký gốc
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: path, name: documentId, required: true, schema: { type: integer } }
 *       - { in: path, name: recoveryId, required: true, schema: { type: integer } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [signers]
 *             properties:
 *               signers: { type: array, items: { type: object, required: [id,page,pos_x,pos_y,box_width,box_height] } }
 *               replacements: { type: array, items: { type: object, required: [config_id,file_id,reason] } }
 *     responses:
 *       200: { description: PDF đã chèn chữ ký để kiểm tra }
 *       409: { description: Nguồn ký đã thay đổi hoặc còn thiếu ảnh }
 * /api/admin/proposal-signatures/{id}/documents/{documentId}/recovery/{recoveryId}/activate:
 *   post:
 *     tags: [Proposal Signatures]
 *     summary: Xác nhận bản phục hồi hoặc trở về bản gốc, giữ status và bằng chứng ký gốc
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: path, name: documentId, required: true, schema: { type: integer } }
 *       - { in: path, name: recoveryId, required: true, schema: { type: integer } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [reason], properties: { reason: { type: string }, original: { type: boolean } } }
 *     responses:
 *       200: { description: Bản đang dùng đã được đổi trong transaction và ghi audit }
 *       409: { description: Hồ sơ đã thay đổi hoặc upload chủ tịch }
 */
router.get('/:id/documents/:documentId/recovery', requireAuth, requireSuperAdmin, recoveryController.inspect);
router.post('/:id/documents/:documentId/recovery', requireAuth, requireSuperAdmin, recoveryController.create);
router.get('/:id/documents/:documentId/recovery/:recoveryId', requireAuth, requireSuperAdmin, recoveryController.get);
router.put('/:id/documents/:documentId/recovery/:recoveryId', requireAuth, requireSuperAdmin, recoveryController.update);
router.post('/:id/documents/:documentId/recovery/:recoveryId/activate', requireAuth, requireSuperAdmin, recoveryController.activate);
/**
 * @swagger
 * /api/admin/proposal-signatures/{id}/documents/{documentId}/recovery/{recoveryId}/image/{configId}:
 *   get:
 *     tags: [Proposal Signatures]
 *     summary: SUPER_ADMIN xem ảnh PNG đã đóng băng của bản phục hồi
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: path, name: documentId, required: true, schema: { type: integer } }
 *       - { in: path, name: recoveryId, required: true, schema: { type: integer } }
 *       - { in: path, name: configId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: PNG snapshot hoặc ảnh thay thế riêng cho lượt phục hồi }
 *       403: { description: Chỉ SUPER_ADMIN }
 *       404: { description: Ảnh thiếu hoặc hoàn tất thủ công không có ảnh }
 */
router.get('/:id/documents/:documentId/recovery/:recoveryId/image/:configId', requireAuth, requireSuperAdmin, recoveryController.image);

/**
 * @swagger
 * /api/admin/proposal-signatures/{id}/signature-image/{configId}:
 *   get:
 *     tags: [Proposal Signatures]
 *     summary: Bản chụp chữ ký tại thời điểm ký, không đổi theo chữ ký hồ sơ
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
 *         description: Ảnh PNG chữ ký đã ký
 *         content:
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *       403:
 *         description: Không có quyền
 *       404:
 *         description: Không tìm thấy chữ ký
 *       409:
 *         description: Bản chụp chữ ký không toàn vẹn
 */
/**
 * @swagger
 * /api/admin/proposal-signatures/{id}/signature-repair/{configId}:
 *   parameters:
 *     - in: path
 *       name: id
 *       required: true
 *       schema:
 *         type: integer
 *     - in: path
 *       name: configId
 *       required: true
 *       schema:
 *         type: integer
 *   get:
 *     tags: [Proposal Signatures]
 *     summary: SUPER_ADMIN kiểm tra ô ký mất ảnh và thời điểm phục hồi
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Khả năng phục hồi và thời gian phục hồi ảnh
 *       403:
 *         description: Chỉ SUPER_ADMIN
 *   post:
 *     tags: [Proposal Signatures]
 *     summary: SUPER_ADMIN lấy chữ ký mới nhất đúng người để phục hồi ô ký mất ảnh
 *     security:
 *       - bearerAuth: []
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
 *                 maxLength: 2000
 *     responses:
 *       200:
 *         description: Đã lưu bản chụp và nhật ký phục hồi, không đổi ngày ký gốc
 *       400:
 *         description: Thiếu lý do hoặc chữ ký hiện tại
 *       403:
 *         description: Chỉ SUPER_ADMIN
 *       404:
 *         description: Không tìm thấy ô ký hoặc ảnh
 *       409:
 *         description: Ảnh còn hợp lệ, đã có bản chụp hoặc tài liệu đã hoàn tất
 */
/**
 * @swagger
 * /api/admin/proposal-signatures/{id}/chairman-files:
 *   get:
 *     tags: [Proposal Signatures]
 *     summary: Tải nguyên bản file chủ tịch hoặc ZIP toàn bộ
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: file_id
 *         description: Không truyền thì ZIP toàn bộ; không chuyển PDF hay đóng dấu lại
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: File nguyên bản hoặc application/zip
 *       403:
 *         description: Không có quyền đọc hồ sơ/tệp
 *       404:
 *         description: Không có file hoặc file không thuộc đề xuất
 */
router.get('/:id/chairman-files', requireAuth, proposalSignatureController.downloadChairmanFiles);
router.get('/:id/signature-repair/:configId', requireAuth, requireSuperAdmin, proposalSignatureController.signatureRepairStatus);
router.post('/:id/signature-repair/:configId', requireAuth, requireSuperAdmin, proposalSignatureController.repairSignature);
router.get('/:id/signature-image/:configId', requireAuth, proposalSignatureController.signatureImage);

module.exports = router;
