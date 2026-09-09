const fieldMappingService = require('../services/fieldMappingService');
const fieldMapper = require('../services/fieldMapper');

exports.getAllByConfig = async (req, res) => {
  try {
    const { configId } = req.params;
    const mappings = await fieldMappingService.getAllByConfig(parseInt(configId));
    res.json({ success: true, data: mappings });
  } catch (error) {
    console.error('Get field mappings error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.getById = async (req, res) => {
  try {
    const mapping = await fieldMappingService.getById(req.params.id);
    if (!mapping) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy field mapping' });
    }
    res.json({ success: true, data: mapping });
  } catch (error) {
    console.error('Get field mapping error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.create = async (req, res) => {
  try {
    const { configId } = req.params;
    const { source_field, target_field, target_field_type, sync_enabled, direction, default_value, transform_rules } = req.body;

    if (!source_field || !source_field.trim()) {
      return res.status(400).json({ success: false, message: 'source_field không được để trống' });
    }
    if (!target_field || !target_field.trim()) {
      return res.status(400).json({ success: false, message: 'target_field không được để trống' });
    }

    const mapping = await fieldMappingService.create({
      api_config_id: parseInt(configId),
      source_field, target_field, target_field_type, sync_enabled, direction, default_value, transform_rules
    });

    res.status(201).json({ success: true, data: mapping, message: 'Tạo field mapping thành công' });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Create field mapping error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { source_field, target_field, target_field_type, sync_enabled, direction, default_value, transform_rules } = req.body;

    const mapping = await fieldMappingService.update(id, {
      source_field, target_field, target_field_type, sync_enabled, direction, default_value, transform_rules
    });

    res.json({ success: true, data: mapping, message: 'Cập nhật field mapping thành công' });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Update field mapping error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await fieldMappingService.getById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy field mapping' });
    }

    await fieldMappingService.remove(id);
    res.json({ success: true, message: 'Xóa field mapping thành công' });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Delete field mapping error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.getFieldTypes = async (req, res) => {
  try {
    const { configId } = req.query;
    let oneOfficeFields = [];

    if (configId) {
      try {
        const oneOfficeService = require('../services/oneOfficeService');
        const apiConfigService = require('../services/apiConfigService');
        const result = await oneOfficeService.getContacts(parseInt(configId), { limit: 50 });

        if (result.success && result.data && result.data.contacts && result.data.contacts.length > 0 && !result.data.error) {
          const apiFieldKeys = new Set();
          result.data.contacts.forEach(c => {
            Object.keys(c).forEach(k => {
              if (k !== 'ID') apiFieldKeys.add(k);
            });
          });

          const apiFields = Array.from(apiFieldKeys).map(key => {
            const known = fieldMapper.ONE_OFFICE_FIELDS.find(f => f.key === key);
            return { key, label: known ? known.label : key, type: known ? known.type : 'text' };
          });

          const savedMetadata = await apiConfigService.mergeFieldMetadata(parseInt(configId), apiFields);

          oneOfficeFields = apiFields.map(f => {
            const saved = savedMetadata[f.key];
            const known = fieldMapper.ONE_OFFICE_FIELDS.find(k => k.key === f.key);
            return {
              key: f.key,
              label: (saved && saved.label !== f.key) ? saved.label : f.label,
              type: saved ? saved.type : f.type,
              required: known ? known.required : false,
              options: saved ? (saved.options || []) : []
            };
          });

          const hardcodedKeys = new Set(oneOfficeFields.map(f => f.key));
          fieldMapper.ONE_OFFICE_FIELDS.forEach(f => {
            if (!hardcodedKeys.has(f.key)) {
              const saved = savedMetadata[f.key];
              oneOfficeFields.push({
                key: f.key,
                label: saved ? saved.label : f.label,
                type: saved ? saved.type : f.type,
                required: f.required,
                options: saved ? saved.options : (f.options || [])
              });
            }
          });
        } else {
          oneOfficeFields = [...fieldMapper.ONE_OFFICE_FIELDS];
        }
      } catch (e) {
        console.log('[FieldMapping] Cannot fetch 1Office fields:', e.message);
        oneOfficeFields = [...fieldMapper.ONE_OFFICE_FIELDS];
      }
    } else {
      oneOfficeFields = [...fieldMapper.ONE_OFFICE_FIELDS];
    }

    res.json({
      success: true,
      data: {
        allowedTypes: fieldMapper.ALLOWED_TYPES,
        oneOfficeFields,
        proposalFields: fieldMapper.PROPOSAL_FIELDS
      }
    });
  } catch (error) {
    console.error('Get field types error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.previewTransform = async (req, res) => {
  try {
    const { value, mapping, direction } = req.body;
    if (!mapping) {
      return res.status(400).json({ success: false, message: 'mapping không được để trống' });
    }

    const result = direction === 'pull'
      ? fieldMapper.transformPull(value, mapping)
      : fieldMapper.transformPush(value, mapping);

    res.json({ success: true, data: { original: value, transformed: result } });
  } catch (error) {
    console.error('Preview transform error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.updateFieldMetadata = async (req, res) => {
  try {
    const { configId } = req.params;
    const metadata = req.body;

    if (!metadata || typeof metadata !== 'object') {
      return res.status(400).json({ success: false, message: 'Metadata không hợp lệ' });
    }

    const apiConfigService = require('../services/apiConfigService');
    const existing = await apiConfigService.getFieldMetadata(parseInt(configId));
    const merged = { ...existing, ...metadata };
    await apiConfigService.updateFieldMetadata(parseInt(configId), merged);

    res.json({ success: true, data: merged });
  } catch (error) {
    console.error('Update field metadata error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.getSelectedFields = async (req, res) => {
  try {
    const { configId } = req.params;
    const apiConfigService = require('../services/apiConfigService');
    const fields = await apiConfigService.getSelectedFields(parseInt(configId));
    res.json({ success: true, data: fields || [] });
  } catch (error) {
    console.error('Get selected fields error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.updateSelectedFields = async (req, res) => {
  try {
    const { configId } = req.params;
    const fields = req.body;

    if (!Array.isArray(fields)) {
      return res.status(400).json({ success: false, message: 'Fields phải là array' });
    }

    const apiConfigService = require('../services/apiConfigService');
    await apiConfigService.updateSelectedFields(parseInt(configId), fields);

    res.json({ success: true, data: fields });
  } catch (error) {
    console.error('Update selected fields error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
