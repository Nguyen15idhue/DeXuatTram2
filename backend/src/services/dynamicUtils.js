const pool = require('../utils/db');

exports.parseOptions = (optionsJson) => {
  if (!optionsJson) return [];
  if (Array.isArray(optionsJson)) return optionsJson;
  if (typeof optionsJson === 'string') {
    try {
      return JSON.parse(optionsJson);
    } catch {
      return [];
    }
  }
  return optionsJson;
};

exports.validateField = (fieldDef, value) => {
  const errors = [];

  if (fieldDef.required && (value === undefined || value === null || value === '')) {
    errors.push(`${fieldDef.label} là bắt buộc`);
    return errors;
  }

  if (value === undefined || value === null || value === '') return errors;

  switch (fieldDef.type) {
    case 'number':
      const num = Number(value);
      if (isNaN(num)) {
        errors.push(`${fieldDef.label} phải là số`);
      } else if (fieldDef.number_format === 'integer' && !Number.isInteger(num)) {
        errors.push(`${fieldDef.label} phải là số nguyên`);
      } else if (fieldDef.decimal_places != null) {
        const parts = String(num).split('.');
        if (parts.length > 1 && parts[1].length > fieldDef.decimal_places) {
          errors.push(`${fieldDef.label} tối đa ${fieldDef.decimal_places} chữ số thập phân`);
        }
      }
      break;

    case 'email':
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        errors.push(`${fieldDef.label} không hợp lệ`);
      }
      break;

    case 'phone':
      const phoneRegex = /^\d{10}$/;
      if (!phoneRegex.test(value)) {
        errors.push(`${fieldDef.label} phải có đúng 10 chữ số`);
      }
      break;

    case 'url':
      try {
        new URL(value);
      } catch {
        errors.push(`${fieldDef.label} không hợp lệ`);
      }
      break;

    case 'date':
      if (isNaN(Date.parse(value))) {
        errors.push(`${fieldDef.label} không hợp lệ`);
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean' && value !== 0 && value !== 1 && value !== '0' && value !== '1') {
        errors.push(`${fieldDef.label} không hợp lệ`);
      }
      break;

    case 'select':
      const options = exports.parseOptions(fieldDef.options);
      if (options.length > 0 && !options.includes(value)) {
        errors.push(`${fieldDef.label} không hợp lệ`);
      }
      break;

    case 'multiselect':
      if (!Array.isArray(value)) {
        errors.push(`${fieldDef.label} phải là mảng`);
      } else {
        const multiOptions = exports.parseOptions(fieldDef.options);
        if (multiOptions.length > 0) {
          const invalid = value.filter(v => !multiOptions.includes(v));
          if (invalid.length > 0) {
            errors.push(`${fieldDef.label} chứa giá trị không hợp lệ: ${invalid.join(', ')}`);
          }
        }
      }
      break;

    case 'file':
      if (fieldDef.file_config && fieldDef.file_config.maxSize && value) {
        const files = Array.isArray(value) ? value : [value];
        const maxSizeBytes = fieldDef.file_config.maxSize * 1024 * 1024;
        for (const f of files) {
          if (f.size && f.size > maxSizeBytes) {
            errors.push(`${fieldDef.label}: file "${f.name || ''}" vượt quá ${fieldDef.file_config.maxSize}MB`);
          }
        }
      }
      break;
    case 'textarea':
    case 'text':
    case 'formula':
      if (fieldDef.type === 'formula') {
        const fc = typeof fieldDef.formula_config === 'string'
          ? (() => { try { return JSON.parse(fieldDef.formula_config); } catch { return {}; } })()
          : (fieldDef.formula_config || {});
        if (fc.compute_mode === 'post') return errors;
      }
    default:
      break;
  }

  return errors;
};

exports.validateData = async (entity, data, fieldDefs) => {
  const allErrors = [];

  if (!fieldDefs || fieldDefs.length === 0) return allErrors;

  for (const fieldDef of fieldDefs) {
    const value = data[fieldDef.key];
    const errors = exports.validateField(fieldDef, value);
    allErrors.push(...errors);
  }

  return allErrors;
};

exports.splitData = (entity, data, fieldDefs) => {
  const fixedData = {};
  const dynamicData = {};

  if (!fieldDefs || fieldDefs.length === 0) {
    Object.keys(data).forEach(key => { fixedData[key] = data[key]; });
    return { fixedData, dynamicData };
  }

  const dynamicKeys = new Set(
    fieldDefs.filter(f => f.source_type === 'json').map(f => f.key)
  );

  Object.keys(data).forEach(key => {
    if (dynamicKeys.has(key)) {
      dynamicData[key] = data[key];
    } else {
      fixedData[key] = data[key];
    }
  });

  return { fixedData, dynamicData };
};

exports.mergeData = (row, fieldDefs) => {
  if (!row || !fieldDefs || fieldDefs.length === 0) return row;

  const result = { ...row };

  if (row.custom_data && typeof row.custom_data === 'string') {
    try {
      result.custom_data = JSON.parse(row.custom_data);
    } catch {
      result.custom_data = {};
    }
  } else if (row.custom_data && typeof row.custom_data === 'object') {
    result.custom_data = row.custom_data;
  } else {
    result.custom_data = {};
  }

  fieldDefs.forEach(fd => {
    if (result[fd.key] === undefined && result.custom_data[fd.key] !== undefined) {
      result[fd.key] = result.custom_data[fd.key];
    }
  });

  return result;
};

exports.buildDynamicSetClause = (data, fieldDefs) => {
  if (!fieldDefs || fieldDefs.length === 0) return null;

  const dynamicKeys = Object.keys(data).filter(key =>
    fieldDefs.some(fd => fd.key === key)
  );

  if (dynamicKeys.length === 0) return null;

  const dynamicObj = {};
  dynamicKeys.forEach(key => { dynamicObj[key] = data[key]; });

  return JSON.stringify(dynamicObj);
};

exports.getFieldDefinitionsByEntity = async (entity) => {
  const [rows] = await pool.query(
    'SELECT * FROM field_definitions WHERE entity = ? AND status = ?',
    [entity, 'active']
  );
  return rows;
};
