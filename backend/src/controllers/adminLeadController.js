const leadService = require('../services/leadService');

exports.getAll = async (req, res) => {
  try {
    const result = await leadService.getLeads(req.query, req.user);
    res.json({
      success: true,
      data: result.leads,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error('Admin get leads error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
