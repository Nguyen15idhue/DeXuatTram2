const pool = require('../utils/db');
const apiConfigService = require('./apiConfigService');

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
  const isCollapsible = section.collapsible || false;
  const defaultCollapsed = section.default_collapsed || false;

  let html = '';
  if (isCollapsible) {
    html += `<details${defaultCollapsed ? '' : ' open'}>`;
    html += `<summary><h3>${escapeHtml(title)}</h3></summary>`;
  } else {
    html += `<h3>${escapeHtml(title)}</h3>`;
  }
  html += '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">';
  for (const fieldKey of section.fields) {
    const value = getFieldValue(proposal, fieldKey);
    const displayValue = value !== null && value !== undefined ? String(value) : '';
    const rowIndex = section.fields.indexOf(fieldKey);
    if (rowIndex % 2 === 1) {
      html += `<tr style="background:#f5f5f5">`;
    } else {
      html += `<tr>`;
    }
    html += `<td><b>${escapeHtml(fieldKey)}</b></td><td>${escapeHtml(displayValue)}</td>`;
    html += '</tr>';
  }
  html += '</table>';
  if (isCollapsible) {
    html += '</details>';
  }
  return html;
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
