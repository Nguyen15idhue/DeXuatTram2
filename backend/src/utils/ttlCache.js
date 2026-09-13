const store = new Map();

function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.exp && entry.exp < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

function set(key, value, ttlMs = 60000) {
  store.set(key, { value, exp: Date.now() + ttlMs });
}

function del(key) {
  store.delete(key);
}

function delPrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

module.exports = { get, set, del, delPrefix };
