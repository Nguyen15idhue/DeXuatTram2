import 'maplibre-gl/dist/maplibre-gl.css';
import { iconSvgMarkup, isValidMarkerIcon } from '../../../utils/mapMarkerIcons';
import { formatDistanceM } from '../../../utils/formatDistance';
import { normalizeClusterOptions, clusterSig } from '../../../utils/mapCluster';

const LARGE_DATASET = 2000;
const WARD_MIN_ZOOM = 12;
const WARD_MAX_LABELS = 400;

let maplibrePromise = null;
let pmtilesRegistered = false;

function loadMaplibre() {
  if (!maplibrePromise) maplibrePromise = import('maplibre-gl').then((m) => m.default || m);
  return maplibrePromise;
}

const glyphImageId = (icon) => `app-glyph-${icon}`;

function ensureGlyphImages(map, icons) {
  icons.filter(isValidMarkerIcon).forEach((icon) => {
    const id = glyphImageId(icon);
    if (map.hasImage(id)) return;
    try {
      const svg = iconSvgMarkup(icon, { size: 32 });
      const img = new Image(32, 32);
      img.onload = () => {
        try {
          if (!map.hasImage(id)) map.addImage(id, img, { pixelRatio: 2 });
        } catch { /* map removed */ }
      };
      img.onerror = () => { /* glyph unavailable; circles still render */ };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    } catch { /* noop */ }
  });
}

async function registerPmtiles(maplibregl) {
  if (pmtilesRegistered) return;
  try {
    const { Protocol } = await import('pmtiles');
    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
  } catch (err) {
    console.error('[MapLibre] pmtiles protocol error:', err.message);
  }
  pmtilesRegistered = true;
}

export function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch {
    return false;
  }
}

function normalizeTileUrl(url) {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `${window.location.origin}${url}`;
  return url;
}

function circleGeoJSON(center, radiusM) {
  const [lat, lng] = center;
  const points = 64;
  const coords = [];
  const earth = 6371000;
  for (let i = 0; i <= points; i += 1) {
    const angle = (i / points) * 2 * Math.PI;
    const dLat = (radiusM * Math.cos(angle)) / earth;
    const dLng = (radiusM * Math.sin(angle)) / (earth * Math.cos((lat * Math.PI) / 180));
    coords.push([lng + (dLng * 180) / Math.PI, lat + (dLat * 180) / Math.PI]);
  }
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coords] },
    properties: {},
  };
}

function rasterStyleFromTile(tile) {
  if (!tile || !tile.url) return null;
  return {
    version: 8,
    sources: {
      base: {
        type: 'raster',
        tiles: [normalizeTileUrl(tile.url)],
        tileSize: 256,
        attribution: tile.attribution || '',
      },
    },
    layers: [{ id: 'base', type: 'raster', source: 'base' }],
  };
}

export async function createMaplibreRuntime({ container, center, zoom, style, tile, apiKey }) {
  if (!hasWebGL()) return null;
  const maplibregl = await loadMaplibre();
  if (!maplibregl || !maplibregl.Map) return null;
  await registerPmtiles(maplibregl);

  const resolveStyle = (s) => {
    if (!s) return null;
    if (typeof s === 'string' && apiKey && s.includes('{key}')) return s.replace('{key}', apiKey);
    return s;
  };

  const resolvedInitialStyle = resolveStyle(style);
  const initialStyle = resolvedInitialStyle || rasterStyleFromTile(tile) || { version: 8, sources: {}, layers: [] };
  let currentStyleKey = typeof resolvedInitialStyle === 'string'
    ? resolvedInitialStyle
    : JSON.stringify(initialStyle);
  const map = new maplibregl.Map({
    container,
    style: initialStyle,
    center: [center?.[1] ?? 108, center?.[0] ?? 16],
    zoom: zoom ?? 6,
    attributionControl: false,
    renderWorldCopies: false,
    maxPitch: 60,
    fadeDuration: 0,
    refreshExpiredTiles: false,
  });

  try {
    if (typeof map.setPixelRatio === 'function') {
      map.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    }
  } catch { /* noop */ }

  let loaded = false;
  let markersState = null;
  let lastClusterSig = null;
  let polylinesState = null;
  let provinceState = null;
  let boundaryState = null;
  let wardState = null;
  let pointsState = null;
  let circleState = null;
  let enabled3d = false;
  let terrainOn = false;
  let popup = null;
  const stationDomMarkers = [];
  const provinceMarkers = [];
  const pointMarkers = [];
  const sourceIds = new Set();

  function removeManagedSource(id) {
    if (!map.getSource(id)) { sourceIds.delete(id); return; }
    const layers = (map.getStyle()?.layers || []).filter((l) => l.source === id);
    layers.forEach((l) => { try { map.removeLayer(l.id); } catch { /* noop */ } });
    try { map.removeSource(id); } catch { /* noop */ } finally { sourceIds.delete(id); }
  }

  function removeMarkers(list) {
    while (list.length) {
      const m = list.pop();
      try { m.remove(); } catch { /* noop */ }
    }
  }

  function removeDomOverlays() {
    removeMarkers(stationDomMarkers);
    removeMarkers(provinceMarkers);
    removeMarkers(pointMarkers);
    if (popup) { try { popup.remove(); } catch { /* noop */ } popup = null; }
  }

  function openPopup(item, lngLat) {
    if (!item || !item.renderPopup) return;
    popup = new maplibregl.Popup({ offset: 12, closeButton: true })
      .setLngLat(lngLat)
      .setDOMContent(item.renderPopup(item))
      .addTo(map);
  }

  function bindMarkerInteractions() {
    map.on('click', 'app-unclustered', (e) => {
      const f = e.features && e.features[0];
      if (!f) return;
      const state = markersState || {};
      const item = (state.items || [])[f.properties._idx];
      if (!item) return;
      const opts = state.options || {};
      if (opts.renderPopup) openPopup({ ...item, renderPopup: opts.renderPopup }, f.geometry.coordinates);
      if (opts.onMarkerClick) opts.onMarkerClick(item, item._type);
    });
    map.on('mouseenter', 'app-unclustered', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'app-unclustered', () => { map.getCanvas().style.cursor = ''; });

    map.on('click', 'app-clusters', (e) => {
      const f = e.features && e.features[0];
      if (!f) return;
      const src = map.getSource('app-markers');
      if (!src || typeof src.getClusterExpansionZoom !== 'function') return;
      src.getClusterExpansionZoom(f.properties.cluster_id)
        .then((zoom) => { map.easeTo({ center: f.geometry.coordinates, zoom }); })
        .catch(() => { /* noop */ });
    });
    map.on('mouseenter', 'app-clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'app-clusters', () => { map.getCanvas().style.cursor = ''; });
  }

  function applyPixelRatio(count) {
    if (typeof map.setPixelRatio !== 'function') return;
    try {
      map.setPixelRatio(count > LARGE_DATASET ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
    } catch { /* noop */ }
  }

  function addMarkerLabelLayer() {
    if (map.getLayer('app-marker-labels')) return;
    try {
      map.addLayer({
        id: 'app-marker-labels',
        type: 'symbol',
        source: 'app-markers',
        minzoom: 14,
        filter: ['!', ['has', 'point_count']],
        layout: {
          'text-field': ['get', '_label'],
          'text-size': 11,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-font': ['Noto Sans Regular'],
        },
        paint: { 'text-color': '#1f2937', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
      });
      overlayOrderDirty = true;
    } catch { /* style lacks glyphs */ }
  }

  function syncMarkerLabels(show) {
    if (show) addMarkerLabelLayer();
    else if (map.getLayer('app-marker-labels')) {
      try { map.removeLayer('app-marker-labels'); } catch { /* noop */ }
    }
  }

  function applyMarkers() {
    const { items, options } = markersState || {};
    if (!items) return;
    const { cluster = true, clusterOptions, showLabels = false, onMarkerClick, renderPopup } = options || {};
    const clusterOpts = normalizeClusterOptions(clusterOptions);
    applyPixelRatio(items.length);
    if (!cluster) {
      removeManagedSource('app-markers');
      removeMarkers(stationDomMarkers);
      items.forEach((item) => {
        const lng = parseFloat(item.longitude);
        const lat = parseFloat(item.latitude);
        if (isNaN(lat) || isNaN(lng)) return;
        const el = document.createElement('div');
        el.className = 'maplibre-marker';
        const hasGlyph = isValidMarkerIcon(item._icon);
        el.style.cssText = hasGlyph
          ? `width:28px;height:28px;background:#fff;border:3px solid ${item._color || '#6b7280'};border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:pointer;display:flex;align-items:center;justify-content:center`
          : `width:22px;height:22px;background:${item._color || '#6b7280'};border:3px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:pointer`;
        if (hasGlyph) el.innerHTML = iconSvgMarkup(item._icon, { size: 16 });
        el.title = item._label || '';
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map);
        if (renderPopup) {
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            openPopup({ ...item, renderPopup }, [lng, lat]);
          });
        }
        if (onMarkerClick) el.addEventListener('click', () => onMarkerClick(item, item._type));
        stationDomMarkers.push(marker);
      });
      return;
    }

    removeMarkers(stationDomMarkers);

    const geojson = {
      type: 'FeatureCollection',
      features: items
        .map((item, idx) => {
          const lng = parseFloat(item.longitude);
          const lat = parseFloat(item.latitude);
          if (isNaN(lat) || isNaN(lng)) return null;
          return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [lng, lat] },
            properties: { _idx: idx, _color: item._color || '#6b7280', _glyph: isValidMarkerIcon(item._icon) ? item._icon : '', _label: item._label || '', _type: item._type },
          };
        })
        .filter(Boolean),
    };

    ensureGlyphImages(map, [...new Set(items.map((i) => i._icon).filter(Boolean))]);

    const sig = clusterSig(clusterOpts);
    if (map.getSource('app-markers') && lastClusterSig !== sig) {
      removeManagedSource('app-markers');
    }
    if (!map.getSource('app-markers')) {
      map.addSource('app-markers', {
        type: 'geojson',
        data: geojson,
        maxzoom: 20,
        cluster: true,
        clusterMaxZoom: clusterOpts.maxZoom,
        clusterRadius: clusterOpts.radius,
      });
      lastClusterSig = clusterSig(clusterOpts);
      sourceIds.add('app-markers');
      map.addLayer({
        id: 'app-clusters',
        type: 'circle',
        source: 'app-markers',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#2563eb',
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });
      map.addLayer({
        id: 'app-cluster-count',
        type: 'symbol',
        source: 'app-markers',
        filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12, 'text-font': ['Noto Sans Regular'] },
        paint: { 'text-color': '#ffffff' },
      });
      map.addLayer({
        id: 'app-unclustered',
        type: 'circle',
        source: 'app-markers',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['case', ['!=', ['get', '_glyph'], ''], '#ffffff', ['get', '_color']],
          'circle-radius': ['case', ['!=', ['get', '_glyph'], ''], 11, 9],
          'circle-stroke-width': 3,
          'circle-stroke-color': ['case', ['!=', ['get', '_glyph'], ''], ['get', '_color'], '#ffffff'],
        },
      });
      map.addLayer({
        id: 'app-marker-glyphs',
        type: 'symbol',
        source: 'app-markers',
        filter: ['all', ['!', ['has', 'point_count']], ['!=', ['get', '_glyph'], '']],
        layout: {
          'icon-image': ['concat', 'app-glyph-', ['get', '_glyph']],
          'icon-size': 0.55,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });
      overlayOrderDirty = true;
    } else {
      map.getSource('app-markers').setData(geojson);
    }
    syncMarkerLabels(showLabels);
  }

  function applyPolylines() {
    const { pairs, renderPopup } = polylinesState || {};
    if (!pairs) return;
    const features = pairs
      .map((pr) => {
        const aLat = parseFloat(pr.a?.latitude);
        const aLng = parseFloat(pr.a?.longitude);
        const bLat = parseFloat(pr.b?.latitude);
        const bLng = parseFloat(pr.b?.longitude);
        if ([aLat, aLng, bLat, bLng].some((v) => isNaN(v))) return null;
        const distanceM = Number(pr.distance_m) || 0;
        const lineColor = distanceM < 500 ? '#ef4444' : distanceM < 2000 ? '#f97316' : '#16a34a';
        return {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[aLng, aLat], [bLng, bLat]] },
          properties: { _color: lineColor, _label: formatDistanceM(distanceM) },
        };
      })
      .filter(Boolean);
    const data = { type: 'FeatureCollection', features };
    if (!map.getSource('app-polylines')) {
      map.addSource('app-polylines', { type: 'geojson', data });
      sourceIds.add('app-polylines');
      map.addLayer({
        id: 'app-polylines-line',
        type: 'line',
        source: 'app-polylines',
        paint: { 'line-color': ['get', '_color'], 'line-width': 3, 'line-opacity': 0.85 },
      });
      try {
        map.addLayer({
          id: 'app-polylines-label',
          type: 'symbol',
          source: 'app-polylines',
          minzoom: 12,
          layout: {
            'symbol-placement': 'line-center',
            'text-field': ['get', '_label'],
            'text-size': 11,
            'text-font': ['Noto Sans Regular'],
          },
          paint: { 'text-color': '#374151', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
        });
      } catch { /* style lacks glyphs */ }
      map.on('click', 'app-polylines-line', (e) => {
        const pair = pairs[0];
        if (renderPopup && pair) openPopup({ renderPopup: () => renderPopup(pair) }, e.lngLat);
      });
      map.on('mouseenter', 'app-polylines-line', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'app-polylines-line', () => { map.getCanvas().style.cursor = ''; });
      overlayOrderDirty = true;
    } else {
      map.getSource('app-polylines').setData(data);
    }
  }

  function applyProvinceLabels() {
    removeMarkers(provinceMarkers);
    const { points, show } = provinceState || {};
    if (!points || !show) return;
    points.forEach((province) => {
      const el = document.createElement('div');
      el.className = 'province-label';
      el.textContent = province.name;
      const marker = new maplibregl.Marker({ element: el }).setLngLat([province.lng, province.lat]).addTo(map);
      provinceMarkers.push(marker);
    });
  }

  function applyBoundaries() {
    const { geojson, show } = boundaryState || {};
    if (!geojson || !show) return;
    if (!map.getSource('app-boundaries')) {
      map.addSource('app-boundaries', { type: 'geojson', data: geojson });
      sourceIds.add('app-boundaries');
      map.addLayer({
        id: 'app-boundaries-line',
        type: 'line',
        source: 'app-boundaries',
        paint: { 'line-color': '#1565C0', 'line-width': 2, 'line-opacity': 0.7, 'line-dasharray': [4, 2] },
      });
      overlayOrderDirty = true;
    } else {
      map.getSource('app-boundaries').setData(geojson);
    }
  }

  function wardVisibleFeatures() {
    const { points } = wardState || {};
    if (!points || points.length === 0) return [];
    const b = map.getBounds();
    const padLng = (b.getEast() - b.getWest()) * 0.15;
    const padLat = (b.getNorth() - b.getSouth()) * 0.15;
    const west = b.getWest() - padLng;
    const east = b.getEast() + padLng;
    const south = b.getSouth() - padLat;
    const north = b.getNorth() + padLat;
    const out = [];
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      if (p.lng < west || p.lng > east || p.lat < south || p.lat > north) continue;
      out.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: { name: p.name, province: p.province || '' },
      });
      if (out.length >= WARD_MAX_LABELS) break;
    }
    return out;
  }

  function refreshWardData() {
    const SRC = 'app-ward-labels';
    const src = map.getSource(SRC);
    if (!src || typeof src.setData !== 'function') return;
    const features = map.getZoom() < WARD_MIN_ZOOM ? [] : wardVisibleFeatures();
    src.setData({ type: 'FeatureCollection', features });
  }

  function applyWardLabels() {
    const SRC = 'app-ward-labels';
    const LAYER = 'app-ward-labels-symbol';
    if (map.getLayer(LAYER)) { try { map.removeLayer(LAYER); } catch { /* noop */ } }
    if (map.getSource(SRC)) removeManagedSource(SRC);
    const { points, show } = wardState || {};
    if (!show || !points || points.length === 0) return;
    if (!map.getStyle().glyphs) {
      try { map.setGlyphs('https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'); } catch { /* noop */ }
    }
    map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    sourceIds.add(SRC);
    map.addLayer({
      id: LAYER,
      type: 'symbol',
      source: SRC,
      minzoom: WARD_MIN_ZOOM,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 12, 9, 14, 12, 17, 14],
        'text-allow-overlap': false,
        'text-optional': true,
        'text-padding': 4,
      },
      paint: {
        'text-color': '#1f2937',
        'text-halo-color': 'rgba(255,255,255,0.95)',
        'text-halo-width': 1.4,
      },
    });
    refreshWardData();
    bringOverlaysToTop();
  }

  function applyPoints() {
    removeMarkers(pointMarkers);
    const { points } = pointsState || {};
    if (!points) return;
    points.forEach((point) => {
      if (!point || !point.position) return;
      const el = document.createElement('div');
      if (point.variant === 'location') {
        el.className = 'location-point-icon';
        el.innerHTML = '<div class="location-point"><span class="location-point-ring"></span><span class="location-point-dot"></span></div>';
      } else {
        el.style.cssText = `width:22px;height:22px;background:${point.color || '#6b7280'};border:3px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.4)`;
      }
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([point.position[1], point.position[0]])
        .addTo(map);
      if (point.renderPopup) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          openPopup({ renderPopup: point.renderPopup }, [point.position[1], point.position[0]]);
        });
      }
      pointMarkers.push(marker);
    });
  }

  function applyCircle() {
    const { center, radiusM, color, fillColor, fillOpacity } = circleState || {};
    if (!center || !radiusM) return;
    const data = circleGeoJSON(center, radiusM);
    if (!map.getSource('app-circle')) {
      map.addSource('app-circle', { type: 'geojson', data });
      sourceIds.add('app-circle');
      map.addLayer({
        id: 'app-circle-fill',
        type: 'fill',
        source: 'app-circle',
        paint: { 'fill-color': fillColor || '#3b82f6', 'fill-opacity': fillOpacity ?? 0.1 },
      });
      map.addLayer({
        id: 'app-circle-line',
        type: 'line',
        source: 'app-circle',
        paint: { 'line-color': color || '#2563eb', 'line-width': 2 },
      });
    } else {
      map.getSource('app-circle').setData(data);
    }
  }

  function findBuildingLayers() {
    const layers = map.getStyle()?.layers || [];
    let flat = null;
    let extrude = null;
    for (const l of layers) {
      if (l['source-layer'] !== 'building') continue;
      if (l.type === 'fill') flat = l.id;
      else if (l.type === 'fill-extrusion') extrude = l.id;
    }
    return { flat, extrude };
  }

  function ensureDemSource() {
    if (map.getSource('dem')) return;
    map.addSource('dem', {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 11,
    });
  }

  let overlayOrderDirty = false;

  const overlayTopOrder = [
    'app-polylines-line',
    'app-polylines-label',
    'app-boundaries-line',
    'app-clusters',
    'app-cluster-count',
    'app-unclustered',
    'app-marker-glyphs',
    'app-marker-labels',
  ];

  function bringOverlaysToTop() {
    if (!overlayOrderDirty) return;
    overlayOrderDirty = false;
    overlayTopOrder.forEach((id) => {
      if (map.getLayer(id)) {
        try { map.moveLayer(id); } catch { /* noop */ }
      }
    });
  }

  function syncTerrain() {
    if (!loaded) return;
    const want = enabled3d && map.getPitch() > 10
      && map.getZoom() >= 15 && !!map.getSource('dem');
    if (want === terrainOn) return;
    terrainOn = want;
    try {
      map.setTerrain(want ? { source: 'dem', exaggeration: 1.1 } : null);
    } catch { /* noop */ }
  }

  function unbindTerrainEvents() {
    map.off('zoomend', syncTerrain);
    map.off('moveend', syncTerrain);
    map.off('pitchend', syncTerrain);
  }

  function bindTerrainEvents() {
    unbindTerrainEvents();
    map.on('zoomend', syncTerrain);
    map.on('moveend', syncTerrain);
    map.on('pitchend', syncTerrain);
  }

  function apply3D() {
    if (!loaded) return;
    const { flat, extrude } = findBuildingLayers();

    if (enabled3d) {
      try {
        ensureDemSource();

        if (extrude) {
          map.setLayoutProperty(extrude, 'visibility', 'visible');
          map.setLayerZoomRange(extrude, 15, 24);
          map.setPaintProperty(extrude, 'fill-extrusion-opacity', 1);
          map.setFilter(extrude, ['>=', ['coalesce', ['get', 'render_height'], 0], 10]);
        } else if (map.getSource('openmaptiles')) {
          if (!map.getLayer('app-buildings')) {
            map.addLayer({
              id: 'app-buildings',
              type: 'fill-extrusion',
              source: 'openmaptiles',
              'source-layer': 'building',
              minzoom: 15,
              filter: ['>=', ['coalesce', ['get', 'render_height'], 0], 10],
              paint: {
                'fill-extrusion-color': '#c9c4bd',
                'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 10],
                'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
                'fill-extrusion-opacity': 1,
              },
            });
          } else {
            map.setLayoutProperty('app-buildings', 'visibility', 'visible');
          }
        }
        if (flat) map.setLayerZoomRange(flat, 13, 15);

        bindTerrainEvents();
        syncTerrain();
      } catch (err) {
        console.error('[MapLibre] 3D error:', err.message);
      }
      if (map.getPitch() < 30) map.easeTo({ pitch: 45, duration: 700 });
    } else {
      unbindTerrainEvents();
      try {
        if (terrainOn) { map.setTerrain(null); terrainOn = false; }

        if (extrude) {
          map.setLayoutProperty(extrude, 'visibility', 'none');
          map.setLayerZoomRange(extrude, 14, 24);
          map.setPaintProperty(extrude, 'fill-extrusion-opacity', 0.8);
          map.setFilter(extrude, null);
        }
        if (map.getLayer('app-buildings')) map.setLayoutProperty('app-buildings', 'visibility', 'none');
        if (flat) {
          map.setLayerZoomRange(flat, 13, 14);
          map.setLayoutProperty(flat, 'visibility', 'visible');
        }
      } catch { /* noop */ }
      if (map.getPitch() > 0) map.easeTo({ pitch: 0, duration: 500 });
    }

    bringOverlaysToTop();
  }

  function applyAll() {
    if (!loaded) return;
    [...sourceIds].forEach((id) => { if (!map.getSource(id)) sourceIds.delete(id); });
    removeDomOverlays();
    applyPolylines();
    applyBoundaries();
    applyCircle();
    applyMarkers();
    applyProvinceLabels();
    applyPoints();
    applyWardLabels();
    apply3D();
    bringOverlaysToTop();
  }

  let navAdded = false;
  const onStyleReady = () => {
    loaded = true;
    applyAll();
    if (!navAdded) {
      navAdded = true;
      try {
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-left');
      } catch { /* noop */ }
    }
  };
  map.on('load', onStyleReady);
  bindMarkerInteractions();
  map.on('zoomend', refreshWardData);
  map.on('moveend', refreshWardData);

  const runtime = {
    id: 'maplibre',
    map,
    supports: { raster: true, vector: true, terrain: true, cluster: true, labels: true, polylines: true },

    setView(nextCenter, nextZoom) {
      map.jumpTo({ center: [nextCenter[1], nextCenter[0]], zoom: nextZoom ?? map.getZoom() });
    },

    flyTo(position, targetZoom) {
      if (!position) return;
      map.flyTo({ center: [position[1], position[0]], zoom: targetZoom ?? map.getZoom() });
    },

    getCenter() {
      const c = map.getCenter();
      return { lat: c.lat, lng: c.lng };
    },

    getZoom() {
      return map.getZoom();
    },

    setStyle(nextStyle) {
      const resolved = resolveStyle(nextStyle);
      if (!resolved) return;
      if (typeof resolved === 'string' && !/^(https?:|pmtiles:|\/)/i.test(resolved)) return;
      const key = typeof resolved === 'string' ? resolved : JSON.stringify(resolved);
      if (key === currentStyleKey) return;
      currentStyleKey = key;
      try {
        map.setStyle(resolved);
      } catch (err) {
        console.error('[MapLibre] setStyle error:', err.message);
      }
      map.once('style.load', () => { applyAll(); });
    },

    setTileLayer(nextTile) {
      if (!nextTile || !nextTile.url) return;
      if (!loaded) return;
      const src = map.getSource('base');
      if (src && typeof src.setTiles === 'function') {
        try { src.setTiles([normalizeTileUrl(nextTile.url)]); } catch { /* noop */ }
      }
    },

    setMarkers(items, options) {
      markersState = { items, options };
      if (loaded) applyMarkers();
    },

    setMarkerLabels(show) {
      if (markersState && markersState.options) markersState.options.showLabels = !!show;
      if (!loaded) return;
      if (!map.getSource('app-markers')) return;
      syncMarkerLabels(!!show);
      bringOverlaysToTop();
    },

    setPolylines(pairs, options) {
      polylinesState = { pairs, ...(options || {}) };
      if (loaded) applyPolylines();
    },

    setProvinceLabels(points, show) {
      provinceState = { points, show };
      if (!loaded) return;
      applyProvinceLabels();
    },

    setWardLabels(points, show) {
      wardState = { points, show };
      if (!loaded) return;
      applyWardLabels();
    },

    setBoundaries(geojson, show) {
      boundaryState = { geojson, show };
      if (loaded) applyBoundaries();
    },

    setPoints(points) {
      pointsState = { points };
      if (loaded) applyPoints();
    },

    setCircle(circle) {
      circleState = circle || null;
      if (loaded) applyCircle();
    },

    set3D(value) {
      enabled3d = !!value;
      apply3D();
    },

    on(event, handler) {
      map.on(event, handler);
    },

    off(event, handler) {
      map.off(event, handler);
    },

    invalidateSize() {
      map.resize();
    },

    remove() {
      try { map.remove(); } catch { /* noop */ }
    },
  };

  return runtime;
}
