import 'maplibre-gl/dist/maplibre-gl.css';

let maplibrePromise = null;
let pmtilesRegistered = false;

function loadMaplibre() {
  if (!maplibrePromise) maplibrePromise = import('maplibre-gl').then((m) => m.default || m);
  return maplibrePromise;
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
  });

  let loaded = false;
  let markersState = null;
  let polylinesState = null;
  let provinceState = null;
  let boundaryState = null;
  let pointsState = null;
  let circleState = null;
  let enabled3d = false;
  let popup = null;
  const extraMarkers = [];
  const sourceIds = new Set();

  function removeManagedSource(id) {
    if (!map.getSource(id)) return;
    const layers = (map.getStyle()?.layers || []).filter((l) => l.source === id);
    layers.forEach((l) => { try { map.removeLayer(l.id); } catch { /* noop */ } });
    try { map.removeSource(id); } catch { /* noop */ } finally { sourceIds.delete(id); }
  }

  function clearOverlays() {
    [...sourceIds].forEach(removeManagedSource);
    while (extraMarkers.length) {
      const m = extraMarkers.pop();
      try { m.remove(); } catch { /* noop */ }
    }
    if (popup) { try { popup.remove(); } catch { /* noop */ } popup = null; }
  }

  function openPopup(item, lngLat) {
    if (!item || !item.renderPopup) return;
    popup = new maplibregl.Popup({ offset: 12, closeButton: true })
      .setLngLat(lngLat)
      .setDOMContent(item.renderPopup())
      .addTo(map);
  }

  function applyMarkers() {
    const { items, options } = markersState || {};
    if (!items) return;
    const { cluster = true, showLabels = false, onMarkerClick, renderPopup } = options || {};
    if (!cluster) {
      items.forEach((item) => {
        const lng = parseFloat(item.longitude);
        const lat = parseFloat(item.latitude);
        if (isNaN(lat) || isNaN(lng)) return;
        const el = document.createElement('div');
        el.className = 'maplibre-marker';
        el.style.cssText = `width:22px;height:22px;background:${item._color || '#6b7280'};border:3px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:pointer`;
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
        extraMarkers.push(marker);
      });
      return;
    }

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
            properties: { _idx: idx, _color: item._color || '#6b7280', _label: item._label || '', _type: item._type },
          };
        })
        .filter(Boolean),
    };

    if (!map.getSource('app-markers')) {
      map.addSource('app-markers', {
        type: 'geojson',
        data: geojson,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });
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
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
        paint: { 'text-color': '#ffffff' },
      });
      map.addLayer({
        id: 'app-unclustered',
        type: 'circle',
        source: 'app-markers',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['get', '_color'],
          'circle-radius': 9,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
      });
      if (showLabels) {
        try {
          map.addLayer({
            id: 'app-marker-labels',
            type: 'symbol',
            source: 'app-markers',
            filter: ['!', ['has', 'point_count']],
            layout: {
              'text-field': ['get', '_label'],
              'text-size': 11,
              'text-offset': [0, 1.2],
              'text-anchor': 'top',
            },
            paint: { 'text-color': '#1f2937', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
          });
        } catch { /* style lacks glyphs */ }
      }
    } else {
      map.getSource('app-markers').setData(geojson);
    }
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
        return {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[aLng, aLat], [bLng, bLat]] },
          properties: { _color: pr.distance_m < 500 ? '#ef4444' : '#f97316', _distance: Number(pr.distance_m) || 0 },
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
            'text-field': ['concat', ['to-string', ['get', '_distance']], 'm'],
            'text-size': 11,
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
    } else {
      map.getSource('app-polylines').setData(data);
    }
  }

  function applyProvinceLabels() {
    const { points, show } = provinceState || {};
    if (!points || !show) return;
    points.forEach((province) => {
      const el = document.createElement('div');
      el.className = 'province-label';
      el.textContent = province.name;
      const marker = new maplibregl.Marker({ element: el }).setLngLat([province.lng, province.lat]).addTo(map);
      extraMarkers.push(marker);
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
    } else {
      map.getSource('app-boundaries').setData(geojson);
    }
  }

  function applyPoints() {
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
      extraMarkers.push(marker);
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

  function syncTerrain() {
    if (!enabled3d || !loaded) return;
    try {
      if (map.getZoom() >= 12 && map.getSource('dem')) {
        map.setTerrain({ source: 'dem', exaggeration: 1.1 });
      } else {
        map.setTerrain(null);
      }
    } catch { /* noop */ }
  }

  function apply3D() {
    if (!loaded) return;
    if (enabled3d) {
      try {
        if (!map.getSource('dem')) {
          map.addSource('dem', {
            type: 'raster-dem',
            tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
            encoding: 'terrarium',
            tileSize: 256,
            maxzoom: 11,
          });
        }
        if (!map.getLayer('hillshade')) {
          map.addLayer({ id: 'hillshade', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': 0.3 } });
        }
        if (map.getSource('openmaptiles') && !map.getLayer('app-buildings')) {
          map.addLayer({
            id: 'app-buildings',
            type: 'fill-extrusion',
            source: 'openmaptiles',
            'source-layer': 'building',
            minzoom: 14,
            paint: {
              'fill-extrusion-color': '#c9c4bd',
              'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
              'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
              'fill-extrusion-opacity': 0.7,
            },
          });
        }
        map.off('zoom', syncTerrain);
        map.on('zoom', syncTerrain);
        syncTerrain();
      } catch (err) {
        console.error('[MapLibre] 3D error:', err.message);
      }
      map.easeTo({ pitch: 55, duration: 800 });
    } else {
      try {
        map.off('zoom', syncTerrain);
        if (map.getLayer('app-buildings')) map.removeLayer('app-buildings');
        if (map.getLayer('hillshade')) map.removeLayer('hillshade');
        map.setTerrain(null);
        if (map.getSource('dem')) map.removeSource('dem');
      } catch { /* noop */ }
      if (map.getPitch() > 0) map.easeTo({ pitch: 0, duration: 600 });
    }
  }

  function applyAll() {
    if (!loaded) return;
    clearOverlays();
    applyPolylines();
    applyBoundaries();
    applyCircle();
    applyMarkers();
    applyProvinceLabels();
    applyPoints();
    apply3D();
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
  map.on('style.load', onStyleReady);

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

    setPolylines(pairs, options) {
      polylinesState = { pairs, ...(options || {}) };
      if (loaded) applyPolylines();
    },

    setProvinceLabels(points, show) {
      provinceState = { points, show };
      if (!loaded) return;
      // remove previous label markers only
      extraMarkers.splice(0).forEach((m) => { try { m.remove(); } catch { /* noop */ } });
      applyProvinceLabels();
      applyPoints();
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
