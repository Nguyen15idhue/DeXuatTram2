const path = require('path');
const { pathToFileURL } = require('url');

const pool = require('../src/utils/db');

const HELP_DIR = path.join(__dirname, '..', '..', 'frontend', 'src', 'help');

const SUPER_SECTIONS = ['fields', 'forms', 'views', 'data-lists', 'mapcfg', 'roles-api'];
const PANEL_SECTIONS = ['dash', 'users', 'stations', 'proposals'];
const ALL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SALES', 'CTV', 'NPP'];
const PANEL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SALES'];
const SUPER_ROLES = ['SUPER_ADMIN'];

function rolesForSection(sectionId) {
  if (SUPER_SECTIONS.includes(sectionId)) return SUPER_ROLES;
  if (PANEL_SECTIONS.includes(sectionId)) return PANEL_ROLES;
  return ALL_ROLES;
}

function slugify(text, fallback) {
  const s = (text || '')
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

function esc(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textNode(text, bold) {
  const node = { type: 'text', text: String(text) };
  if (bold) node.marks = [{ type: 'bold' }];
  return node;
}

function para(segments) {
  return { type: 'paragraph', content: segments };
}

function labeledPara(label, value) {
  return para([textNode(label + ': ', true), textNode(value)]);
}

function listBlock(ordered, items) {
  return {
    type: ordered ? 'orderedList' : 'bulletList',
    content: items.map((item) => ({
      type: 'listItem',
      content: [para([textNode(item)])],
    })),
  };
}

function stepToDoc(step) {
  const content = [];
  if (step.purpose) content.push(labeledPara('De lam gi', step.purpose));
  else if (step.text) content.push(para([textNode(step.text)]));
  if (step.audience) content.push(labeledPara('Ai lam / khi nao', step.audience));
  if (step.prereq) content.push(labeledPara('Truoc khi bat dau', step.prereq));
  if (step.note) content.push(para([textNode(step.note)]));
  if (Array.isArray(step.substeps) && step.substeps.length > 0) {
    content.push(listBlock(true, step.substeps));
  }
  if (step.expected) content.push(labeledPara('Ket qua', step.expected));
  if (Array.isArray(step.errors) && step.errors.length > 0) {
    content.push(para([textNode('Loi thuong gap', true)]));
    content.push(listBlock(false, step.errors));
  }
  return { type: 'doc', content };
}

function stepToHtml(step) {
  const parts = [];
  if (step.purpose) parts.push('<p><strong>De lam gi:</strong> ' + esc(step.purpose) + '</p>');
  else if (step.text) parts.push('<p>' + esc(step.text) + '</p>');
  if (step.audience) parts.push('<p><strong>Ai lam / khi nao:</strong> ' + esc(step.audience) + '</p>');
  if (step.prereq) parts.push('<p><strong>Truoc khi bat dau:</strong> ' + esc(step.prereq) + '</p>');
  if (step.note) parts.push('<p>' + esc(step.note) + '</p>');
  if (Array.isArray(step.substeps) && step.substeps.length > 0) {
    parts.push('<ol>' + step.substeps.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol>');
  }
  if (step.expected) parts.push('<p><strong>Ket qua:</strong> ' + esc(step.expected) + '</p>');
  if (Array.isArray(step.errors) && step.errors.length > 0) {
    parts.push('<p><strong>Loi thuong gap:</strong></p><ul>' + step.errors.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul>');
  }
  return parts.join('\n');
}

function flowToDoc(flow) {
  const content = [];
  if (flow.desc) content.push(para([textNode(flow.desc)]));
  for (const st of flow.steps || []) {
    const label = st.ref ? '[' + st.ref + '] ' : '';
    content.push(para([textNode(label, true), textNode(st.note || '')]));
  }
  return { type: 'doc', content };
}

function flowToHtml(flow) {
  const parts = [];
  if (flow.desc) parts.push('<p>' + esc(flow.desc) + '</p>');
  if (Array.isArray(flow.steps) && flow.steps.length > 0) {
    parts.push('<ol>' + flow.steps.map((st) => {
      const label = st.ref ? '<strong>[' + esc(st.ref) + ']</strong> ' : '';
      return '<li>' + label + esc(st.note || '') + '</li>';
    }).join('') + '</ol>');
  }
  return parts.join('\n');
}

async function upsertCategory(slug, title, icon, sortOrder, roles) {
  const [rows] = await pool.query('SELECT id FROM help_categories WHERE slug = ?', [slug]);
  if (rows.length > 0) return rows[0].id;
  const [res] = await pool.query(
    'INSERT INTO help_categories (slug, title, icon, sort_order, visible_roles) VALUES (?, ?, ?, ?, CAST(? AS JSON))',
    [slug, title, icon || null, sortOrder, JSON.stringify(roles)]
  );
  return res.insertId;
}

async function insertArticle(row) {
  const [exists] = await pool.query('SELECT id FROM help_articles WHERE slug = ? OR legacy_id = ?', [row.slug, row.legacyId]);
  if (exists.length > 0) return { skipped: true };
  await pool.query(
    'INSERT INTO help_articles (slug, legacy_id, category_id, title, summary, content_json, content_html, videos, images, route, tags, related, roles, status, sort_order, published_at)' +
    ' VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), ?, CAST(? AS JSON), CAST(? AS JSON), ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), ?, ?, NOW())',
    [
      row.slug, row.legacyId, row.categoryId, row.title, row.summary || null,
      JSON.stringify(row.doc), row.html,
      JSON.stringify(row.videos || []), JSON.stringify(row.images || []),
      row.route || null,
      JSON.stringify(row.tags || []), JSON.stringify(row.related || []),
      JSON.stringify(row.roles), 'published', row.sortOrder,
    ]
  );
  return { skipped: false };
}

async function main() {
  const skipExisting = !process.argv.includes('--no-skip');
  if (!skipExisting) {
    throw new Error('seed-help chi ho tro che do skip-existing (idempotent)');
  }
  const [{ startGuide }] = [await import(pathToFileURL(path.join(HELP_DIR, 'guideData.start.js')).href)];
  const [{ groupsGuide }] = [await import(pathToFileURL(path.join(HELP_DIR, 'guideData.groups.js')).href)];
  const [{ flowsGuide }] = [await import(pathToFileURL(path.join(HELP_DIR, 'guideData.flows.js')).href)];
  const [{ integrationsGuide }] = [await import(pathToFileURL(path.join(HELP_DIR, 'guideData.integrations.js')).href)];

  let catOrder = 0;
  let artOrder = 0;
  let inserted = 0;
  let skipped = 0;

  const batDauId = await upsertCategory(startGuide.id, startGuide.title, startGuide.icon, catOrder++, ALL_ROLES);
  for (const step of startGuide.steps) {
    const legacy = step.id;
    const slug = legacy.toLowerCase() + '-' + slugify(step.title, 'step');
    const r = await insertArticle({
      slug, legacyId: legacy, categoryId: batDauId, title: step.title,
      summary: step.purpose || step.text || null,
      doc: stepToDoc(step), html: stepToHtml(step),
      videos: [], images: step.image ? [{ url: step.image }] : [],
      route: step.route, tags: step.tags, related: step.related,
      roles: ALL_ROLES, sortOrder: artOrder++,
    });
    if (r.skipped) skipped++; else inserted++;
  }

  for (const section of groupsGuide.sections) {
    const roles = rolesForSection(section.id);
    const catId = await upsertCategory(section.id, section.title, section.icon, catOrder++, roles);
    for (const step of section.steps) {
      const legacy = step.id;
      const slug = legacy.toLowerCase() + '-' + slugify(step.title, 'step');
      const r = await insertArticle({
        slug, legacyId: legacy, categoryId: catId, title: step.title,
        summary: step.purpose || step.text || null,
        doc: stepToDoc(step), html: stepToHtml(step),
        videos: [], images: step.image ? [{ url: step.image }] : [],
        route: step.route, tags: step.tags, related: step.related,
        roles, sortOrder: artOrder++,
      });
      if (r.skipped) skipped++; else inserted++;
    }
  }

  const flowCatId = await upsertCategory('luong-thuc-hien', flowsGuide.title, 'Route', catOrder++, ALL_ROLES);
  for (const flow of flowsGuide.flows) {
    const slug = flow.id.toLowerCase() + '-' + slugify(flow.title, 'flow');
    const images = [];
    for (const st of flow.steps || []) {
      if (st.image && !images.some((im) => im.url === st.image)) images.push({ url: st.image });
    }
    const r = await insertArticle({
      slug, legacyId: flow.id, categoryId: flowCatId, title: flow.id + '. ' + flow.title,
      summary: flow.desc || null,
      doc: flowToDoc(flow), html: flowToHtml(flow),
      videos: [], images,
      route: null,
      tags: (flow.steps || []).map((st) => st.ref).filter(Boolean),
      related: [],
      roles: ALL_ROLES, sortOrder: artOrder++,
    });
    if (r.skipped) skipped++; else inserted++;
  }

  const intCatId = await upsertCategory('tich-hop', integrationsGuide.title, 'Plug', catOrder++, PANEL_ROLES);
  for (const flow of integrationsGuide.flows) {
    const slug = flow.id.toLowerCase() + '-' + slugify(flow.title, 'flow');
    const images = [];
    for (const st of flow.steps || []) {
      if (st.image && !images.some((im) => im.url === st.image)) images.push({ url: st.image });
    }
    const r = await insertArticle({
      slug, legacyId: flow.id, categoryId: intCatId, title: flow.id + '. ' + flow.title,
      summary: flow.desc || null,
      doc: flowToDoc(flow), html: flowToHtml(flow),
      videos: [], images,
      route: null,
      tags: (flow.steps || []).map((st) => st.ref).filter(Boolean),
      related: [],
      roles: PANEL_ROLES, sortOrder: artOrder++,
    });
    if (r.skipped) skipped++; else inserted++;
  }

  const [catCount] = await pool.query('SELECT COUNT(*) AS n FROM help_categories');
  const [artCount] = await pool.query('SELECT COUNT(*) AS n FROM help_articles');
  console.log('[seed-help] inserted=' + inserted + ' skipped=' + skipped +
    ' categories=' + catCount[0].n + ' articles=' + artCount[0].n);
  await pool.end();
}

main().catch((err) => {
  console.error('[seed-help] LOI:', err.message);
  process.exit(1);
});
