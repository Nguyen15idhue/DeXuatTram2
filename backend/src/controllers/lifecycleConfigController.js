const proposalLifecycle = require('../services/proposalLifecycle');

exports.get = async (req, res) => {
  try {
    const config = await proposalLifecycle.getCountdownConfig();
    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Get lifecycle countdown config error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.update = async (req, res) => {
  try {
    const { rules, warn_hours } = req.body || {};
    if (!Array.isArray(rules)) {
      return res.status(400).json({ success: false, message: 'rules phải là mảng' });
    }
    const config = await proposalLifecycle.saveCountdownConfig({ rules, warn_hours });
    res.json({ success: true, data: config, message: 'Cập nhật thành công' });
  } catch (error) {
    console.error('Update lifecycle countdown config error:', error);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật cấu hình' });
  }
};
