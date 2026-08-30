const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\d{10}$/;

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
      case 'select':
        const opts = parseOptions(fd.options);
        if (opts.length > 0 && !opts.includes(value)) errors.push(`${fd.label} không hợp lệ`);
        break;
      case 'multiselect':
        if (!Array.isArray(value)) errors.push(`${fd.label} phải là mảng`);
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

function validateRegister(req, res, next) {
  const { full_name, email, phone, password } = req.body;
  const errors = runValidations([
    validateFullName(full_name),
    validateEmail(email),
    validatePhone(phone),
    validatePassword(password)
  ]);
  if (validationResponse(res, errors)) return;
  next();
}

function validateLogin(req, res, next) {
  const { email, password } = req.body;
  const errors = runValidations([
    validateRequired(email, 'Email'),
    validateRequired(password, 'Mật khẩu')
  ]);
  if (validationResponse(res, errors)) return;
  next();
}

function validateCreateStation(req, res, next) {
  const { name, latitude, longitude, address, status } = req.body;
  const errors = runValidations([
    validateRequired(name, 'Tên trạm'),
    validateLatitude(latitude),
    validateLongitude(longitude),
    validateRequired(address, 'Địa chỉ'),
    validateEnum(status, ['ACTIVE', 'DEPLOYING'], 'Trạng thái')
  ]);
  if (validationResponse(res, errors)) return;
  next();
}

function validateUpdateStation(req, res, next) {
  const { name, latitude, longitude, address, status } = req.body;
  const errors = runValidations([
    validateRequired(name, 'Tên trạm'),
    validateLatitude(latitude),
    validateLongitude(longitude),
    validateRequired(address, 'Địa chỉ'),
    validateEnum(status, ['ACTIVE', 'DEPLOYING'], 'Trạng thái')
  ]);
  if (validationResponse(res, errors)) return;
  next();
}

function validateCreateProposal(req, res, next) {
  const { latitude, longitude, owner_name, owner_phone, address } = req.body;
  const errors = runValidations([
    validateLatitude(latitude),
    validateLongitude(longitude),
    validateRequired(owner_name, 'Chủ mặt bằng'),
    validatePhone(owner_phone),
    validateRequired(address, 'Địa chỉ')
  ]);
  if (validationResponse(res, errors)) return;
  next();
}

function validateCreateUser(req, res, next) {
  const { full_name, email, phone, password } = req.body;
  const errors = runValidations([
    validateFullName(full_name),
    validateEmail(email),
    validatePhone(phone),
    validatePassword(password)
  ]);
  if (validationResponse(res, errors)) return;
  next();
}

function validateUpdateUser(req, res, next) {
  const { full_name, email, phone } = req.body;
  const errors = runValidations([
    validateFullName(full_name),
    validateEmail(email),
    phone ? validatePhone(phone) : null
  ]);
  if (validationResponse(res, errors)) return;
  next();
}

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
  validateCreateUser,
  validateUpdateUser
};
