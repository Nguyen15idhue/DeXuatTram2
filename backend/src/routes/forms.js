const express = require('express');
const router = express.Router();
const { requireAuth, requireSuperAdmin } = require('../middlewares/auth');
const formController = require('../controllers/formController');

/**
 * @swagger
 * /api/forms:
 *   get:
 *     tags: [Forms]
 *     summary: Lấy danh sách forms
 *     description: Admin có thể filter theo entity, status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: entity
 *         schema:
 *           type: string
 *           enum: [stations, station_proposals, users]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *       - in: query
 *         name: purpose
 *         schema:
 *           type: string
 *           enum: [create, view, all]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 */
router.get('/', requireAuth, requireSuperAdmin, formController.getAll);

/**
 * @swagger
 * /api/forms/by-entity-purpose:
 *   get:
 *     tags: [Forms]
 *     summary: Lấy form theo entity và purpose (công khai)
 *     description: Trả về form active có entity và purpose khớp
 *     parameters:
 *       - in: query
 *         name: entity
 *         required: true
 *         schema:
 *           type: string
 *           enum: [stations, station_proposals, users]
 *       - in: query
 *         name: purpose
 *         required: true
 *         schema:
 *           type: string
 *           enum: [create, view, all]
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Thiếu tham số
 *       404:
 *         description: Không tìm thấy form
 */
router.get('/by-entity-purpose', formController.getByEntityAndPurpose);

/**
 * @swagger
 * /api/forms/{id}:
 *   get:
 *     tags: [Forms]
 *     summary: Lấy form + fields theo ID (công khai)
 *     description: Trả về form kèm danh sách fields đã sắp xếp theo order_index
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
 *         description: Không tìm thấy form
 */
router.get('/:id', formController.getById);

/**
 * @swagger
 * /api/forms:
 *   post:
 *     tags: [Forms]
 *     summary: Tạo form mới
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [entity, name]
 *             properties:
 *               entity:
 *                 type: string
 *                 enum: [stations, station_proposals, users]
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 default: active
 *               purpose:
 *                 type: string
 *                 enum: [create, view, all]
 *                 default: all
 *                 description: Mục đích form: create (nhập liệu), view (xem/sửa), all (cả hai)
 *               layout_config:
 *                 type: object
 *                 description: Layout config với sections và rows
 *                 properties:
 *                   sections:
 *                     type: array
 *                     description: Danh sách section (nếu có)
 *                     items:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         title:
 *                           type: string
 *                         collapsible:
 *                           type: boolean
 *                           default: false
 *                         rows:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               columns:
 *                                 type: string
 *                                 enum: ['1:1', '1:2', '2:1', '2:2']
 *                   rows:
 *                     type: array
 *                     description: Rows cũ (backward compatible, không có sections)
 *                     items:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         columns:
 *                           type: string
 *                           enum: ['1:1', '1:2', '2:1', '2:2']
 *     responses:
 *       201:
 *         description: Tạo thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 */
router.post('/', requireAuth, requireSuperAdmin, formController.create);

/**
 * @swagger
 * /api/forms/{id}:
 *   put:
 *     tags: [Forms]
 *     summary: Cập nhật form
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
 *             required: [entity, name]
 *             properties:
 *               entity:
 *                 type: string
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *               purpose:
 *                 type: string
 *                 enum: [create, view, all]
 *                 default: all
 *               layout_config:
 *                 type: object
 *                 description: Layout config với sections và rows
 *                 properties:
 *                   sections:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         title:
 *                           type: string
 *                         collapsible:
 *                           type: boolean
 *                         rows:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               columns:
 *                                 type: string
 *                                 enum: ['1:1', '1:2', '2:1', '2:2']
 *                   rows:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         columns:
 *                           type: string
 *                           enum: ['1:1', '1:2', '2:1', '2:2']
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 *       404:
 *         description: Không tìm thấy
 */
router.put('/:id', requireAuth, requireSuperAdmin, formController.update);

/**
 * @swagger
 * /api/forms/{id}:
 *   delete:
 *     tags: [Forms]
 *     summary: Xóa form (CASCADE xóa form_fields)
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
 *         description: Xóa thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 *       404:
 *         description: Không tìm thấy
 */
router.delete('/:id', requireAuth, requireSuperAdmin, formController.delete);

module.exports = router;
