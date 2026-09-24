const pool = require('../utils/db');
const ttlCache = require('../utils/ttlCache');

const KNOWN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SALES', 'CTV', 'NPP', 'guest'];
const ARTICLE_STATUSES = ['draft', 'published', 'archived'];

function bumpAssistantCache() {
  ttlCache.del('assistant:articles-version');
  ttlCache.del('assistant:knowledge-version');
  ttlCache.delPrefix('assistant:');
}

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    return fallback;
  }
}

function toJsonParam(value) {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
}

function escapeHtml(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeHtml(html) {
  let out = String(html || '');
  out = out.replace(/<script[\s\S]*?<\/script\s*>/gi, '');
  out = out.replace(/<style[\s\S]*?<\/style\s*>/gi, '');
  out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  out = out.replace(/(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, '$1="#"');
  return out;
}

function slugify(text, fallback) {
  const s = String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || fallback;
}

function renderInline(content) {
  let html = '';
  for (const node of content || []) {
    if (node.type === 'text') {
      let t = escapeHtml(node.text);
      const marks = node.marks || [];
      if (marks.some((m) => m.type === 'code')) t = '<code>' + t + '</code>';
      if (marks.some((m) => m.type === 'italic')) t = '<em>' + t + '</em>';
      if (marks.some((m) => m.type === 'bold')) t = '<strong>' + t + '</strong>';
      const link = marks.find((m) => m.type === 'link');
      if (link && link.attrs && link.attrs.href) {
        const href = String(link.attrs.href);
        if (/^(https?:|mailto:|\/)/i.test(href)) t = '<a href="' + escapeHtml(href) + '">' + t + '</a>';
      }
      html += t;
    } else if (node.type === 'hardBreak') {
      html += '<br>';
    }
  }
  return html;
}

function renderBlocks(content) {
  let html = '';
  for (const node of content || []) {
    switch (node.type) {
      case 'paragraph':
        html += '<p>' + renderInline(node.content) + '</p>';
        break;
      case 'heading': {
        const level = Math.min(6, Math.max(1, (node.attrs && node.attrs.level) || 2));
        html += '<h' + level + '>' + renderInline(node.content) + '</h' + level + '>';
        break;
      }
      case 'bulletList':
        html += '<ul>' + renderBlocks(node.content) + '</ul>';
        break;
      case 'orderedList':
        html += '<ol>' + renderBlocks(node.content) + '</ol>';
        break;
      case 'listItem':
        html += '<li>' + renderBlocks(node.content).replace(/<\/?p>/g, '') + '</li>';
        break;
      case 'blockquote':
        html += '<blockquote>' + renderBlocks(node.content) + '</blockquote>';
        break;
      case 'codeBlock':
        html += '<pre><code>' + renderInline(node.content) + '</code></pre>';
        break;
      case 'image':
        if (node.attrs && node.attrs.src) html += '<img src="' + escapeHtml(node.attrs.src) + '" alt="' + escapeHtml((node.attrs.alt || '')) + '">';
        break;
      default:
        break;
    }
  }
  return html;
}

function buildHtmlFromDoc(doc) {
  if (!doc || doc.type !== 'doc' || !Array.isArray(doc.content)) return '';
  return renderBlocks(doc.content);
}

function validateVideoItem(item) {
  if (!item || typeof item !== 'object') return 'video phai la object';
  if (!['youtube', 'file'].includes(item.type)) return 'video.type phai la youtube hoac file';
  if (item.type === 'youtube') {
    const url = String(item.url || '');
    if (!/^https?:\/\/(www\.)?(youtube\.com\/(watch|embed|shorts)|youtu\.be\/)/i.test(url)) {
      return 'URL YouTube khong hop le';
    }
  } else if (!item.file_id && !item.url) {
    return 'video file thieu file_id';
  }
  return null;
}

function validateArticleInput(data, isUpdate) {
  const errors = [];
  if (!isUpdate && (!data.title || !String(data.title).trim())) errors.push('title bat buoc');
  if (data.slug !== undefined && data.slug !== null && data.slug !== '') {
    if (!/^[a-z0-9][a-z0-9-]{0,148}$/.test(data.slug)) errors.push('slug chi gom chu thuong, so, gach ngang');
  }
  if (data.status !== undefined && !ARTICLE_STATUSES.includes(data.status)) errors.push('status khong hop le');
  if (data.roles !== undefined && data.roles !== null) {
    if (!Array.isArray(data.roles) || data.roles.some((r) => !KNOWN_ROLES.includes(r))) {
      errors.push('roles khong hop le');
    }
  }
  if (data.videos !== undefined && data.videos !== null) {
    if (!Array.isArray(data.videos)) errors.push('videos phai la mang');
    else {
      for (const v of data.videos) {
        const err = validateVideoItem(v);
        if (err) {
          errors.push(err);
          break;
        }
      }
    }
  }
  for (const key of ['images', 'tags', 'related']) {
    if (data[key] !== undefined && data[key] !== null && !Array.isArray(data[key])) {
      errors.push(key + ' phai la mang');
    }
  }
  return errors;
}

function rowToArticle(row) {
  return {
    id: row.id,
    slug: row.slug,
    legacy_id: row.legacy_id,
    category_id: row.category_id,
    category_slug: row.category_slug || null,
    category_title: row.category_title || null,
    title: row.title,
    summary: row.summary,
    content_json: parseJson(row.content_json, null),
    content_html: row.content_html,
    videos: parseJson(row.videos, []),
    images: parseJson(row.images, []),
    route: row.route,
    tags: parseJson(row.tags, []),
    related: parseJson(row.related, []),
    roles: parseJson(row.roles, null),
    status: row.status,
    sort_order: row.sort_order,
    view_count: row.view_count,
    published_at: row.published_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToCategory(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    icon: row.icon,
    sort_order: row.sort_order,
    visible_roles: parseJson(row.visible_roles, null),
    article_count: row.article_count !== undefined ? Number(row.article_count) : undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function roleVisibleClause(userRole, alias, column) {
  const col = column || 'roles';
  if (!userRole) return ' AND (' + alias + '.' + col + ' IS NULL OR JSON_CONTAINS(' + alias + '.' + col + ', \'"guest"\'))';
  const escaped = userRole.replace(/'/g, "''");
  return ' AND (' + alias + '.' + col + ' IS NULL OR JSON_CONTAINS(' + alias + '.' + col + ', \'"' + escaped + '"\'))';
}

async function getCategories(userRole) {
  const [rows] = await pool.query(
    'SELECT c.*, (SELECT COUNT(*) FROM help_articles a WHERE a.category_id = c.id AND a.status = \'published\'' +
    roleVisibleClause(userRole, 'a') + ') AS article_count' +
    ' FROM help_categories c WHERE 1=1' + roleVisibleClause(userRole, 'c', 'visible_roles') +
    ' ORDER BY c.sort_order ASC, c.id ASC'
  );
  return rows.map(rowToCategory);
}

async function listArticles(filters, userRole) {
  const where = ['a.status = \'published\''];
  const params = [];
  if (filters.category) {
    where.push('c.slug = ?');
    params.push(filters.category);
  }
  if (filters.q) {
    if (filters.q.length >= 3) {
      where.push('MATCH(a.title, a.summary, a.content_html) AGAINST(? IN NATURAL LANGUAGE MODE)');
      params.push(filters.q);
    } else {
      where.push('(a.title LIKE ? OR a.summary LIKE ?)');
      params.push('%' + filters.q + '%', '%' + filters.q + '%');
    }
  }
  const [rows] = await pool.query(
    'SELECT a.*, c.slug AS category_slug, c.title AS category_title FROM help_articles a' +
    ' LEFT JOIN help_categories c ON c.id = a.category_id' +
    ' WHERE ' + where.join(' AND ') + roleVisibleClause(userRole, 'a') +
    ' ORDER BY a.sort_order ASC, a.id ASC LIMIT 200',
    params
  );
  return rows.map(rowToArticle);
}

async function getBySlug(slugOrLegacy, userRole) {
  const [rows] = await pool.query(
    'SELECT a.*, c.slug AS category_slug, c.title AS category_title FROM help_articles a' +
    ' LEFT JOIN help_categories c ON c.id = a.category_id' +
    ' WHERE (a.slug = ? OR UPPER(a.legacy_id) = UPPER(?)) AND a.status = \'published\'' +
    roleVisibleClause(userRole, 'a') + ' LIMIT 1',
    [slugOrLegacy, slugOrLegacy]
  );
  if (rows.length === 0) return null;
  return rowToArticle(rows[0]);
}

async function trackView(id) {
  await pool.query('UPDATE help_articles SET view_count = view_count + 1 WHERE id = ?', [id]);
}

async function adminList(filters) {
  const where = ['1=1'];
  const params = [];
  if (filters.status) {
    where.push('a.status = ?');
    params.push(filters.status);
  }
  if (filters.category) {
    where.push('c.slug = ?');
    params.push(filters.category);
  }
  if (filters.q) {
    where.push('(a.title LIKE ? OR a.slug LIKE ? OR a.legacy_id LIKE ?)');
    params.push('%' + filters.q + '%', '%' + filters.q + '%', '%' + filters.q + '%');
  }
  const [rows] = await pool.query(
    'SELECT a.*, c.slug AS category_slug, c.title AS category_title FROM help_articles a' +
    ' LEFT JOIN help_categories c ON c.id = a.category_id' +
    ' WHERE ' + where.join(' AND ') + ' ORDER BY a.sort_order ASC, a.id ASC LIMIT 500',
    params
  );
  return rows.map(rowToArticle);
}

async function adminGet(id) {
  const [rows] = await pool.query(
    'SELECT a.*, c.slug AS category_slug, c.title AS category_title FROM help_articles a' +
    ' LEFT JOIN help_categories c ON c.id = a.category_id WHERE a.id = ? LIMIT 1',
    [id]
  );
  if (rows.length === 0) return null;
  return rowToArticle(rows[0]);
}

async function resolveCategoryId(categoryId, categorySlug) {
  if (categoryId) {
    const [rows] = await pool.query('SELECT id FROM help_categories WHERE id = ?', [categoryId]);
    return rows.length > 0 ? rows[0].id : null;
  }
  if (categorySlug) {
    const [rows] = await pool.query('SELECT id FROM help_categories WHERE slug = ?', [categorySlug]);
    if (rows.length > 0) return rows[0].id;
  }
  return undefined;
}

async function createArticle(data, userId) {
  const errors = validateArticleInput(data, false);
  if (errors.length > 0) {
    const err = new Error(errors.join('; '));
    err.statusCode = 400;
    throw err;
  }
  const slug = (data.slug && String(data.slug).trim()) || (String(data.title).trim().toLowerCase() + '-' + Date.now());
  const finalSlug = slugify(slug, 'bai-viet');
  const [dup] = await pool.query('SELECT id FROM help_articles WHERE slug = ?', [finalSlug]);
  if (dup.length > 0) {
    const err = new Error('slug da ton tai');
    err.statusCode = 400;
    throw err;
  }
  const catId = await resolveCategoryId(data.category_id, data.category_slug);
  if (catId === null) {
    const err = new Error('category khong ton tai');
    err.statusCode = 400;
    throw err;
  }
  const doc = data.content_json || null;
  const html = data.content_html !== undefined ? sanitizeHtml(data.content_html) : sanitizeHtml(buildHtmlFromDoc(doc));
  const status = data.status || 'draft';
  const [res] = await pool.query(
    'INSERT INTO help_articles (slug, legacy_id, category_id, title, summary, content_json, content_html, videos, images, route, tags, related, roles, status, sort_order, created_by, updated_by, published_at)' +
    ' VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), ?, CAST(? AS JSON), CAST(? AS JSON), ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), ?, ?, ?, ?, ?)',
    [
      finalSlug, data.legacy_id || null, catId === undefined ? null : catId,
      String(data.title).trim(), data.summary || null,
      doc ? JSON.stringify(doc) : null, html,
      toJsonParam(data.videos || []), toJsonParam(data.images || []),
      data.route || null,
      toJsonParam(data.tags || []), toJsonParam(data.related || []),
      toJsonParam(data.roles || null), status, data.sort_order || 0,
      userId || null, userId || null,
      status === 'published' ? new Date() : null,
    ]
  );
  bumpAssistantCache();
  return adminGet(res.insertId);
}

async function updateArticle(id, data, userId) {
  const current = await adminGet(id);
  if (!current) return null;
  const errors = validateArticleInput(data, true);
  if (errors.length > 0) {
    const err = new Error(errors.join('; '));
    err.statusCode = 400;
    throw err;
  }
  if (data.slug) {
    const finalSlug = slugify(String(data.slug).trim(), current.slug);
    const [dup] = await pool.query('SELECT id FROM help_articles WHERE slug = ? AND id <> ?', [finalSlug, id]);
    if (dup.length > 0) {
      const err = new Error('slug da ton tai');
      err.statusCode = 400;
      throw err;
    }
    data.slug = finalSlug;
  }
  let catId = current.category_id;
  if (data.category_id !== undefined || data.category_slug !== undefined) {
    const resolved = await resolveCategoryId(data.category_id, data.category_slug);
    if (resolved === null) {
      const err = new Error('category khong ton tai');
      err.statusCode = 400;
      throw err;
    }
    catId = resolved === undefined ? null : resolved;
  }
  const sets = ['category_id = ?', 'updated_by = ?'];
  const params = [catId, userId || null];
  const simpleFields = ['slug', 'title', 'summary', 'route'];
  for (const f of simpleFields) {
    if (data[f] !== undefined) {
      sets.push(f + ' = ?');
      params.push(f === 'title' ? String(data[f]).trim() : (data[f] || null));
    }
  }
  if (data.content_json !== undefined) {
    sets.push('content_json = CAST(? AS JSON)');
    params.push(data.content_json ? JSON.stringify(data.content_json) : null);
  }
  if (data.content_html !== undefined) {
    sets.push('content_html = ?');
    params.push(sanitizeHtml(data.content_html));
  } else if (data.content_json !== undefined && data.content_json) {
    sets.push('content_html = ?');
    params.push(sanitizeHtml(buildHtmlFromDoc(data.content_json)));
  }
  for (const f of ['videos', 'images', 'tags', 'related', 'roles']) {
    if (data[f] !== undefined) {
      sets.push(f + ' = CAST(? AS JSON)');
      params.push(data[f] === null ? null : JSON.stringify(data[f]));
    }
  }
  if (data.sort_order !== undefined) {
    sets.push('sort_order = ?');
    params.push(Number(data.sort_order) || 0);
  }
  if (data.status !== undefined && data.status !== current.status) {
    sets.push('status = ?');
    params.push(data.status);
    sets.push('published_at = ?');
    params.push(data.status === 'published' ? new Date() : current.published_at);
  }
  params.push(id);
  await pool.query('UPDATE help_articles SET ' + sets.join(', ') + ' WHERE id = ?', params);
  bumpAssistantCache();
  return adminGet(id);
}

async function deleteArticle(id) {
  const [res] = await pool.query('DELETE FROM help_articles WHERE id = ?', [id]);
  if (res.affectedRows > 0) bumpAssistantCache();
  return res.affectedRows > 0;
}

async function setArticleStatus(id, status, userId) {
  if (!ARTICLE_STATUSES.includes(status)) {
    const err = new Error('status khong hop le');
    err.statusCode = 400;
    throw err;
  }
  const current = await adminGet(id);
  if (!current) return null;
  await pool.query(
    'UPDATE help_articles SET status = ?, published_at = ?, updated_by = ? WHERE id = ?',
    [status, status === 'published' ? new Date() : current.published_at, userId || null, id]
  );
  bumpAssistantCache();
  return adminGet(id);
}

async function createCategory(data) {
  if (!data.slug || !/^[a-z0-9][a-z0-9-]{0,98}$/.test(data.slug)) {
    const err = new Error('slug category khong hop le');
    err.statusCode = 400;
    throw err;
  }
  if (!data.title || !String(data.title).trim()) {
    const err = new Error('title category bat buoc');
    err.statusCode = 400;
    throw err;
  }
  const [dup] = await pool.query('SELECT id FROM help_categories WHERE slug = ?', [data.slug]);
  if (dup.length > 0) {
    const err = new Error('slug category da ton tai');
    err.statusCode = 400;
    throw err;
  }
  const [res] = await pool.query(
    'INSERT INTO help_categories (slug, title, icon, sort_order, visible_roles) VALUES (?, ?, ?, ?, CAST(? AS JSON))',
    [data.slug, String(data.title).trim(), data.icon || null, data.sort_order || 0, toJsonParam(data.visible_roles || null)]
  );
  bumpAssistantCache();
  const [rows] = await pool.query('SELECT * FROM help_categories WHERE id = ?', [res.insertId]);
  return rowToCategory(rows[0]);
}

const STOPWORDS = new Set([
  'lam', 'sao', 'the', 'nao', 'cach', 'gi', 'de', 'mot', 'cua', 'va', 'hay', 'khi',
  'cho', 'toi', 'minh', 'co', 'khong', 'duoc', 'thi', 'voi', 'nhu', 'ra', 'vao',
  'o', 'tai', 'nay', 'do', 'muon', 'bang', 'bao', 'nhieu', 'the', 'giup', 'hoi',
  'xin', 'can', 'phai', 'nhung', 'hoac', 'neu', 'roi', 'cung', 'chi', 'mot',
]);

function normalizeText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

const SHORT_TOKENS = new Set([
  'nq', 'lk', 'tdt', 'nqlk', '3d', 'api', 'qr', 'ip', 'pdf', 'csv', 'txt',
  'ctv', 'npp', 'sms', 'otp', 'url', 'id', 'gps', 'ev', 'kw', 'kwh', 'ac',
  'dc', 'faq', 'ui', 'ux', 'db', 'sql', 'cdn', 'ssl', 'lcd', 'led', 'sim',
  'pb', 'cd', 'gd', 'tt', 'kv', 'bc', 'dx', 'tmdv', 'kcn',
]);

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fieldIncludes(field, t) {
  if (!field || !t) return false;
  if (t.length < 3) return new RegExp(`\\b${escapeRegExp(t)}\\b`).test(field);
  return field.includes(t);
}

function tokenize(text) {
  return normalizeText(text)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => (t.length >= 3 || SHORT_TOKENS.has(t)) && !STOPWORDS.has(t));
}

function normHay(text) {
  return normalizeText(text).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');
}

function scoreArticle(row, tokens, phrases) {
  const title = normHay(row.title);
  const summary = normHay(row.summary);
  const content = normHay(row.content_html);
  const tags = normHay(parseJson(row.tags, []).join(' '));
  let score = 0;
  let contentHits = 0;
  for (const t of tokens) {
    if (fieldIncludes(title, t)) score += 6;
    if (fieldIncludes(tags, t)) score += 4;
    if (fieldIncludes(summary, t)) score += 3;
    if (fieldIncludes(content, t)) contentHits += 1;
  }
  score += contentHits / Math.sqrt(content.length / 2000 + 1);
  for (const p of phrases) {
    if (title.includes(p)) score += 6;
    else if (summary.includes(p)) score += 3;
  }
  return score;
}

async function searchForAssistant(question, userRole, limit) {
  const max = limit || 5;
  const tokens = tokenize(question).slice(0, 8);
  const phrases = [];
  for (let i = 0; i + 1 < tokens.length; i += 1) {
    phrases.push(`${tokens[i]} ${tokens[i + 1]}`);
    if (i + 2 < tokens.length) phrases.push(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
  }

  let rows = [];
  try {
    const [ft] = await pool.query(
      'SELECT a.*, c.slug AS category_slug, c.title AS category_title FROM help_articles a' +
      ' LEFT JOIN help_categories c ON c.id = a.category_id' +
      ' WHERE a.status = \'published\'' + roleVisibleClause(userRole, 'a') +
      ' AND MATCH(a.title, a.summary, a.content_html) AGAINST(? IN NATURAL LANGUAGE MODE) LIMIT 60',
      [question]
    );
    rows = ft;
  } catch { /* FULLTEXT unavailable */ }

  if (rows.length === 0) {
    const [all] = await pool.query(
      'SELECT a.*, c.slug AS category_slug, c.title AS category_title FROM help_articles a' +
      ' LEFT JOIN help_categories c ON c.id = a.category_id' +
      ' WHERE a.status = \'published\'' + roleVisibleClause(userRole, 'a') +
      ' LIMIT 500'
    );
    rows = all;
  }

  const scored = rows.map((row) => ({ row, score: scoreArticle(row, tokens, phrases) }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    const fulltext = await listArticles({ q: question }, userRole);
    return fulltext.slice(0, max);
  }
  const topScore = scored[0].score;
  const threshold = Math.max(4, topScore * 0.35);
  return scored.filter((x) => x.score >= threshold).slice(0, max).map((x) => rowToArticle(x.row));
}

async function legacyStatus() {  const [artCount] = await pool.query('SELECT COUNT(*) AS n FROM help_articles');
  const [catCount] = await pool.query('SELECT COUNT(*) AS n FROM help_categories');
  return { articles: artCount[0].n, categories: catCount[0].n };
}

module.exports = {
  KNOWN_ROLES,
  ARTICLE_STATUSES,
  sanitizeHtml,
  buildHtmlFromDoc,
  validateArticleInput,
  getCategories,
  listArticles,
  getBySlug,
  trackView,
  searchForAssistant,
  normalizeText,
  normHay,
  fieldIncludes,
  tokenize,
  adminList,
  adminGet,
  createArticle,
  updateArticle,
  deleteArticle,
  setArticleStatus,
  createCategory,
  legacyStatus,
};
