export const appendMultiFilter = (params, key, values) => {
  (Array.isArray(values) ? values : values ? [values] : [])
    .forEach((value) => params.append(key, value));
};

export const hasFilterValue = (value) => Array.isArray(value) ? value.length > 0 : Boolean(value);
