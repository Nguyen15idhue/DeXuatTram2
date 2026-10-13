import { create, all } from 'mathjs';
import { formatNumber } from './formatNumber';

const math = create(all);
const customFunctions = {
  ROUNDUP: (x, d = 0) => Math.ceil(x * Math.pow(10, d)) / Math.pow(10, d),
  ROUNDDOWN: (x, d = 0) => Math.floor(x * Math.pow(10, d)) / Math.pow(10, d),
  MOD: (a, b) => a % b,
  IF: (cond, t, f) => cond ? t : f,
  AND: (...args) => args.every(Boolean),
  OR: (...args) => args.some(Boolean),
  NOT: (v) => !v,
  IFERROR: (v, fallback) => { try { return v; } catch { return fallback; } },
  ROUND: (x, d = 0) => { const f = Math.pow(10, d); return Math.round(x * f) / f; },
  CONCAT: (...args) => args.join(''),
  LEN: (s) => String(s ?? '').length,
  UPPER: (s) => String(s ?? '').toUpperCase(),
  LOWER: (s) => String(s ?? '').toLowerCase(),
  TRIM: (s) => String(s ?? '').trim(),
  LPAD: (s, len, ch = '0') => String(s ?? '').padStart(len, ch),
  RPAD: (s, len, ch = ' ') => String(s ?? '').padEnd(len, ch),
};
math.import(customFunctions, { override: false });

export const FOOTER_AGG_NAMES = ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT'];

export const FOOTER_DEFAULT_LABELS = { SUM: 'Tổng', AVG: 'TB', MIN: 'Min', MAX: 'Max', COUNT: 'Đếm' };

export const FOOTER_FUNCTION_HELP =
  'SUM/AVG/MIN/MAX/COUNT = cột này; SUM(cot_khac)/AVG(cot_khac)... = cột khác; hỗ trợ %, +, -, *, /, IF, ROUND.';

export const FOOTER_KNOWN_FUNCTIONS = [
  ...FOOTER_AGG_NAMES,
  'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'MOD', 'IF', 'AND', 'OR', 'NOT', 'IFERROR',
  'CONCAT', 'LEN', 'UPPER', 'LOWER', 'TRIM', 'LPAD', 'RPAD',
];

export const normalizeFooterExpression = (expression, currentColKey = null) => {
  const key = String(currentColKey == null ? '' : currentColKey).replace(/"/g, '\\"');
  return String(expression || '')
    .replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)')
    .replace(/\b(SUM|AVG|MIN|MAX|COUNT)\b(?!\s*\()/g, (m) => `${m}("${key}")`)
    .replace(/\b(SUM|AVG|MIN|MAX|COUNT)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g, '$1("$2")');
};

export const buildFooterSuggestions = (columns = []) => {
  const items = FOOTER_AGG_NAMES.map((fn) => ({
    label: fn,
    insert: fn,
    detail: FOOTER_DEFAULT_LABELS[fn],
  }));
  (columns || []).forEach((c) => {
    if (!c || !c.key) return;
    FOOTER_AGG_NAMES.forEach((fn) => {
      items.push({ label: `${fn}(${c.key})`, insert: `${fn}(${c.key})`, detail: c.label || c.key });
    });
  });
  return items;
};

export const validateFooterFormula = (expression, columns = [], currentColKey = null) => {
  const raw = (expression || '').trim();
  if (!raw) return { valid: true, error: '' };
  const knownFn = new Set(FOOTER_KNOWN_FUNCTIONS);
  const keys = new Set((columns || []).map((c) => c && c.key).filter(Boolean));
  let node;
  try {
    node = math.parse(normalizeFooterExpression(raw, currentColKey));
  } catch {
    return { valid: false, error: 'Cú pháp không hợp lệ' };
  }
  let error = '';
  node.traverse((n) => {
    if (error) return;
    if (n.isSymbolNode && !FOOTER_AGG_NAMES.includes(n.name) && !knownFn.has(n.name)) {
      error = `Không nhận diện "${n.name}". Dùng SUM/AVG/MIN/MAX/COUNT hoặc SUM(cot).`;
      return;
    }
    if (n.isFunctionNode) {
      const name = n.fn && n.fn.name;
      if (!knownFn.has(name)) {
        error = `Hàm không hỗ trợ: ${name || '?'}`;
        return;
      }
      if (FOOTER_AGG_NAMES.includes(name)) {
        const arg = n.args && n.args[0];
        if (arg && arg.isConstantNode && typeof arg.value === 'string' && arg.value !== '' && !keys.has(arg.value)) {
          error = `Không có cột "${arg.value}"`;
        }
      }
    }
  });
  return { valid: !error, error };
};

const toNumber = (raw) => {
  if (raw === '' || raw === null || raw === undefined) return null;
  const n = typeof raw === 'number' ? raw : parseFloat(raw);
  return isNaN(n) ? null : n;
};

export const computeColumnAggregates = (columns, rows, getCellValue) => {
  const agg = {};
  (columns || []).forEach((col) => {
    const values = (rows || []).map((r) => toNumber(getCellValue(col, r))).filter((v) => v !== null);
    const sum = values.reduce((a, b) => a + b, 0);
    agg[col.key] = {
      SUM: sum,
      AVG: values.length ? sum / values.length : 0,
      MIN: values.length ? Math.min(...values) : 0,
      MAX: values.length ? Math.max(...values) : 0,
      COUNT: values.length,
    };
  });
  return agg;
};

export const getFooterConfig = (col) => {
  const expression = col && col.footer_formula ? String(col.footer_formula).trim() : '';
  if (!expression) return null;
  const legacy = FOOTER_AGG_NAMES.includes(expression.toUpperCase()) ? expression.toUpperCase() : null;
  const label = (col.footer_label && String(col.footer_label).trim())
    || (legacy ? FOOTER_DEFAULT_LABELS[legacy] : '');
  return { expression, legacy, label, colKey: col.key };
};

export const hasFooter = (columns) => (columns || []).some((col) => getFooterConfig(col));

export const computeFooterValue = (col, columns, rows, getCellValue) => {
  const cfg = getFooterConfig(col);
  if (!cfg) return '';
  try {
    const agg = computeColumnAggregates(columns, rows, getCellValue);
    if (cfg.legacy) {
      return agg[col.key] ? agg[col.key][cfg.legacy] : 0;
    }
    const expr = normalizeFooterExpression(cfg.expression, col.key);
    const scope = {};
    FOOTER_AGG_NAMES.forEach((name) => {
      scope[name] = (key) => {
        const entry = agg[String(key)];
        return entry ? entry[name] : 0;
      };
    });
    const result = math.evaluate(expr, scope);
    return typeof result === 'number' ? result : String(result);
  } catch {
    return '#ERR';
  }
};

export const formatFooterValue = (value, col) => {
  if (typeof value === 'number' && isFinite(value)) {
    return formatNumber(value, {
      format: (col && col.display_format) || 'plain',
      decimalPlaces: col && col.decimal_places,
      unit: col && col.unit,
    });
  }
  return value === null || value === undefined ? '' : String(value);
};
