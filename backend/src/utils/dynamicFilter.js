const MAX_FILTER_KEYS = 20;
const MAX_VALUE_LEN = 100;

function escapeLike(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function parseFiltersInput(raw) {
  if (!raw) return {};
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    return obj;
  } catch {
    return {};
  }
}

function colRef(alias, col) {
  return alias ? `${alias}.${col}` : col;
}

function userIdExpr(cdRef, key) {
  return `COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(${cdRef}, '$.${key}.id')), 'null'), JSON_UNQUOTE(JSON_EXTRACT(${cdRef}, '$.${key}')))`;
}

function parseUserFilter(val) {
  const tokens = String(val).split(',').map((t) => t.trim()).filter(Boolean).slice(0, 20);
  const ids = [];
  const names = [];
  for (let tok of tokens) {
    if (tok.startsWith('#')) tok = tok.slice(1).trim();
    if (/^[0-9]{1,10}$/.test(tok)) {
      if (!ids.includes(tok)) ids.push(tok);
    } else if (tok) {
      if (!names.includes(tok)) names.push(tok);
    }
  }
  return { ids, names };
}

exports.buildColumnFilterWhere = ({ filters, fieldDefs = [], fixedColumns = [], alias = '', customDataColumn = 'custom_data' } = {}) => {
  const obj = parseFiltersInput(filters);
  const defKeys = new Set((fieldDefs || []).map((f) => f.key));
  const userKeys = new Set((fieldDefs || []).filter((f) => f.type === 'user').map((f) => f.key));
  const fixed = new Set(fixedColumns);
  const clauses = [];
  const params = [];
  let count = 0;
  for (const [key, rawVal] of Object.entries(obj)) {
    if (count >= MAX_FILTER_KEYS) break;
    if (!/^[A-Za-z0-9_]{1,64}$/.test(key)) continue;
    const val = rawVal == null ? '' : String(rawVal).trim();
    if (!val || val.length > MAX_VALUE_LEN) continue;
    if (userKeys.has(key)) {
      const { ids, names } = parseUserFilter(val);
      if (ids.length === 0 && names.length === 0) continue;
      const idExpr = userIdExpr(`${colRef(alias, customDataColumn)}`, key);
      const ors = [];
      if (ids.length > 0) {
        ors.push(`(${idExpr} IN (${ids.map(() => '?').join(',')}))`);
        params.push(...ids);
      }
      for (const name of names) {
        ors.push(`(EXISTS (SELECT 1 FROM users fu WHERE fu.id = ${idExpr} AND fu.full_name LIKE ? ESCAPE '\\\\'))`);
        params.push(`%${escapeLike(name)}%`);
      }
      clauses.push(`(${ors.join(' OR ')})`);
      count += 1;
      continue;
    }
    const like = `%${escapeLike(val)}%`;
    if (fixed.has(key)) {
      clauses.push(`(CAST(${colRef(alias, key)} AS CHAR) LIKE ? ESCAPE '\\\\')`);
      params.push(like);
      count += 1;
    } else if (defKeys.has(key)) {
      clauses.push(`(JSON_UNQUOTE(JSON_EXTRACT(${colRef(alias, customDataColumn)}, '$.${key}')) LIKE ? ESCAPE '\\\\')`);
      params.push(like);
      count += 1;
    }
  }
  return { clauses, params };
};
