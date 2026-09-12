const pool = require('../utils/db');
const apiConfigService = require('./apiConfigService');

let fieldCache = null;
let fieldCacheTime = 0;
const CACHE_TTL = 60000;

async function getFieldMap() {
  const now = Date.now();
  if (fieldCache && now - fieldCacheTime < CACHE_TTL) return fieldCache;

  const [rows] = await pool.query(
    'SELECT `key`, label, type FROM field_definitions WHERE status = ?',
    ['active']
  );
  fieldCache = {};
  for (const row of rows) {
    fieldCache[row.key] = { label: row.label || row.key, type: row.type || 'text' };
  }
  fieldCacheTime = now;
  return fieldCache;
}

exports.clearCache = () => { fieldCache = null; fieldCacheTime = 0; };

exports.render = async (proposal, apiConfigId) => {
  const template = await apiConfigService.getDescTemplate(apiConfigId);
  if (!template || !template.sections || template.sections.length === 0) {
    return proposal.description || '';
  }

  const fieldMap = await getFieldMap();

  let html = '';
  for (const section of template.sections) {
    if (section.condition) {
      const value = getFieldValue(proposal, section.condition.field);
      if (!evaluateCondition(value, section.condition.operator, section.condition.value)) {
        continue;
      }
    }
    html += renderSection(section, proposal, fieldMap);
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
  if (!templateConfig) return { valid: true, errors: [] };
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

function getFieldLabel(fieldKey, fieldMap) {
  if (fieldMap[fieldKey]) return fieldMap[fieldKey].label;
  return fieldKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getFieldTypeInfo(fieldKey, fieldMap) {
  if (fieldMap[fieldKey]) return fieldMap[fieldKey].type;
  return 'text';
}

function renderSection(section, proposal, fieldMap) {
  const title = section.title || '';
  const emoji = section.emoji || '📋';
  const color = section.color || '#e74c3c';
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
    html += render2ColLayout(fields, proposal, fieldMap);
  } else if (layout === 'table') {
    html += renderTableLayout(fields, proposal, fieldMap, color);
  } else {
    html += render1ColLayout(fields, proposal, fieldMap);
  }

  if (isCollapsible) {
    html += `</details>`;
  }

  return html;
}

const TD_LABEL = 'width:35%;font-weight:600;background:#fafafa;border:1px solid #ddd;padding:6px 10px;vertical-align:top;overflow-wrap:anywhere;word-break:break-word';
const TD_VALUE = 'border:1px solid #ddd;padding:6px 10px;vertical-align:top;overflow-wrap:anywhere;word-break:break-word';

function render2ColLayout(fields, proposal, fieldMap) {
  let html = `<table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:13px"><tbody>`;
  for (const key of fields) {
    const raw = getFieldValue(proposal, key);
    const label = getFieldLabel(key, fieldMap);
    const value = formatFieldValue(key, raw, fieldMap) || '<span style="color:#aaa">—</span>';
    html += `<tr><td style="${TD_LABEL}">${escapeHtml(label)}</td><td style="${TD_VALUE}">${value}</td></tr>`;
  }
  html += `</tbody></table>`;
  return html;
}

function render1ColLayout(fields, proposal, fieldMap) {
  return render2ColLayout(fields, proposal, fieldMap);
}

function renderTableLayout(fields, proposal, fieldMap, color) {
  if (fields.length === 0) return '';

  let html = `<div style="overflow-x:auto;max-width:100%;-webkit-overflow-scrolling:touch">`;
  html += `<table style="width:100%;border-collapse:collapse;border:1px solid #ddd;font-size:13px;margin-bottom:12px">`;
  html += `<thead><tr style="background:${color};color:white">`;
  for (const fieldKey of fields) {
    const label = getFieldLabel(fieldKey, fieldMap);
    html += `<th style="padding:8px 10px;border:1px solid rgba(255,255,255,0.3);text-align:left;font-weight:600">${escapeHtml(label)}</th>`;
  }
  html += `</tr></thead><tbody>`;

  const dataRows = getFieldArrayValue(proposal, fields[0]);
  if (Array.isArray(dataRows) && dataRows.length > 0) {
    for (const row of dataRows) {
      html += `<tr>`;
      for (const fieldKey of fields) {
        const raw = row[fieldKey] !== undefined ? row[fieldKey] : null;
        const value = formatFieldValue(fieldKey, raw, fieldMap);
        html += `<td style="padding:6px 10px;border:1px solid #ddd;word-break:break-word;overflow-wrap:anywhere">${value || '—'}</td>`;
      }
      html += `</tr>`;
    }
  } else {
    html += `<tr>`;
    for (const fieldKey of fields) {
      const raw = getFieldValue(proposal, fieldKey);
      const value = formatFieldValue(fieldKey, raw, fieldMap);
      html += `<td style="padding:6px 10px;border:1px solid #ddd;word-break:break-word;overflow-wrap:anywhere">${value || '—'}</td>`;
    }
    html += `</tr>`;
  }

  html += `</tbody></table>`;
  html += `</div>`;
  return html;
}

function formatFieldValue(fieldKey, value, fieldMap) {
  if (value === null || value === undefined || value === '') return null;

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (typeof value.label === 'string' && value.label) return escapeHtml(value.label);
    if (value.id !== undefined && Object.keys(value).every(k => k === 'id' || k === 'label')) {
      return escapeHtml(`User #${value.id}`);
    }
  }

  const type = getFieldTypeInfo(fieldKey, fieldMap);

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
        return `${day}/${month}/${d.getFullYear()}`;
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
        return `${day}/${month}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
      try { items = Array.isArray(value) ? value : JSON.parse(value); } catch { items = String(value).split(',').map(s => s.trim()); }
      if (!Array.isArray(items) || items.length === 0) return null;
      return items.map(item =>
        `<span style="background:#e8f4f8;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:500;color:#2c3e50;margin-right:4px">${escapeHtml(String(item))}</span>`
      ).join(' ');
    }
    case 'textarea': {
      const text = String(value);
      if (text.length <= 100) return escapeHtml(text);
      return `<div style="line-height:1.6;color:#333">${escapeHtml(text)}</div>`;
    }
    case 'user': {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (value.label) return escapeHtml(String(value.label));
        const uid = value.id ?? value.user_id;
        const n = Number(uid);
        if (Number.isInteger(n) && n > 0) return escapeHtml(`User #${n}`);
        return null;
      }
      const n = Number(value);
      if (Number.isInteger(n) && n > 0) return escapeHtml(`User #${n}`);
      return escapeHtml(String(value));
    }
    default:
      return escapeHtml(String(value));
  }
}

function getFieldArrayValue(proposal, fieldKey) {
  if (proposal[fieldKey] && Array.isArray(proposal[fieldKey])) return proposal[fieldKey];
  if (proposal.custom_data) {
    const customData = typeof proposal.custom_data === 'string' ? JSON.parse(proposal.custom_data) : proposal.custom_data;
    if (customData[fieldKey] && Array.isArray(customData[fieldKey])) return customData[fieldKey];
  }
  return null;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
