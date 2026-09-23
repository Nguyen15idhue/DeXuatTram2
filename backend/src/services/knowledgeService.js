const pool = require('../utils/db');
const helpService = require('./helpService');

const INTERNAL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SALES'];

function canUseKnowledge(userRole) {
  return INTERNAL_ROLES.includes(userRole);
}

function rowToChunk(row) {
  return {
    source_path: row.source_path,
    heading: row.heading,
    content: row.content,
    tags: row.tags ? (typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags) : [],
  };
}

async function search(question, limit) {
  const max = limit || 3;
  const tokens = helpService.tokenize(question).slice(0, 8);
  if (tokens.length === 0) return [];

  const candidates = new Map();

  try {
    const [ft] = await pool.query(
      'SELECT id, source_path, heading, content, tags FROM assistant_knowledge WHERE MATCH(heading, content) AGAINST (? IN NATURAL LANGUAGE MODE) LIMIT 80',
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
      'SELECT id, source_path, heading, content, tags FROM assistant_knowledge WHERE ' + clauses.join(' OR ') + ' LIMIT 200',
      params
    );
    for (const row of likeRows) candidates.set(row.id, row);
  }

  const scored = [...candidates.values()].map((row) => {
    const heading = helpService.normalizeText(row.heading);
    const content = helpService.normalizeText(row.content);
    const path = helpService.normalizeText(row.source_path);
    let score = 0;
    for (const t of tokens) {
      if (heading.includes(t)) score += 8;
      if (path.includes(t)) score += 3;
      if (content.includes(t)) score += 1;
    }
    return { row, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);

  return scored.slice(0, max).map((x) => rowToChunk(x.row));
}

async function stats() {
  const [rows] = await pool.query('SELECT COUNT(*) AS n, COUNT(DISTINCT source_path) AS files FROM assistant_knowledge');
  return { chunks: rows[0].n, files: rows[0].files };
}

module.exports = { search, stats, canUseKnowledge, INTERNAL_ROLES };
