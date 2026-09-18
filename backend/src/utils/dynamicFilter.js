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

exports.buildColumnFilterWhere = ({ filters, fieldDefs = [], fixedColumns = [], alias = '', customDataColumn = 'custom_data' } = {}) => {
  const obj = parseFiltersInput(filters);
  const defKeys = new Set((fieldDefs || []).map((f) => f.key));
  const fixed = new Set(fixedColumns);
  const clauses = [];
  const params = [];
  let count = 0;
  for (const [key, rawVal] of Object.entries(obj)) {
    if (count >= MAX_FILTER_KEYS) break;
    if (!/^[A-Za-z0-9_]{1,64}$/.test(key)) continue;
    const val = rawVal == null ? '' : String(rawVal).trim();
    if (!val || val.length > MAX_VALUE_LEN) continue;
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
