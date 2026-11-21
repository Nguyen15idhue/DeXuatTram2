const values = (value) => [...new Set((Array.isArray(value) ? value : [value])
  .filter((item) => item !== undefined && item !== null && String(item).trim() !== '')
  .map((item) => String(item).trim()))];

const addInFilter = (where, params, expression, value) => {
  const selected = values(value);
  if (!selected.length) return;
  where.push(`${expression} IN (${selected.map(() => '?').join(',')})`);
  params.push(...selected);
};

module.exports = { values, addInFilter };
