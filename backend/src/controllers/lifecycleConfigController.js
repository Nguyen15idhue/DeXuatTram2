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
    const { rules, warn_hours, extend_max_times, extend_max_days_per_time, auto_push_on_update } = req.body || {};
    if (!Array.isArray(rules)) {
      if (auto_push_on_update !== undefined) {
        const data = await proposalLifecycle.saveAutoPushOnUpdate(auto_push_on_update === true);
        return res.json({ success: true, data, message: 'Cập nhật thành công' });
      }
      return res.status(400).json({ success: false, message: 'rules phải là mảng' });
    }
    const config = await proposalLifecycle.saveCountdownConfig({ rules, warn_hours, extend_max_times, extend_max_days_per_time, auto_push_on_update });
    res.json({ success: true, data: config, message: 'Cập nhật thành công' });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Update lifecycle countdown config error:', error);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật cấu hình' });
  }
};
