const { create, all } = require('mathjs');
const math = create(all);
const pool = require('../utils/db');

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

const DB_FUNCTIONS = new Set(['SEQ']);

exports.validateFormula = (expression, availableFields = []) => {
  if (!expression || typeof expression !== 'string') {
    return { valid: false, error: 'Công thức không được để trống' };
  }

  try {
    const node = math.parse(expression);
    const symbols = new Set();
    const funcNames = new Set();
    node.traverse(n => {
      if (n.isFunctionNode && n.fn && n.fn.name) funcNames.add(n.fn.name);
      if (n.isSymbolNode && !customFunctions[n.name.toUpperCase()] && !DB_FUNCTIONS.has(n.name.toUpperCase())) {
        symbols.add(n.name);
      }
    });

    const fieldKeys = new Set(availableFields.map(f => f.key));
    const unknown = [...symbols].filter(s => !fieldKeys.has(s) && !funcNames.has(s) && !POST_METADATA.has(s));
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
  const scope = exports.buildPostScope(metadata, {});
  try {
    return math.evaluate(expression, scope);
  } catch {
    return null;
  }
};

exports.buildPostScope = (metadata = {}, recordData = {}) => {
  const scope = {};
  if (recordData && typeof recordData === 'object' && !Array.isArray(recordData)) {
    for (const [k, v] of Object.entries(recordData)) {
      scope[k] = (v === null || v === undefined) ? '' : v;
    }
  }
  scope.id = metadata.id ?? '';
  scope.entity = metadata.entity || '';
  scope.base_url = metadata.base_url || '';
  scope.created_at = metadata.created_at || '';
  scope.user_id = metadata.user_id ?? '';
  scope.user_email = metadata.user_email || '';
  scope.user_name = metadata.user_name || '';
  return scope;
};

const POST_METADATA = new Set(['id', 'entity', 'base_url', 'created_at', 'user_id', 'user_email', 'user_name']);

exports.getNextSequence = async (prefix, connection) => {
  const p = String(prefix ?? '').slice(0, 20);
  if (!p) throw new Error('SEQ thiếu prefix');
  const run = async (db) => {
    await db.query('INSERT IGNORE INTO proposal_sequences (prefix, last_number) VALUES (?, 0)', [p]);
    await db.query('UPDATE proposal_sequences SET last_number = LAST_INSERT_ID(last_number + 1) WHERE prefix = ?', [p]);
    const [rows] = await db.query('SELECT LAST_INSERT_ID() AS n');
    return rows[0].n;
  };
  let n;
  if (connection) {
    n = await run(connection);
  } else {
    const conn = await pool.getConnection();
    try {
      n = await run(conn);
    } finally {
      conn.release();
    }
  }
  return n;
};

exports.reconcileSequences = async () => {
  const targets = [
    { table: 'station_proposals', key: 'ma_de_xuat' },
    { table: 'stations', key: 'ma_tram' }
  ];
  const maxByPrefix = {};
  for (const t of targets) {
    const [rows] = await pool.query(
      `SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.${t.key}')) AS code FROM ${t.table} WHERE JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.${t.key}')) IS NOT NULL`
    );
    for (const r of rows) {
      const m = /^(.*)(\d{4})$/.exec(String(r.code || ''));
      if (!m) continue;
      const prefix = m[1].replace(/_+$/, '').slice(0, 20);
      if (!prefix) continue;
      maxByPrefix[prefix] = Math.max(maxByPrefix[prefix] || 0, parseInt(m[2], 10));
    }
  }
  let fixed = 0;
  for (const [prefix, max] of Object.entries(maxByPrefix)) {
    await pool.query(
      'INSERT INTO proposal_sequences (prefix, last_number) VALUES (?, ?) ON DUPLICATE KEY UPDATE last_number = GREATEST(last_number, VALUES(last_number))',
      [prefix, max]
    );
    fixed++;
  }
  return { prefixes: fixed };
};

exports.evaluatePostFormulaAsync = async (expression, metadata = {}, recordData = {}, options = {}) => {
  const scope = exports.buildPostScope(metadata, recordData);
  let node;
  try {
    node = math.parse(expression);
  } catch {
    return null;
  }
  const seqNodes = node.filter(n => n.isFunctionNode && n.fn && (n.fn.name || '').toUpperCase() === 'SEQ');
  const values = new Map();
  for (const seqNode of seqNodes) {
    try {
      if (!seqNode.args || seqNode.args.length === 0) return null;
      const prefix = String(math.evaluate(seqNode.args[0].toString(), scope));
      values.set(seqNode, options.dryRun ? 1 : await exports.getNextSequence(prefix, options.connection));
    } catch {
      return null;
    }
  }
  const transformed = values.size > 0
    ? node.transform(n => (values.has(n) ? new math.ConstantNode(values.get(n)) : n))
    : node;
  try {
    return transformed.compile().evaluate(scope);
  } catch {
    return null;
  }
};
