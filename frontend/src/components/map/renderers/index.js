import leafletRenderer from './leafletRenderer';

const RENDERERS = {
  leaflet: leafletRenderer,
};

export function getRenderer(id) {
  return RENDERERS[id] || null;
}

export function resolveRenderer(id) {
  const requested = id || 'leaflet';
  const renderer = getRenderer(requested);
  if (renderer) return { renderer, requested, fallback: false };
  return { renderer: RENDERERS.leaflet, requested, fallback: requested !== 'leaflet' };
}

export function listRenderers() {
  return Object.values(RENDERERS).map(r => ({ id: r.id, name: r.name }));
}

export default RENDERERS;
