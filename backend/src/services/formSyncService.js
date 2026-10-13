const pool = require('../utils/db');
const apiConfigService = require('./apiConfigService');
const templateService = require('./templateService');

const EXTRA_SECTION_ID = 'sync_extra_section';
const EXTRA_SECTION_TITLE = 'Trường riêng form xem/sửa';
const DEFAULT_COLOR = '#27ae60';
const DEFAULT_EMOJI = '📋';
const TAB_COLOR = '#0ea5e9';
const TAB_EMOJI = '🤝';
const COLOR_BY_MO_HINH = {
  TDT: ['#f39c12', '📋'],
  LK: ['#9b59b6', '📋'],
  NQ: ['#3498db', '📋']
};

const parseJson = (value, fallback) => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const loadForm = async (formId) => {
  const [forms] = await pool.query('SELECT * FROM forms WHERE id = ?', [formId]);
  if (forms.length === 0) return null;
  const [fields] = await pool.query(
    `SELECT ff.field_id, ff.visible, ff.config, fd.\`key\`, fd.label, fd.type
     FROM form_fields ff
     JOIN field_definitions fd ON fd.id = ff.field_id
     WHERE ff.form_id = ?
     ORDER BY ff.order_index, ff.id`,
    [formId]
  );
  return { form: forms[0], fields };
};

const findSourceFormId = async (entity, excludeId) => {
  const [rows] = await pool.query(
    `SELECT id FROM forms
     WHERE entity = ? AND purpose = 'create' AND status = 'active' AND id <> ?
     ORDER BY is_default DESC, id ASC LIMIT 1`,
    [entity, excludeId]
  );
  return rows.length > 0 ? rows[0].id : null;
};

const normalizeLayout = (raw) => {
  const parsed = parseJson(raw, null) || {};
  const sections = (Array.isArray(parsed.sections) ? parsed.sections : [])
    .filter((s) => s && s.id && s.id !== EXTRA_SECTION_ID)
    .map((s) => (s.type === 'tabs' ? { ...s, rows: [] } : { ...s, rows: Array.isArray(s.rows) ? s.rows : [] }));
  return { ...parsed, rows: Array.isArray(parsed.rows) ? parsed.rows : [], sections };
};

const collectRowIds = (layout) => {
  const ids = new Set();
  for (const section of layout.sections || []) {
    for (const row of section.rows || []) ids.add(String(row.id));
  }
  return ids;
};

const groupKeyOf = (field) => {
  const raw = field.config && field.config.rowId ? String(field.config.rowId) : '';
  if (!raw) return `single_${field.key}`;
  let key = raw;
  while (key.startsWith('sync_extra_')) key = key.slice('sync_extra_'.length);
  return key;
};

const groupParkedFields = (parked) => {
  const groups = new Map();
  for (const field of parked) {
    const key = groupKeyOf(field);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(field);
  }
  const rows = [];
  const placed = [];
  for (const [groupKey, list] of groups) {
    const rowId = `sync_extra_${groupKey}`;
    list.sort((a, b) => ((a.config && a.config.colIndex) || 0) - ((b.config && b.config.colIndex) || 0));
    rows.push({ id: rowId, columns: list.length > 1 ? '1:2' : '1:1' });
    list.forEach((field, index) => {
      const config = { ...(field.config || {}), rowId, colIndex: index };
      delete config.rowIndex;
      placed.push({ ...field, config });
    });
  }
  return { rows, placed };
};

const buildPlan = async (targetId) => {
  const target = await loadForm(targetId);
  if (!target) {
    throw Object.assign(new Error('Không tìm thấy form'), { statusCode: 404 });
  }
  if (target.form.purpose !== 'view') {
    throw Object.assign(new Error('Chỉ đồng bộ được cho form Xem/sửa (purpose = view)'), { statusCode: 400 });
  }

  const sourceId = await findSourceFormId(target.form.entity, target.form.id);
  if (!sourceId) {
    throw Object.assign(
      new Error(`Không tìm thấy form Nhập liệu (create) đang hoạt động cho entity ${target.form.entity}`),
      { statusCode: 400 }
    );
  }

  const source = await loadForm(sourceId);
  const layout = normalizeLayout(source.form.layout_config);
  const rowIds = collectRowIds(layout);

  const sourceKeys = new Set(source.fields.map((f) => f.key));
  const sourceByKey = new Map();
  const kept = [];
  const parked = [];
  for (const field of source.fields) {
    const config = parseJson(field.config, {});
    sourceByKey.set(field.key, config);
    if (!config.rowId || !rowIds.has(String(config.rowId))) {
      parked.push({ ...field, config, reason: 'no_row' });
    } else {
      kept.push({ ...field, config });
    }
  }

  const extraOnly = [];
  const replaced = [];
  for (const field of target.fields) {
    const config = parseJson(field.config, {});
    if (!sourceKeys.has(field.key)) {
      extraOnly.push({ ...field, config, reason: 'view_only' });
    } else if (JSON.stringify(config) !== JSON.stringify(sourceByKey.get(field.key))) {
      replaced.push({ key: field.key, label: field.label, type: field.type });
    }
  }
  parked.push(...extraOnly);

  const grouped = groupParkedFields(parked);
  if (grouped.rows.length > 0) {
    layout.sections = layout.sections.concat([
      { id: EXTRA_SECTION_ID, title: EXTRA_SECTION_TITLE, collapsible: false, rows: grouped.rows }
    ]);
  }

  const fields = kept.concat(grouped.placed).map((field, index) => ({
    field_id: field.field_id,
    key: field.key,
    label: field.label,
    type: field.type,
    order_index: index,
    visible: field.visible === 0 || field.visible === false ? 0 : 1,
    config: field.config
  }));

  return {
    target: target.form,
    source: source.form,
    layout,
    fields,
    summary: {
      sourceFieldCount: source.fields.length,
      targetFieldCount: target.fields.length,
      newFieldCount: fields.length,
      keptCount: kept.length,
      parkedFromSource: parked.filter((f) => f.reason === 'no_row').length,
      extraOnly: extraOnly.length,
      replaced: replaced.length,
      extraSectionCreated: grouped.rows.length > 0
    },
    parked: parked.map((f) => ({ key: f.key, label: f.label, type: f.type, reason: f.reason })),
    replaced
  };
};

const fieldsOfSection = (section, fields) => {
  const out = [];
  for (const row of section.rows || []) {
    const cells = fields
      .filter((f) => f.config && String(f.config.rowId) === String(row.id))
      .map((f) => ({ key: f.key, colIndex: f.config.colIndex || 0 }))
      .sort((a, b) => a.colIndex - b.colIndex);
    cells.forEach((cell) => out.push(cell.key));
  }
  return out;
};

const describeSections = (layout, fields) =>
  (layout.sections || []).map((section) => ({
    id: section.id,
    title: section.title,
    type: section.type === 'tabs' ? 'tabs' : 'section',
    condition: section.visibleWhen ? { field: section.visibleWhen.field, value: section.visibleWhen.value } : null,
    fields: fieldsOfSection(section, fields)
  }));

const buildDescTemplate = (layout, fields, existing) => {
  const labelByKey = new Map(fields.map((f) => [f.key, f.label]));
  const styleById = new Map();
  const walk = (list) => {
    for (const section of list || []) {
      if (section && section.id) styleById.set(section.id, section);
      if (section && Array.isArray(section.sections)) walk(section.sections);
    }
  };
  walk(existing && existing.sections);

  const styleFor = (section, isTab) => {
    const saved = styleById.get(section.id) || {};
    let fallback = isTab ? [TAB_COLOR, TAB_EMOJI] : [DEFAULT_COLOR, DEFAULT_EMOJI];
    const value = section.visibleWhen && section.visibleWhen.value;
    if (COLOR_BY_MO_HINH[value]) fallback = COLOR_BY_MO_HINH[value];
    return { color: saved.color || fallback[0], emoji: saved.emoji || fallback[1] };
  };

  const sectionNode = (section, withCondition) => {
    const keys = fieldsOfSection(section, fields).filter((key) => labelByKey.has(key));
    if (keys.length === 0) return null;
    const style = styleFor(section, false);
    const node = {
      id: section.id,
      color: style.color,
      emoji: style.emoji,
      title: section.title,
      layout: (section.rows || []).some((r) => String(r.columns) === '1:2') ? '2col' : '1col',
      collapsible: false,
      fields: keys
    };
    if (withCondition) {
      if (section.visibleWhen && section.visibleWhen.field) {
        node.condition = { field: section.visibleWhen.field, value: section.visibleWhen.value, operator: '=' };
        node.always_show = false;
      } else {
        node.condition = null;
        node.always_show = true;
      }
    }
    return node;
  };

  const byId = new Map((layout.sections || []).map((s) => [s.id, s]));
  const sections = [];
  for (const section of layout.sections || []) {
    if (section.type === 'tabs') {
      const children = [];
      for (const tab of section.tabs || []) {
        for (const ref of tab.sectionRefs || []) {
          const target = byId.get(ref);
          if (!target) continue;
          const child = sectionNode(target, false);
          if (child) children.push(child);
        }
      }
      if (children.length === 0) continue;
      const style = styleFor(section, true);
      const node = {
        id: section.id,
        color: style.color,
        emoji: style.emoji,
        title: section.title,
        layout: '2col',
        collapsible: false,
        sections: children
      };
      if (section.visibleWhen && section.visibleWhen.field) {
        node.condition = { field: section.visibleWhen.field, value: section.visibleWhen.value, operator: '=' };
        node.always_show = false;
      } else {
        node.condition = null;
        node.always_show = true;
      }
      sections.push(node);
      continue;
    }
    const node = sectionNode(section, true);
    if (node) sections.push(node);
  }
  return { sections };
};

const findDescTemplateConfig = async () => {
  const [preferred] = await pool.query(
    `SELECT id, name FROM api_configs
     WHERE system_key = '1office' AND api_type = 'contact'
     ORDER BY id ASC LIMIT 1`
  );
  if (preferred.length > 0) return preferred[0];
  const [fallback] = await pool.query(
    'SELECT id, name FROM api_configs WHERE desc_template_config IS NOT NULL ORDER BY id ASC LIMIT 1'
  );
  return fallback.length > 0 ? fallback[0] : null;
};

exports.syncPreview = async (targetId) => {
  const plan = await buildPlan(targetId);
  const descConfig = await findDescTemplateConfig();
  const existing = descConfig ? await apiConfigService.getDescTemplate(descConfig.id) : null;
  const descTemplate = buildDescTemplate(plan.layout, plan.fields, existing);
  return {
    targetForm: {
      id: plan.target.id,
      name: plan.target.name,
      entity: plan.target.entity,
      purpose: plan.target.purpose
    },
    sourceForm: { id: plan.source.id, name: plan.source.name },
    summary: plan.summary,
    extraSectionTitle: EXTRA_SECTION_TITLE,
    parked: plan.parked,
    replaced: plan.replaced,
    sections: describeSections(plan.layout, plan.fields),
    descConfig: descConfig
      ? { id: descConfig.id, name: descConfig.name, sectionCount: descTemplate.sections.length }
      : null,
    descTemplate
  };
};

exports.syncFromCreate = async (targetId, options = {}) => {
  const plan = await buildPlan(targetId);
  const syncDesc = !!options.syncDesc;
  const descConfig = syncDesc ? await findDescTemplateConfig() : null;
  let descTemplate = null;

  if (descConfig) {
    const existing = await apiConfigService.getDescTemplate(descConfig.id);
    descTemplate = buildDescTemplate(plan.layout, plan.fields, existing);
    const validation = templateService.validateTemplate(descTemplate);
    if (!validation.valid) {
      throw Object.assign(new Error(`Mẫu mô tả 1Office tạo ra không hợp lệ: ${validation.errors.join('; ')}`), {
        statusCode: 400
      });
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE forms SET layout_config = ?, updated_at = NOW() WHERE id = ?', [
      JSON.stringify(plan.layout),
      targetId
    ]);
    await conn.query('DELETE FROM form_fields WHERE form_id = ?', [targetId]);
    if (plan.fields.length > 0) {
      const rows = plan.fields.map((f) => [
        targetId,
        f.field_id,
        f.order_index,
        f.visible,
        JSON.stringify(f.config)
      ]);
      await conn.query('INSERT INTO form_fields (form_id, field_id, order_index, visible, config) VALUES ?', [rows]);
    }
    if (descTemplate) {
      await conn.query('UPDATE api_configs SET desc_template_config = ?, updated_at = NOW() WHERE id = ?', [
        JSON.stringify(descTemplate),
        descConfig.id
      ]);
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  if (descTemplate) templateService.clearCache();

  return {
    summary: plan.summary,
    sections: describeSections(plan.layout, plan.fields),
    descConfig: descTemplate
      ? { id: descConfig.id, name: descConfig.name, sectionCount: descTemplate.sections.length }
      : null
  };
};
