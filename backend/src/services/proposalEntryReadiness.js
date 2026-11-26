const pool = require('../utils/db');
const dynamicUtils = require('./dynamicUtils');
const { getApplicableFieldKeys } = require('../middlewares/validators');

const hasValue = (value) => value !== undefined && value !== null && value !== '';

exports.check = async (row, connection = pool) => {
  const [forms] = await connection.query(
    "SELECT id FROM forms WHERE entity = 'station_proposals' AND purpose = 'create' AND status = 'active' AND is_default = 1 ORDER BY id ASC LIMIT 1"
  );
  if (!forms.length) {
    throw Object.assign(new Error('Không tìm thấy form tạo đầy đủ mặc định đang hoạt động'), { statusCode: 500 });
  }
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const flat = dynamicUtils.mergeData(row, fieldDefs);
  const applicable = await getApplicableFieldKeys('station_proposals', flat, 'create', forms[0].id, connection);
  if (!applicable.size) {
    throw Object.assign(new Error('Form tạo đầy đủ không có trường hợp lệ để kiểm tra'), { statusCode: 500 });
  }
  const defs = fieldDefs.filter((field) => applicable.has(field.key)).map((field) => {
    const config = dynamicUtils.parseSourceConfig(field.source_config);
    const required = field.required || ['area_director', 'center_director'].includes(config.auto_user);
    return {
      ...field,
      required,
      ...(['latitude', 'longitude'].includes(field.key) ? { decimal_places: null } : {})
    };
  });
  const errors = await dynamicUtils.validateData('station_proposals', flat, defs, { connection, strict: true });
  for (const field of defs) {
    if (field.required && Array.isArray(flat[field.key]) && flat[field.key].length === 0) {
      errors.push(field.type === 'table'
        ? `${field.label} phải có ít nhất 1 dòng`
        : `${field.label} là bắt buộc`);
    }
  }
  for (const [key, label, min, max] of [
    ['latitude', 'Vĩ độ', -90, 90], ['longitude', 'Kinh độ', -180, 180]
  ]) {
    if (!hasValue(flat[key])) errors.push(`${label} là bắt buộc`);
    else if (!Number.isFinite(Number(flat[key])) || Number(flat[key]) < min || Number(flat[key]) > max) {
      errors.push(`${label} không hợp lệ`);
    }
  }
  const missing = [...new Set(errors)];
  return { complete: missing.length === 0, missing };
};
