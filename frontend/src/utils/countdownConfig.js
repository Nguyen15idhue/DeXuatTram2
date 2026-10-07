import { api } from '../services/api';

export const COUNTDOWN_CONFIG_EVENT = 'countdown:refresh';

let cache = null;
let inflight = null;

export const FALLBACK_COUNTDOWN_STATUSES = ['PENDING', 'REVIEWING', 'PRINCIPLE_APPROVED'];
export const FALLBACK_SUPPLEMENT_STATUSES = ['PENDING', 'REVIEWING', 'PRINCIPLE_APPROVED'];

export async function loadCountdownConfig(force = false) {
  if (!force && cache) return cache;
  if (!force && inflight) return inflight;
  const token = (() => { try { return localStorage.getItem('token'); } catch { return null; } })();
  if (!token) return cache;
  inflight = api.getWithAuth('/admin/lifecycle-config', token)
    .then((res) => {
      const data = (res && res.data) || null;
      if (data) cache = data;
      inflight = null;
      return data;
    })
    .catch(() => { inflight = null; return cache; });
  return inflight;
}

const partEnabled = (part) => !!(part && part.enabled);

export function getCountdownStatuses(config) {
  const rules = config && Array.isArray(config.rules) ? config.rules : null;
  if (!rules) return FALLBACK_COUNTDOWN_STATUSES;
  const set = new Set();
  rules.forEach((r) => {
    if (!r || !r.status) return;
    if (partEnabled(r.supplement) || partEnabled(r.transition)) set.add(r.status);
  });
  const enabled = [...set];
  return enabled.length > 0 ? enabled : FALLBACK_COUNTDOWN_STATUSES;
}

export function getSupplementStatuses(config) {
  const rules = config && Array.isArray(config.rules) ? config.rules : null;
  if (!rules) return FALLBACK_SUPPLEMENT_STATUSES;
  return rules.filter((r) => r && r.status && partEnabled(r.supplement)).map((r) => r.status);
}

// Trả về { [status]: { supplement: bool, transition: bool } }
export function getCountdownFlags(config) {
  const rules = config && Array.isArray(config.rules) ? config.rules : null;
  if (!rules) return {};
  const map = {};
  rules.forEach((r) => {
    if (!r || !r.status) return;
    map[r.status] = { supplement: partEnabled(r.supplement), transition: partEnabled(r.transition) };
  });
  return map;
}

export function notifyCountdownConfigChanged() {
  cache = null;
  inflight = null;
  try { window.dispatchEvent(new Event(COUNTDOWN_CONFIG_EVENT)); } catch { /* noop */ }
}
