const express = require('express');
const router = express.Router();
const pool = require('../utils/db');
const { requireAuth, requireAdmin } = require('../middlewares/auth');

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     tags: [Admin - Dashboard]
 *     summary: Lấy thống kê dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         active:
 *                           type: integer
 *                         locked:
 *                           type: integer
 *                     stations:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         active:
 *                           type: integer
 *                         deploying:
 *                           type: integer
 *                     proposals:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         pending:
 *                           type: integer
 *                         approved:
 *                           type: integer
 *                         rejected:
 *                           type: integer
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 */
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [[{ totalUsers }]] = await pool.query('SELECT COUNT(*) as totalUsers FROM users');
    const [[{ totalStations }]] = await pool.query('SELECT COUNT(*) as totalStations FROM stations');
    const [[{ totalProposals }]] = await pool.query('SELECT COUNT(*) as totalProposals FROM station_proposals');

    const [[{ activeStations }]] = await pool.query("SELECT COUNT(*) as activeStations FROM stations WHERE status = 'ACTIVE'");
    const [[{ deployingStations }]] = await pool.query("SELECT COUNT(*) as deployingStations FROM stations WHERE status = 'DEPLOYING'");

    const [[{ pendingProposals }]] = await pool.query("SELECT COUNT(*) as pendingProposals FROM station_proposals WHERE status = 'PENDING'");
    const [[{ approvedProposals }]] = await pool.query("SELECT COUNT(*) as approvedProposals FROM station_proposals WHERE status = 'APPROVED'");
    const [[{ rejectedProposals }]] = await pool.query("SELECT COUNT(*) as rejectedProposals FROM station_proposals WHERE status = 'REJECTED'");

    const [[{ activeUsers }]] = await pool.query("SELECT COUNT(*) as activeUsers FROM users WHERE status = 'ACTIVE'");
    const [[{ lockedUsers }]] = await pool.query("SELECT COUNT(*) as lockedUsers FROM users WHERE status = 'LOCKED'");

    res.json({
      success: true,
      data: {
        users: { total: totalUsers, active: activeUsers, locked: lockedUsers },
        stations: { total: totalStations, active: activeStations, deploying: deployingStations },
        proposals: { total: totalProposals, pending: pendingProposals, approved: approvedProposals, rejected: rejectedProposals }
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;
