const externalUserService = require('../services/externalUserService');

exports.getAll = async (req, res) => {
  try {
    const { system, active } = req.query;
    const activeOnly = active === undefined ? true : (active === '1' || active === 'true');
    const data = await externalUserService.getAll({ system: system || '1office', activeOnly });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Get external users error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
