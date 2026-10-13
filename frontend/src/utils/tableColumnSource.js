const SOURCES = ['manual', 'datalist', 'inherit'];

const findBaseField = (col, allFields) => {
  if (!col || !col.field_id) return null;
  return (allFields || []).find((f) => f && (f.id === col.field_id || f.field_id === col.field_id)) || null;
};

const getColumnSource = (col, base) => {
  if (col && SOURCES.includes(col.options_source)) return col.options_source;
  if (col && col.data_list_id) return 'datalist';
  if (base && base.data_list_id) return 'inherit';
  return 'manual';
};

const resolveColumnDatalist = (col, base) => {
  const src = getColumnSource(col, base);
  if (src === 'datalist') {
    if (!col || !col.data_list_id) return null;
    return {
      data_list_id: col.data_list_id,
      data_list_column: col.data_list_column || null,
      data_list_label_column: col.data_list_label_column || null,
      parent_column: col.parent_column || null,
    };
  }
  if (src === 'inherit') {
    if (!base || !base.data_list_id) return null;
    return {
      data_list_id: base.data_list_id,
      data_list_column: base.data_list_column || null,
      data_list_label_column: base.data_list_label_column || null,
      parent_column: col && col.parent_column ? col.parent_column : null,
    };
  }
  return null;
};

const collectTableDatalistIds = (columns, allFields) => {
  const ids = new Set();
  for (const col of columns || []) {
    if (!col) continue;
    if (col.data_list_id) ids.add(col.data_list_id);
    const base = findBaseField(col, allFields);
    const dl = resolveColumnDatalist(col, base);
    if (dl && dl.data_list_id) ids.add(dl.data_list_id);
  }
  return [...ids];
};

export { SOURCES, findBaseField, getColumnSource, resolveColumnDatalist, collectTableDatalistIds };
