const fs = require('fs');

const KEY_PATH = process.env.GGSA_KEY_PATH || '/app/secrets/ggsheet-sa.json';
let client = null;
let keyEmail = '';

const sheets = async () => {
  if (client) return client;
  if (!fs.existsSync(KEY_PATH)) {
    throw Object.assign(new Error('Thieu key service account (GGSA_KEY_PATH). Lien he quan tri de nap key.'), { statusCode: 503 });
  }
  let google;
  try {
    google = require('googleapis').google;
  } catch {
    throw Object.assign(new Error('Thieu thu vien googleapis'), { statusCode: 500 });
  }
  const key = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
  keyEmail = key.client_email || '';
  const auth = new google.auth.GoogleAuth({ credentials: key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  client = google.sheets({ version: 'v4', auth });
  return client;
};

exports.keyEmail = () => keyEmail;

exports.getTabs = async (spreadsheetId) => {
  const s = await sheets();
  const meta = await s.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  return (meta.data.sheets || []).map((t) => t.properties.title);
};

exports.getHeaders = async (spreadsheetId, tab) => {
  const s = await sheets();
  const r = await s.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A1:ZZ1` });
  const row = (r.data.values && r.data.values[0]) || [];
  return row.map((h) => String(h || '').trim());
};

const colLetter = (i) => {
  let s = '';
  let n = i;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
};
exports.colLetter = colLetter;

exports.appendColumn = async (spreadsheetId, tab, header) => {
  const headers = await exports.getHeaders(spreadsheetId, tab);
  let idx = headers.length;
  while (idx > 0 && headers[idx - 1] === '') idx--;
  const s = await sheets();
  await s.spreadsheets.values.update({
    spreadsheetId, range: `${tab}!${colLetter(idx)}1`,
    valueInputOption: 'RAW', requestBody: { values: [[header]] },
  });
  return { col: colLetter(idx), index: idx };
};

exports.ensureTab = async (spreadsheetId, tab) => {
  const tabs = await exports.getTabs(spreadsheetId);
  if (tabs.includes(tab)) return { created: false };
  const s = await sheets();
  await s.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] } });
  return { created: true };
};

exports.updateCells = async (spreadsheetId, updates) => {
  if (!updates || updates.length === 0) return { updated: 0 };
  const s = await sheets();
  await s.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'RAW', data: updates } });
  return { updated: updates.length };
};

exports.clearTab = async (spreadsheetId, tab) => {
  const s = await sheets();
  await s.spreadsheets.values.clear({ spreadsheetId, range: `${tab}!A1:ZZ10000` });
  return { cleared: true };
};

exports.readColumnA = async (spreadsheetId, tab) => {
  const s = await sheets();
  const r = await s.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A1:A10000` });
  return (r.data.values || []).map((x) => String(x[0] || ''));
};

exports.upsertRows = async (spreadsheetId, tab, headers, rows) => {
  const s = await sheets();
  const cur = await s.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A1:${colLetter(Math.max(headers.length - 1, 25))}1` });
  const existing = (cur.data.values && cur.data.values[0]) || [];
  const merged = headers.map((h, i) => {
    const old = String(existing[i] || '').trim();
    return old !== '' ? existing[i] : h;
  });
  await s.spreadsheets.values.update({
    spreadsheetId, range: `${tab}!A1:${colLetter(merged.length - 1)}1`,
    valueInputOption: 'RAW', requestBody: { values: [merged] },
  });
  const colA = await exports.readColumnA(spreadsheetId, tab);
  const pos = new Map();
  colA.forEach((v, i) => { if (v && !pos.has(v)) pos.set(v, i + 1); });
  let next = colA.length + 1;
  const updates = [];
  let inserted = 0;
  let updated = 0;
  rows.forEach((row) => {
    const key = String(row[0] || '');
    if (!key) return;
    if (pos.has(key)) {
      updates.push({ range: `${tab}!A${pos.get(key)}:${colLetter(row.length - 1)}${pos.get(key)}`, values: [row] });
      updated++;
    } else {
      updates.push({ range: `${tab}!A${next}:${colLetter(row.length - 1)}${next}`, values: [row] });
      pos.set(key, next);
      next++;
      inserted++;
    }
  });
  if (updates.length > 0) {
    await s.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'RAW', data: updates } });
  }
  return { updated, inserted };
};
