const { create, all } = require('mathjs');

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
};
math.import(customFunctions, { override: false });

const AGG = ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT'];
const KNOWN_FNS = new Set([
  ...AGG,
  'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'MOD', 'IF', 'AND', 'OR', 'NOT', 'IFERROR',
  'CONCAT', 'LEN', 'UPPER', 'LOWER', 'TRIM',
]);

exports.normalize = (expression, currentColKey = null) => {
  const key = String(currentColKey == null ? '' : currentColKey).replace(/"/g, '\\"');
  return String(expression || '')
    .replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)')
    .replace(/\b(SUM|AVG|MIN|MAX|COUNT)\b(?!\s*\()/g, (m) => `${m}("${key}")`)
    .replace(/\b(SUM|AVG|MIN|MAX|COUNT)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g, '$1("$2")');
};

exports.validate = (expression, columns = [], currentColKey = null) => {
  const raw = (expression || '').trim();
  if (!raw) return { valid: true, error: '' };
  const keys = new Set((columns || []).filter(Boolean));
  let node;
  try {
    node = math.parse(exports.normalize(raw, currentColKey));
  } catch {
    return { valid: false, error: 'Cú pháp không hợp lệ' };
  }
  let error = '';
  node.traverse((n) => {
    if (error) return;
    if (n.isSymbolNode && !AGG.includes(n.name) && !KNOWN_FNS.has(n.name)) {
      error = `Không nhận diện "${n.name}"`;
      return;
    }
    if (n.isFunctionNode) {
      const name = n.fn && n.fn.name;
      if (!KNOWN_FNS.has(name)) {
        error = `Hàm không hỗ trợ: ${name || '?'}`;
        return;
      }
      if (AGG.includes(name)) {
        const arg = n.args && n.args[0];
        if (arg && arg.isConstantNode && typeof arg.value === 'string' && arg.value !== '' && !keys.has(arg.value)) {
          error = `Không có cột "${arg.value}"`;
        }
      }
    }
  });
  return { valid: !error, error };
};

exports.columnAggregates = (rows, getNum) => {
  const values = (rows || []).map((r) => {
    const n = getNum(r);
    return typeof n === 'number' && isFinite(n) ? n : null;
  }).filter((v) => v !== null);
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    SUM: sum,
    AVG: values.length ? sum / values.length : 0,
    MIN: values.length ? Math.min(...values) : 0,
    MAX: values.length ? Math.max(...values) : 0,
    COUNT: values.length,
  };
};

exports.evaluate = (expression, aggregatesByCol, currentColKey = null) => {
  const expr = exports.normalize(expression, currentColKey);
  const scope = {};
  AGG.forEach((name) => {
    scope[name] = (key) => {
      const entry = aggregatesByCol[String(key)];
      return entry ? entry[name] : 0;
    };
  });
  const result = math.evaluate(expr, scope);
  return typeof result === 'number' ? result : String(result);
};
