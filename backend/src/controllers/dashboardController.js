const dashboardService = require('../services/dashboardService');

exports.getStats = async (req, res) => {
  try {
    const stats = await dashboardService.getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
