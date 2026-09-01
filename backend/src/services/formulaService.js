const { create, all } = require('mathjs');
const math = create(all);

const customFunctions = {
  ROUNDUP: (x, d = 0) => Math.ceil(x * Math.pow(10, d)) / Math.pow(10, d),
  ROUNDDOWN: (x, d = 0) => Math.floor(x * Math.pow(10, d)) / Math.pow(10, d),
  MOD: (a, b) => a % b,
  IF: (condition, trueVal, falseVal) => condition ? trueVal : falseVal,
  AND: (...args) => args.every(Boolean),
  OR: (...args) => args.some(Boolean),
  NOT: (x) => !x,
  IFERROR: (val, fallback) => {
    if (val === null || val === undefined || isNaN(val) || val === Infinity) return fallback;
    return val;
  },
  COUNT: (...args) => args.filter(v => v !== null && v !== undefined && !isNaN(v)).length,
  COUNTA: (...args) => args.filter(v => v !== null && v !== undefined && v !== '').length,
  COUNTIF: (arr, criteria) => {
    if (!Array.isArray(arr)) return 0;
    return arr.filter(v => v === criteria).length;
  },
  SUMIF: (arr, criteria) => {
    if (!Array.isArray(arr)) return 0;
    return arr.filter(v => v === criteria).reduce((s, v) => s + (Number(v) || 0), 0);
  },
  AVERAGE: (...args) => {
    const nums = args.flat().filter(v => v !== null && v !== undefined && !isNaN(v));
    if (nums.length === 0) return 0;
    return nums.reduce((s, v) => s + Number(v), 0) / nums.length;
  },
  CONCAT: (...args) => args.map(v => v ?? '').join(''),
  LEN: (s) => String(s ?? '').length,
  LEFT: (s, n = 1) => String(s ?? '').substring(0, n),
  RIGHT: (s, n = 1) => { const str = String(s ?? ''); return str.substring(str.length - n); },
  UPPER: (s) => String(s ?? '').toUpperCase(),
  LOWER: (s) => String(s ?? '').toLowerCase(),
  TRIM: (s) => String(s ?? '').trim(),
  DATE: (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
  TODAY: () => new Date().toISOString().split('T')[0],
  LPAD: (s, len, ch = '0') => String(s ?? '').padStart(len, ch),
  RPAD: (s, len, ch = ' ') => String(s ?? '').padEnd(len, ch),
  YEAR: (d) => new Date(d).getFullYear(),
  MONTH: (d) => new Date(d).getMonth() + 1,
  DAY: (d) => new Date(d).getDate(),
  NOW: () => new Date().toISOString(),
};

math.import(customFunctions, { override: false });

exports.customFunctions = customFunctions;

exports.validateFormula = (expression, availableFields = []) => {
  if (!expression || typeof expression !== 'string') {
    return { valid: false, error: 'Công thức không được để trống' };
  }

  try {
    const node = math.parse(expression);
    const symbols = new Set();
    node.traverse(n => {
      if (n.isSymbolNode && !customFunctions[n.name.toUpperCase()]) {
        symbols.add(n.name);
      }
    });

    const fieldKeys = new Set(availableFields.map(f => f.key));
    const unknown = [...symbols].filter(s => !fieldKeys.has(s));
    if (unknown.length > 0) {
      return { valid: false, error: `Trường không tồn tại: ${unknown.join(', ')}` };
    }

    return { valid: true, symbols: [...symbols] };
  } catch (err) {
    return { valid: false, error: `Lỗi cú pháp: ${err.message}` };
  }
};

exports.evaluateFormula = (expression, scope = {}) => {
  try {
    return math.evaluate(expression, scope);
  } catch {
    return null;
  }
};

exports.evaluatePostFormula = (expression, metadata = {}) => {
  let expr = expression;
  expr = expr.replace(/\bid\b/g, String(metadata.id ?? ''));
  expr = expr.replace(/\bentity\b/g, `'${metadata.entity || ''}'`);
  expr = expr.replace(/\bbase_url\b/g, `'${metadata.base_url || ''}'`);
  expr = expr.replace(/\bcreated_at\b/g, `'${metadata.created_at || ''}'`);
  expr = expr.replace(/\buser_id\b/g, String(metadata.user_id ?? ''));
  expr = expr.replace(/\buser_email\b/g, `'${metadata.user_email || ''}'`);

  try {
    return math.evaluate(expr);
  } catch {
    return null;
  }
};
