export const normalizeForSearch = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');

export const matchesSearch = (text, term) => {
  const t = normalizeForSearch(term).trim();
  if (!t) return true;
  return normalizeForSearch(text).includes(t);
};

export const filterFieldsBySearch = (fields, term, pick = (f) => [f.label, f.key, f.type]) => {
  const t = normalizeForSearch(term).trim();
  if (!t) return fields;
  return (fields || []).filter((f) => pick(f).some((v) => normalizeForSearch(v).includes(t)));
};
