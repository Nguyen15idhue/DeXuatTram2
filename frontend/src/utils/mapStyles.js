import { DEFAULT_MODE } from './mapModes';

export const OPENFREEMAP_STYLES = {
  streets: 'https://tiles.openfreemap.org/styles/liberty',
  bright: 'https://tiles.openfreemap.org/styles/bright',
  positron: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

const ESRI_IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const OPENTOPO = 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png';

export function rasterStyle(id, tiles, attribution) {
  return {
    version: 8,
    sources: {
      [id]: { type: 'raster', tiles: [tiles], tileSize: 256, attribution: attribution || '' },
    },
    layers: [{ id, type: 'raster', source: id }],
  };
}

function toAbsolute(url) {
  if (/^https?:\/\//i.test(url)) return url;
  return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

export function buildPmtilesStyle(pmtilesUrl, options = {}) {
  if (!pmtilesUrl) return null;
  const absolute = toAbsolute(pmtilesUrl);
  const glyphs = options.glyphs || 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
  return {
    version: 8,
    glyphs,
    sources: {
      openmaptiles: { type: 'vector', url: `pmtiles://${absolute}` },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#f8f4f0' } },
      {
        id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water',
        paint: { 'fill-color': '#a0c8f0' },
      },
      {
        id: 'landcover', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover',
        filter: ['in', 'class', 'wood', 'grass', 'farmland'],
        paint: { 'fill-color': '#d8e8c8', 'fill-opacity': 0.6 },
      },
      {
        id: 'landuse', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse',
        filter: ['==', 'class', 'residential'],
        paint: { 'fill-color': '#e8e0d8', 'fill-opacity': 0.5 },
      },
      {
        id: 'road', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
        filter: ['in', 'class', 'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 10, 1.5, 14, 4, 18, 12],
        },
      },
      {
        id: 'boundary', type: 'line', source: 'openmaptiles', 'source-layer': 'boundary',
        filter: ['<=', 'admin_level', 4],
        paint: { 'line-color': '#9e9cab', 'line-width': 1, 'line-dasharray': [3, 1] },
      },
      {
        id: 'place', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place',
        filter: ['in', 'class', 'country', 'state', 'province', 'city', 'town', 'village', 'hamlet', 'suburb', 'neighbourhood', 'island'],
        layout: {
          'text-field': ['coalesce', ['get', 'name'], ['get', 'name:latin']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, 10, 8, 12, 12, 15],
        },
        paint: { 'text-color': '#33302e', 'text-halo-color': '#ffffff', 'text-halo-width': 1.3 },
      },
      {
        id: 'transportation_name', type: 'symbol', source: 'openmaptiles', 'source-layer': 'transportation_name',
        minzoom: 13,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['coalesce', ['get', 'name'], ['get', 'name:latin']],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
        },
        paint: { 'text-color': '#4b4b4b', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 },
      },
      {
        id: 'water_name', type: 'symbol', source: 'openmaptiles', 'source-layer': 'water_name',
        layout: {
          'text-field': ['coalesce', ['get', 'name'], ['get', 'name:latin']],
          'text-font': ['Noto Sans Italic'],
          'text-size': 11,
        },
        paint: { 'text-color': '#4a80b3', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 },
      },
    ],
  };
}

let libertyRawPromise = null;

function fetchLibertyRaw() {
  if (!libertyRawPromise) {
    libertyRawPromise = fetch('/pmtiles/liberty-style.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .catch(() => null);
  }
  return libertyRawPromise;
}

export function loadLibertyBaseStyle() {
  return fetchLibertyRaw();
}

function fetchJson(url) {
  return fetch(url)
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);
}

let provinceLabelsPromise = null;
export function loadProvinceLabels() {
  if (!provinceLabelsPromise) provinceLabelsPromise = fetchJson('/vn-provinces-labels.geojson');
  return provinceLabelsPromise;
}

let provinceLabelsOldPromise = null;
export function loadProvinceLabelsOld() {
  if (!provinceLabelsOldPromise) provinceLabelsOldPromise = fetchJson('/vn-provinces-labels-old.geojson');
  return provinceLabelsOldPromise;
}

let wardLabelsPromise = null;
export function loadWardLabels() {
  if (!wardLabelsPromise) wardLabelsPromise = fetchJson('/vn-wards-labels.geojson');
  return wardLabelsPromise;
}

const pmtilesStyleCache = new Map();

export async function loadPmtilesStyle(pmtilesUrl) {
  if (!pmtilesUrl) return null;
  const absolute = toAbsolute(pmtilesUrl);
  if (pmtilesStyleCache.has(absolute)) return pmtilesStyleCache.get(absolute);
  const promise = (async () => {
    const base = await fetchLibertyRaw();
    if (!base) return buildPmtilesStyle(pmtilesUrl);
    const style = JSON.parse(JSON.stringify(base));
    if (style.sources) {
      delete style.sources.ne2_shaded;
      style.sources.openmaptiles = {
        type: 'vector',
        url: `pmtiles://${absolute}`,
        attribution: (base.sources && base.sources.openmaptiles && base.sources.openmaptiles.attribution) || '',
      };
    }
    style.layers = (style.layers || []).filter((l) => l.source !== 'ne2_shaded');
    return style;
  })();
  pmtilesStyleCache.set(absolute, promise);
  return promise;
}

const STYLE_URL_RE = /^(https?:|pmtiles:|\/)/i;

export function isStyleUrl(value) {
  if (typeof value !== 'string' || !value) return false;
  if (value.includes('{domain}') || value.includes('{key}') || value.includes('{z}')) return false;
  return STYLE_URL_RE.test(value) || /\.json(\?|#|$)/i.test(value);
}

const HYBRID_LINE_PREFIXES = ['road_', 'boundary_', 'waterway_'];
const HYBRID_SYMBOL_EXCLUDE = new Set(['road_one_way_arrow', 'road_one_way_arrow_opposite', 'poi_r20', 'label_other']);

function keepHybridLayer(layer) {
  if (!layer || !layer.id) return false;
  if (layer.type === 'symbol') return !HYBRID_SYMBOL_EXCLUDE.has(layer.id);
  if (layer.type === 'line') return HYBRID_LINE_PREFIXES.some((p) => layer.id.startsWith(p));
  return false;
}

function localizeLabelField(layer) {
  if (layer.type !== 'symbol' || !layer.layout || !layer.layout['text-field']) return;
  if (/shield|one_way/.test(layer.id)) return;
  layer.layout['text-field'] = ['coalesce', ['get', 'name:vi'], ['get', 'name'], layer.layout['text-field']];
}

export function buildHybridStyle(baseStyle, options = {}) {
  if (!baseStyle || !Array.isArray(baseStyle.layers)) return null;
  const imageryUrl = options.imageryUrl || ESRI_IMAGERY;
  const sources = { ...(baseStyle.sources || {}) };
  delete sources.ne2_shaded;
  if (options.pmtilesUrl) {
    sources.openmaptiles = {
      type: 'vector',
      url: `pmtiles://${toAbsolute(options.pmtilesUrl)}`,
      attribution: (baseStyle.sources && baseStyle.sources.openmaptiles && baseStyle.sources.openmaptiles.attribution) || '',
    };
  }
  if (!sources.openmaptiles) return null;
  sources.satellite = {
    type: 'raster',
    tiles: [imageryUrl],
    tileSize: 256,
    attribution: '&copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
  };
  const layers = [{
    id: 'satellite',
    type: 'raster',
    source: 'satellite',
    paint: { 'raster-opacity': 1, 'raster-fade-duration': 300 },
  }];
  const seen = new Set();
  baseStyle.layers.forEach((layer) => {
    if (!keepHybridLayer(layer) || seen.has(layer.id)) return;
    seen.add(layer.id);
    const clone = JSON.parse(JSON.stringify(layer));
    if (clone.id === 'poi_transit') clone.minzoom = Math.max(clone.minzoom || 0, 12);
    localizeLabelField(clone);
    layers.push(clone);
  });
  return {
    version: 8,
    glyphs: baseStyle.glyphs,
    sprite: baseStyle.sprite,
    sources,
    layers,
  };
}

export function buildMapStyle(mode, options = {}) {
  const { styleUrl, pmtilesUrl } = options;
  const m = mode || DEFAULT_MODE;
  const providerStyle = isStyleUrl(styleUrl) ? styleUrl : '';

  if (m === 'satellite') {
    return rasterStyle('satellite', ESRI_IMAGERY, '&copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics');
  }

  if (m === 'terrain') {
    return rasterStyle('terrain', OPENTOPO, '&copy; <a href="https://opentopomap.org/">OpenTopoMap</a> (CC-BY-SA)');
  }

  if (m === 'hybrid') {
    const detailed = options.libertyBase
      ? buildHybridStyle(options.libertyBase, { imageryUrl: options.imageryUrl, pmtilesUrl })
      : null;
    if (detailed) return detailed;
    return {
      version: 8,
      sources: {
        satellite: { type: 'raster', tiles: [ESRI_IMAGERY], tileSize: 256, attribution: '&copy; Esri &mdash; Source: Esri, Maxar' },
        labels: { type: 'raster', tiles: [ESRI_LABELS], tileSize: 256, attribution: '&copy; Esri' },
      },
      layers: [
        { id: 'satellite', type: 'raster', source: 'satellite', paint: { 'raster-fade-duration': 300 } },
        { id: 'labels', type: 'raster', source: 'labels' },
      ],
    };
  }

  if (pmtilesUrl) return buildPmtilesStyle(pmtilesUrl) || OPENFREEMAP_STYLES.streets;

  return providerStyle || OPENFREEMAP_STYLES.streets;
}
