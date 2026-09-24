const pool = require('../utils/db');
const helpService = require('./helpService');

function enabled() {
  return process.env.ASSISTANT_CODE_KNOWLEDGE !== 'false';
}

function canUseCodeKnowledge(userRole) {
  return userRole === 'SUPER_ADMIN';
}

function rowToChunk(row) {
  return {
    source_path: row.source_path,
    kind: row.kind,
    heading: row.heading,
    content: row.content,
  };
}

async function search(question, limit) {
  if (!enabled()) return [];
  const max = limit || 3;
  const tokens = helpService.tokenize(question).slice(0, 8);
  if (tokens.length === 0) return [];

  const candidates = new Map();

  try {
    const [ft] = await pool.query(
      'SELECT id, source_path, kind, heading, content FROM assistant_code_knowledge WHERE MATCH(heading, content) AGAINST (? IN NATURAL LANGUAGE MODE) LIMIT 80',
      [question]
    );
    for (const row of ft) candidates.set(row.id, row);
  } catch { /* FULLTEXT unavailable */ }

  if (candidates.size < 5) {
    const clauses = [];
    const params = [];
    for (const t of tokens) {
      clauses.push('(heading LIKE ? OR content LIKE ?)');
      const like = `%${t}%`;
      params.push(like, like);
    }
    const [likeRows] = await pool.query(
      'SELECT id, source_path, kind, heading, content FROM assistant_code_knowledge WHERE ' + clauses.join(' OR ') + ' LIMIT 200',
      params
    );
    for (const row of likeRows) candidates.set(row.id, row);
  }

  const scored = [...candidates.values()].map((row) => {
    const heading = helpService.normHay(row.heading);
    const content = helpService.normHay(row.content);
    const kindBoost = row.kind === 'schema' ? 2 : 0;
    let score = kindBoost;
    for (const t of tokens) {
      if (helpService.fieldIncludes(heading, t)) score += 8;
      if (helpService.fieldIncludes(content, t)) score += 1;
    }
    return { row, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);

  return scored.slice(0, max).map((x) => rowToChunk(x.row));
}

async function stats() {
  const [rows] = await pool.query("SELECT COUNT(*) AS n, SUM(kind = 'code') AS code_chunks, SUM(kind = 'schema') AS schema_chunks FROM assistant_code_knowledge");
  return { chunks: rows[0].n, code: rows[0].code_chunks, schema: rows[0].schema_chunks };
}

module.exports = { search, stats, canUseCodeKnowledge, enabled };
