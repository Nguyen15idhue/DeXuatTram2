const pool = require('../utils/db');

function decodeEntities(s) {
  return String(s == null ? '' : s)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCharCode(Number(n)); } catch { return ''; } })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => { try { return String.fromCharCode(parseInt(n, 16)); } catch { return ''; } });
}

function stripTags(html) {
  return decodeEntities(String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ''))
    .replace(/[ \t\u00a0]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

const isEmptyText = (t) => !t || t === '—' || t === '-' || t === '–';

function normLabel(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseDescRows(descHtml) {
  const rows = [];
  if (!descHtml) return rows;
  const html = String(descHtml);
  const rowRe = /<tr[^>]*>\s*<td[^>]*width:35%[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const label = stripTags(m[1]);
    if (!label) continue;
    const valueHtml = m[2] || '';
    if (/<table[\s >]/i.test(valueHtml)) {
      rows.push({ label, tableHtml: valueHtml, text: null });
    } else {
      const text = stripTags(valueHtml);
      if (isEmptyText(text)) continue;
      rows.push({ label, text, tableHtml: null });
    }
  }
  const spanRe = /<td[^>]*colspan[^>]*>\s*<div[^>]*>([\s\S]*?)<\/div>\s*(<table[\s\S]*?<\/table>)/gi;
  while ((m = spanRe.exec(html)) !== null) {
    const label = stripTags(m[1]);
    if (!label) continue;
    rows.push({ label, tableHtml: m[2], text: null });
  }
  return rows;
}

function parseViNumber(text) {
  let s = String(text == null ? '' : text).trim();
  if (!s) return null;
  s = s.replace(/\s+/g, '').replace(/VND|₫|m²|m\b/gi, '');
  s = s.replace(/[^0-9.,-]/g, '');
  if (!s || s === '-' || s === '.' || s === ',') return null;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    const parts = s.split('.');
    if (parts.length > 2) {
      s = parts.join('');
    } else if (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3) {
      s = parts.join('');
    }
  }
  const n = Number(s);
  return isNaN(n) ? null : n;
}

function parseDateDmy(text) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/.exec(String(text || '').trim());
  if (!m) return null;
  const dd = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  const base = `${m[3]}-${mm}-${dd}`;
  if (m[4] !== undefined) return `${base} ${(m[4] || '').padStart(2, '0')}:${(m[5] || '00').padStart(2, '0')}:${(m[6] || '00').padStart(2, '0')}`;
  return base;
}

function getOptions(def) {
  let opts = def.options;
  if (typeof opts === 'string') {
    try { opts = JSON.parse(opts); } catch { opts = []; }
  }
  return Array.isArray(opts) ? opts : [];
}

function matchSelectOption(def, text) {
  const t = String(text == null ? '' : text).trim().toLowerCase();
  if (!t) return null;
  for (const o of getOptions(def)) {
    const label = String(o.label == null ? '' : o.label).trim().toLowerCase();
    const value = String(o.value == null ? '' : o.value).trim().toLowerCase();
    if (label && (label === t || t.includes(label) || label.includes(t))) return o.value;
    if (value && value === t) return o.value;
  }
  return null;
}

async function resolveUserByName(text) {
  const m = /User\s*#\s*(\d+)/i.exec(String(text || ''));
  if (m) return { id: Number(m[1]) };
  const name = String(text || '').trim();
  if (!name) return null;
  const [rows] = await pool.query('SELECT id FROM users WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(?)) AND status = ? LIMIT 1', [name, 'ACTIVE']);
  if (rows.length > 0) return { id: Number(rows[0].id) };
  return null;
}

function parseTableHtml(tableHtml, def) {
  let sc = def.source_config;
  if (typeof sc === 'string') {
    try { sc = JSON.parse(sc); } catch { sc = {}; }
  }
  const columns = (sc && sc.columns) || [];
  if (columns.length === 0) return null;
  const thRe = /<th[^>]*>([\s\S]*?)<\/th>/gi;
  const headLabels = [];
  let hm;
  while ((hm = thRe.exec(tableHtml)) !== null) {
    headLabels.push(stripTags(hm[1]));
  }
  const bodyMatch = /<tbody[^>]*>([\s\S]*?)<\/tbody>/i.exec(tableHtml);
  const bodyHtml = bodyMatch ? bodyMatch[1] : tableHtml;
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const out = [];
  let tm;
  while ((tm = trRe.exec(bodyHtml)) !== null) {
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells = [];
    let cm;
    while ((cm = tdRe.exec(tm[1])) !== null) cells.push(stripTags(cm[1]));
    if (cells.length === 0) continue;
    const dataCells = cells.length > columns.length ? cells.slice(1) : cells;
    if (dataCells.every(isEmptyText)) continue;
    const row = {};
    columns.forEach((col, idx) => {
      if (col.formula) return;
      const raw = dataCells[idx] !== undefined ? dataCells[idx] : '';
      if (isEmptyText(raw)) return;
      const colType = col.column_type || col.type;
      if (colType === 'number') {
        const n = parseViNumber(raw);
        row[col.key] = n === null ? raw : n;
      } else {
        row[col.key] = raw;
      }
    });
    if (Object.keys(row).length > 0) out.push(row);
  }
  void headLabels;
  return out.length > 0 ? out : null;
}

async function coerceValue(def, text, tableHtml) {
  const type = def.type || 'text';
  if (type === 'table') {
    if (!tableHtml) return { value: null, unmatched: true };
    const parsed = parseTableHtml(tableHtml, def);
    return parsed ? { value: parsed } : { value: null, unmatched: true };
  }
  if (text === null || text === undefined) return { value: null, unmatched: true };
  switch (type) {
    case 'number': {
      const n = parseViNumber(text);
      return n === null ? { value: null, unmatched: true } : { value: n };
    }
    case 'phone': {
      const digits = String(text).replace(/[^0-9]/g, '');
      return digits ? { value: digits } : { value: null, unmatched: true };
    }
    case 'email':
      return { value: String(text).trim().toLowerCase() };
    case 'date': {
      const d = parseDateDmy(text);
      return d ? { value: d } : { value: String(text).trim(), unmatched: true };
    }
    case 'datetime': {
      const d = parseDateDmy(text);
      return d ? { value: d.length === 10 ? `${d} 00:00:00` : d } : { value: String(text).trim(), unmatched: true };
    }
    case 'boolean': {
      const t = String(text).trim().toLowerCase();
      if (['1', 'true', 'có', 'co', 'yes', 'x'].includes(t)) return { value: 1 };
      if (['0', 'false', 'không', 'khong', 'no'].includes(t)) return { value: 0 };
      return { value: null, unmatched: true };
    }
    case 'select': {
      const matched = matchSelectOption(def, text);
      return matched !== null ? { value: matched } : { value: String(text).trim(), unmatched: true };
    }
    case 'multiselect': {
      const matched = matchSelectOption(def, text);
      if (matched !== null) return { value: [matched] };
      const parts = String(text).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      return parts.length > 0 ? { value: parts, unmatched: true } : { value: null, unmatched: true };
    }
    case 'user': {
      const u = await resolveUserByName(text);
      return u ? { value: u } : { value: null, unmatched: true };
    }
    case 'file':
      return { value: null, unmatched: true };
    default:
      return { value: String(text).trim() };
  }
}

exports.mapRowsToFields = async (rows, fieldDefs) => {
  const byLabel = new Map();
  for (const def of fieldDefs || []) {
    const label = normLabel(def.label || def.key);
    if (!label) continue;
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label).push(def);
  }
  const values = {};
  const unmatched = [];
  for (const row of rows) {
    const defs = byLabel.get(normLabel(row.label)) || [];
    if (defs.length === 0) {
      unmatched.push({ label: row.label, text: row.text });
      continue;
    }
    let assigned = false;
    for (const def of defs) {
      try {
        const { value, unmatched: notSure } = await coerceValue(def, row.text, row.tableHtml);
        if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) continue;
        if (values[def.key] === undefined) values[def.key] = value;
        assigned = true;
        if (notSure) unmatched.push({ label: row.label, text: row.text, reason: 'fuzzy' });
      } catch {
        continue;
      }
    }
    if (!assigned) unmatched.push({ label: row.label, text: row.text, reason: 'parse' });
  }
  return { values, unmatched };
};

exports.parseDescToFields = async (descHtml, fieldDefs) => {
  const rows = parseDescRows(descHtml);
  const { values, unmatched } = await exports.mapRowsToFields(rows, fieldDefs);
  return { values, unmatched, rowCount: rows.length };
};

function findNextMatch(text, labels, from) {
  let best = null;
  for (const { label, len } of labels) {
    const idx = text.indexOf(label, from);
    if (idx === -1) continue;
    if (!best || idx < best.idx || (idx === best.idx && len > best.len)) {
      best = { idx, len, label };
    }
  }
  return best;
}

exports.parseDescText = async (text, fieldDefs) => {
  const values = {};
  const unmatched = [];
  const content = String(text || '');
  if (!content.trim()) return { values, unmatched, rowCount: 0 };
  const labelDefs = new Map();
  for (const def of fieldDefs || []) {
    const key = normLabel(def.label || def.key);
    if (!key) continue;
    if (!labelDefs.has(key)) labelDefs.set(key, []);
    labelDefs.get(key).push(def);
  }
  const labels = [...labelDefs.keys()].map((label) => ({ label, len: label.length })).sort((a, b) => b.len - a.len);
  const isTableLabel = (label) => (labelDefs.get(label) || []).every((d) => d.type === 'table');
  let pos = 0;
  let rowCount = 0;
  while (pos < content.length) {
    const lower = content.toLowerCase();
    const headIdx = lower.indexOf('📋', pos);
    const m = findNextMatch(lower, labels, pos);
    if (headIdx !== -1 && (!m || headIdx < m.idx)) {
      pos = headIdx + 2;
      continue;
    }
    if (!m) break;
    const defs = labelDefs.get(m.label) || [];
    const valStart = m.idx + m.len;
    const tableOnly = defs.length > 0 && isTableLabel(m.label);
    const nextM = findNextMatch(lower, labels, valStart);
    const nextHead = lower.indexOf('📋', valStart);
    let end = content.length;
    if (nextM) end = Math.min(end, nextM.idx);
    if (nextHead !== -1) end = Math.min(end, nextHead);
    const rawText = content.slice(valStart, end).trim();
    if (tableOnly) {
      unmatched.push({ label: defs[0].label || m.label, text: rawText.slice(0, 60), reason: 'table-text' });
      pos = end;
      continue;
    }
    if (!rawText || isEmptyText(rawText)) {
      pos = end;
      continue;
    }
    rowCount++;
    let assigned = false;
    for (const def of defs) {
      try {
        const { value, unmatched: notSure } = await coerceValue(def, rawText, null);
        if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) continue;
        if (values[def.key] === undefined) values[def.key] = value;
        assigned = true;
        if (notSure) unmatched.push({ label: def.label || m.label, text: rawText.slice(0, 60), reason: 'fuzzy' });
      } catch {
        continue;
      }
    }
    if (!assigned) unmatched.push({ label: m.label, text: rawText.slice(0, 60), reason: 'parse' });
    pos = end;
  }
  return { values, unmatched, rowCount };
};

exports.stripTags = stripTags;
exports.parseViNumber = parseViNumber;
