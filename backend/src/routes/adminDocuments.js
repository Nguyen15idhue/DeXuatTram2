const express = require('express');
const router = express.Router();
const { requireAuth, requireSuperAdmin } = require('../middlewares/auth');
const documentTemplateService = require('../services/documentTemplateService');

router.use(requireAuth, requireSuperAdmin);

const sendError = (res, error) => {
  const status = (error && error.statusCode) || 500;
  res.status(status).json({ success: false, message: (error && error.message) || 'Lỗi server' });
};

/**
 * @swagger
 * /api/admin/documents/templates:
 *   get:
 *     tags: [Documents]
 *     summary: Danh sách template báo cáo
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 *       403:
 *         description: Không có quyền SUPER_ADMIN
 */
router.get('/templates', async (req, res) => {
  try {
    const data = await documentTemplateService.listTemplates();
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/documents/templates:
 *   post:
 *     tags: [Documents]
 *     summary: Tạo template báo cáo
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *               entity:
 *                 type: string
 *                 default: station_proposals
 *               model:
 *                 type: string
 *                 enum: [TDT, NQ, LK]
 *               file_id:
 *                 type: integer
 *                 description: ID file .docx đã upload qua /api/files/upload
 *     responses:
 *       201:
 *         description: Tạo thành công
 */
router.post('/templates', async (req, res) => {
  try {
    const data = await documentTemplateService.createTemplate(req.body || {});
    res.status(201).json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/documents/templates/{id}:
 *   get:
 *     tags: [Documents]
 *     summary: Chi tiết template báo cáo
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
 *         description: Không tìm thấy
 */
router.get('/templates/:id', async (req, res) => {
  try {
    const data = await documentTemplateService.getTemplate(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Không tìm thấy template' });
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/documents/templates/{id}:
 *   put:
 *     tags: [Documents]
 *     summary: Cập nhật template báo cáo (meta + mapping)
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
 *               name:
 *                 type: string
 *               model:
 *                 type: string
 *                 enum: [TDT, NQ, LK]
 *               file_id:
 *                 type: integer
 *               mapping:
 *                 type: object
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *               is_default:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Thành công
 */
router.put('/templates/:id', async (req, res) => {
  try {
    const data = await documentTemplateService.updateTemplate(req.params.id, req.body || {});
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/documents/templates/{id}:
 *   delete:
 *     tags: [Documents]
 *     summary: Xóa template báo cáo
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
 */
router.delete('/templates/:id', async (req, res) => {
  try {
    const ok = await documentTemplateService.deleteTemplate(req.params.id);
    if (!ok) return res.status(404).json({ success: false, message: 'Không tìm thấy template' });
    res.json({ success: true, message: 'Đã xóa template' });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/documents/constants:
 *   get:
 *     tags: [Documents]
 *     summary: Danh sách hằng số dùng chung cho báo cáo
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/constants', async (req, res) => {
  try {
    const data = await documentTemplateService.listConstants();
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/documents/constants:
 *   put:
 *     tags: [Documents]
 *     summary: Cập nhật hằng số báo cáo
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [key]
 *                   properties:
 *                     key:
 *                       type: string
 *                     label:
 *                       type: string
 *                     value:
 *                       type: string
 *                     group_name:
 *                       type: string
 *     responses:
 *       200:
 *         description: Thành công
 */
router.put('/constants', async (req, res) => {
  try {
    const data = await documentTemplateService.updateConstants((req.body || {}).items);
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/documents/constants/{key}:
 *   delete:
 *     tags: [Documents]
 *     summary: Xóa hằng số báo cáo
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thành công
 *       404:
 *         description: Không tìm thấy
 */
router.delete('/constants/:key', async (req, res) => {
  try {
    const ok = await documentTemplateService.deleteConstant(req.params.key);
    if (!ok) return res.status(404).json({ success: false, message: 'Không tìm thấy hằng số' });
    res.json({ success: true, message: 'Đã xóa hằng số' });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/documents/datalists:
 *   get:
 *     tags: [Documents]
 *     summary: Danh sách data list + cột cho palette báo cáo
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/datalists', async (req, res) => {
  try {
    const data = await documentTemplateService.listDatalists();
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/documents/templates/{id}/tokens:
 *   get:
 *     tags: [Documents]
 *     summary: Liệt kê token/loop trong file docx theo thứ tự
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
 */
router.get('/templates/:id/tokens', async (req, res) => {
  try {
    const data = await documentTemplateService.listTokens(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/documents/templates/{id}/preview-blank:
 *   get:
 *     tags: [Documents]
 *     summary: Preview HTML template trống
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
 */
router.get('/templates/:id/preview-blank', async (req, res) => {
  try {
    const data = await documentTemplateService.previewBlank(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/documents/templates/{id}/validate:
 *   post:
 *     tags: [Documents]
 *     summary: Kiểm tra mapping (token chưa bind, loop, công thức footer)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mapping:
 *                 type: object
 *                 description: Mapping cần kiểm tra (bỏ trống để dùng mapping đã lưu)
 *     responses:
 *       200:
 *         description: Thành công
 */
router.post('/templates/:id/validate', async (req, res) => {
  try {
    const data = await documentTemplateService.validateMapping(req.params.id, (req.body || {}).mapping);
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/documents/templates/{id}/layout:
 *   get:
 *     tags: [Documents]
 *     summary: Cây bố cục (đoạn/ô) của file .docx
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
 */
router.get('/templates/:id/layout', async (req, res) => {
  try {
    const data = await documentTemplateService.getLayout(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/documents/templates/{id}/layout/preview:
 *   get:
 *     tags: [Documents]
 *     summary: File .docx có anchor ẩn để click chọn vị trí
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
 *         description: File docx
 */
router.get('/templates/:id/layout/preview', async (req, res) => {
  try {
    const { buffer, filename, contentType } = await documentTemplateService.getLayoutPreview(req.params.id);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/documents/templates/{id}/layout/insert:
 *   post:
 *     tags: [Documents]
 *     summary: Chèn token-slot vào đoạn
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
 *             required: [nodeId, name]
 *             properties:
 *               nodeId:
 *                 type: integer
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Thành công
 */
router.post('/templates/:id/layout/insert', async (req, res) => {
  try {
    const { nodeId, name } = req.body || {};
    const data = await documentTemplateService.insertLayoutToken(req.params.id, nodeId, name);
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/documents/templates/{id}/layout/remove:
 *   post:
 *     tags: [Documents]
 *     summary: Xóa token khỏi đoạn (để trống vị trí)
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
 *             required: [nodeId, token]
 *             properties:
 *               nodeId:
 *                 type: integer
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Thành công
 */
router.post('/templates/:id/layout/remove', async (req, res) => {
  try {
    const { nodeId, token } = req.body || {};
    const data = await documentTemplateService.removeLayoutToken(req.params.id, nodeId, token);
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/documents/templates/{id}/layout/align:
 *   post:
 *     tags: [Documents]
 *     summary: Căn chỉnh đoạn (ngang / thụt lề / tab / copy từ đoạn trên)
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
 *             required: [nodeId]
 *             properties:
 *               nodeId:
 *                 type: integer
 *               jc:
 *                 type: string
 *                 enum: [left, center, right, both]
 *               indentLeftCm:
 *                 type: number
 *               tabPosCm:
 *                 type: number
 *               copyFromId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Thành công
 */
router.post('/templates/:id/layout/align', async (req, res) => {
  try {
    const { nodeId, ...opts } = req.body || {};
    const data = await documentTemplateService.alignLayout(req.params.id, nodeId, opts);
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/documents/templates/{id}/versions:
 *   get:
 *     tags: [Documents]
 *     summary: Lịch sử bố cục template
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
 */
router.get('/templates/:id/versions', async (req, res) => {
  try {
    const data = await documentTemplateService.listLayoutVersions(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/documents/templates/{id}/versions/{versionId}/restore:
 *   post:
 *     tags: [Documents]
 *     summary: Khôi phục bố cục từ phiên bản
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: versionId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Thành công
 */
router.post('/templates/:id/versions/:versionId/restore', async (req, res) => {
  try {
    const data = await documentTemplateService.restoreLayoutVersion(req.params.id, req.params.versionId);
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

module.exports = router;
