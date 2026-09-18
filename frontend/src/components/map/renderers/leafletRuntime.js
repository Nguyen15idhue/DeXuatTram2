import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { createCustomIcon } from '../../../utils/mapHelpers';
import { formatDistanceM } from '../../../utils/formatDistance';
import { normalizeClusterOptions } from '../../../utils/mapCluster';

const ZOOM_SHOW_DUP_LABEL = 12;
const WARD_MIN_ZOOM = 12;
const WARD_MAX_LABELS = 400;

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function createLeafletRuntime({ container, center, zoom, zoomControl = false }) {
  const map = L.map(container, {
    center: center || [16, 108],
    zoom: zoom || 6,
    minZoom: 2,
    maxZoom: 22,
    zoomControl,
    scrollWheelZoom: true,
  });

  let tileLayer = null;
  const labelLayers = [];
  let markerLayer = null;
  let polylineLayer = null;
  let boundaryLayer = null;
  let provinceLabelLayer = null;
  let wardLabelLayer = null;
  let wardState = { points: [], show: false };
  let pointLayer = null;
  let circleLayer = null;
  let dupLabelToggle = null;
  let tileErr = { count: 0, fired: false, loaded: false, handler: null };

  function renderWardLabels() {
    if (wardLabelLayer) {
      map.removeLayer(wardLabelLayer);
      wardLabelLayer = null;
    }
    const { points, show } = wardState;
    if (!show || !points || points.length === 0) return;
    if (map.getZoom() < WARD_MIN_ZOOM) return;
    const bounds = map.getBounds().pad(0.15);
    const visible = [];
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      if (bounds.contains([p.lat, p.lng])) {
        visible.push(p);
        if (visible.length >= WARD_MAX_LABELS) break;
      }
    }
    if (visible.length === 0) return;
    wardLabelLayer = L.layerGroup(visible.map((p) => L.marker([p.lat, p.lng], {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: 'admin-ward-label',
        html: `<span>${escapeHtml(p.name)}</span>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }),
    })));
    wardLabelLayer.addTo(map);
  }

  map.on('zoomend moveend', renderWardLabels);

  const runtime = {
    id: 'leaflet',
    map,
    supports: { raster: true, vector: false, terrain: false, cluster: true, labels: true, polylines: true },

    setView(nextCenter, nextZoom) {
      map.setView(nextCenter, nextZoom ?? map.getZoom());
    },

    flyTo(position, targetZoom) {
      if (!position) return;
      map.flyTo(position, targetZoom ?? map.getZoom(), { duration: 1.5 });
    },

    getCenter() {
      return map.getCenter();
    },

    getZoom() {
      return map.getZoom();
    },

    setTileLayer({ url, attribution, subdomains, maxZoom = 22, maxNativeZoom = 19, overlays, onTileError } = {}) {
      if (tileLayer) {
        map.removeLayer(tileLayer);
        tileLayer = null;
      }
      while (labelLayers.length) {
        const layer = labelLayers.pop();
        try { map.removeLayer(layer); } catch { /* noop */ }
      }
      tileErr = { count: 0, fired: false, loaded: false, handler: onTileError || null };
      if (!url) return;
      tileLayer = L.tileLayer(url, {
        attribution: attribution || '',
        subdomains: subdomains || '',
        maxZoom,
        maxNativeZoom,
        zIndex: 1,
      });
      tileLayer.on('tileerror', () => {
        if (tileErr.loaded) return;
        tileErr.count += 1;
        if (tileErr.count >= 6 && !tileErr.fired) {
          tileErr.fired = true;
          if (tileErr.handler) tileErr.handler();
        }
      });
      tileLayer.on('tileload', () => {
        tileErr.loaded = true;
        tileErr.count = 0;
      });
      tileLayer.addTo(map);

      (Array.isArray(overlays) ? overlays : []).forEach((ov, idx) => {
        if (!ov || !ov.url) return;
        const overlayLayer = L.tileLayer(ov.url, {
          attribution: ov.attribution || '',
          subdomains: ov.subdomains || '',
          maxZoom,
          maxNativeZoom: ov.max_zoom || maxNativeZoom,
          zIndex: 2 + idx,
        });
        overlayLayer.addTo(map);
        labelLayers.push(overlayLayer);
      });
    },

    setMarkers(items, { cluster = true, clusterOptions, showLabels = false, onMarkerClick, renderPopup } = {}) {
      if (markerLayer) {
        map.removeLayer(markerLayer);
        markerLayer = null;
      }
      const clusterOpts = normalizeClusterOptions(clusterOptions);
      const group = cluster
        ? L.markerClusterGroup({
            maxClusterRadius: clusterOpts.radius,
            disableClusteringAtZoom: clusterOpts.maxZoom + 1,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
          })
        : L.layerGroup();

      (items || []).forEach((item) => {
        const lat = parseFloat(item.latitude);
        const lng = parseFloat(item.longitude);
        if (isNaN(lat) || isNaN(lng)) return;
        const marker = L.marker([lat, lng], { icon: createCustomIcon(item._color, item._icon) });
        if (showLabels && item._label) {
          marker.bindTooltip(item._label, { permanent: false, direction: 'top', offset: [0, -8], className: 'marker-label-tooltip' });
        }
        if (renderPopup) {
          marker.bindPopup(() => renderPopup(item), { className: item._type === 'station' ? 'station-popup' : 'proposal-popup' });
        }
        marker.on('click', () => onMarkerClick && onMarkerClick(item, item._type));
        group.addLayer(marker);
      });

      group.addTo(map);
      markerLayer = group;
    },

    setPolylines(pairs, { renderPopup, showLabels = true } = {}) {
      if (dupLabelToggle) {
        map.off('zoomend', dupLabelToggle);
        dupLabelToggle = null;
      }
      if (polylineLayer) {
        map.removeLayer(polylineLayer);
        polylineLayer = null;
      }
      map.getContainer().classList.remove('hide-dup-labels');
      if (!pairs || pairs.length === 0) return;

      const group = L.layerGroup();
      pairs.forEach((pr) => {
        const aLat = parseFloat(pr.a?.latitude);
        const aLng = parseFloat(pr.a?.longitude);
        const bLat = parseFloat(pr.b?.latitude);
        const bLng = parseFloat(pr.b?.longitude);
        if ([aLat, aLng, bLat, bLng].some((v) => isNaN(v))) return;
        const distanceM = Number(pr.distance_m) || 0;
        const color = distanceM < 500 ? '#ef4444' : distanceM < 2000 ? '#f97316' : '#16a34a';
        const line = L.polyline([[aLat, aLng], [bLat, bLng]], { color, weight: 3, opacity: 0.85 });
        if (showLabels) {
          line.bindTooltip(formatDistanceM(pr.distance_m), { permanent: true, direction: 'center', className: 'dup-distance-label' });
        }
        if (renderPopup) line.bindPopup(() => renderPopup(pr));
        group.addLayer(line);
      });
      group.addTo(map);
      polylineLayer = group;

      if (showLabels) {
        dupLabelToggle = () => {
          map.getContainer().classList.toggle('hide-dup-labels', map.getZoom() < ZOOM_SHOW_DUP_LABEL);
        };
        dupLabelToggle();
        map.on('zoomend', dupLabelToggle);
      }
    },

    setProvinceLabels(points, show) {
      if (provinceLabelLayer) {
        map.removeLayer(provinceLabelLayer);
        provinceLabelLayer = null;
      }
      if (!show || !points || points.length === 0) return;
      provinceLabelLayer = L.layerGroup(
        points.map((province) => {
          const icon = L.divIcon({
            className: 'province-label-icon',
            html: `<div class="province-label">${province.name}</div>`,
            iconSize: [120, 24],
            iconAnchor: [60, 12],
          });
          return L.marker([province.lat, province.lng], { icon, interactive: false });
        })
      );
      provinceLabelLayer.addTo(map);
    },

    setWardLabels(points, show) {
      wardState = { points: points || [], show: !!show };
      renderWardLabels();
    },

    setBoundaries(geojson, show) {
      if (boundaryLayer) {
        map.removeLayer(boundaryLayer);
        boundaryLayer = null;
      }
      if (!show || !geojson) return;
      boundaryLayer = L.geoJSON(geojson, {
        style: {
          color: '#1565C0',
          weight: 2,
          opacity: 0.7,
          dashArray: '8, 5',
          fillColor: 'transparent',
          fillOpacity: 0,
        },
        onEachFeature: (feature, layer) => {
          if (feature.properties?.name) {
            layer.bindTooltip(feature.properties.name, { sticky: true, className: 'province-boundary-tooltip' });
          }
        },
      });
      boundaryLayer.addTo(map);
    },

    setPoints(points) {
      if (pointLayer) {
        map.removeLayer(pointLayer);
        pointLayer = null;
      }
      const list = (points || []).filter((p) => p && p.position);
      if (list.length === 0) return;
      pointLayer = L.layerGroup(
        list.map((point) => {
          const icon = point.variant === 'location'
            ? L.divIcon({
                className: 'location-point-icon',
                html: '<div class="location-point"><span class="location-point-ring"></span><span class="location-point-dot"></span></div>',
                iconSize: [24, 24],
                iconAnchor: [12, 12],
              })
            : createCustomIcon(point.color || '#6b7280');
          const marker = L.marker(point.position, { icon });
          if (point.renderPopup) marker.bindPopup(() => point.renderPopup());
          return marker;
        })
      );
      pointLayer.addTo(map);
    },

    setCircle(circle) {
      const { center, radiusM, color = '#2563eb', fillColor = '#3b82f6', fillOpacity = 0.1 } = circle || {};
      if (circleLayer) {
        map.removeLayer(circleLayer);
        circleLayer = null;
      }
      if (!center || !radiusM) return;
      circleLayer = L.circle(center, { radius: radiusM, color, weight: 2, fillColor, fillOpacity });
      circleLayer.addTo(map);
    },

    set3D() {
      // Leaflet không hỗ trợ 3D/terrain — bỏ qua
    },

    on(event, handler) {
      map.on(event, handler);
    },

    off(event, handler) {
      map.off(event, handler);
    },

    invalidateSize() {
      map.invalidateSize();
    },

    remove() {
      if (dupLabelToggle) map.off('zoomend', dupLabelToggle);
      map.remove();
    },
  };

  return runtime;
}
