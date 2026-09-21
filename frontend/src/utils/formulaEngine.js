import { create, all } from 'mathjs';
import { parseFormattedNumber } from './formatNumber';

export const math = create(all);

const customFunctions = {
  ROUNDUP: (x, d = 0) => Math.ceil(x * Math.pow(10, d)) / Math.pow(10, d),
  ROUNDDOWN: (x, d = 0) => Math.floor(x * Math.pow(10, d)) / Math.pow(10, d),
  MOD: (a, b) => a % b,
  IF: (condition, trueVal, falseVal) => (condition ? trueVal : falseVal),
  AND: (...args) => args.every(Boolean),
  OR: (...args) => args.some(Boolean),
  NOT: (x) => !x,
  IFERROR: (val, fallback) => (val === null || val === undefined || isNaN(val) || val === Infinity) ? fallback : val,
  COUNT: (...args) => args.filter(v => v !== null && v !== undefined && !isNaN(v)).length,
  COUNTA: (...args) => args.filter(v => v !== null && v !== undefined && v !== '').length,
  AVERAGE: (...args) => { const nums = args.flat().filter(v => v !== null && v !== undefined && !isNaN(v)); return nums.length === 0 ? 0 : nums.reduce((s, v) => s + Number(v), 0) / nums.length; },
  TABLE_SUM: (arr) => { if (!Array.isArray(arr)) return 0; return arr.reduce((s, v) => s + (Number(v) || 0), 0); },
  TABLE_AVG: (arr) => { if (!Array.isArray(arr)) return 0; const nums = arr.filter(v => v !== null && v !== undefined && !isNaN(v)); return nums.length === 0 ? 0 : nums.reduce((s, v) => s + Number(v), 0) / nums.length; },
  TABLE_MIN: (arr) => { if (!Array.isArray(arr) || arr.length === 0) return 0; const nums = arr.filter(v => v !== null && v !== undefined && !isNaN(v)).map(Number); return nums.length === 0 ? 0 : Math.min(...nums); },
  TABLE_MAX: (arr) => { if (!Array.isArray(arr) || arr.length === 0) return 0; const nums = arr.filter(v => v !== null && v !== undefined && !isNaN(v)).map(Number); return nums.length === 0 ? 0 : Math.max(...nums); },
  TABLE_COUNT: (arr) => { if (!Array.isArray(arr)) return 0; return arr.filter(v => v !== null && v !== undefined && v !== '').length; },
  CONCAT: (...args) => args.map(v => v ?? '').join(''),
  LEN: (s) => String(s ?? '').length,
  LEFT: (s, n = 1) => String(s ?? '').substring(0, n),
  RIGHT: (s, n = 1) => { const str = String(s ?? ''); return str.substring(str.length - n); },
  UPPER: (s) => String(s ?? '').toUpperCase(),
  LOWER: (s) => String(s ?? '').toLowerCase(),
  TRIM: (s) => String(s ?? '').trim(),
  LPAD: (s, len, ch = '0') => String(s ?? '').padStart(len, ch),
  RPAD: (s, len, ch = ' ') => String(s ?? '').padEnd(len, ch),
  YEAR: (d) => new Date(d).getFullYear(),
  MONTH: (d) => new Date(d).getMonth() + 1,
  DAY: (d) => new Date(d).getDate(),
  TODAY: () => new Date().toISOString().split('T')[0],
  NOW: () => new Date().toISOString(),
  DATE: (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
};
math.import(customFunctions, { override: false });

export const parseSourceConfig = (val) => {
  if (!val) return {};
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return {}; }
};

export const buildFormulaScope = (fields, formData, excludeKey) => {
  const scope = {};
  (fields || []).forEach(f => {
    if (!f || !f.key || f.key === excludeKey || f.type === 'password') return;
    const val = formData[f.key];
    if (f.type === 'table') {
      const rows = Array.isArray(val) ? val : [];
      const columns = parseSourceConfig(f.source_config).columns || [];
      const nested = {};
      for (const col of columns) {
        const colValues = rows.map(r => (r ? r[col.key] ?? '' : ''));
        scope[`${f.key}.${col.key}`] = colValues;
        nested[col.key] = colValues;
      }
      scope[f.key] = nested;
      return;
    }
    if (val === undefined || val === '' || val === null) return;
    if (f.type === 'number' || f.type === 'formula') {
      const num = typeof val === 'number' ? val : parseFormattedNumber(val);
      scope[f.key] = isNaN(num) ? 0 : num;
    } else {
      scope[f.key] = val;
    }
  });
  return scope;
};

export const computeFormulaValue = (field, fields, formData) => {
  const fc = field && field.formula_config;
  if (!fc || !fc.expression) return '';
  if (fc.compute_mode === 'post') return '';
  try {
    const scope = buildFormulaScope(fields, formData, field.key);
    const result = math.evaluate(fc.expression, scope);
    if (result === null || result === undefined) return '';
    if (typeof result === 'number' && !isFinite(result)) return '';
    return result;
  } catch {
    return '';
  }
};
