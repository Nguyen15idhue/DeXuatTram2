import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, ZoomControl } from 'react-leaflet';
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
  'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
  'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
];

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
  return FALLBACK_TILES[0];
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

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    errCountRef.current = 0;
    firedRef.current = false;
    if (!tileUrl) return;
    const layer = L.tileLayer(tileUrl, {
      attribution: attribution || '',
      subdomains: subdomains || '',
      maxZoom: 20,
    });
    layer.on('tileerror', () => {
      errCountRef.current += 1;
      if (errCountRef.current >= 6 && !firedRef.current) {
        firedRef.current = true;
        if (onTileError) onTileError();
      }
    });
    layer.on('tileload', () => {
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
  }, [map, tileUrl, attribution, subdomains]);

  return null;
}

function MapControlButton({ icon, tooltip, active, onClick, disabled }) {
  return (
    <button
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

function MapLayerController({ stations, proposals, onMarkerClick, user, showStationLabels }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  const clusterRef = useRef(null);

  useEffect(() => {
    const handleZoom = () => setZoom(map.getZoom());
    map.on('zoomend', handleZoom);
    return () => map.off('zoomend', handleZoom);
  }, [map]);

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

      let popupHtml = '<div class="popup-content">';
      if (item._type === 'station') {
        popupHtml += `<h3>${item.name}</h3>`;
        popupHtml += `<p><strong>Địa chỉ:</strong> ${item.address || ''}</p>`;
        popupHtml += `<p><strong>Trạng thái:</strong> <span style="color:${getMarkerColor(item.status)}">${item.status}</span></p>`;
        if (item.description) popupHtml += `<p><strong>Mô tả:</strong> ${item.description}</p>`;
        if (user?.role === 'ADMIN') {
          popupHtml += `<button class="btn btn-sm btn-primary" onclick="window.location.href='/admin/stations/view=${item.id}'">Xem chi tiết</button>`;
        }
      } else {
        popupHtml += `<h3>Đề xuất #${item.id}</h3>`;
        popupHtml += `<p><strong>Chủ sở hữu:</strong> ${item.owner_name || ''}</p>`;
        popupHtml += `<p><strong>SĐT:</strong> ${item.owner_phone || ''}</p>`;
        popupHtml += `<p><strong>Địa chỉ:</strong> ${item.address || ''}</p>`;
        popupHtml += `<p><strong>Trạng thái:</strong> <span style="color:${getMarkerColor(item.status)}">${item.status}</span></p>`;
        if (item.description) popupHtml += `<p><strong>Mô tả:</strong> ${item.description}</p>`;
        popupHtml += `<p><strong>Người đề xuất:</strong> ${item.user_name || ''}</p>`;
      }
      popupHtml += '</div>';
      marker.bindPopup(popupHtml);
      marker.on('click', () => onMarkerClick && onMarkerClick(item, item._type));
      cluster.addLayer(marker);
    });

    map.addLayer(cluster);
    clusterRef.current = cluster;

    return () => {
      if (clusterRef.current) {
        map.removeLayer(clusterRef.current);
        clusterRef.current = null;
      }
    };
  }, [map, stations, proposals, onMarkerClick, user, zoom, showStationLabels]);

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
  readOnly = false
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
  const [resolvedTileUrl, setResolvedTileUrl] = useState(FALLBACK_TILES[0]);
  const [resolvedAttribution, setResolvedAttribution] = useState('&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors');
  const [resolvedSubdomains, setResolvedSubdomains] = useState('a,b,c');
  const [tileWarning, setTileWarning] = useState('');
  const [config, setConfig] = useState({
    tile_provider_id: 'leaflet-osm',
    tile_url: FALLBACK_TILES[0],
    tile_attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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

  const fetchData = async () => {
    try {
      const [stationsRes, proposalsRes] = await Promise.all([
        stationService.getAll(),
        proposalService.getAll()
      ]);
      if (stationsRes.success) setStations(stationsRes.data);
      if (proposalsRes.success) setProposals(proposalsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const buildTileUrl = (providerId, apiKey, styleIdx) => {
    const fallback = { url: FALLBACK_TILES[0], attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', subdomains: 'a,b,c', warning: '' };
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
        url: resolveTileUrl(selectedStyle.url, apiKey, selectedStyle.value),
        attribution: selectedStyle.attribution || provider.attribution,
        subdomains: selectedStyle.subdomains ?? provider.subdomains ?? '',
        warning: '',
      };
    }

    if (provider.tile_url_template && selectedStyle) {
      return {
        url: resolveTileUrl(provider.tile_url_template, apiKey, selectedStyle.value),
        attribution: provider.attribution,
        subdomains: provider.subdomains || '',
        warning: '',
      };
    }

    if (provider.tile_url && isValidTileUrl(provider.tile_url)) {
      return {
        url: provider.tile_url,
        attribution: provider.attribution,
        subdomains: provider.subdomains || '',
        warning: '',
      };
    }

    return fallback;
  };

  const applyFallback = (message) => {
    setResolvedTileUrl(FALLBACK_TILES[0]);
    setResolvedAttribution('&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors');
    setResolvedSubdomains('a,b,c');
    setTileWarning(message);
  };

  const handleTileError = () => {
    applyFallback('Tile server lỗi liên tục, đã tự chuyển về bản đồ mặc định.');
  };

  const fetchConfig = async () => {
    try {
      const data = await api.get('/map-configs?entity=stations');
      if (data.success && data.data) {
        const d = data.data;
        const providerId = d.tile_provider_id || d.tile_provider || 'leaflet-osm';
        const apiKey = d.api_key || '';
        const tile = buildTileUrl(providerId, apiKey, 0);

        setResolvedTileUrl(tile.url);
        setResolvedAttribution(tile.attribution);
        setResolvedSubdomains(tile.subdomains);
        setTileWarning(tile.warning || '');

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
      // Use defaults
    }
  };

  useEffect(() => { fetchData(); fetchConfig(); }, []);
  useEffect(() => { if (refreshKey) fetchData(); }, [refreshKey]);

  useEffect(() => {
    if (activeLayerIdx === 0 && !config.api_key) return;
    const tile = buildTileUrl(config.tile_provider_id, config.api_key, activeLayerIdx);
    setResolvedTileUrl(tile.url);
    setResolvedAttribution(tile.attribution);
    setResolvedSubdomains(tile.subdomains);
    setTileWarning(tile.warning || '');
  }, [activeLayerIdx, config.tile_provider_id, config.api_key]);

  const handleMyLocation = (openForm = false) => {
    if (!navigator.geolocation) {
      alert('Trình duyệt không hỗ trợ định vị');
      return;
    }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setMyLocation([latitude, longitude]);
        setLocationLoading(false);
        setShowCreateMenu(false);
        if (openForm && onLocationSelected) {
          onLocationSelected(latitude, longitude);
        }
      },
      (error) => {
        setLocationLoading(false);
        let msg = 'Không thể lấy vị trí';
        if (error.code === 1) msg = 'Bạn đã từ chối quyền truy cập vị trí';
        else if (error.code === 2) msg = 'Không xác định được vị trí';
        else if (error.code === 3) msg = 'Timeout lấy vị trí';
        alert(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleGoogleMapSubmit = async () => {
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
  };

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

        {tileWarning && (
          <div className="alert alert-warning text-xs shadow-lg"
            style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, maxWidth: '90%' }}>
            <span>{tileWarning}</span>
            <button className="btn btn-xs btn-ghost" onClick={() => setTileWarning('')}>✕</button>
          </div>
        )}

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

      {/* Map Controls - Top Right */}
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

      {/* Map Legend */}
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

      {/* Floating Action Buttons - bottom right */}
      {!readOnly && (
      <div className="map-fab-group">
        {showCreateMenu && (
          <div className="map-create-menu">
            <button className="map-create-option" onClick={() => handleMyLocation(true)} disabled={locationLoading}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                <circle cx="12" cy="9" r="2.5"/>
              </svg>
              <span>{locationLoading ? 'Đang lấy...' : 'Vị trí của tôi'}</span>
            </button>
            <button
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
