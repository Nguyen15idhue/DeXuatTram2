import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { stationService, proposalService, api } from '../services/api';
import { getMarkerColor, parseGoogleMapsLink, resolveGoogleMapsShortUrl } from '../utils/mapHelpers';
import { STATION_STATUSES, PROPOSAL_STATUSES } from '../utils/mapStatuses';
import { PROVINCES, VIETNAM_CENTER, VIETNAM_DEFAULT_ZOOM } from '../utils/provinceData';
import { getProviderById, loadTileProviders } from '../utils/tileProviders';
import { buildTileConfig, PROXY_TILE, OSM_ATTRIBUTION } from '../utils/mapTile';
import { buildMapStyle, loadPmtilesStyle, loadLibertyBaseStyle } from '../utils/mapStyles';
import { MAP_MODES, DEFAULT_MODE } from '../utils/mapModes';
import { resolveRenderer } from './map/renderers';
import MapCanvas from './map/MapCanvas';
import useMediaQuery from '../hooks/useMediaQuery';

const EMPTY_PAIRS = [];

const dupLabelOf = (p) => {
  if (p.code) return p.code;
  return p.kind === 'station' ? `Trạm #${p.id}` : `Đề xuất #${p.id}`;
};

export function createDuplicatePopupContent(pair) {
  const div = document.createElement('div');
  div.className = 'popup-content';
  const h3 = document.createElement('h3');
  h3.textContent = `${dupLabelOf(pair.a)} ↔ ${dupLabelOf(pair.b)}`;
  div.appendChild(h3);
  const p = document.createElement('p');
  const strong = document.createElement('strong');
  strong.textContent = 'Khoảng cách: ';
  p.appendChild(strong);
  p.appendChild(document.createTextNode(`${Number(pair.distance_m) || 0}m`));
  div.appendChild(p);
  return div;
}

function createPositionPopupContent(title, position) {
  const div = document.createElement('div');
  div.className = 'popup-content';
  const h3 = document.createElement('h3');
  h3.textContent = title;
  div.appendChild(h3);
  const lat = document.createElement('p');
  const latStrong = document.createElement('strong');
  latStrong.textContent = 'Vĩ độ: ';
  lat.appendChild(latStrong);
  lat.appendChild(document.createTextNode(Number(position[0]).toFixed(6)));
  div.appendChild(lat);
  const lng = document.createElement('p');
  const lngStrong = document.createElement('strong');
  lngStrong.textContent = 'Kinh độ: ';
  lng.appendChild(lngStrong);
  lng.appendChild(document.createTextNode(Number(position[1]).toFixed(6)));
  div.appendChild(lng);
  return div;
}

const MAP_LEGEND = {
  stations: STATION_STATUSES,
  proposals: PROPOSAL_STATUSES
};

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

const ADMIN_PANEL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SALES'];
const canOpenAdminRecord = (user) => !!user && ADMIN_PANEL_ROLES.includes(user.role);

const canViewProposal = (item, user) => {
  if (!user) return false;
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return true;
  if (user.role === 'SALES') {
    return Number(item.user_id) === Number(user.id) || Number(item.owner_parent_id) === Number(user.id);
  }
  return false;
};

function renderAdminLink(div, href) {
  const a = document.createElement('a');
  a.href = href;
  a.className = 'btn btn-sm btn-primary mt-2';
  a.textContent = 'Xem chi tiết';
  div.appendChild(a);
}

function renderDeniedNote(div) {
  const p = document.createElement('p');
  p.className = 'popup-denied';
  p.textContent = 'Bạn không có quyền xem đề xuất này';
  div.appendChild(p);
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
  statusSpan.style.color = getMarkerColor(item.status, 'station');
  statusSpan.textContent = item.status;
  statusP.appendChild(statusSpan);
  div.appendChild(statusP);

  if (item.description) addRow('Mô tả', item.description);

  if (canOpenAdminRecord(user)) {
    renderAdminLink(div, `/admin/stations/view=${item.id}`);
  }

  return div;
}

function createProposalPopupContent(item, user) {
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

  addRow('Địa chỉ', item.address);
  const statusP = document.createElement('p');
  const statusStrong = document.createElement('strong');
  statusStrong.textContent = 'Trạng thái: ';
  statusP.appendChild(statusStrong);
  const statusSpan = document.createElement('span');
  statusSpan.style.color = getMarkerColor(item.status, 'proposal');
  statusSpan.textContent = item.status;
  statusP.appendChild(statusSpan);
  div.appendChild(statusP);

  if (canViewProposal(item, user)) {
    renderAdminLink(div, `/admin/proposals/view=${item.id}`);
  } else if (user && (user.role === 'SALES')) {
    renderDeniedNote(div);
  }

  return div;
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
  pairs = EMPTY_PAIRS,
  filters = null
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
  const [showLegend, setShowLegend] = useState(() => (typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true));
  const [showCluster, setShowCluster] = useState(true);
  const [activeLayerIdx, setActiveLayerIdx] = useState(0);
  const [resolvedTileUrl, setResolvedTileUrl] = useState(PROXY_TILE);
  const [resolvedAttribution, setResolvedAttribution] = useState(OSM_ATTRIBUTION);
  const [resolvedSubdomains, setResolvedSubdomains] = useState('');
  const [resolvedOverlays, setResolvedOverlays] = useState([]);
  const [tileFailed, setTileFailed] = useState(false);
  const [tileWarning, setTileWarning] = useState('');
  const [runtimeWarning, setRuntimeWarning] = useState('');
  const [boundaries, setBoundaries] = useState(null);
  const [configVersion, setConfigVersion] = useState(0);
  const mountedRef = useRef(true);

  const [config, setConfig] = useState({
    tile_provider_id: 'leaflet-osm',
    tile_url: PROXY_TILE,
    tile_attribution: OSM_ATTRIBUTION,
    tile_subdomains: '',
    api_key: '',
    renderer: 'leaflet',
    tile_mode: 'proxy',
    retina: 0,
    show_boundaries: true,
    show_province_labels: true,
    show_cluster: true,
    center_lat: VIETNAM_CENTER.lat,
    center_lng: VIETNAM_CENTER.lng,
    default_zoom: VIETNAM_DEFAULT_ZOOM,
  });

  const isMobile = useMediaQuery('(max-width: 767px)');
  const [activeMode, setActiveMode] = useState(DEFAULT_MODE);
  const [active3d, setActive3d] = useState(false);
  const [pmtilesStyle, setPmtilesStyle] = useState(null);
  const [libertyBase, setLibertyBase] = useState(null);

  useEffect(() => {
    setActiveMode(config.default_mode || DEFAULT_MODE);
    setActive3d(!!Number(config.enable_3d));
  }, [config.default_mode, config.enable_3d, config.renderer, config.tile_provider_id]);

  const pmtilesUrl = useMemo(
    () => (/\.pmtiles(\?|$)/i.test(config.tile_url || '') ? config.tile_url : ''),
    [config.tile_url]
  );

  useEffect(() => {
    let cancelled = false;
    if (config.renderer !== 'maplibre' || !pmtilesUrl) {
      setPmtilesStyle(null);
      return undefined;
    }
    loadPmtilesStyle(pmtilesUrl).then((s) => { if (!cancelled) setPmtilesStyle(s); });
    return () => { cancelled = true; };
  }, [config.renderer, pmtilesUrl]);

  useEffect(() => {
    let cancelled = false;
    if (config.renderer !== 'maplibre') {
      setLibertyBase(null);
      return undefined;
    }
    loadLibertyBaseStyle().then((s) => { if (!cancelled) setLibertyBase(s); });
    return () => { cancelled = true; };
  }, [config.renderer]);

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

  const buildTileUrl = useCallback((providerId, apiKey, styleIdx, opts = {}) => {
    return buildTileConfig({
      tile_provider_id: providerId,
      api_key: apiKey,
      tile_mode: opts.tileMode,
      retina: opts.retina,
      renderer: opts.renderer,
      tile_url: opts.tileUrl,
      tile_attribution: opts.tileAttribution,
      tile_subdomains: opts.tileSubdomains,
      style_url: opts.styleUrl,
    }, styleIdx);
  }, []);

  const handleTileError = useCallback(() => {
    setTileFailed(true);
  }, []);

  const handleRuntimeInfo = useCallback(({ fallback, requested }) => {
    setRuntimeWarning(fallback
      ? `Renderer "${requested}" không khởi động được (thiếu WebGL?), đang dùng Leaflet.`
      : '');
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
        await loadTileProviders();
        const data = await api.get('/map-configs?entity=stations');
        if (controller.signal.aborted) return;
        if (data.success && data.data) {
          const d = data.data;
          const providerId = d.tile_provider_id || d.tile_provider || 'leaflet-osm';
          const apiKey = d.api_key || '';
          const tileMode = d.tile_mode || 'proxy';
          const retina = !!Number(d.retina);
          const provider = getProviderById(providerId);
          const providerStyles = (provider?.tile_url_styles || provider?.style_options) || [];
          const savedStyleIdx = Math.max(0, providerStyles.findIndex(s => s.value === d.style_url));
          const tile = buildTileUrl(providerId, apiKey, providerStyles.length ? savedStyleIdx : null, {
            tileMode, retina, renderer: d.renderer,
            tileUrl: d.tile_url, tileAttribution: d.tile_attribution,
            tileSubdomains: d.tile_subdomains, styleUrl: d.style_url,
          });
          const rendererInfo = resolveRenderer(d.renderer);
          const warning = tile.warning || (rendererInfo.fallback
            ? `Renderer "${rendererInfo.requested}" chưa hỗ trợ, đang dùng Leaflet.`
            : '');

          setTileFailed(false);
          setResolvedTileUrl(tile.url);
          setResolvedAttribution(tile.attribution);
          setResolvedSubdomains(tile.subdomains);
          setResolvedOverlays(tile.overlays || []);
          setTileWarning(warning);

          setConfig(prev => ({
            ...prev,
            ...d,
            tile_provider_id: providerId,
            api_key: apiKey,
            tile_mode: tileMode,
            retina,
            center_lat: parseFloat(d.center_lat) || prev.center_lat,
            center_lng: parseFloat(d.center_lng) || prev.center_lng,
            default_zoom: parseInt(d.default_zoom) || prev.default_zoom,
          }));
          setShowProvinceLabels(d.show_province_labels !== false);
          setShowBoundaries(d.show_boundaries !== false);
          setShowCluster(d.show_cluster !== false);
          setActiveLayerIdx(providerStyles.length ? savedStyleIdx : 0);
        }
      } catch (e) {
        if (e.name !== 'AbortError') { /* Use defaults */ }
      }
    };
    fetchConfig();
    return () => controller.abort();
  }, [buildTileUrl, configVersion]);

  useEffect(() => {
    const onRefresh = () => setConfigVersion(v => v + 1);
    window.addEventListener('mapconfig:refresh', onRefresh);
    return () => window.removeEventListener('mapconfig:refresh', onRefresh);
  }, []);

  useEffect(() => {
    if (!config.tile_provider_id) return;
    const tile = buildTileUrl(config.tile_provider_id, config.api_key, activeLayerIdx, {
      tileMode: config.tile_mode,
      retina: !!config.retina,
      renderer: config.renderer,
      tileUrl: config.tile_url,
      tileAttribution: config.tile_attribution,
      tileSubdomains: config.tile_subdomains,
      styleUrl: config.style_url,
    });
    setTileFailed(false);
    setResolvedTileUrl(tile.url);
    setResolvedAttribution(tile.attribution);
    setResolvedSubdomains(tile.subdomains);
    setResolvedOverlays(tile.overlays || []);
    setTileWarning(tile.warning || '');
  }, [activeLayerIdx, config.tile_provider_id, config.api_key, config.tile_mode, config.retina, config.renderer, config.style_url, config.tile_url, config.tile_attribution, config.tile_subdomains, buildTileUrl]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!showBoundaries) return undefined;
    let cancelled = false;
    const controller = new AbortController();
    fetch('/vietnam-provinces.geojson', { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(geojson => { if (!cancelled) setBoundaries(geojson); })
      .catch(err => {
        if (err.name !== 'AbortError') console.error('Failed to load province boundaries:', err);
      });
    return () => { cancelled = true; controller.abort(); };
  }, [showBoundaries]);

  const visibleStations = useMemo(() => {
    if (!filters) return stations;
    if (filters.hideStations) return [];
    let list = stations;
    const statuses = filters.stationStatuses || [];
    if (statuses.length > 0) {
      list = list.filter(s => statuses.includes(s.status));
    }
    const priorities = filters.priorities || [];
    if (priorities.length > 0) {
      list = list.filter(s => priorities.includes(String(s.loai_uu_tien)));
    }
    return list;
  }, [stations, filters]);

  const visibleProposals = useMemo(() => {
    if (!filters) return proposals;
    if (filters.hideProposals) return [];
    let list = proposals;
    if (filters.scope === 'mine' && user) {
      const uid = Number(user.id);
      list = list.filter(p => Number(p.user_id) === uid);
    }
    const statuses = filters.proposalStatuses || [];
    if (statuses.length > 0) {
      list = list.filter(p => statuses.includes(p.status));
    }
    const priorities = filters.priorities || [];
    if (priorities.length > 0) {
      list = list.filter(p => priorities.includes(String(p.loai_uu_tien)));
    }
    return list;
  }, [proposals, filters, user]);

  const layerStations = useMemo(() => {
    if (!highlightIds) return visibleStations;
    const ids = new Set(highlightIds.stations);
    return visibleStations.filter(s => ids.has(s.id));
  }, [visibleStations, highlightIds]);

  const layerProposals = useMemo(() => {
    if (!highlightIds) return visibleProposals;
    const ids = new Set(highlightIds.proposals);
    return visibleProposals.filter(p => ids.has(p.id));
  }, [visibleProposals, highlightIds]);

  const canvasStations = useMemo(
    () => layerStations.map(s => ({ ...s, _color: getMarkerColor(s.status, 'station') })),
    [layerStations]
  );
  const canvasProposals = useMemo(
    () => layerProposals.map(p => ({ ...p, _color: getMarkerColor(p.status, 'proposal') })),
    [layerProposals]
  );

  const renderStationPopup = useCallback((item) => createStationPopupContent(item, user), [user]);
  const renderProposalPopup = useCallback((item) => createProposalPopupContent(item, user), [user]);
  const renderDuplicatePopup = useCallback((pair) => createDuplicatePopupContent(pair), []);
  const renderSelectedPopup = useCallback(
    () => createPositionPopupContent('Vị trí đã chọn', selectedPosition || [0, 0]),
    [selectedPosition]
  );
  const renderMyLocationPopup = useCallback(
    () => createPositionPopupContent('Vị trí của tôi', myLocation || [0, 0]),
    [myLocation]
  );

  const tileConfig = useMemo(
    () => ({ url: resolvedTileUrl, attribution: resolvedAttribution, subdomains: resolvedSubdomains, overlays: resolvedOverlays }),
    [resolvedTileUrl, resolvedAttribution, resolvedSubdomains, resolvedOverlays]
  );

  const vectorStyle = useMemo(() => {
    if (config.renderer !== 'maplibre') return '';
    if (activeMode === 'streets' && pmtilesUrl && pmtilesStyle) return pmtilesStyle;
    const provider = getProviderById(config.tile_provider_id);
    const providerStyle = provider?.style_url && !provider.style_url.includes('{domain}') ? provider.style_url : '';
    return buildMapStyle(activeMode, { styleUrl: providerStyle || config.style_url, pmtilesUrl, libertyBase });
  }, [config.renderer, activeMode, config.tile_provider_id, config.style_url, pmtilesUrl, pmtilesStyle, libertyBase]);

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
  const isMaplibre = config.renderer === 'maplibre';
  const layerOptions = isMaplibre ? MAP_MODES : (tileUrlStyles.length > 1 ? tileUrlStyles : []);
  const activeLayerIndex = isMaplibre
    ? Math.max(0, MAP_MODES.findIndex(m => m.id === activeMode))
    : activeLayerIdx;
  const handleLayerSwitch = (idx) => {
    if (isMaplibre) setActiveMode(MAP_MODES[idx].id);
    else setActiveLayerIdx(idx);
  };

  return (
    <div style={{ flex: 1, height: '100%', width: '100%', position: 'relative' }}>
      <MapCanvas
        renderer={config.renderer}
        center={center}
        zoom={zoom}
        tile={tileConfig}
        vectorStyle={vectorStyle}
        apiKey={config.api_key || ''}
        stations={canvasStations}
        proposals={canvasProposals}
        pairs={pairs}
        showCluster={showCluster}
        showStationLabels={showStationLabels}
        showProvinceLabels={showProvinceLabels}
        showBoundaries={showBoundaries}
        boundariesGeojson={boundaries}
        provincePoints={PROVINCES}
        selectedPosition={selectedPosition}
        myLocation={myLocation}
        onMarkerClick={onMarkerClick}
        renderStationPopup={renderStationPopup}
        renderProposalPopup={renderProposalPopup}
        renderDuplicatePopup={renderDuplicatePopup}
        renderSelectedPopup={renderSelectedPopup}
        renderMyLocationPopup={renderMyLocationPopup}
        selectingLocation={selectingLocation}
        onMapSelectClick={onMapSelectClick}
        flyToPosition={highlightPosition || myLocation}
        enable3d={isMaplibre && active3d && !isMobile}
        onTileError={handleTileError}
        onRuntimeInfo={handleRuntimeInfo}
      />

      {(tileWarning || tileFailed || runtimeWarning) && (
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000, maxWidth: '90%', padding: '8px 14px', borderRadius: 8,
          background: 'rgba(180, 83, 9, 0.95)', color: '#fff', fontSize: 13,
        }}>
          {tileFailed
            ? 'Không tải được bản đồ. Vào Admin → Cấu hình bản đồ để kiểm tra provider/API key.'
            : (runtimeWarning || tileWarning)}
        </div>
      )}

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

        {isMaplibre && (
          <MapControlButton
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l9 5v10l-9 5-9-5V7l9-5z"/><path d="M12 12l9-5M12 12v10M12 12L3 7"/></svg>}
            tooltip={active3d ? 'Tắt 3D' : 'Bật 3D (nhà nổi + địa hình)'}
            active={active3d}
            onClick={() => setActive3d(v => !v)}
          />
        )}

        {layerOptions.length > 0 && (
          <MapLayerSwitcher
            layers={layerOptions}
            activeIdx={activeLayerIndex}
            onSwitch={handleLayerSwitch}
          />
        )}
      </div>

      {showLegend && (
        <div className="map-legend">
          <div className="map-legend-title">Chú thích</div>
          <div className="map-legend-columns">
            <div className="map-legend-col">
              <div className="map-legend-col-title">Trạm</div>
              {MAP_LEGEND.stations.map((item) => (
                <div key={`s-${item.value}`} className="map-legend-item">
                  <span className="map-legend-dot" style={{ backgroundColor: getMarkerColor(item.value, 'station') }} />
                  <span className="map-legend-label">{item.label}</span>
                </div>
              ))}
            </div>
            <div className="map-legend-col">
              <div className="map-legend-col-title">Đề xuất</div>
              {MAP_LEGEND.proposals.map((item) => (
                <div key={`p-${item.value}`} className="map-legend-item">
                  <span className="map-legend-dot" style={{ backgroundColor: getMarkerColor(item.value, 'proposal') }} />
                  <span className="map-legend-label">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
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
