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

const scalarFunctions = {
  ...customFunctions,
  SUM: (...values) => values.reduce((sum, value) => sum + value, 0),
  MIN: (...values) => Math.min(...values),
  MAX: (...values) => Math.max(...values),
  AVG: (...values) => values.reduce((sum, value) => sum + value, 0) / values.length
};
const invalidScalar = (message) => Object.assign(new Error(message), { statusCode: 400 });
const safeScalarKey = (key) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)
  && !['__proto__', 'prototype', 'constructor'].includes(key);

exports.scalarPlan = (mapping = {}) => {
  const entries = Object.entries(mapping.tokens || {});
  const available = new Set(entries.map(([name]) => name));
  const footerNames = new Set();
  for (const [loop, config] of Object.entries(mapping.loops || {})) {
    (config?.footers || []).forEach((footer) => {
      const name = `${loop}_f_${footer.id}_value`;
      available.add(name);
      footerNames.add(name);
    });
  }
  ['today_day', 'today_month', 'today_year'].forEach((name) => available.add(name));
  const formulas = new Map();
  for (const [name, binding] of entries.filter(([, value]) => value?.source === 'formula')) {
    if (!safeScalarKey(name) || Object.hasOwn(scalarFunctions, name) || footerNames.has(name)
      || ['today_day', 'today_month', 'today_year'].includes(name)
      || typeof binding.expression !== 'string' || !binding.expression.trim() || binding.expression.length > 1000
      || (binding.decimalPlaces !== undefined && (!Number.isInteger(binding.decimalPlaces) || binding.decimalPlaces < 0 || binding.decimalPlaces > 10))) {
      throw invalidScalar(`Công thức BCĐX "${name}" chưa cấu hình hợp lệ`);
    }
    let node;
    try {
      node = math.parse(binding.expression);
    } catch {
      throw invalidScalar(`Công thức BCĐX "${name}": cú pháp không hợp lệ`);
    }
    const dependencies = new Set();
    let count = 0;
    node.traverse((part, path, parent) => {
      if (++count > 200 || !['ConstantNode', 'SymbolNode', 'OperatorNode', 'ParenthesisNode', 'FunctionNode'].includes(part.type)) {
        throw invalidScalar(`Công thức BCĐX "${name}": biểu thức không được hỗ trợ`);
      }
      if (part.isOperatorNode && !['+', '-', '*', '/', '%', '^', '==', '!=', '<', '>', '<=', '>='].includes(part.op)) {
        throw invalidScalar(`Công thức BCĐX "${name}": toán tử không được hỗ trợ`);
      }
      if (part.isConstantNode && !['number', 'boolean'].includes(typeof part.value)) {
        throw invalidScalar(`Công thức BCĐX "${name}": chỉ hỗ trợ giá trị số`);
      }
      if (part.isFunctionNode && !Object.hasOwn(scalarFunctions, part.fn.name)) {
        throw invalidScalar(`Công thức BCĐX "${name}": hàm không hỗ trợ "${part.fn.name}"`);
      }
      if (part.isSymbolNode && !(parent?.isFunctionNode && path === 'fn')) {
        if (!safeScalarKey(part.name) || !available.has(part.name)) {
          throw invalidScalar(`Công thức BCĐX "${name}": không có token "${part.name}"`);
        }
        dependencies.add(part.name);
      }
    });
    formulas.set(name, { name, binding, dependencies: [...dependencies], node });
  }
  if (formulas.size > 128) throw invalidScalar('Mẫu có quá nhiều công thức BCĐX (tối đa 128)');
  const ordered = [];
  const visiting = new Set();
  const done = new Set();
  const visit = (name) => {
    if (done.has(name)) return;
    if (visiting.has(name)) throw invalidScalar(`Công thức BCĐX tham chiếu vòng tại "${name}"`);
    visiting.add(name);
    const formula = formulas.get(name);
    formula.dependencies.filter((key) => formulas.has(key)).forEach(visit);
    visiting.delete(name);
    done.add(name);
    ordered.push(formula);
  };
  formulas.forEach((_, name) => visit(name));
  return ordered;
};

exports.evaluateScalars = (mapping, numericValues) => {
  const scope = { ...scalarFunctions, ...numericValues };
  const raw = {};
  const display = {};
  const warnings = [];
  for (const { name, binding, dependencies, node } of exports.scalarPlan(mapping)) {
    const missing = dependencies.filter((key) => typeof scope[key] !== 'number' || !Number.isFinite(scope[key]));
    if (missing.length) {
      warnings.push(`Công thức "${name}": chưa có dữ liệu số cho ${missing.join(', ')}`);
      display[name] = '';
      continue;
    }
    let value;
    try {
      value = node.compile().evaluate({
        ...scalarFunctions,
        ...Object.fromEntries(dependencies.map((key) => [key, scope[key]]))
      });
    } catch (cause) {
      throw invalidScalar(`Công thức BCĐX "${name}": ${cause.message}`);
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw invalidScalar(`Công thức BCĐX "${name}": kết quả không hữu hạn hoặc không phải số; kiểm tra phép chia cho 0`);
    }
    scope[name] = value;
    raw[name] = value;
    display[name] = value.toLocaleString('vi-VN', {
      minimumFractionDigits: binding.decimalPlaces ?? 0,
      maximumFractionDigits: binding.decimalPlaces ?? 0
    });
  }
  return { raw, display, warnings };
};
