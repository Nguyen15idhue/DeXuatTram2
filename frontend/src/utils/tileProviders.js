import { TILE_PROVIDER_CATALOG } from './tileProviderCatalog';
import { API_URL } from '../services/api';

export const TILE_PROVIDERS = TILE_PROVIDER_CATALOG;

let catalog = TILE_PROVIDER_CATALOG;
let loadPromise = null;

export async function loadTileProviders() {
  if (loadPromise) return loadPromise;
  const base = typeof API_URL === 'string' && API_URL ? API_URL : '/api';
  loadPromise = fetch(`${base}/map-configs/tile-providers`)
    .then(res => (res.ok ? res.json() : null))
    .then(json => {
      const list = json && json.success && Array.isArray(json.data) ? json.data : null;
      if (list && list.length > 0) catalog = list;
      return catalog;
    })
    .catch(() => catalog);
  return loadPromise;
}

export function getTileProviders() {
  return catalog;
}

export const TILE_CATEGORIES = [
  { id: 'free', label: 'Miễn phí', description: 'Mã nguồn mở, không cần API key' },
  { id: 'self-hosted', label: 'Tự host', description: 'Tự cung cấp tile server' },
  { id: 'api', label: 'Dịch vụ API', description: 'Cần API key / Token' },
];

export const AUTH_TYPES = [
  { id: 'none', label: 'Không cần xác thực', icon: '🔓' },
  { id: 'token', label: 'API Key / Token', icon: '🔑' },
];

export function getProviderById(id) {
  return catalog.find(p => p.id === id);
}

export function getProvidersByType(type) {
  return catalog.filter(p => p.type === type);
}

export function getFreeProviders() {
  return catalog.filter(p => p.type === 'free');
}

export function getApiProviders() {
  return catalog.filter(p => p.type === 'api');
}
