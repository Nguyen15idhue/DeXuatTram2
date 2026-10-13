const LS_PREFIX = 'form_memory:v1';
export const MEMORY_MAX = 5;

const EXCLUDED_TYPES = new Set(['password', 'file', 'table', 'boolean', 'multiselect', 'formula', 'user']);

const EXCLUDED_KEYS = new Set(['latitude', 'longitude', 'password']);

const normUser = (userId) => (userId === undefined || userId === null || userId === '' ? 'guest' : String(userId));

const keyOf = (entity, formKey, fieldKey, userId) =>
  `${LS_PREFIX}:${normUser(userId)}:${entity || 'unknown'}:${formKey || 'default'}:${fieldKey}`;

const readAll = () => {
  try {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX + ':')) {
        try { out[k] = JSON.parse(localStorage.getItem(k)); } catch { out[k] = null; }
      }
    }
    return out;
  } catch { return {}; }
};

export const isMemorableField = (field) => {
  if (!field || !field.key) return false;
  if (EXCLUDED_TYPES.has(field.type)) return false;
  if (EXCLUDED_KEYS.has(field.key)) return false;
  return true;
};

const toStorable = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object') return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.length > 200 ? s.slice(0, 200) : s;
};

export const getSuggestions = (entity, formKey, fieldKey, userId) => {
  try {
    const raw = localStorage.getItem(keyOf(entity, formKey, fieldKey, userId));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((v) => typeof v === 'string').slice(0, MEMORY_MAX) : [];
  } catch { return []; }
};

export const remember = (entity, formKey, fieldKey, value, userId) => {
  const s = toStorable(value);
  if (!s) return;
  try {
    const k = keyOf(entity, formKey, fieldKey, userId);
    const raw = localStorage.getItem(k);
    const arr = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(arr) ? arr.filter((v) => v !== s) : [];
    list.unshift(s);
    localStorage.setItem(k, JSON.stringify(list.slice(0, MEMORY_MAX)));
  } catch { /* quota đầy thì bỏ qua */ }
};

export const rememberFormValues = (entity, formKey, fields, formData, userId) => {
  (fields || []).forEach((f) => {
    if (!isMemorableField(f)) return;
    remember(entity, formKey, f.key, formData ? formData[f.key] : null, userId);
  });
};

export const clearFieldMemory = (entity, formKey, fieldKey, userId) => {
  try { localStorage.removeItem(keyOf(entity, formKey, fieldKey, userId)); } catch { /* silent */ }
};

export const clearFormMemory = (entity, formKey, userId) => {
  const all = readAll();
  const prefix = `${LS_PREFIX}:${normUser(userId)}:${entity || 'unknown'}:${formKey || 'default'}:`;
  Object.keys(all).forEach((k) => {
    if (k.startsWith(prefix)) {
      try { localStorage.removeItem(k); } catch { /* silent */ }
    }
  });
};
