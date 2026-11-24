const Docxtemplater = require('docxtemplater');
const { SYSTEM_DATE_TOKENS } = require('./documentSystemTokens');

const INPUT_TYPES = ['text', 'textarea', 'number', 'date'];
const invalid = (message) => Object.assign(new Error(message), { statusCode: 400 });
const safeKey = (key) => /^[a-zA-Z0-9_.]+$/.test(key)
  && !key.split('.').some((part) => ['__proto__', 'prototype', 'constructor', ''].includes(part));

const normalizeInput = (field, value) => {
  if (typeof value !== 'string' || value.length > 10000) throw invalid(`${field.label}: dữ liệu không hợp lệ`);
  if (field.type === 'number' && value.trim() !== '' && !Number.isFinite(Number(value))) {
    throw invalid(`${field.label}: số không hợp lệ`);
  }
  if (field.type === 'date' && value !== '') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const date = match && new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (!date || date.toISOString().slice(0, 10) !== value) throw invalid(`${field.label}: ngày không hợp lệ`);
  }
  return field.type === 'number' && value.trim() !== '' ? Number(value) : value;
};

const getInputFields = (mapping = {}) => Object.entries(mapping.tokens || {})
  .filter(([name, binding]) => !Object.hasOwn(SYSTEM_DATE_TOKENS, name) && binding?.source === 'input')
  .map(([key, binding]) => {
    if (!safeKey(key) || !INPUT_TYPES.includes(binding.type)
      || typeof binding.label !== 'string' || !binding.label.trim() || binding.label.length > 200
      || (binding.required !== undefined && typeof binding.required !== 'boolean')) {
      throw invalid(`Trường nhập BCĐX "${key}" chưa cấu hình hợp lệ`);
    }
    const field = { key, label: binding.label.trim(), type: binding.type, required: !!binding.required };
    const value = binding.defaultValue ?? '';
    normalizeInput(field, value);
    return { ...field, value };
  });

const validateInputs = (mapping, inputs = {}) => {
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) throw invalid('Dữ liệu nhập BCĐX không hợp lệ');
  const fields = getInputFields(mapping);
  const allowed = new Set(fields.map((field) => field.key));
  for (const key of Object.keys(inputs)) {
    if (!allowed.has(key)) throw invalid(`Trường nhập BCĐX không được phép: ${key}`);
  }
  return Object.fromEntries(fields.map((field) => [
    field.key, normalizeInput(field, Object.hasOwn(inputs, field.key) ? inputs[field.key] : field.value)
  ]));
};

const documentError = (cause) => {
  const errors = cause.properties?.errors || (cause.properties?.id ? [cause] : []);
  if (!errors.length) return cause;
  const details = errors.map((item) => {
    const props = item.properties || {};
    return `${props.explanation || item.message}${props.file ? ` (${props.file})` : ''}`;
  });
  return invalid(`Mẫu Word không hợp lệ: ${details.join('; ')}`);
};

const compileDocx = (zip, options = {}) => {
  try {
    return new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, errorLogging: false, ...options });
  } catch (cause) {
    throw documentError(cause);
  }
};

const renderDocument = ({ zip, data, mapping = {}, inputs = {} }) => {
  const warnings = new Set();
  const known = new Set([...Object.keys(mapping.tokens || {}), ...Object.keys(SYSTEM_DATE_TOKENS)]);
  const loopKeys = new Set(Object.keys(mapping.loops || {}));
  const configuredLoops = new Set();
  for (const [key, config] of Object.entries(mapping.loops || {})) {
    if (!config || typeof config !== 'object') throw invalid(`Bảng "${key}" chưa cấu hình hợp lệ`);
    if ((config.parts || []).some((part) => part.table || part.listId)
      || (config.source === 'field' && config.table)
      || (config.source === 'datalist' && config.listId)
      || (config.source === 'computed' && config.key)
      || config.source === 'fixed') configuredLoops.add(key);
    known.add(key);
    if (config.stt !== false) known.add('stt');
    Object.keys(config.columns || {}).forEach((name) => { if (config.columns[name]) known.add(name); });
    (config.parts || []).forEach((part) => Object.keys(part.columns || {}).forEach((name) => {
      if (part.columns[name]) known.add(name);
    }));
    Object.keys(config.scalars || {}).forEach((name) => known.add(name));
    (config.footers || []).forEach((footer) => {
      known.add(`${key}_f_${footer.id}_label`);
      known.add(`${key}_f_${footer.id}_value`);
    });
  }
  const missing = (name) => {
    const configured = known.has(name);
    warnings.add(`${configured ? 'Chưa có dữ liệu' : 'Chưa cấu hình'}: ${name}`);
    return `[${configured ? 'Chưa có dữ liệu' : 'Chưa cấu hình'}: ${name}]`;
  };
  const resolvedInputs = validateInputs(mapping, inputs);
  const doc = compileDocx(zip, {
    parser: (tag) => ({
      get: (scope) => {
        const key = tag.trim();
        if (key === '.') return scope;
        if (!safeKey(key) || !scope || !Object.hasOwn(scope, key)) return undefined;
        const value = scope[key];
        if (Array.isArray(value) && value.length === 0 && loopKeys.has(key)) {
          if (!configuredLoops.has(key)) {
            warnings.add(`Bảng chưa cấu hình: ${key}`);
            return [{}];
          }
          warnings.add(`Bảng chưa có dữ liệu: ${key}`);
        }
        return value === '' || value === null ? missing(key) : value;
      }
    }),
    nullGetter: (part) => {
      if (part.module === 'loop') {
        warnings.add(`${configuredLoops.has(part.value) ? 'Bảng chưa có dữ liệu' : 'Bảng chưa cấu hình'}: ${part.value}`);
        return [{}];
      }
      return missing(part.value);
    }
  });
  try {
    doc.render({ ...data, ...resolvedInputs });
  } catch (cause) {
    throw documentError(cause);
  }
  return { buffer: doc.getZip().generate({ type: 'nodebuffer' }), warnings: [...warnings] };
};

module.exports = { INPUT_TYPES, getInputFields, validateInputs, compileDocx, renderDocument };
