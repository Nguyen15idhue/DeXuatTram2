const express = require('express');
const router = express.Router();
const { requireAuth, requireSuperAdmin } = require('../middlewares/auth');
const queueService = require('../services/queueService');
const queueWorker = require('../workers/queueWorker');

/**
 * @swagger
 * /api/admin/queue-logs:
 *   get:
 *     tags: [Queue Logs]
 *     summary: Lấy danh sách hàng đợi
 *     description: SUPER_ADMIN xem tất cả. Phân trang, filter theo status, direction, action.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed, failed, cancelled]
 *       - in: query
 *         name: direction
 *         schema:
 *           type: string
 *           enum: [push, pull]
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: api_config_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: entity_type
 *         schema:
 *           type: string
 *       - in: query
 *         name: entity_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: created_by
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
 *           default: 50
 *     responses:
 *       200:
 *         description: Thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền SUPER_ADMIN
 */
router.get('/', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      direction: req.query.direction,
      action: req.query.action,
      api_config_id: req.query.api_config_id ? parseInt(req.query.api_config_id) : undefined,
      entity_type: req.query.entity_type,
      entity_id: req.query.entity_id ? parseInt(req.query.entity_id) : undefined,
      created_by: req.query.created_by ? parseInt(req.query.created_by) : undefined,
      date_from: req.query.date_from,
      date_to: req.query.date_to
    };

    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined || filters[key] === null || filters[key] === '') {
        delete filters[key];
      }
    });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const result = await queueService.getAll(filters, page, limit);
    res.json({
      success: true,
      data: result.jobs,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Get queue logs error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Lỗi khi lấy danh sách hàng đợi'
    });
  }
});

/**
 * @swagger
 * /api/admin/queue-logs/stats:
 *   get:
 *     tags: [Queue Logs]
 *     summary: Thống kê hàng đợi
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thống kê
 */
router.get('/stats', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const apiConfigId = req.query.api_config_id ? parseInt(req.query.api_config_id) : undefined;
    const stats = await queueService.getStats(apiConfigId);
    const memoryQueue = queueService.getMemoryQueue();
    const workerStatus = queueWorker.getStatus();

    res.json({
      success: true,
      data: {
        ...stats,
        memory: memoryQueue,
        worker: {
          isRunning: workerStatus.isRunning,
          pollInterval: workerStatus.pollInterval
        }
      }
    });
  } catch (error) {
    console.error('Get queue stats error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Lỗi khi lấy thống kê hàng đợi'
    });
  }
});

/**
 * @swagger
 * /api/admin/queue-logs/{id}:
 *   get:
 *     tags: [Queue Logs]
 *     summary: Lấy chi tiết job
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
 *         description: Chi tiết job
 *       404:
 *         description: Không tìm thấy
 */
router.get('/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const job = await queueService.getById(parseInt(req.params.id));
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy queue job'
      });
    }
    res.json({ success: true, data: job });
  } catch (error) {
    console.error('Get queue job error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Lỗi khi lấy chi tiết job'
    });
  }
});

/**
 * @swagger
 * /api/admin/queue-logs/{id}/retry:
 *   post:
 *     tags: [Queue Logs]
 *     summary: Retry job đã fail
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
 *         description: Retry thành công
 *       400:
 *         description: Job không ở trạng thái failed
 *       404:
 *         description: Không tìm thấy
 */
router.post('/:id/retry', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const job = await queueService.retry(parseInt(req.params.id));
    res.json({
      success: true,
      data: job,
      message: 'Đã tái xử lý job'
    });
  } catch (error) {
    console.error('Retry queue job error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Lỗi khi retry job'
    });
  }
});

/**
 * @swagger
 * /api/admin/queue-logs/{id}/cancel:
 *   post:
 *     tags: [Queue Logs]
 *     summary: Cancel job
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
 *         description: Cancel thành công
 *       400:
 *         description: Job không thể cancel
 *       404:
 *         description: Không tìm thấy
 */
router.post('/:id/cancel', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const job = await queueService.cancel(parseInt(req.params.id));
    res.json({
      success: true,
      data: job,
      message: 'Đã hủy job'
    });
  } catch (error) {
    console.error('Cancel queue job error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Lỗi khi cancel job'
    });
  }
});

module.exports = router;
