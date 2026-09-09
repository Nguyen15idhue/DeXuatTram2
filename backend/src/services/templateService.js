const pool = require('../utils/db');
const apiConfigService = require('./apiConfigService');

const FIELD_LABELS = {
  tracking_code: 'Mã đề xuất',
  ma_de_xuat: 'Mã đề xuất',
  owner_name: 'Họ tên người đề xuất',
  owner_phone: 'Số điện thoại',
  so_dien_thoai: 'Số điện thoại liên hệ',
  owner_email: 'Email',
  email_lien_he: 'Email liên hệ',
  address: 'Địa chỉ',
  area: 'Diện tích (m²)',
  lat: 'Vĩ độ',
  latitude: 'Vĩ độ',
  lng: 'Kinh độ',
  longitude: 'Kinh độ',
  mo_hinh: 'Mô hình đầu tư',
  mo_hinh_dau_tu: 'Mô hình đầu tư',
  investment_cost: 'Chi phí đầu tư (VNĐ)',
  loai_tru: 'Loại trụ',
  description: 'Mô tả',
  land_type: 'Loại đất',
  price: 'Đơn giá (VNĐ/m²)',
  total_area: 'Tổng diện tích (m²)',
  status: 'Trạng thái',
  created_at: 'Ngày tạo',
  updated_at: 'Ngày cập nhật',
  user_id: 'Người tạo',
  contact_1office_code: 'Mã 1Office',
  nguoi_dai_dien: 'Người đại diện',
  lk_nguoi_dai_dien: 'Người đại diện',
  ten_chu_dau_tu: 'Tên chủ đầu tư',
  quoc_gia: 'Quốc gia',
  tinh_thanh: 'Tỉnh/Thành phố',
  quan_huyen: 'Quận/Huyện',
  phuong_xa: 'Phường/Xã',
  so_nha: 'Số nhà',
  ten_duong: 'Tên đường',
  chieu_dai: 'Chiều dài (m)',
  chieu_rong: 'Chiều rộng (m)',
  dien_tich_dat: 'Diện tích đất (m²)',
  dien_tich_xay_dung: 'Diện tích xây dựng (m²)',
  so_tang: 'Số tầng',
  loai_hinh_su_dung: 'Loại hình sử dụng',
  hinh_thuc_so_huu: 'Hình thức sở hữu',
  trang_thai_dat: 'Trạng thái đất',
  muc_dich_su_dung: 'Mục đích sử dụng',
  ghi_chu: 'Ghi chú',
  ly_do: 'Lý do đề xuất',
  muc_tieu: 'Mục tiêu',
  doi_tuong_khach: 'Đối tượng khách hàng',
  phuong_thuc_quang_bao: 'Phương thức quảng bao',
  ngay_bat_dau: 'Ngày bắt đầu',
  ngay_ket_thuc: 'Ngày kết thúc',
  thoi_gian_du_kien: 'Thời gian dự kiến',
  tong_dau_tu: 'Tổng đầu tư (VNĐ)',
  nguon_von: 'Nguồn vốn',
  ti_le_von: 'Tỷ lệ vốn (%)',
  quy_mo: 'Quy mô',
  loai_tram: 'Loại trạm',
  cong_suat: 'Công suất (kW)',
  so_cong: 'Số cổng sạc',
  loai_cong: 'Loại cổng sạc',
  diem_dau: 'Điểm đầu',
  diem_cuoi: 'Điểm cuối',
  quang_duong: 'Quãng đường (km)',
  so_luong_tram: 'Số lượng trạm',
  vi_tri: 'Vị trí',
  khu_vuc: 'Khu vực',
  vung: 'Vùng',
  mien: 'Miền'
};

const FIELD_EMOJIS = {
  tracking_code: '📋', owner_name: '👤', owner_phone: '📞', owner_email: '✉️',
  address: '📍', area: '📐', lat: '🌐', lng: '🌐',
  investment_cost: '💰', loai_tru: '🔌', mo_hinh: '🏢',
  description: '📝', land_type: '🏗️', price: '💵',
  nguoi_dai_dien: '👤', so_dien_thoai: '📞', email_lien_he: '✉️',
  ten_chu_dau_tu: '🏢', tinh_thanh: '🏙️', quan_huyen: '🏘️',
  cong_suat: '⚡', so_cong: '🔌', loai_tram: '🏭',
  tong_dau_tu: '💰', nguon_von: '🏦', quang_duong: '🛣️'
};

const SECTION_COLORS = {
  default: '#e74c3c',
  blue: '#3498db',
  green: '#27ae60',
  orange: '#f39c12',
  purple: '#9b59b6'
};

exports.render = async (proposal, apiConfigId) => {
  const template = await apiConfigService.getDescTemplate(apiConfigId);
  if (!template || !template.sections || template.sections.length === 0) {
    return proposal.description || '';
  }

  let html = '';
  for (const section of template.sections) {
    if (section.condition) {
      const value = getFieldValue(proposal, section.condition.field);
      if (!evaluateCondition(value, section.condition.operator, section.condition.value)) {
        continue;
      }
    }
    html += renderSection(section, proposal);
  }
  return html;
};

exports.parseTemplate = (templateStr, data) => {
  if (!templateStr) return '';
  return templateStr.replace(/\{(\w+)\}/g, (match, key) => {
    return data[key] !== undefined && data[key] !== null ? String(data[key]) : '';
  });
};

exports.evaluateCondition = evaluateCondition;

exports.renderSection = renderSection;

exports.validateTemplate = (templateConfig) => {
  const errors = [];
  if (!templateConfig) {
    return { valid: true, errors: [] };
  }
  if (!templateConfig.sections || !Array.isArray(templateConfig.sections)) {
    errors.push('sections phải là một array');
    return { valid: false, errors };
  }
  for (const section of templateConfig.sections) {
    if (!section.id) errors.push('Section thiếu id');
    if (!section.title) errors.push('Section thiếu title');
    if (!section.fields || !Array.isArray(section.fields)) {
      errors.push(`Section "${section.id}" thiếu fields array`);
    }
    if (section.condition) {
      if (!section.condition.field) errors.push(`Section "${section.id}" condition thiếu field`);
      if (!section.condition.operator) errors.push(`Section "${section.id}" condition thiếu operator`);
    }
  }
  return { valid: errors.length === 0, errors };
};

function getFieldValue(proposal, fieldKey) {
  if (proposal[fieldKey] !== undefined) return proposal[fieldKey];
  if (proposal.custom_data) {
    const customData = typeof proposal.custom_data === 'string'
      ? JSON.parse(proposal.custom_data)
      : proposal.custom_data;
    if (customData[fieldKey] !== undefined) return customData[fieldKey];
  }
  return null;
}

function evaluateCondition(value, operator, target) {
  if (value === null || value === undefined) {
    return operator === 'empty';
  }
  const strValue = String(value).toLowerCase();
  const strTarget = String(target).toLowerCase();
  switch (operator) {
    case '=':
    case '==':
      return strValue === strTarget;
    case '!=':
      return strValue !== strTarget;
    case 'contains':
      return strValue.includes(strTarget);
    case '>':
      return Number(value) > Number(target);
    case '<':
      return Number(value) < Number(target);
    case '>=':
      return Number(value) >= Number(target);
    case '<=':
      return Number(value) <= Number(target);
    case 'empty':
      return value === null || value === undefined || strValue === '';
    case 'not_empty':
      return value !== null && value !== undefined && strValue !== '';
    default:
      return false;
  }
}

function renderSection(section, proposal) {
  const title = section.title || '';
  const emoji = section.emoji || FIELD_EMOJIS[section.id] || '📋';
  const color = section.color || SECTION_COLORS.default;
  const layout = section.layout || '2col';
  const isCollapsible = section.collapsible || false;
  const defaultCollapsed = section.default_collapsed || false;

  const fields = section.fields || [];
  if (fields.length === 0) return '';

  let html = '';

  if (isCollapsible) {
    html += `<details${defaultCollapsed ? '' : ' open'} style="margin-bottom:16px">`;
    html += `<summary style="cursor:pointer;padding:8px 0;font-weight:600;font-size:14px">`;
  }

  html += `<div style="background:${color};color:white;padding:10px 16px;border-radius:6px 6px 0 0;margin-top:16px;font-size:15px;font-weight:600">`;
  html += `${escapeHtml(emoji)} ${escapeHtml(title)}`;
  html += `</div>`;

  if (isCollapsible) {
    html += `</summary>`;
  }

  if (layout === '2col') {
    html += render2ColLayout(fields, proposal, color);
  } else if (layout === 'table') {
    html += renderTableLayout(fields, proposal, color);
  } else {
    html += render1ColLayout(fields, proposal, color);
  }

  if (isCollapsible) {
    html += `</details>`;
  }

  return html;
}

function render2ColLayout(fields, proposal, color) {
  let html = `<table style="width:100%;border-collapse:collapse;border:1px solid #ddd;font-size:13px;margin-bottom:12px">`;

  for (let i = 0; i < fields.length; i += 2) {
    const key1 = fields[i];
    const key2 = fields[i + 1];

    const raw1 = getFieldValue(proposal, key1);
    const raw2 = key2 ? getFieldValue(proposal, key2) : null;

    const label1 = getFieldLabel(key1);
    const label2 = key2 ? getFieldLabel(key2) : null;

    const value1 = formatFieldValue(key1, raw1);
    const value2 = key2 ? formatFieldValue(key2, raw2) : null;

    html += `<tr>`;
    html += `<td style="padding:8px 10px;background:#f8f9fa;border:1px solid #ddd;font-weight:600;width:140px;vertical-align:top;white-space:nowrap">${escapeHtml(label1)}</td>`;
    html += `<td style="padding:8px 10px;border:1px solid #ddd;vertical-align:top;word-break:break-word">${value1 || '<span style="color:#aaa">—</span>'}</td>`;

    if (key2) {
      html += `<td style="padding:8px 10px;background:#f8f9fa;border:1px solid #ddd;font-weight:600;width:140px;vertical-align:top;white-space:nowrap">${escapeHtml(label2)}</td>`;
      html += `<td style="padding:8px 10px;border:1px solid #ddd;vertical-align:top;word-break:break-word">${value2 || '<span style="color:#aaa">—</span>'}</td>`;
    } else {
      html += `<td colspan="2" style="padding:8px 10px;border:1px solid #ddd;background:#fafafa"></td>`;
    }

    html += `</tr>`;
  }

  html += `</table>`;
  return html;
}

function render1ColLayout(fields, proposal, color) {
  let html = `<table style="width:100%;border-collapse:collapse;border:1px solid #ddd;font-size:13px;margin-bottom:12px">`;

  for (const fieldKey of fields) {
    const raw = getFieldValue(proposal, fieldKey);
    const label = getFieldLabel(fieldKey);
    const value = formatFieldValue(fieldKey, raw);

    html += `<tr>`;
    html += `<td style="padding:8px 10px;background:#f8f9fa;border:1px solid #ddd;font-weight:600;width:140px;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td>`;
    html += `<td style="padding:8px 10px;border:1px solid #ddd;vertical-align:top;word-break:break-word">${value || '<span style="color:#aaa">—</span>'}</td>`;
    html += `</tr>`;
  }

  html += `</table>`;
  return html;
}

function renderTableLayout(fields, proposal, color) {
  if (fields.length === 0) return '';

  let html = `<table style="width:100%;border-collapse:collapse;border:1px solid #ddd;font-size:13px;margin-bottom:12px">`;
  html += `<thead><tr style="background:${color};color:white">`;
  for (const fieldKey of fields) {
    const label = getFieldLabel(fieldKey);
    html += `<th style="padding:8px 10px;border:1px solid rgba(255,255,255,0.3);text-align:left;font-weight:600">${escapeHtml(label)}</th>`;
  }
  html += `</tr></thead>`;
  html += `<tbody>`;

  const dataRows = getFieldArrayValue(proposal, fields[0]);
  if (Array.isArray(dataRows) && dataRows.length > 0) {
    for (const row of dataRows) {
      html += `<tr>`;
      for (const fieldKey of fields) {
        const raw = row[fieldKey] !== undefined ? row[fieldKey] : null;
        const value = formatFieldValue(fieldKey, raw);
        html += `<td style="padding:6px 10px;border:1px solid #ddd;word-break:break-word">${value || '—'}</td>`;
      }
      html += `</tr>`;
    }
  } else {
    html += `<tr>`;
    for (const fieldKey of fields) {
      const raw = getFieldValue(proposal, fieldKey);
      const value = formatFieldValue(fieldKey, raw);
      html += `<td style="padding:6px 10px;border:1px solid #ddd;word-break:break-word">${value || '—'}</td>`;
    }
    html += `</tr>`;
  }

  html += `</tbody></table>`;
  return html;
}

function getFieldLabel(fieldKey) {
  if (FIELD_LABELS[fieldKey]) return FIELD_LABELS[fieldKey];
  return fieldKey
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function getFieldTypeInfo(fieldKey) {
  const map = {
    owner_phone: 'phone', so_dien_thoai: 'phone',
    owner_email: 'email', email_lien_he: 'email',
    investment_cost: 'number', price: 'number', area: 'number',
    total_area: 'number', dien_tich_dat: 'number', dien_tich_xay_dung: 'number',
    chieu_dai: 'number', chieu_rong: 'number', cong_suat: 'number',
    so_cong: 'number', so_tang: 'number', so_luong_tram: 'number',
    quang_duong: 'number', tong_dau_tu: 'number', ti_le_von: 'number',
    lat: 'number', lng: 'number',
    birthday: 'date', job_date: 'date', created_at: 'date', updated_at: 'date',
    ngay_bat_dau: 'date', ngay_ket_thuc: 'date',
    datetime: 'datetime',
    is_active: 'boolean',
    mo_hinh: 'select', status: 'select', loai_tru: 'select',
    loai_tram: 'select', loai_cong: 'select', land_type: 'select',
    tinh_thanh: 'select', quan_huyen: 'select', phuong_xa: 'select',
    quoc_gia: 'select', vung: 'select', mien: 'select', khu_vuc: 'select',
    loai_hinh_su_dung: 'select', hinh_thuc_so_huu: 'select',
    trang_thai_dat: 'select', nguon_von: 'select',
    multiselect: 'multiselect',
    textarea: 'textarea'
  };
  return map[fieldKey] || 'text';
}

function formatFieldValue(fieldKey, value) {
  if (value === null || value === undefined || value === '') return null;

  const type = getFieldTypeInfo(fieldKey);

  switch (type) {
    case 'phone': {
      const str = String(value).replace(/[^0-9]/g, '');
      if (str.length >= 9) {
        const formatted = str.replace(/(\d{4})(\d{3})(\d{3})/, '$1.$2.$3');
        return `<a href="tel:${str}" style="color:#3498db;text-decoration:none">${formatted}</a>`;
      }
      return escapeHtml(String(value));
    }
    case 'email':
      return `<a href="mailto:${escapeHtml(String(value))}" style="color:#3498db;text-decoration:none">${escapeHtml(String(value))}</a>`;
    case 'number': {
      const num = Number(value);
      if (isNaN(num)) return escapeHtml(String(value));
      return `<span style="font-family:monospace">${num.toLocaleString('vi-VN')}</span>`;
    }
    case 'date': {
      try {
        const d = new Date(value);
        if (isNaN(d.getTime())) return escapeHtml(String(value));
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
      } catch {
        return escapeHtml(String(value));
      }
    }
    case 'datetime': {
      try {
        const d = new Date(value);
        if (isNaN(d.getTime())) return escapeHtml(String(value));
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hour = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year} ${hour}:${min}`;
      } catch {
        return escapeHtml(String(value));
      }
    }
    case 'boolean':
      return value
        ? '<span style="color:#27ae60;font-weight:600">✓ Có</span>'
        : '<span style="color:#e74c3c">✗ Không</span>';
    case 'select':
      return `<span style="background:#e8f4f8;padding:3px 10px;border-radius:4px;font-size:12px;font-weight:500;color:#2c3e50">${escapeHtml(String(value))}</span>`;
    case 'multiselect': {
      let items;
      try {
        items = Array.isArray(value) ? value : JSON.parse(value);
      } catch {
        items = String(value).split(',').map(s => s.trim());
      }
      if (!Array.isArray(items) || items.length === 0) return null;
      const badges = items.map(item =>
        `<span style="background:#e8f4f8;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:500;color:#2c3e50;margin-right:4px">${escapeHtml(String(item))}</span>`
      ).join(' ');
      return badges;
    }
    case 'textarea': {
      const text = String(value);
      if (text.length <= 100) return escapeHtml(text);
      return `<div style="line-height:1.6;color:#333">${escapeHtml(text)}</div>`;
    }
    default:
      return escapeHtml(String(value));
  }
}

function getFieldArrayValue(proposal, fieldKey) {
  if (proposal[fieldKey] && Array.isArray(proposal[fieldKey])) {
    return proposal[fieldKey];
  }
  if (proposal.custom_data) {
    const customData = typeof proposal.custom_data === 'string'
      ? JSON.parse(proposal.custom_data)
      : proposal.custom_data;
    if (customData[fieldKey] && Array.isArray(customData[fieldKey])) {
      return customData[fieldKey];
    }
  }
  return null;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
