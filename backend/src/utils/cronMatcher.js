const FIELD_BOUNDS = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12 },
  { min: 0, max: 6 }
];

const parseField = (expr, min, max) => {
  const set = new Set();
  let ok = true;
  String(expr).split(',').forEach(part => {
    let step = 1;
    let range = part;
    const slashIdx = part.indexOf('/');
    if (slashIdx >= 0) {
      range = part.slice(0, slashIdx);
      step = parseInt(part.slice(slashIdx + 1), 10);
      if (isNaN(step) || step <= 0) { ok = false; return; }
    }
    let start;
    let end;
    if (range === '*') {
      start = min;
      end = max;
    } else if (range.includes('-')) {
      const [a, b] = range.split('-');
      start = parseInt(a, 10);
      end = parseInt(b, 10);
    } else {
      start = parseInt(range, 10);
      end = start;
    }
    if (isNaN(start) || isNaN(end) || start < min || end > max || start > end) { ok = false; return; }
    for (let v = start; v <= end; v += step) set.add(v);
  });
  return ok ? set : null;
};

const parseCron = (expr) => {
  const parts = String(expr || '').trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const sets = [];
  for (let i = 0; i < 5; i++) {
    const set = parseField(parts[i], FIELD_BOUNDS[i].min, FIELD_BOUNDS[i].max);
    if (!set || set.size === 0) return null;
    sets.push(set);
  }
  return sets;
};

exports.validate = (expr) => parseCron(expr) !== null;

exports.matches = (expr, date) => {
  const sets = parseCron(expr);
  if (!sets) return false;
  const vals = [date.getMinutes(), date.getHours(), date.getDate(), date.getMonth() + 1, date.getDay()];
  return sets.every((set, i) => set.has(vals[i]));
};
