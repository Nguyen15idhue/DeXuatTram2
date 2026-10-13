export const getDataListLabel = (field, raw, value) => {
  const labelCol = field ? field.data_list_label_column : null;
  if (labelCol && raw && raw[labelCol] !== undefined && raw[labelCol] !== null && raw[labelCol] !== '') {
    return raw[labelCol];
  }
  return value;
};

export const getDataListLabelFromMap = (dataListMap, field, value) => {
  if (!dataListMap || !field || !field.data_list_column) return value;
  const col = field.data_list_column;
  const entries = dataListMap.tree && dataListMap.tree[col] ? dataListMap.tree[col][value] : null;
  const raw = entries && entries.length > 0 ? entries[0]._raw : null;
  return getDataListLabel(field, raw, value);
};
