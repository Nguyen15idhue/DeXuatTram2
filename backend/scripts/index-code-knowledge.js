const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../src/utils/db');

const ROOT = process.env.REPO_ROOT || path.join(__dirname, '..', '..');
const MAX_CHUNK = 2400;
const MAX_FILE_BYTES = 400 * 1024;

const CODE_DIRS = ['backend/src', 'frontend/src'];
const CODE_EXTS = new Set(['.js', '.jsx']);

const EXCLUDE_PATH = [
  /(^|\/)frontend\/public\//i,
  /(^|\/)frontend\/dist\//i,
  /(^|\/)node_modules\//i,
  /guideData\./i,
  /\.min\.js$/i,
  /\.map$/i,
  /(^|\/)(storage|uploads)\//i,
];

const FUNCTION_DIRS = [
  /backend\/src\/(services|routes|middlewares|utils|workers|controllers)/i,
  /frontend\/src\/(components|pages|hooks|utils|services|contexts|layouts)/i,
];

const SECRET_PATTERNS = [
  [/AIza[0-9A-Za-z\-_]{20,}/g, '[REDACTED_API_KEY]'],
  [/AQ\.[0-9A-Za-z\-_.]{20,}/g, '[REDACTED_API_KEY]'],
  [/sk-[A-Za-z0-9]{20,}/g, '[REDACTED_KEY]'],
  [/ghp_[A-Za-z0-9]{20,}/g, '[REDACTED_TOKEN]'],
  [/\b[0-9a-f]{32,}\b/gi, '[REDACTED_HEX]'],
  [/((?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?token)\s*[:=]\s*)\S+/gi, '$1[REDACTED]'],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (m) => (['127.0.0.1', '0.0.0.0', 'localhost'].includes(m) ? m : '[REDACTED_IP]')],
];

const BOUNDARY_RE = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\s+[A-Za-z_$][\w$]*|class\s+[A-Za-z_$][\w$]*|(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=|exports\.[A-Za-z_$][\w$]*|router\.(?:get|post|put|delete|patch|use)\s*\()/;

function redact(text) {
  let out = text;
  for (const [re, rep] of SECRET_PATTERNS) {
    out = typeof rep === 'function' ? out.replace(re, rep) : out.replace(re, rep);
  }
  return out;
}

function isExcluded(relPath) {
  const p = relPath.replace(/\\/g, '/');
  return EXCLUDE_PATH.some((re) => re.test(p));
}

function isFunctionDir(relPath) {
  const p = relPath.replace(/\\/g, '/');
  return FUNCTION_DIRS.some((re) => re.test(p));
}

function walk(dir, acc) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    if (isExcluded(rel)) continue;
    if (e.isDirectory()) walk(full, acc);
    else if (CODE_EXTS.has(path.extname(e.name).toLowerCase())) acc.push(rel);
  }
  return acc;
}

function extractSymbols(text) {
  const syms = new Set();
  const routes = new Set();
  const patterns = [
    /(?:^|\n)\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /(?:^|\n)\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g,
    /(?:^|\n)\s*(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/g,
    /(?:^|\n)\s*exports\.([A-Za-z_$][\w$]*)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) syms.add(m[1]);
  }
  const routeRe = /router\.(get|post|put|delete|patch|use)\(\s*['"`]([^'"`]+)['"`]/g;
  let rm;
  while ((rm = routeRe.exec(text)) !== null) routes.add(`${rm[1].toUpperCase()} ${rm[2]}`);
  return { symbols: [...syms].slice(0, 80), routes: [...routes].slice(0, 60) };
}

function boundarySymbol(line) {
  const t = line.trim();
  let m = t.match(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/);
  if (m) return m[1];
  m = t.match(/^(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/);
  if (m) return m[1];
  m = t.match(/^(?:export\s+)?(?:default\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/);
  if (m) return m[1];
  m = t.match(/^exports\.([A-Za-z_$][\w$]*)/);
  if (m) return m[1];
  m = t.match(/^router\.(get|post|put|delete|patch|use)\s*\(\s*['"`]([^'"`]+)['"`]/);
  if (m) return `${m[1].toUpperCase()} ${m[2]}`;
  return null;
}

function chunkFunctions(relPath, text) {
  const lines = text.split(/\r?\n/);
  const sections = [];
  let cur = { symbol: null, buf: [] };
  const flush = () => {
    const body = cur.buf.join('\n').trim();
    if (body) sections.push({ symbol: cur.symbol, body });
    cur = { symbol: null, buf: [] };
  };
  for (const line of lines) {
    if (BOUNDARY_RE.test(line) && cur.buf.length > 0) flush();
    if (cur.symbol === null) {
      const s = boundarySymbol(line);
      if (s) cur.symbol = s;
    }
    cur.buf.push(line);
    if (cur.buf.join('\n').length > MAX_CHUNK) flush();
  }
  flush();
  const out = [];
  let part = 0;
  for (const s of sections) {
    const body = s.body.length > MAX_CHUNK ? s.body.slice(0, MAX_CHUNK) : s.body;
    out.push({
      heading: `${relPath}#${s.symbol || `part${(part += 1)}`}`,
      content: redact(body),
    });
  }
  return out;
}

function codeMapChunk(relPath, text, lineCount) {
  const { symbols, routes } = extractSymbols(text);
  const parts = [`Tệp mã nguồn: ${relPath} (${lineCount} dòng).`];
  if (symbols.length > 0) parts.push(`Hàm/lớp/biến chính: ${symbols.join(', ')}.`);
  if (routes.length > 0) parts.push(`Route: ${routes.join(', ')}.`);
  return { heading: relPath, content: redact(parts.join('\n')) };
}

async function schemaChunks() {
  const [tables] = await pool.query(
    "SELECT TABLE_NAME, TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME"
  );
  const out = [];
  for (const t of tables) {
    const name = t.TABLE_NAME;
    const [cols] = await pool.query(
      'SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, COLUMN_COMMENT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
      [name]
    );
    const [keys] = await pool.query(
      'SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
      [name]
    );
    const lines = [`Bảng cơ sở dữ liệu: ${name} (${cols.length} cột).`];
    if (t.TABLE_COMMENT) lines.push(`Mô tả: ${t.TABLE_COMMENT}.`);
    lines.push('Các cột:');
    for (const c of cols) {
      const nn = c.IS_NULLABLE === 'NO' ? ' NOT NULL' : '';
      const def = c.COLUMN_DEFAULT !== null && c.COLUMN_DEFAULT !== undefined ? ` DEFAULT ${c.COLUMN_DEFAULT}` : '';
      const extra = c.EXTRA ? ` ${c.EXTRA}` : '';
      lines.push(`- ${c.COLUMN_NAME} ${c.COLUMN_TYPE}${nn}${def}${extra}${c.COLUMN_COMMENT ? ` (${c.COLUMN_COMMENT})` : ''}`);
    }
    const pks = keys.filter((k) => k.CONSTRAINT_NAME === 'PRIMARY').map((k) => k.COLUMN_NAME);
    if (pks.length > 0) lines.push(`Khóa chính: ${pks.join(', ')}.`);
    const fks = keys.filter((k) => k.REFERENCED_TABLE_NAME);
    for (const fk of fks) lines.push(`Khóa ngoại: ${fk.COLUMN_NAME} → ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}.`);
    out.push({
      source_path: `schema:${name}`,
      heading: `Bảng ${name}`,
      content: redact(lines.join('\n')),
    });
  }
  return out;
}

async function upsert(kind, heading, sourcePath, content, order, seenKeys) {
  const key = `${sourcePath}::${heading}`;
  seenKeys.add(key);
  const hash = crypto.createHash('sha1').update(content).digest('hex');
  const [existing] = await pool.query(
    'SELECT id, content_hash FROM assistant_code_knowledge WHERE source_path = ? AND heading = ?',
    [sourcePath, heading]
  );
  if (existing.length > 0) {
    if (existing[0].content_hash === hash) return 'fresh';
    await pool.query(
      'UPDATE assistant_code_knowledge SET content = ?, content_hash = ?, kind = ?, sort_order = ? WHERE id = ?',
      [content, hash, kind, order, existing[0].id]
    );
    return 'updated';
  }
  await pool.query(
    'INSERT INTO assistant_code_knowledge (source_path, kind, heading, content, content_hash, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
    [sourcePath, kind, heading, content, hash, order]
  );
  return 'inserted';
}

async function main() {
  const seenKeys = new Set();
  let inserted = 0;
  let updated = 0;
  let fresh = 0;

  const files = [];
  for (const d of CODE_DIRS) {
    const full = path.join(ROOT, d);
    if (fs.existsSync(full)) walk(full, files);
  }
  const uniq = [...new Set(files)];
  console.log(`[index-code] bat dau: ${uniq.length} file...`);
  let order = 0;
  let processed = 0;
  for (const rel of uniq) {
    const full = path.join(ROOT, rel);
    let raw;
    try {
      const st = fs.statSync(full);
      if (st.size > MAX_FILE_BYTES) { console.log(`[index-code] bo qua (qua lon): ${rel}`); continue; }
      raw = fs.readFileSync(full, 'utf8');
    } catch (e) {
      console.log(`[index-code] loi doc ${rel}: ${e.message}`);
      continue;
    }
    const lineCount = raw.split('\n').length;
    const map = codeMapChunk(rel, raw, lineCount);
    const r1 = await upsert('code', map.heading, rel, map.content, order++, seenKeys);
    if (r1 === 'inserted') inserted += 1; else if (r1 === 'updated') updated += 1; else fresh += 1;
    if (isFunctionDir(rel)) {
      for (const c of chunkFunctions(rel, raw)) {
        const r2 = await upsert('code', c.heading, rel, c.content, order++, seenKeys);
        if (r2 === 'inserted') inserted += 1; else if (r2 === 'updated') updated += 1; else fresh += 1;
      }
    }
    processed += 1;
    if (processed % 50 === 0) console.log(`[index-code] ... ${processed}/${uniq.length} file, ${order} chunk`);
  }

  for (const c of await schemaChunks()) {
    const r = await upsert('schema', c.heading, c.source_path, c.content, order++, seenKeys);
    if (r === 'inserted') inserted += 1; else if (r === 'updated') updated += 1; else fresh += 1;
  }

  const [all] = await pool.query('SELECT id, source_path, heading FROM assistant_code_knowledge');
  let removed = 0;
  for (const row of all) {
    if (!seenKeys.has(`${row.source_path}::${row.heading}`)) {
      await pool.query('DELETE FROM assistant_code_knowledge WHERE id = ?', [row.id]);
      removed += 1;
    }
  }

  const [cnt] = await pool.query("SELECT COUNT(*) AS n, SUM(kind = 'code') AS code_chunks, SUM(kind = 'schema') AS schema_chunks FROM assistant_code_knowledge");
  console.log(`[index-code] files=${uniq.length} inserted=${inserted} updated=${updated} unchanged=${fresh} removed=${removed}`);
  console.log(`[index-code] total chunks=${cnt[0].n} (code=${cnt[0].code_chunks}, schema=${cnt[0].schema_chunks})`);
  await pool.end();
  process.exit(0);
}

main().catch((e) => { console.error('[index-code] LOI:', e.message); process.exit(1); });
