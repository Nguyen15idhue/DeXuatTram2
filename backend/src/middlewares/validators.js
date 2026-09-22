const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\d{10}$/;

const dynamicUtils = require('../services/dynamicUtils');
const pool = require('../utils/db');

function evalCondition(data, c) {
  if (!c || !c.field) return true;
  const val = data[c.field];
  const v = c.value ?? '';
  switch (c.operator) {
    case '=': return String(val ?? '') === String(v);
    case '!=': return String(val ?? '') !== String(v);
    case 'contains': return String(val ?? '').toLowerCase().includes(String(v).toLowerCase());
    case '>': return Number(val) > Number(v);
    case '<': return Number(val) < Number(v);
    case 'empty': return val === '' || val === null || val === undefined;
    case 'not_empty': return val !== '' && val !== null && val !== undefined;
    default: return true;
  }
}

const MAX_TAB_DEPTH = 5;

// visibleWhen: field + value (khong ho tro operator o cap section/tab)
function evalVisibleWhen(node, data) {
  if (!node || !node.visibleWhen || !node.visibleWhen.field) return true;
  return String(data[node.visibleWhen.field] ?? '') === String(node.visibleWhen.value ?? '');
}

// Luat "visible thang": row duoc coi la hien neu TON TAI it nhat 1 noi chua no dang hien
function markRows(rowHidden, rows, visible) {
  (rows || []).forEach((row) => {
    if (!row || !row.id) return;
    rowHidden[row.id] = rowHidden[row.id] === false ? false : !visible;
  });
}

// Duyet de quy layout_config.sections + tabs[] (khong gioi han 2 cap, chan vong bang pathSet)
function walkLayoutNode(node, visible, data, sectionMap, pathSet, depth, isReferenced, rowHidden) {
  if (!node || depth > MAX_TAB_DEPTH) return;
  const myVisible = isReferenced ? visible : (visible && evalVisibleWhen(node, data));

  if (node.type === 'tabs' || Array.isArray(node.tabs)) {
    (node.tabs || []).forEach((tab) => {
      if (!tab) return;
      const tabVisible = myVisible && evalVisibleWhen(tab, data);
      (tab.sectionRefs || []).forEach((refId) => {
        if (pathSet.has(refId)) return;
        const sec = sectionMap[refId];
        if (!sec) return;
        const next = new Set(pathSet);
        next.add(refId);
        walkLayoutNode(sec, tabVisible, data, sectionMap, next, depth + 1, true, rowHidden);
      });
      if (Array.isArray(tab.tabs)) {
        walkLayoutNode(tab, tabVisible, data, sectionMap, pathSet, depth + 1, false, rowHidden);
      }
    });
    markRows(rowHidden, node.rows, myVisible);
  } else {
    markRows(rowHidden, node.rows, myVisible);
  }
}

// Tra ve tap key field CAN validate: chi gom field CO trong form dang dung va DANG hien thi
// (bo qua field khong nam trong form, va field bi an theo section.visibleWhen / field.conditions)
async function getApplicableFieldKeys(entity, data, purpose = 'create', formId = null) {
  let form = null;

  // formId duoc chi dinh -> whitelist (phai thuoc dung entity + dang active), sai thi bo qua
  if (formId) {
    const [picked] = await pool.query(
      "SELECT id, layout_config FROM forms WHERE id = ? AND entity = ? AND status = 'active' LIMIT 1",
      [formId, entity]
    );
    form = picked[0] || null;
  }

  if (!form) {
    const [forms] = await pool.query(
      "SELECT id, layout_config FROM forms WHERE entity = ? AND status = 'active' ORDER BY (purpose = ?) DESC, is_default DESC, id ASC LIMIT 1",
      [entity, purpose]
    );
    form = forms[0] || null;
  }

  if (!form) return new Set();

  let layout = form.layout_config;
  if (typeof layout === 'string') { try { layout = JSON.parse(layout); } catch { layout = {}; } }
  const sections = (layout && layout.sections) || [];
  const sectionMap = {};
  sections.forEach((s) => { if (s && s.id) sectionMap[s.id] = s; });
  const rowHidden = {};
  sections.forEach((sec) => {
    walkLayoutNode(sec, true, data, sectionMap, new Set(), 1, false, rowHidden);
  });

  const [ffs] = await pool.query(
    'SELECT fd.`key` AS field_key, ff.config FROM form_fields ff JOIN field_definitions fd ON fd.id = ff.field_id WHERE ff.form_id = ?',
    [form.id]
  );

  const applicable = new Set();
  ffs.forEach((f) => {
    let cfg = f.config;
    if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch { cfg = {}; } }
    if (!cfg) cfg = {};
    let visible = true;
    if (cfg.rowId && rowHidden[cfg.rowId]) visible = false;
    if (visible && Array.isArray(cfg.conditions) && cfg.conditions.length > 0) {
      const results = cfg.conditions.map((c) => evalCondition(data, c));
      visible = cfg.conditionLogic === 'OR' ? results.some(Boolean) : results.every(Boolean);
    }
    if (visible) applicable.add(f.field_key);
  });
  return applicable;
}

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
  let defs = partial
    ? fieldDefs.filter((f) => Object.prototype.hasOwnProperty.call(data, f.key))
    : fieldDefs;

  try {
    const purpose = (req.method === 'PUT' || req.method === 'PATCH') ? 'view' : 'create';
    const rawFormId = (req.query && req.query.formId) ? parseInt(req.query.formId, 10) : null;
    const formId = Number.isFinite(rawFormId) ? rawFormId : null;
    const applicable = await getApplicableFieldKeys(entity, data, purpose, formId);
    if (applicable && applicable.size > 0) defs = defs.filter((f) => applicable.has(f.key));
  } catch { /* silent */ }

  // Toa do: decimal_places chi la dinh dang hien thi -> khong chan theo so chu so thap phan
  defs = defs.map((f) => ((f.key === 'latitude' || f.key === 'longitude') ? { ...f, decimal_places: null } : f));

  // Chuan hoa so dien thoai: bo khoang trang/ky tu khong phai so truoc khi validate + luu
  fieldDefs.forEach((f) => {
    if (f.type !== 'phone') return;
    const v = data[f.key];
    if (typeof v === 'string' && v.trim() !== '') {
      data[f.key] = v.replace(/[^\d]/g, '');
    }
  });

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
  const identifier = req.body.email || req.body.identifier || req.body.phone;
  const { password } = req.body;
  const errors = runValidations([
    validateRequired(identifier, 'Email/Số điện thoại'),
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
