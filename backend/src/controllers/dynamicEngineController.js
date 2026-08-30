const dynamicEngineService = require('../services/dynamicEngineService');

exports.getFormConfig = async (req, res) => {
  try {
    const { entity, formId } = req.params;

    const allowedEntities = ['stations', 'station_proposals', 'users'];
    if (!allowedEntities.includes(entity)) {
      return res.status(400).json({ success: false, message: `Entity phải là một trong: ${allowedEntities.join(', ')}` });
    }

    const config = await dynamicEngineService.getFormConfig(entity, parseInt(formId));
    if (!config) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy form' });
    }

    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Get form config error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.getViewConfig = async (req, res) => {
  try {
    const { entity, viewId } = req.params;

    const allowedEntities = ['stations', 'station_proposals', 'users'];
    if (!allowedEntities.includes(entity)) {
      return res.status(400).json({ success: false, message: `Entity phải là một trong: ${allowedEntities.join(', ')}` });
    }

    const config = await dynamicEngineService.getViewConfig(entity, parseInt(viewId));
    if (!config) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy view' });
    }

    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Get view config error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.validateData = async (req, res) => {
  try {
    const { entity } = req.params;
    const { data } = req.body;

    const allowedEntities = ['stations', 'station_proposals', 'users'];
    if (!allowedEntities.includes(entity)) {
      return res.status(400).json({ success: false, message: `Entity phải là một trong: ${allowedEntities.join(', ')}` });
    }

    if (!data || typeof data !== 'object') {
      return res.status(400).json({ success: false, message: 'data phải là một object' });
    }

    const errors = await dynamicEngineService.validateEntityData(entity, data);

    if (errors.length > 0) {
      return res.json({ success: true, valid: false, errors });
    }

    res.json({ success: true, valid: true, errors: [] });
  } catch (error) {
    console.error('Validate data error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
