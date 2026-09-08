import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, ZoomControl } from 'react-leaflet';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { stationService, proposalService, api } from '../services/api';
import { getMarkerColor, createCustomIcon, parseGoogleMapsLink, resolveGoogleMapsShortUrl } from '../utils/mapHelpers';
import { PROVINCES, VIETNAM_CENTER, VIETNAM_DEFAULT_ZOOM } from '../utils/provinceData';
import { getProviderById } from '../utils/tileProviders';

const FALLBACK_TILES = [
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
  'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
];

const PROXY_TILE = '/tiles/{z}/{x}/{y}';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function resolveTileUrl(template, apiKey, styleValue) {
  if (!template) return '';
  let url = template.replace('{key}', apiKey || '');
  url = url.replace('{style}', styleValue || '');
  return url;
}

function isValidTileUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const placeholderPattern = /\{[^}]+\}/g;
  const matches = url.match(placeholderPattern) || [];
  const validPlaceholders = ['{z}', '{x}', '{y}', '{s}', '{r}'];
  return matches.every(m => validPlaceholders.includes(m));
}

function getSafeTileUrl(url) {
  if (isValidTileUrl(url)) return url;
  return PROXY_TILE;
}

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function FlyToLocation({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo(position, 16, { duration: 1.5 });
    }
  }, [position, map]);
  return null;
}

const dupLabelOf = (p) => {
  if (p.code) return p.code;
  return p.kind === 'station' ? `Trạm #${p.id}` : `Đề xuất #${p.id}`;
};

function DuplicateLines({ pairs }) {
  const map = useMap();
  const layerRef = useRef(null);
  const ZOOM_SHOW_LABEL = 12;

  useEffect(() => {
    const updateLabels = () => {
      map.getContainer().classList.toggle('hide-dup-labels', map.getZoom() < ZOOM_SHOW_LABEL);
    };
    updateLabels();
    map.on('zoomend', updateLabels);
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (!pairs || pairs.length === 0) return;

    const group = L.layerGroup();
    pairs.forEach(pr => {
      const aLat = parseFloat(pr.a?.latitude);
      const aLng = parseFloat(pr.a?.longitude);
      const bLat = parseFloat(pr.b?.latitude);
      const bLng = parseFloat(pr.b?.longitude);
      if ([aLat, aLng, bLat, bLng].some(v => isNaN(v))) return;
      const color = pr.distance_m < 500 ? '#ef4444' : '#f97316';
      const line = L.polyline([[aLat, aLng], [bLat, bLng]], { color, weight: 3, opacity: 0.85 });
      line.bindTooltip(`${pr.distance_m}m`, { permanent: true, direction: 'center', className: 'dup-distance-label' });
      line.bindPopup(`<div class="popup-content"><h3>${dupLabelOf(pr.a)} ↔ ${dupLabelOf(pr.b)}</h3><p><strong>Khoảng cách:</strong> ${pr.distance_m}m</p></div>`);
      group.addLayer(line);
    });
    group.addTo(map);
    layerRef.current = group;

    return () => {
      map.off('zoomend', updateLabels);
      map.getContainer().classList.remove('hide-dup-labels');
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, pairs]);

  return null;
}

function MapEventsHandler({ selectingLocation, onMapSelectClick }) {
  useMapEvents({
    click(e) {
      if (selectingLocation && onMapSelectClick) {
        onMapSelectClick(e.latlng.lat, e.latlng.lng);
      }
    }
  });
  return null;
}

const MAP_LEGEND = [
  { status: 'ACTIVE', label: 'Đang hoạt động' },
  { status: 'DEPLOYING', label: 'Đang triển khai' },
  { status: 'PENDING', label: 'Đang đề xuất' },
  { status: 'REVIEWING', label: 'Đang xem xét' },
  { status: 'APPROVED', label: 'Đã duyệt' },
  { status: 'REJECTED', label: 'Từ chối' },
];

function getProvinceIcon(province) {
  return L.divIcon({
    className: 'province-label-icon',
    html: `<div class="province-label">${province.name}</div>`,
    iconSize: [120, 24],
    iconAnchor: [60, 12],
  });
}

function DynamicTileLayer({ tileUrl, attribution, subdomains, onTileError }) {
  const map = useMap();
  const layerRef = useRef(null);
  const errCountRef = useRef(0);
  const firedRef = useRef(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    errCountRef.current = 0;
    firedRef.current = false;
    loadedRef.current = false;
    if (!tileUrl) return;

    const layer = L.tileLayer(tileUrl, {
      attribution: attribution || '',
      subdomains: subdomains || '',
      maxZoom: 20,
    });

    layer.on('tileerror', () => {
      if (loadedRef.current) return;
      errCountRef.current += 1;
      if (errCountRef.current >= 6 && !firedRef.current) {
        firedRef.current = true;
        if (onTileError) onTileError();
      }
    });
    layer.on('tileload', () => {
      loadedRef.current = true;
      errCountRef.current = 0;
    });
    layer.addTo(map);
    layerRef.current = layer;
    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, tileUrl, attribution, subdomains, onTileError]);

  return null;
}

function MapControlButton({ icon, tooltip, active, onClick, disabled }) {
  return (
    <button
      type="button"
      className={`map-control-btn ${active ? 'map-control-btn-active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
    >
      {icon}
    </button>
  );
}

function MapLayerSwitcher({ layers, activeIdx, onSwitch }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (!layers || layers.length <= 1) return null;

  return (
    <div className="map-layer-switcher" ref={ref}>
      <button
        type="button"
        className={`map-control-btn ${open ? 'map-control-btn-active' : ''}`}
        onClick={() => setOpen(v => !v)}
        title="Chuyển layer"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
      </button>
      {open && (
        <div className="map-layer-dropdown">
          {layers.map((layer, idx) => (
            <button
              type="button"
              key={idx}
              className={`map-layer-option ${idx === activeIdx ? 'map-layer-option-active' : ''}`}
              onClick={() => { onSwitch(idx); setOpen(false); }}
            >
              {layer.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function createStationPopupContent(item, user) {
  const div = document.createElement('div');
  div.className = 'popup-content';
  const h3 = document.createElement('h3');
  h3.textContent = item.name;
  div.appendChild(h3);

  const addRow = (label, value) => {
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = `${label}: `;
    p.appendChild(strong);
    p.appendChild(document.createTextNode(value || ''));
    div.appendChild(p);
  };

  addRow('Địa chỉ', item.address);
  const statusP = document.createElement('p');
  const statusStrong = document.createElement('strong');
  statusStrong.textContent = 'Trạng thái: ';
  statusP.appendChild(statusStrong);
  const statusSpan = document.createElement('span');
  statusSpan.style.color = getMarkerColor(item.status);
  statusSpan.textContent = item.status;
  statusP.appendChild(statusSpan);
  div.appendChild(statusP);

  if (item.description) addRow('Mô tả', item.description);

  if (user?.role === 'ADMIN') {
    const root = createRoot(div);
    root.render(
      <Link to={`/admin/stations/view=${item.id}`} className="btn btn-sm btn-primary mt-2">
        Xem chi tiết
      </Link>
    );
  }

  return div;
}

function createProposalPopupContent(item) {
  const div = document.createElement('div');
  div.className = 'popup-content';
  const h3 = document.createElement('h3');
  h3.textContent = `Đề xuất #${item.id}`;
  div.appendChild(h3);

  const addRow = (label, value) => {
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = `${label}: `;
    p.appendChild(strong);
    p.appendChild(document.createTextNode(value || ''));
    div.appendChild(p);
  };

  addRow('Chủ sở hữu', item.owner_name);
  addRow('SĐT', item.owner_phone);
  addRow('Địa chỉ', item.address);
  const statusP = document.createElement('p');
  const statusStrong = document.createElement('strong');
  statusStrong.textContent = 'Trạng thái: ';
  statusP.appendChild(statusStrong);
  const statusSpan = document.createElement('span');
  statusSpan.style.color = getMarkerColor(item.status);
  statusSpan.textContent = item.status;
  statusP.appendChild(statusSpan);
  div.appendChild(statusP);
  if (item.description) addRow('Mô tả', item.description);
  addRow('Người đề xuất', item.user_name || 'Khách');

  return div;
}

function MapLayerController({ stations, proposals, onMarkerClick, user, showStationLabels }) {
  const map = useMap();
  const clusterRef = useRef(null);

  useEffect(() => {
    if (clusterRef.current) {
      map.removeLayer(clusterRef.current);
      clusterRef.current = null;
    }

    const cluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
    });

    const allItems = [
      ...stations.map(s => ({ ...s, _type: 'station' })),
      ...proposals.map(p => ({ ...p, _type: 'proposal' })),
    ];

    const markers = [];

    allItems.forEach(item => {
      const lat = parseFloat(item.latitude);
      const lng = parseFloat(item.longitude);
      if (isNaN(lat) || isNaN(lng)) return;

      const marker = L.marker([lat, lng], {
        icon: createCustomIcon(getMarkerColor(item.status)),
      });

      if (showStationLabels) {
        const label = item._type === 'station' ? (item.name || `Trạm #${item.id}`) : `Đề xuất #${item.id}`;
        marker.bindTooltip(label, { permanent: false, direction: 'top', offset: [0, -8], className: 'marker-label-tooltip' });
      }

      if (item._type === 'station') {
        marker.bindPopup(() => createStationPopupContent(item, user), { className: 'station-popup' });
      } else {
        marker.bindPopup(() => createProposalPopupContent(item), { className: 'proposal-popup' });
      }

      marker.on('click', () => onMarkerClick && onMarkerClick(item, item._type));
      markers.push(marker);
    });

    if (markers.length > 0) {
      cluster.addLayers(markers);
    }

    map.addLayer(cluster);
    clusterRef.current = cluster;

    return () => {
      if (clusterRef.current) {
        map.removeLayer(clusterRef.current);
        clusterRef.current = null;
      }
    };
  }, [map, stations, proposals, onMarkerClick, user, showStationLabels]);

  return null;
}

function ProvinceBoundaryLayer({ show }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    if (!show) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
      return;
    }

    let cancelled = false;

    fetch('/vietnam-provinces.geojson')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(geojson => {
        if (cancelled) return;
        const layer = L.geoJSON(geojson, {
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
              layer.bindTooltip(feature.properties.name, {
                sticky: true,
                className: 'province-boundary-tooltip',
              });
            }
          },
        });
        layer.addTo(map);
        layerRef.current = layer;
      })
      .catch(err => {
        console.error('Failed to load province boundaries:', err);
      });

    return () => {
      cancelled = true;
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, show]);

  return null;
}

const MapView = ({
  onMarkerClick,
  selectingLocation,
  onLocationSelected,
  onMapSelectClick,
  highlightPosition,
  refreshKey,
  user,
  highlightIds = null,
  readOnly = false,
  pairs = []
}) => {
  const [stations, setStations] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [googleMapUrl, setGoogleMapUrl] = useState('');
  const [resolvingUrl, setResolvingUrl] = useState(false);
  const [myLocation, setMyLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [showStationLabels, setShowStationLabels] = useState(true);
  const [showProvinceLabels, setShowProvinceLabels] = useState(true);
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [activeLayerIdx, setActiveLayerIdx] = useState(0);
  const [resolvedTileUrl, setResolvedTileUrl] = useState(PROXY_TILE);
  const [resolvedAttribution, setResolvedAttribution] = useState(OSM_ATTRIBUTION);
  const [resolvedSubdomains, setResolvedSubdomains] = useState('');
  const mountedRef = useRef(true);

  const [config, setConfig] = useState({
    tile_provider_id: 'leaflet-osm',
    tile_url: PROXY_TILE,
    tile_attribution: OSM_ATTRIBUTION,
    tile_subdomains: '',
    api_key: '',
    show_boundaries: true,
    show_province_labels: true,
    show_cluster: true,
    center_lat: VIETNAM_CENTER.lat,
    center_lng: VIETNAM_CENTER.lng,
    default_zoom: VIETNAM_DEFAULT_ZOOM,
  });

  useEffect(() => {
    if (highlightPosition) {
      setSelectedPosition(highlightPosition);
    }
  }, [highlightPosition]);

  const fetchData = useCallback(async (signal) => {
    try {
      const [stationsRes, proposalsRes] = await Promise.all([
        stationService.getAll(),
        proposalService.getAll()
      ]);
      if (!signal?.aborted) {
        if (stationsRes.success) setStations(stationsRes.data);
        if (proposalsRes.success) setProposals(proposalsRes.data);
      }
    } catch (error) {
      if (error.name !== 'AbortError') console.error('Error fetching data:', error);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  const buildTileUrl = useCallback((providerId, apiKey, styleIdx) => {
    const fallback = { url: PROXY_TILE, attribution: OSM_ATTRIBUTION, subdomains: '', warning: '' };
    const provider = getProviderById(providerId);
    if (!provider) return { ...fallback, warning: 'Không tìm thấy provider đã lưu, đang dùng bản đồ mặc định.' };
    if (provider.incompatible_with_leaflet) {
      return { ...fallback, warning: `${provider.name} không dùng được với Leaflet, đang dùng bản đồ mặc định. Vào Admin → Cấu hình bản đồ để đổi provider.` };
    }
    if (provider.requires_key && !apiKey) {
      return { ...fallback, warning: `${provider.name} yêu cầu API Key nhưng chưa cấu hình, đang dùng bản đồ mặc định. Vào Admin → Cấu hình bản đồ để nhập key.` };
    }

    const tileUrlStyles = provider.tile_url_styles || [];
    const selectedStyle = tileUrlStyles[styleIdx] || tileUrlStyles[0];

    if (selectedStyle && selectedStyle.url) {
      return {
        url: PROXY_TILE,
        attribution: selectedStyle.attribution || provider.attribution,
        subdomains: '',
        warning: '',
      };
    }

    if (provider.tile_url_template && selectedStyle) {
      return {
        url: PROXY_TILE,
        attribution: provider.attribution,
        subdomains: '',
        warning: '',
      };
    }

    if (provider.tile_url && isValidTileUrl(provider.tile_url)) {
      return {
        url: PROXY_TILE,
        attribution: provider.attribution,
        subdomains: '',
        warning: '',
      };
    }

    return fallback;
  }, []);

  const handleTileError = useCallback(() => {
    setResolvedTileUrl(prev => {
      if (prev !== PROXY_TILE) {
        setResolvedAttribution(OSM_ATTRIBUTION);
        setResolvedSubdomains('');
        return PROXY_TILE;
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  useEffect(() => {
    if (refreshKey) {
      const controller = new AbortController();
      fetchData(controller.signal);
      return () => controller.abort();
    }
  }, [refreshKey, fetchData]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchConfig = async () => {
      try {
        const data = await api.get('/map-configs?entity=stations');
        if (controller.signal.aborted) return;
        if (data.success && data.data) {
          const d = data.data;
          const providerId = d.tile_provider_id || d.tile_provider || 'leaflet-osm';
          const apiKey = d.api_key || '';
          const tile = buildTileUrl(providerId, apiKey, 0);

          setResolvedTileUrl(tile.url);
          setResolvedAttribution(tile.attribution);
          setResolvedSubdomains(tile.subdomains);


          setConfig(prev => ({
            ...prev,
            ...d,
            tile_provider_id: providerId,
            api_key: apiKey,
            center_lat: parseFloat(d.center_lat) || prev.center_lat,
            center_lng: parseFloat(d.center_lng) || prev.center_lng,
            default_zoom: parseInt(d.default_zoom) || prev.default_zoom,
          }));
          setShowProvinceLabels(d.show_province_labels !== false);
          setShowBoundaries(d.show_boundaries !== false);
          setActiveLayerIdx(0);
        }
      } catch (e) {
        if (e.name !== 'AbortError') { /* Use defaults */ }
      }
    };
    fetchConfig();
    return () => controller.abort();
  }, [buildTileUrl]);

  useEffect(() => {
    if (activeLayerIdx === 0 && !config.api_key) return;
    const tile = buildTileUrl(config.tile_provider_id, config.api_key, activeLayerIdx);
    setResolvedTileUrl(tile.url);
    setResolvedAttribution(tile.attribution);
    setResolvedSubdomains(tile.subdomains);
  }, [activeLayerIdx, config.tile_provider_id, config.api_key, buildTileUrl]);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const handleMyLocation = useCallback((openForm = false) => {
    if (!navigator.geolocation) {
      console.error('[MapView] navigator.geolocation is not available');
      alert('Trình duyệt không hỗ trợ định vị');
      return;
    }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!mountedRef.current) return;
        const { latitude, longitude } = position.coords;
        setMyLocation([latitude, longitude]);
        setLocationLoading(false);
        setShowCreateMenu(false);
        if (openForm && onLocationSelected) {
          onLocationSelected(latitude, longitude);
        }
      },
      (error) => {
        if (!mountedRef.current) return;
        setLocationLoading(false);
        console.error('[MapView] Geolocation error:', error.code, error.message);
        let msg = 'Không thể lấy vị trí';
        if (error.code === 1) msg = 'Bạn đã từ chối quyền truy cập vị trí';
        else if (error.code === 2) msg = 'Không xác định được vị trí';
        else if (error.code === 3) msg = 'Timeout lấy vị trí';
        alert(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [onLocationSelected]);

  const handleGoogleMapSubmit = useCallback(async () => {
    if (!googleMapUrl.trim()) return;
    setResolvingUrl(true);
    const result = parseGoogleMapsLink(googleMapUrl);
    if (result && !result.needResolve) {
      setGoogleMapUrl('');
      setResolvingUrl(false);
      setShowCreateMenu(false);
      if (onLocationSelected) onLocationSelected(result.lat, result.lng);
      return;
    }
    if (result && result.needResolve) {
      const resolved = await resolveGoogleMapsShortUrl(result.url);
      setResolvingUrl(false);
      if (resolved && !resolved.needResolve) {
        setGoogleMapUrl('');
        setShowCreateMenu(false);
        if (onLocationSelected) onLocationSelected(resolved.lat, resolved.lng);
        return;
      }
    }
    setResolvingUrl(false);
    alert('Không thể đọc tọa độ từ link này. Vui lòng kiểm tra lại định dạng link.');
  }, [googleMapUrl, onLocationSelected]);

  if (loading) {
    return <div className="map-loading">Đang tải bản đồ...</div>;
  }

  const center = [config.center_lat || VIETNAM_CENTER.lat, config.center_lng || VIETNAM_CENTER.lng];
  const zoom = config.default_zoom || VIETNAM_DEFAULT_ZOOM;

  const currentProvider = getProviderById(config.tile_provider_id);
  const tileUrlStyles = currentProvider?.tile_url_styles || [];
  const layerOptions = tileUrlStyles.length > 1 ? tileUrlStyles : [];

  return (
    <div style={{ flex: 1, height: '100%', width: '100%', position: 'relative' }}>
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={true}
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <ZoomControl position="bottomleft" />

        <DynamicTileLayer
          tileUrl={resolvedTileUrl}
          attribution={resolvedAttribution}
          subdomains={resolvedSubdomains}
          onTileError={handleTileError}
        />

        <MapEventsHandler
          selectingLocation={selectingLocation}
          onMapSelectClick={onMapSelectClick}
        />

        {highlightPosition && <FlyToLocation position={highlightPosition} />}
        {myLocation && <FlyToLocation position={myLocation} />}
        {selectedPosition && (
          <Marker position={selectedPosition} icon={createCustomIcon('#ea4335')}>
            <Popup>
              <div className="popup-content">
                <h3>Vị trí đã chọn</h3>
                <p><strong>Vĩ độ:</strong> {selectedPosition[0].toFixed(6)}</p>
                <p><strong>Kinh độ:</strong> {selectedPosition[1].toFixed(6)}</p>
              </div>
            </Popup>
          </Marker>
        )}
        {myLocation && (
          <Marker position={myLocation} icon={createCustomIcon('#4285f4')}>
            <Popup>
              <div className="popup-content">
                <h3>Vị trí của tôi</h3>
                <p><strong>Vĩ độ:</strong> {myLocation[0].toFixed(6)}</p>
                <p><strong>Kinh độ:</strong> {myLocation[1].toFixed(6)}</p>
              </div>
            </Popup>
          </Marker>
        )}

        <MapLayerController
          stations={highlightIds ? stations.filter(s => highlightIds.stations.includes(s.id)) : stations}
          proposals={highlightIds ? proposals.filter(p => highlightIds.proposals.includes(p.id)) : proposals}
          onMarkerClick={onMarkerClick}
          user={user}
          showStationLabels={showStationLabels}
        />

        <DuplicateLines pairs={pairs} />

        <ProvinceBoundaryLayer show={showBoundaries} />

        {showProvinceLabels && PROVINCES.map((p) => (
          <Marker
            key={`province-${p.name}`}
            position={[p.lat, p.lng]}
            icon={getProvinceIcon(p)}
            interactive={false}
          />
        ))}
      </MapContainer>

      <div className="map-controls-top-right">
        <MapControlButton
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>}
          tooltip="Chú thích"
          active={showLegend}
          onClick={() => setShowLegend(v => !v)}
        />

        <MapControlButton
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>}
          tooltip="Tên trạm"
          active={showStationLabels}
          onClick={() => setShowStationLabels(v => !v)}
        />

        <MapControlButton
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>}
          tooltip="Tên tỉnh"
          active={showProvinceLabels}
          onClick={() => setShowProvinceLabels(v => !v)}
        />

        <MapControlButton
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="4 2"/></svg>}
          tooltip="Ranh giới"
          active={showBoundaries}
          onClick={() => setShowBoundaries(v => !v)}
        />

        {layerOptions.length > 0 && (
          <MapLayerSwitcher
            layers={layerOptions}
            activeIdx={activeLayerIdx}
            onSwitch={(idx) => setActiveLayerIdx(idx)}
          />
        )}
      </div>

      {showLegend && (
        <div className="map-legend">
          <div className="map-legend-title">Chú thích</div>
          {MAP_LEGEND.map((item) => (
            <div key={item.status} className="map-legend-item">
              <span className="map-legend-dot" style={{ backgroundColor: getMarkerColor(item.status) }} />
              <span className="map-legend-label">{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
      <div className="map-fab-group">
        {showCreateMenu && (
          <div className="map-create-menu">
            <button type="button" className="map-create-option" onClick={() => handleMyLocation(true)} disabled={locationLoading}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                <circle cx="12" cy="9" r="2.5"/>
              </svg>
              <span>{locationLoading ? 'Đang lấy...' : 'Vị trí của tôi'}</span>
            </button>
            <button
              type="button"
              className="map-create-option"
              onClick={() => { setShowCreateMenu(false); if (onLocationSelected) onLocationSelected(null, null, 'select'); }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              <span>Chọn trên bản đồ</span>
            </button>
            <div className="map-create-option map-create-option-input">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z"/>
                <path d="M8 2v12M16 6v12"/>
              </svg>
              <input
                type="text"
                placeholder="Dán link Google Map..."
                value={googleMapUrl}
                onChange={(e) => setGoogleMapUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGoogleMapSubmit()}
              />
              <button
                type="button"
                className="map-google-confirm"
                onClick={handleGoogleMapSubmit}
                disabled={resolvingUrl || !googleMapUrl.trim()}
              >
                {resolvingUrl ? '...' : '✓'}
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          className="map-fab map-fab-location"
          onClick={() => handleMyLocation()}
          disabled={locationLoading}
          title="Vị trí của tôi"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/>
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        <button
          type="button"
          className={`map-fab map-fab-create ${showCreateMenu ? 'map-fab-active' : ''}`}
          onClick={() => setShowCreateMenu(!showCreateMenu)}
          title="Tạo đề xuất mới"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>
      )}
    </div>
  );
};

export default MapView;
