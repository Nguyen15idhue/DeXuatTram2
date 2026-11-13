const router = require('express').Router();
const { requireAuth } = require('../middlewares/auth');
const service = require('../services/shippingCarrierService');

router.use(requireAuth);
const handle = (action) => async (req, res) => {
  try {
    res.json({ success: true, data: await action(req) });
  } catch (error) {
    console.error('Shipping carrier error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

/**
 * @swagger
 * /api/admin/shipping-carriers:
 *   get:
 *     tags: [Warehouse]
 *     summary: Danh mục vận chuyển (SUPER_ADMIN), options=1 cho Back Office chọn khi xuất kho
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: options
 *         schema: { type: string, enum: ['1'] }
 *     responses:
 *       200: { description: Danh sách đơn vị vận chuyển }
 *       403: { description: Không có quyền }
 *   post:
 *     tags: [Warehouse]
 *     summary: SUPER_ADMIN thêm đơn vị vận chuyển, name/note/active
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Đã lưu }
 * /api/admin/shipping-carriers/{id}:
 *   put:
 *     tags: [Warehouse]
 *     summary: SUPER_ADMIN cập nhật đơn vị vận chuyển
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Đã lưu }
 *   delete:
 *     tags: [Warehouse]
 *     summary: SUPER_ADMIN xóa đơn vị chưa sử dụng
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Đã xóa }
 *       409: { description: Đã sử dụng, chỉ được ngừng hoạt động }
 */
router.get('/', handle((req) => service.list(req.user, req.query.options === '1')));
router.post('/', handle((req) => service.save(null, req.body, req.user)));
router.put('/:id', handle((req) => service.save(req.params.id, req.body, req.user)));
router.delete('/:id', handle((req) => service.remove(req.params.id, req.user)));
module.exports = router;
