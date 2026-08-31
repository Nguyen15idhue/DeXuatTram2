const pool = require('../utils/db');
const dynamicUtils = require('./dynamicUtils');

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
            fd.number_format, fd.decimal_places, fd.date_format, fd.timezone,
            fd.source_type, fd.required, fd.validation, fd.options,
            fd.source_config, fd.parent_field, fd.option_style,
            fd.file_config, fd.formula_config,
            fd.formula, fd.placeholder, fd.help_text
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
      status: form.status
    },
    fields: fields.map(f => ({
      field_id: f.field_id,
      key: f.key,
      label: f.label,
      type: f.type,
      number_format: f.number_format,
      decimal_places: f.decimal_places,
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
      config: f.config
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
            fd.number_format, fd.decimal_places, fd.date_format, fd.timezone,
            fd.source_type, fd.required, fd.options,
            fd.source_config, fd.parent_field, fd.option_style,
            fd.file_config, fd.formula_config
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
      config: f.config
    })),
    allFields: allFieldDefs.map(f => ({
      id: f.id,
      key: f.key,
      label: f.label,
      type: f.type,
      number_format: f.number_format,
      decimal_places: f.decimal_places,
      date_format: f.date_format,
      timezone: f.timezone,
      source_type: f.source_type,
      required: !!f.required,
      options: f.options ? dynamicUtils.parseOptions(f.options) : [],
      source_config: f.source_config ? dynamicUtils.parseOptions(f.source_config) : null,
      parent_field: f.parent_field,
      option_style: f.option_style ? dynamicUtils.parseOptions(f.option_style) : null,
      file_config: f.file_config ? dynamicUtils.parseOptions(f.file_config) : null,
      formula_config: f.formula_config ? dynamicUtils.parseOptions(f.formula_config) : null
    }))
  };
};

exports.validateEntityData = async (entity, data) => {
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity(entity);
  return dynamicUtils.validateData(entity, data, fieldDefs);
};
