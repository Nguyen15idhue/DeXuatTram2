const pool = require('../utils/db');
const dynamicUtils = require('./dynamicUtils');
const formulaService = require('./formulaService');
const math = formulaService.math;

exports.getFormConfig = async (entity, formId) => {
  const [forms] = await pool.query(
    'SELECT * FROM forms WHERE id = ? AND entity = ?',
    [formId, entity]
  );
  if (forms.length === 0) return null;

  const form = forms[0];

  const [fields] = await pool.query(
    `SELECT ff.order_index, ff.visible, ff.config,
            fd.id as field_id, fd.entity, fd.\`key\`, fd.label, fd.type,
            fd.number_format, fd.decimal_places, fd.display_format, fd.unit, fd.date_format, fd.timezone,
            fd.source_type, fd.required, fd.validation, fd.options,
            fd.source_config, fd.parent_field, fd.option_style,
            fd.file_config, fd.formula_config,
            fd.formula, fd.placeholder, fd.help_text,
            fd.data_list_id, fd.data_list_column, fd.data_list_label_column, fd.relation_key
     FROM form_fields ff
     JOIN field_definitions fd ON ff.field_id = fd.id
     WHERE ff.form_id = ?
     ORDER BY ff.order_index`,
    [formId]
  );

  return {
    form: {
      id: form.id,
      entity: form.entity,
      name: form.name,
      description: form.description,
      status: form.status,
      layout_config: form.layout_config
    },
    fields: fields.map(f => ({
      field_id: f.field_id,
      key: f.key,
      label: f.label,
      type: f.type,
      number_format: f.number_format,
      decimal_places: f.decimal_places,
      display_format: f.display_format || 'plain',
      unit: f.unit || null,
      date_format: f.date_format,
      timezone: f.timezone,
      source_type: f.source_type,
      required: !!f.required,
      validation: f.validation,
      options: f.options ? dynamicUtils.parseOptions(f.options) : [],
      source_config: f.source_config ? dynamicUtils.parseOptions(f.source_config) : null,
      parent_field: f.parent_field,
      option_style: f.option_style ? dynamicUtils.parseOptions(f.option_style) : null,
      file_config: f.file_config ? dynamicUtils.parseOptions(f.file_config) : null,
      formula_config: f.formula_config ? dynamicUtils.parseOptions(f.formula_config) : null,
      formula: f.formula,
      placeholder: f.placeholder,
      help_text: f.help_text,
      order_index: f.order_index,
      visible: !!f.visible,
      config: f.config,
      data_list_id: f.data_list_id || null,
      data_list_column: f.data_list_column || null,
      data_list_label_column: f.data_list_label_column || null,
      relation_key: f.relation_key || null
    }))
  };
};

exports.getViewConfig = async (entity, viewId) => {
  const [views] = await pool.query(
    'SELECT * FROM views WHERE id = ? AND entity = ?',
    [viewId, entity]
  );
  if (views.length === 0) return null;

  const view = views[0];

  const [fields] = await pool.query(
    `SELECT vf.order_index, vf.visible, vf.width, vf.sortable, vf.filterable, vf.config,
            fd.id as field_id, fd.entity, fd.\`key\`, fd.label, fd.type,
            fd.number_format, fd.decimal_places, fd.display_format, fd.unit, fd.date_format, fd.timezone,
            fd.source_type, fd.required, fd.options,
            fd.source_config, fd.parent_field, fd.option_style,
            fd.file_config, fd.formula_config,
            fd.data_list_id, fd.data_list_column, fd.data_list_label_column, fd.relation_key
     FROM view_fields vf
     JOIN field_definitions fd ON vf.field_id = fd.id
     WHERE vf.view_id = ?
     ORDER BY vf.order_index`,
    [viewId]
  );

  const allFieldDefs = await dynamicUtils.getFieldDefinitionsByEntity(entity);

  return {
    view: {
      id: view.id,
      entity: view.entity,
      name: view.name,
      description: view.description,
      status: view.status
    },
    fields: fields.map(f => ({
      field_id: f.field_id,
      key: f.key,
      label: f.label,
      type: f.type,
      number_format: f.number_format,
      decimal_places: f.decimal_places,
      display_format: f.display_format || 'plain',
      unit: f.unit || null,
      date_format: f.date_format,
      timezone: f.timezone,
      source_type: f.source_type,
      required: !!f.required,
      options: f.options ? dynamicUtils.parseOptions(f.options) : [],
      source_config: f.source_config ? dynamicUtils.parseOptions(f.source_config) : null,
      parent_field: f.parent_field,
      option_style: f.option_style ? dynamicUtils.parseOptions(f.option_style) : null,
      file_config: f.file_config ? dynamicUtils.parseOptions(f.file_config) : null,
      formula_config: f.formula_config ? dynamicUtils.parseOptions(f.formula_config) : null,
      order_index: f.order_index,
      visible: !!f.visible,
      width: f.width,
      sortable: !!f.sortable,
      filterable: !!f.filterable,
      config: f.config,
      data_list_id: f.data_list_id || null,
      data_list_column: f.data_list_column || null,
      data_list_label_column: f.data_list_label_column || null,
      relation_key: f.relation_key || null
    })),
    allFields: allFieldDefs.map(f => ({
      id: f.id,
      key: f.key,
      label: f.label,
      type: f.type,
      number_format: f.number_format,
      decimal_places: f.decimal_places,
      display_format: f.display_format || 'plain',
      unit: f.unit || null,
      date_format: f.date_format,
      timezone: f.timezone,
      source_type: f.source_type,
      required: !!f.required,
      options: f.options ? dynamicUtils.parseOptions(f.options) : [],
      source_config: f.source_config ? dynamicUtils.parseOptions(f.source_config) : null,
      parent_field: f.parent_field,
      option_style: f.option_style ? dynamicUtils.parseOptions(f.option_style) : null,
      file_config: f.file_config ? dynamicUtils.parseOptions(f.file_config) : null,
      formula_config: f.formula_config ? dynamicUtils.parseOptions(f.formula_config) : null,
      data_list_id: f.data_list_id || null,
      data_list_column: f.data_list_column || null,
      data_list_label_column: f.data_list_label_column || null,
      relation_key: f.relation_key || null
    }))
  };
};

exports.validateEntityData = async (entity, data) => {
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity(entity);
  return dynamicUtils.validateData(entity, data, fieldDefs);
};

exports.computePostFormulas = async (entity, recordId, recordData, userId, userEmail, options = {}) => {
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity(entity);
  const postFormulaFields = fieldDefs.filter(f => {
    if (f.type !== 'formula' || !f.formula_config) return false;
    const fc = typeof f.formula_config === 'string' ? (() => { try { return JSON.parse(f.formula_config); } catch { return {}; } })() : f.formula_config;
    return fc.compute_mode === 'post';
  });
  if (postFormulaFields.length === 0) return {};

  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const createdAt = new Date().toISOString();
  const resolveUserId = recordData?.user_id ?? userId;
  let userName = '';
  let userRole = '';
  let salesName = '';
  let id1Office = '';
  if (resolveUserId !== undefined && resolveUserId !== null && resolveUserId !== '') {
    try {
      const [users] = await pool.query('SELECT full_name, role, parent_id FROM users WHERE id = ?', [resolveUserId]);
      if (users.length > 0) {
        userName = users[0].full_name || '';
        userRole = users[0].role || '';
        if (users[0].parent_id) {
          try {
            const [parents] = await pool.query('SELECT full_name FROM users WHERE id = ?', [users[0].parent_id]);
            if (parents.length > 0) salesName = parents[0].full_name || '';
          } catch { /* silent */ }
        }
      }
    } catch { /* silent */ }
  }
  if (entity === 'station_proposals' && recordId !== undefined && recordId !== null && recordId !== '') {
    try {
      const [linked] = await pool.query('SELECT contact_1office_id, contact_1office_code FROM station_proposals WHERE id = ?', [recordId]);
      if (linked.length > 0) {
        const numId = linked[0].contact_1office_id;
        id1Office = (numId !== null && numId !== undefined && String(numId) !== '')
          ? String(numId)
          : (linked[0].contact_1office_code || '');
      }
    } catch { /* silent */ }
  }
  const metadata = { id: recordId, entity, base_url: baseUrl, created_at: createdAt, user_id: userId, user_email: userEmail, user_name: userName, user_role: userRole, sales_name: salesName, id_1office: id1Office };

  const tableFields = fieldDefs.filter(f => f.type === 'table');
  const tableColArrays = {};
  for (const tf of tableFields) {
    const tc = typeof tf.source_config === 'string' ? (() => { try { return JSON.parse(tf.source_config); } catch { return {}; } })() : (tf.source_config || {});
    const columns = tc.columns || [];
    const rows = Array.isArray(recordData[tf.key]) ? recordData[tf.key] : [];
    for (const col of columns) {
      const colValues = rows.map(r => r[col.key] ?? '');
      tableColArrays[`${tf.key}.${col.key}`] = colValues;
    }
  }

  const results = {};
  const excludeKeys = new Set(options.excludeKeys || []);
  const userFieldKeys = fieldDefs.filter(f => f.type === 'user').map(f => f.key);
  const userLabelMap = {};
  if (userFieldKeys.length > 0) {
    const uidSet = new Set();
    for (const k of userFieldKeys) {
      const v = recordData?.[k];
      const id = (v && typeof v === 'object') ? Number(v.id ?? v.user_id ?? v.value) : Number(v);
      if (Number.isInteger(id) && id > 0) uidSet.add(id);
    }
    if (uidSet.size > 0) {
      try {
        const ids = [...uidSet];
        const [urows] = await pool.query(`SELECT id, full_name FROM users WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
        for (const r of urows) userLabelMap[Number(r.id)] = r.full_name || '';
      } catch { /* silent */ }
    }
  }
  for (const field of postFormulaFields) {
    const fc = typeof field.formula_config === 'string' ? (() => { try { return JSON.parse(field.formula_config); } catch { return {}; } })() : field.formula_config;
    if (!fc.expression) continue;
    if (excludeKeys.has(field.key)) continue;
    if (Array.isArray(fc.referencedFields) && fc.referencedFields.length > 0) {
      const missing = fc.referencedFields.some(k => {
        if (k.includes('.')) return false;
        return recordData?.[k] === undefined || recordData?.[k] === null || recordData?.[k] === '';
      });
      if (missing) continue;
    }
    const scope = { ...recordData };
    for (const [key, arr] of Object.entries(tableColArrays)) {
      scope[key] = arr;
    }
    for (const k of userFieldKeys) {
      const v = scope[k];
      const id = (v && typeof v === 'object') ? Number(v.id ?? v.user_id ?? v.value) : Number(v);
      if (Number.isInteger(id) && id > 0 && userLabelMap[id]) scope[k] = userLabelMap[id];
    }
    for (const [k, v] of Object.entries(metadata)) {
      scope[k] = v;
    }
    let result;
    try {
      const node = math.parse(fc.expression);
      const seqNodes = node.filter(n => n.isFunctionNode && n.fn && (n.fn.name || '').toUpperCase() === 'SEQ');
      if (seqNodes.length > 0) {
        const values = new Map();
        for (const seqNode of seqNodes) {
          if (!seqNode.args || seqNode.args.length === 0) { result = null; break; }
          const prefix = String(math.evaluate(seqNode.args[0].toString(), scope));
          values.set(seqNode, options.dryRun ? 1 : await formulaService.getNextSequence(prefix, options.connection));
        }
        if (result === null) continue;
        const transformed = node.transform(n => (values.has(n) ? new math.ConstantNode(values.get(n)) : n));
        result = transformed.compile().evaluate(scope);
      } else {
        result = math.evaluate(fc.expression, scope);
      }
    } catch { result = null; }
    if (result !== null && result !== undefined) {
      const decimalPlaces = fc.decimalPlaces ?? 2;
      if (fc.outputType === 'number' || (fc.outputType === 'auto' && typeof result === 'number')) {
        let formatted = Number(result);
        if (decimalPlaces > 0) formatted = formatted.toFixed(decimalPlaces);
        if (fc.unit) formatted += ' ' + fc.unit;
        results[field.key] = String(formatted);
      } else {
        results[field.key] = String(result);
      }
    }
  }
  return results;
};
