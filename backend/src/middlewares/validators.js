const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\d{10}$/;

const dynamicUtils = require('../services/dynamicUtils');

// required la nguon duy nhat theo field_definitions (Admin -> Fields).
// Cac key duoi day la invariant he thong, luon bat buoc (khong phu thuoc cau hinh):
const ALWAYS_REQUIRED = {
  stations: { latitude: 'Vĩ độ', longitude: 'Kinh độ' },
  station_proposals: { latitude: 'Vĩ độ', longitude: 'Kinh độ' },
  users: { full_name: 'Họ tên', email: 'Email', password: 'Mật khẩu' },
};
const ALWAYS_REQUIRED_UPDATE = {
  users: { email: 'Email' },
};

const hasValue = (v) => !(v === undefined || v === null || v === '');

async function validateAgainstEntity(req, res, entity, { partial = false, always = null } = {}) {
  const data = (req && req.body) || {};
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity(entity);
  const defs = partial
    ? fieldDefs.filter((f) => Object.prototype.hasOwnProperty.call(data, f.key))
    : fieldDefs;
  const errors = await dynamicUtils.validateData(entity, data, defs);

  const alwaysKeys = always || (partial ? (ALWAYS_REQUIRED_UPDATE[entity] || {}) : (ALWAYS_REQUIRED[entity] || {}));
  for (const [key, label] of Object.entries(alwaysKeys)) {
    if (!hasValue(data[key])) errors.push(`${label} là bắt buộc`);
  }

  if (entity === 'stations' || entity === 'station_proposals') {
    if (hasValue(data.latitude)) {
      const n = Number(data.latitude);
      if (isNaN(n) || n < -90 || n > 90) errors.push('Vĩ độ không hợp lệ (phải từ -90 đến 90)');
    }
    if (hasValue(data.longitude)) {
      const n = Number(data.longitude);
      if (isNaN(n) || n < -180 || n > 180) errors.push('Kinh độ không hợp lệ (phải từ -180 đến 180)');
    }
  }

  const uniqueErrors = [...new Set(errors)];
  if (uniqueErrors.length > 0) {
    res.status(400).json({ success: false, message: uniqueErrors[0], errors: uniqueErrors });
    return true;
  }
  return false;
}

function makeEntityValidator(entity, opts = {}) {
  return async function (req, res, next) {
    try {
      const handled = await validateAgainstEntity(req, res, entity, opts);
      if (handled) return;
      next();
    } catch (err) {
      next(err);
    }
  };
}

function parseOptions(optionsJson) {
  if (!optionsJson) return [];
  if (Array.isArray(optionsJson)) return optionsJson;
  if (typeof optionsJson === 'string') {
    try { return JSON.parse(optionsJson); } catch { return []; }
  }
  return optionsJson;
}

function validateDynamicFields(data, fieldDefs) {
  if (!fieldDefs || fieldDefs.length === 0) return [];
  const errors = [];

  for (const fd of fieldDefs) {
    const value = data[fd.key];
    if (fd.required && (value === undefined || value === null || value === '')) {
      errors.push(`${fd.label} là bắt buộc`);
      continue;
    }
    if (value === undefined || value === null || value === '') continue;

    switch (fd.type) {
      case 'number':
        if (isNaN(Number(value))) errors.push(`${fd.label} phải là số`);
        break;
      case 'email':
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors.push(`${fd.label} không hợp lệ`);
        break;
      case 'phone':
        if (!/^\d{10}$/.test(value)) errors.push(`${fd.label} phải có đúng 10 chữ số`);
        break;
      case 'password':
        if (typeof value !== 'string' || value.length < 6) errors.push(`${fd.label} phải có ít nhất 6 ký tự`);
        break;
      case 'select':
        const opts = parseOptions(fd.options).map(o => (o && typeof o === 'object' ? (o.value ?? o.label) : o));
        if (opts.length > 0 && !opts.includes(value)) errors.push(`${fd.label} không hợp lệ`);
        break;
      case 'multiselect':
        if (!Array.isArray(value)) errors.push(`${fd.label} phải là mảng`);
        else {
          const mOpts = parseOptions(fd.options).map(o => (o && typeof o === 'object' ? (o.value ?? o.label) : o));
          if (mOpts.length > 0) {
            const invalid = value.filter(v => !mOpts.includes(v));
            if (invalid.length > 0) errors.push(`${fd.label} chứa giá trị không hợp lệ: ${invalid.join(', ')}`);
          }
        }
        break;
      case 'user': {
        let rawUser = value;
        if (typeof value === 'object' && value !== null) rawUser = value.id ?? value.user_id ?? value.value;
        const userNum = Number(rawUser);
        if (!Number.isInteger(userNum) || userNum <= 0) errors.push(`${fd.label} không hợp lệ`);
        break;
      }
      case 'table':
        if (value !== undefined && value !== null && value !== '' && !Array.isArray(value)) {
          errors.push(`${fd.label} phải là mảng`);
        }
        break;
    }
  }
  return errors;
}

function validateEmail(email) {
  if (!email || typeof email !== 'string') return 'Email là bắt buộc';
  if (!EMAIL_REGEX.test(email.trim())) return 'Email không hợp lệ';
  return null;
}

function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') return 'Số điện thoại là bắt buộc';
  if (!PHONE_REGEX.test(phone.trim())) return 'Số điện thoại phải có đúng 10 chữ số';
  return null;
}

function validateFullName(name) {
  if (!name || typeof name !== 'string') return 'Họ tên là bắt buộc';
  const trimmed = name.trim();
  if (trimmed.length < 2) return 'Họ tên phải có ít nhất 2 ký tự';
  if (trimmed.length > 100) return 'Họ tên không được quá 100 ký tự';
  return null;
}

function validatePassword(password) {
  if (!password || typeof password !== 'string') return 'Mật khẩu là bắt buộc';
  if (password.length < 6) return 'Mật khẩu phải có ít nhất 6 ký tự';
  return null;
}

function validateLatitude(lat) {
  if (lat === undefined || lat === null || lat === '') return 'Vĩ độ là bắt buộc';
  const num = parseFloat(lat);
  if (isNaN(num) || num < -90 || num > 90) return 'Vĩ độ không hợp lệ (phải từ -90 đến 90)';
  return null;
}

function validateLongitude(lng) {
  if (lng === undefined || lng === null || lng === '') return 'Kinh độ là bắt buộc';
  const num = parseFloat(lng);
  if (isNaN(num) || num < -180 || num > 180) return 'Kinh độ không hợp lệ (phải từ -180 đến 180)';
  return null;
}

function validateRequired(value, fieldName) {
  if (!value || (typeof value === 'string' && !value.trim())) {
    return `${fieldName} là bắt buộc`;
  }
  return null;
}

function validateEnum(value, allowedValues, fieldName) {
  if (value && !allowedValues.includes(value)) {
    return `${fieldName} không hợp lệ. Chỉ chấp nhận: ${allowedValues.join(', ')}`;
  }
  return null;
}

function runValidations(validations) {
  const errors = [];
  for (const err of validations) {
    if (err) errors.push(err);
  }
  return errors;
}

function validationResponse(res, errors) {
  if (errors.length > 0) {
    return res.status(400).json({ success: false, message: errors[0], errors });
  }
  return null;
}

// Invariant: full_name + email + password bat buoc; phone/truong khac theo field_definitions
const validateRegister = makeEntityValidator('users');

function validateLogin(req, res, next) {
  const { email, password } = req.body;
  const errors = runValidations([
    validateRequired(email, 'Email'),
    validateRequired(password, 'Mật khẩu')
  ]);
  if (validationResponse(res, errors)) return;
  next();
}

// Required theo field_definitions + invariant (lat/lng cho geo, email/password cho users)
const validateCreateStation = makeEntityValidator('stations');
const validateUpdateStation = makeEntityValidator('stations', { partial: true });
const validateCreateProposal = makeEntityValidator('station_proposals');
const validateUpdateProposal = makeEntityValidator('station_proposals', { partial: true });
const validateCreateUser = makeEntityValidator('users');
const validateUpdateUser = makeEntityValidator('users', { partial: true });

module.exports = {
  validateEmail,
  validatePhone,
  validateFullName,
  validatePassword,
  validateLatitude,
  validateLongitude,
  validateRequired,
  validateEnum,
  validateDynamicFields,
  validateRegister,
  validateLogin,
  validateCreateStation,
  validateUpdateStation,
  validateCreateProposal,
  validateUpdateProposal,
  validateCreateUser,
  validateUpdateUser
};
