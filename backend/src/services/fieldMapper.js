const adminUserService = require('./adminUserService');
const oneOfficeService = require('./oneOfficeService');

const ONE_OFFICE_USER_VALUE_CACHE = {};
const ONE_OFFICE_USER_VALUE_TTL = 10 * 60 * 1000;

const getOneOfficeUserMaps = async (apiConfigId) => {
  const now = Date.now();
  const cached = ONE_OFFICE_USER_VALUE_CACHE[apiConfigId];
  if (cached && now - cached.at < ONE_OFFICE_USER_VALUE_TTL) return cached.maps;
  const res = await oneOfficeService.getUsers(apiConfigId, { limit: 100 });
  const users = (res && res.data && Array.isArray(res.data.users)) ? res.data.users : null;
  if (!users) throw new Error('Không lấy được danh sách user hệ ngoài');
  const valueByPersonnel = {};
  const personnelByApiId = {};
  users.forEach(u => {
    const pid = (u.personnel_id !== null && u.personnel_id !== undefined) ? String(u.personnel_id) : '';
    const code = (u.code !== null && u.code !== undefined && String(u.code).trim() !== '') ? String(u.code).trim() : '';
    const val = code || (u.fullname ? String(u.fullname).trim() : '');
    if (pid !== '' && val) valueByPersonnel[pid] = val;
    if (u.ID !== null && u.ID !== undefined && pid !== '') personnelByApiId[String(u.ID)] = pid;
  });
  const maps = { valueByPersonnel, personnelByApiId };
  ONE_OFFICE_USER_VALUE_CACHE[apiConfigId] = { at: now, maps };
  return maps;
};

const ALLOWED_TYPES = ['text', 'textarea', 'number', 'email', 'phone', 'url', 'date', 'datetime', 'boolean', 'select', 'multiselect', 'file', 'formula', 'password', 'table', 'user'];

const ONE_OFFICE_FIELDS = [
  { key: 'code', label: 'Mã', type: 'text', required: true },
  { key: 'type', label: 'Loại liên hệ', type: 'select', required: true },
  { key: 'name', label: 'Tên liên hệ', type: 'text', required: true },
  { key: 'formal_name', label: 'Danh xưng', type: 'select', required: false },
  { key: 'phones', label: 'Điện thoại', type: 'phone', required: false },
  { key: 'emails', label: 'Email', type: 'email', required: false },
  { key: 'address', label: '[Địa chỉ] Số, đường', type: 'text', required: false },
  { key: 'place_of_address', label: '[Địa chỉ] Xã phường, Quận huyện, Tỉnh thành', type: 'text', required: false },
  { key: 'group_type_id', label: 'Nhóm khách hàng', type: 'text', required: false },
  { key: 'region', label: 'Vùng miền', type: 'text', required: false },
  { key: 'partner_id', label: 'Đối tác', type: 'text', required: false },
  { key: 'job_tax', label: 'CMND/Căn cước', type: 'text', required: false },
  { key: 'id_card_date', label: 'Ngày cấp', type: 'date', required: false },
  { key: 'id_card_place', label: 'Nơi cấp', type: 'text', required: false },
  { key: 'birthday', label: 'Ngày sinh', type: 'date', required: false },
  { key: 'scale_id', label: 'Quy mô tổ chức', type: 'select', required: false },
  { key: 'status_id', label: 'Trạng thái', type: 'text', required: false },
  { key: 'source_id', label: 'Nguồn liên hệ', type: 'text', required: false },
  { key: 'desc', label: 'Mô tả', type: 'textarea', required: false },
  { key: 'user_ids', label: 'Phụ trách', type: 'user', required: false },
  { key: 'manager_user_ids', label: 'Người giao phụ trách', type: 'user', required: false },
  { key: 'trade_ids', label: 'Lĩnh vực', type: 'text', required: false },
  { key: 'tax_number', label: 'Mã số thuế/ĐKKD', type: 'text', required: false },
  { key: 'established_date', label: 'Ngày thành lập', type: 'date', required: false },
  { key: 'gender', label: 'Giới tính', type: 'text', required: false },
  { key: 'websites', label: 'Website', type: 'text', required: false }
];

const PROPOSAL_FIELDS = [
  { key: 'owner_name', label: 'Tên chủ sở hữu', type: 'text' },
  { key: 'owner_phone', label: 'SĐT chủ sở hữu', type: 'phone' },
  { key: 'address', label: 'Địa chỉ', type: 'text' },
  { key: 'latitude', label: 'Vĩ độ', type: 'number' },
  { key: 'longitude', label: 'Kinh độ', type: 'number' },
  { key: 'area', label: 'Khu vực', type: 'text' },
  { key: 'land_type', label: 'Loại đất', type: 'text' },
  { key: 'description', label: 'Mô tả', type: 'textarea' },
  { key: 'status', label: 'Trạng thái', type: 'select' },
  { key: 'created_at', label: 'Ngày tạo', type: 'datetime' },
  { key: 'tracking_code', label: 'Mã đề xuất', type: 'text' },
  { key: 'custom_data', label: 'Dữ liệu tùy chỉnh', type: 'table' }
];

exports.ALLOWED_TYPES = ALLOWED_TYPES;
exports.ONE_OFFICE_FIELDS = ONE_OFFICE_FIELDS;
exports.PROPOSAL_FIELDS = PROPOSAL_FIELDS;

const ONE_OFFICE_UNSUPPORTED = ['gender', 'group_type_id', 'trade_ids', 'websites', 'status_id', 'source_id', 'region', 'contacts', 'detail'];
const ONE_OFFICE_SPECIAL = ['desc', 'files'];

exports.ONE_OFFICE_UNSUPPORTED = ONE_OFFICE_UNSUPPORTED;
exports.ONE_OFFICE_SPECIAL = ONE_OFFICE_SPECIAL;
exports.isUnsupportedTarget = (key) => ONE_OFFICE_UNSUPPORTED.includes(String(key || ''));
exports.isSpecialTarget = (key) => ONE_OFFICE_SPECIAL.includes(String(key || ''));
exports.buildFilesTarget = () => ({ key: 'files', label: 'Tệp đính kèm', type: 'json', required: false, options: [] });

exports.transformPush = async (value, mapping, system = null, apiConfigId = null) => {
  if (value === null || value === undefined || value === '') {
    return mapping.default_value || null;
  }

  const type = mapping.target_field_type;
  const rules = mapping.transform_rules
    ? (typeof mapping.transform_rules === 'string' ? JSON.parse(mapping.transform_rules) : mapping.transform_rules)
    : {};

  switch (type) {
    case 'text':
      return exports.transformText(value, rules);
    case 'textarea':
      return exports.transformTextarea(value, rules);
    case 'number':
      return exports.transformNumber(value, rules);
    case 'email':
      return exports.transformEmail(value, rules);
    case 'phone':
      return exports.transformPhone(value, rules);
    case 'url':
      return exports.transformUrl(value, rules);
    case 'date':
      return exports.transformDate(value, rules);
    case 'datetime':
      return exports.transformDatetime(value, rules);
    case 'boolean':
      return exports.transformBoolean(value, rules);
    case 'select':
      return exports.transformSelect(value, rules);
    case 'multiselect':
      return exports.transformMultiselect(value, rules);
    case 'file':
      return exports.transformFile(value, rules);
    case 'formula':
      return exports.transformFormula(value, rules);
    case 'password':
      return null;
    case 'table':
      return exports.transformTable(value, rules);
    case 'user':
      return exports.transformUserPush(value, mapping, system, apiConfigId);
    default:
      return String(value);
  }
};

exports.transformPull = async (value, mapping, system = null, apiConfigId = null) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const type = mapping.target_field_type;

  switch (type) {
    case 'text':
    case 'textarea':
    case 'phone':
    case 'url':
      return typeof value === 'string' ? value.trim() : String(value);
    case 'number':
      return isNaN(Number(value)) ? null : Number(value);
    case 'email':
      return typeof value === 'string' ? value.trim().toLowerCase() : String(value);
    case 'date': {
      if (typeof value === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
        const [d, m, y] = value.split('/');
        return `${y}-${m}-${d}`;
      }
      return typeof value === 'string' ? value.trim() : String(value);
    }
    case 'datetime': {
      if (typeof value === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
        const [d, m, y] = value.split('/');
        return `${y}-${m}-${d} 00:00:00`;
      }
      return typeof value === 'string' ? value.trim() : String(value);
    }
    case 'boolean':
      return value === '1' || value === 1 || value === true ? 1 : 0;
    case 'select':
      return typeof value === 'string' ? value.trim() : String(value);
    case 'multiselect':
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') return value.split(',').map(v => v.trim()).filter(Boolean);
      return [];
    case 'file':
      return value;
    case 'formula':
      return typeof value === 'string' ? value.trim() : String(value);
    case 'password':
      return null;
    case 'table':
      return value;
    case 'user':
      return exports.transformUserPull(value, mapping, system, apiConfigId);
    default:
      return value;
  }
};

exports.transformText = (value, rules) => {
  let result = String(value).trim();
  if (rules.max_length && result.length > rules.max_length) {
    result = result.substring(0, rules.max_length);
  }
  return result;
};

exports.transformTextarea = (value, rules) => {
  let result = String(value).trim();
  if (rules.strip_html) {
    result = result.replace(/<[^>]*>/g, '');
  }
  if (rules.max_length && result.length > rules.max_length) {
    result = result.substring(0, rules.max_length);
  }
  return result;
};

exports.transformNumber = (value, rules) => {
  const num = Number(value);
  if (isNaN(num)) return null;
  if (rules.decimal_places !== undefined) {
    return parseFloat(num.toFixed(rules.decimal_places));
  }
  return num;
};

exports.transformEmail = (value, rules) => {
  const result = String(value).trim().toLowerCase();
  if (rules.validate !== false && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) {
    return null;
  }
  return result;
};

exports.transformPhone = (value, rules) => {
  let result = String(value).replace(/[\s\-\(\)\.]/g, '').trim();
  if (rules.add_country_code && !result.startsWith('+')) {
    if (result.startsWith('0')) {
      result = '+84' + result.substring(1);
    }
  }
  return result;
};

exports.transformUrl = (value, rules) => {
  let result = String(value).trim();
  if (result && !/^https?:\/\//i.test(result)) {
    result = 'https://' + result;
  }
  return result;
};

exports.transformDate = (value, rules) => {
  if (!value) return null;
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-');
    return `${d}/${m}/${y}`;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    return str;
  }
  const date = new Date(str);
  if (isNaN(date.getTime())) return null;
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
};

exports.transformDatetime = (value, rules) => {
  if (!value) return null;
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const datePart = str.substring(0, 10);
    const [y, m, d] = datePart.split('-');
    return `${d}/${m}/${y}`;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    return str;
  }
  const date = new Date(str);
  if (isNaN(date.getTime())) return null;
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
};

exports.transformBoolean = (value, rules) => {
  if (rules.format === 'boolean') return !!value;
  return value ? '1' : '0';
};

exports.transformSelect = (value, rules) => {
  if (typeof value === 'object' && value !== null) {
    return value.label || value.value || String(value);
  }
  return String(value).trim();
};

exports.transformMultiselect = (value, rules) => {
  if (Array.isArray(value)) {
    return value.map(v => {
      if (typeof v === 'object' && v !== null) return v.label || v.value || String(v);
      return String(v).trim();
    }).join(', ');
  }
  return String(value).trim();
};

exports.transformFile = (value, rules) => {
  if (typeof value === 'string' && value.startsWith('data:')) return value;
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
};

exports.transformFormula = (value, rules) => {
  if (typeof value === 'number') {
    if (rules.decimal_places !== undefined) {
      return parseFloat(value.toFixed(rules.decimal_places)).toString();
    }
    return value.toString();
  }
  return String(value);
};

exports.transformTable = (value, rules) => {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
};

exports.resolveUserId = (value) => {
  if (value === null || value === undefined || value === '') return null;
  let raw = value;
  if (typeof value === 'object' && value !== null) {
    raw = value.id ?? value.user_id ?? value.value;
  }
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

exports.transformUser = (value, rules) => {
  const id = exports.resolveUserId(value);
  return id === null ? null : String(id);
};

exports.transformUserPush = async (value, mapping, system, apiConfigId = null) => {
  const id = exports.resolveUserId(value);
  if (id === null) return null;
  if (!system) return String(id);
  try {
    const ext = await adminUserService.findExternalByUser(id, system);
    if (!ext) {
      console.warn(`[fieldMapper] user ${id} chua co map he ${system}, bo qua.`);
      return null;
    }
    let outgoing = String(ext);
    if (apiConfigId) {
      try {
        const maps = await getOneOfficeUserMaps(apiConfigId);
        const resolved = maps.valueByPersonnel[outgoing];
        if (!resolved) {
          console.warn(`[fieldMapper] khong tim thay nhan su he ngoai personnel_id=${outgoing} trong danh sach, bo qua field.`);
          return null;
        }
        outgoing = resolved;
      } catch (err) {
        console.warn('[fieldMapper] khong lay duoc danh sach user he ngoai, bo qua field:', err.message);
        return null;
      }
    }
    return outgoing;
  } catch (err) {
    console.error('[fieldMapper] transformUserPush error:', err.message);
    return null;
  }
};

exports.transformUserPull = async (value, mapping, system, apiConfigId = null) => {
  if (value === null || value === undefined || value === '') return null;
  if (!system) return value;
  const ext = String(value).trim();
  if (!ext) return null;
  try {
    let personnelId = ext;
    if (apiConfigId) {
      try {
        const maps = await getOneOfficeUserMaps(apiConfigId);
        if (maps.personnelByApiId[ext]) personnelId = maps.personnelByApiId[ext];
      } catch (err) {
        console.warn('[fieldMapper] khong lay duoc danh sach user he ngoai (pull), dung gia tri goc:', err.message);
      }
    }
    const found = await adminUserService.findUserByExternal(system, personnelId);
    if (!found) return null;
    return { id: Number(found.user_id) };
  } catch (err) {
    console.error('[fieldMapper] transformUserPull error:', err.message);
    return null;
  }
};
