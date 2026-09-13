import leafletRenderer from './leafletRenderer';
import maplibreRenderer from './maplibreRenderer';
import { createLeafletRuntime } from './leafletRuntime';
import { createMaplibreRuntime } from './maplibreRuntime';

const RENDERERS = {
  leaflet: leafletRenderer,
  maplibre: maplibreRenderer,
};

const RUNTIMES = {
  leaflet: createLeafletRuntime,
  maplibre: createMaplibreRuntime,
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

export function createRuntime(rendererId, args) {
  const requested = rendererId || 'leaflet';
  const factory = RUNTIMES[requested];
  if (!factory) {
    return { runtime: RUNTIMES.leaflet(args), requested, fallback: true };
  }
  const result = factory(args);
  if (result && typeof result.then === 'function') {
    return result.then((runtime) => {
      if (runtime) return { runtime, requested, fallback: false };
      return Promise.resolve(RUNTIMES.leaflet(args)).then((fallbackRuntime) => ({ runtime: fallbackRuntime, requested, fallback: true }));
    });
  }
  return { runtime: result, requested, fallback: false };
}

export function listRenderers() {
  return Object.values(RENDERERS).map(r => ({ id: r.id, name: r.name, supports: r.supports }));
}

export default RENDERERS;
