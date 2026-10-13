const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../src/utils/db');

const ROOT = path.join(__dirname, '..', '..');
const MAX_CHUNK = 2400;
const MAX_FILE_BYTES = 400 * 1024;

const INCLUDE_FILES = ['AGENTS.md', 'README.md'];
const INCLUDE_DIRS = ['docs'];

const EXCLUDE_PATH = [
  /(^|\/)docs\/0\//i,
  /(^|\/)docs\/6\//i,
  /secret/i,
  /credential/i,
  /password/i,
  /\.env/i,
  /docker-compose/i,
  /node_modules/i,
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

function walkMd(dir, acc) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    if (isExcluded(rel)) continue;
    if (e.isDirectory()) walkMd(full, acc);
    else if (e.name.toLowerCase().endsWith('.md')) acc.push(rel);
  }
  return acc;
}

function listSources() {
  const files = [];
  for (const f of INCLUDE_FILES) {
    const full = path.join(ROOT, f);
    if (fs.existsSync(full)) files.push(f);
  }
  for (const d of INCLUDE_DIRS) {
    const full = path.join(ROOT, d);
    if (fs.existsSync(full)) walkMd(full, files);
  }
  return [...new Set(files)];
}

function chunkMarkdown(relPath, raw) {
  const lines = raw.split(/\r?\n/);
  const docTitle = (lines.find((l) => /^#\s+/.test(l)) || '').replace(/^#\s+/, '').trim();
  const chunks = [];
  let heading = docTitle || relPath;
  let buf = [];

  const flush = () => {
    const text = buf.join('\n').trim();
    if (!text) { buf = []; return; }
    if (text.length <= MAX_CHUNK) {
      chunks.push({ heading, content: redact(text) });
    } else {
      for (let i = 0; i < text.length; i += MAX_CHUNK) {
        chunks.push({ heading: `${heading} (phần ${Math.floor(i / MAX_CHUNK) + 1})`, content: redact(text.slice(i, i + MAX_CHUNK)) });
      }
    }
    buf = [];
  };

  for (const line of lines) {
    if (/^#{1,3}\s+/.test(line)) {
      flush();
      heading = line.replace(/^#{1,3}\s+/, '').trim();
      buf.push(line);
      continue;
    }
    buf.push(line);
  }
  flush();

  const seen = new Map();
  return chunks.map((c) => {
    const n = (seen.get(c.heading) || 0) + 1;
    seen.set(c.heading, n);
    return { heading: n > 1 ? `${c.heading} #${n}` : c.heading, content: c.content };
  });
}

async function main() {
  const sources = listSources();
  let inserted = 0;
  let updated = 0;
  let skippedFresh = 0;
  const seenKeys = new Set();

  for (const rel of sources) {
    const full = path.join(ROOT, rel);
    let raw;
    try {
      const st = fs.statSync(full);
      if (st.size > MAX_FILE_BYTES) { console.log(`[index-knowledge] bo qua (qua lon): ${rel}`); continue; }
      raw = fs.readFileSync(full, 'utf8');
    } catch (e) {
      console.log(`[index-knowledge] loi doc ${rel}: ${e.message}`);
      continue;
    }
    const chunks = chunkMarkdown(rel, raw);
    let order = 0;
    for (const c of chunks) {
      const key = `${rel}::${c.heading}`;
      seenKeys.add(key);
      const hash = crypto.createHash('sha1').update(c.content).digest('hex');
      const [existing] = await pool.query(
        'SELECT id, content_hash FROM assistant_knowledge WHERE source_path = ? AND heading = ?',
        [rel, c.heading]
      );
      if (existing.length > 0) {
        if (existing[0].content_hash === hash) { skippedFresh += 1; continue; }
        await pool.query(
          'UPDATE assistant_knowledge SET content = ?, content_hash = ?, sort_order = ? WHERE id = ?',
          [c.content, hash, order++, existing[0].id]
        );
        updated += 1;
      } else {
        await pool.query(
          'INSERT INTO assistant_knowledge (source_path, heading, content, tags, content_hash, sort_order) VALUES (?, ?, ?, CAST(? AS JSON), ?, ?)',
          [rel, c.heading, c.content, JSON.stringify([]), hash, order++]
        );
        inserted += 1;
      }
    }
  }

  const [all] = await pool.query('SELECT id, source_path, heading FROM assistant_knowledge');
  let removed = 0;
  for (const row of all) {
    if (!seenKeys.has(`${row.source_path}::${row.heading}`)) {
      await pool.query('DELETE FROM assistant_knowledge WHERE id = ?', [row.id]);
      removed += 1;
    }
  }

  const [cnt] = await pool.query('SELECT COUNT(*) AS n, COUNT(DISTINCT source_path) AS f FROM assistant_knowledge');
  console.log(`[index-knowledge] files=${sources.length} inserted=${inserted} updated=${updated} unchanged=${skippedFresh} removed=${removed}`);
  console.log(`[index-knowledge] total chunks=${cnt[0].n} from ${cnt[0].f} files`);
  await pool.end();
  process.exit(0);
}

main().catch((e) => { console.error('[index-knowledge] LOI:', e.message); process.exit(1); });
