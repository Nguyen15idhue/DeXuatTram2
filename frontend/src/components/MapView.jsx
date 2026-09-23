import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { stationService, proposalService, api } from '../services/api';
import { getMarkerColor, parseGoogleMapsLink, resolveGoogleMapsShortUrl } from '../utils/mapHelpers';
import { getMarkerIcon } from '../utils/mapMarkerIcons';
import MarkerIcon from './MarkerIcon';
import useMarkerIcons from '../hooks/useMarkerIcons';
import useMapStatuses from '../hooks/useMapStatuses';
import { getStatusLabel } from '../utils/mapStatuses';
import { PROVINCES, ISLAND_POINTS, VIETNAM_CENTER, VIETNAM_DEFAULT_ZOOM } from '../utils/provinceData';
import { getProviderById, loadTileProviders } from '../utils/tileProviders';
import { buildTileConfig, PROXY_TILE, OSM_ATTRIBUTION } from '../utils/mapTile';
import { buildMapStyle, loadPmtilesStyle, loadLibertyBaseStyle, loadProvinceLabels, loadProvinceLabelsOld, loadWardLabels } from '../utils/mapStyles';
import { MAP_MODES, DEFAULT_MODE } from '../utils/mapModes';
import { resolveRenderer } from './map/renderers';
import MapCanvas from './map/MapCanvas';
import useMediaQuery from '../hooks/useMediaQuery';
import { formatDistanceM, haversineM, measureTotalM } from '../utils/formatDistance';
import { normalizeClusterOptions } from '../utils/mapCluster';
import { useAuth } from '../contexts/AuthContext';

const EMPTY_PAIRS = [];

const isConfigOn = (v) => v !== 0 && v !== '0' && v !== false;

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
  p.appendChild(document.createTextNode(formatDistanceM(pair.distance_m)));
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

const ADMIN_LABEL_OPTIONS = [
  { id: 'new', label: 'Nhãn mới' },
  { id: 'old', label: 'Nhãn cũ' },
  { id: 'off', label: 'Tắt nhãn' },
];

const featureCollectionToPoints = (fc) => {
  if (!fc || !Array.isArray(fc.features)) return [];
  return fc.features.map((f) => ({
    name: f.properties.name,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    province: f.properties.province,
  }));
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

function MapLayerSwitcher({ groups }) {
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

  const visibleGroups = (groups || []).filter((g) => (g.options || []).length > 1);
  if (visibleGroups.length === 0) return null;

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
          {visibleGroups.map((group, gi) => (
            <div key={group.key || gi} className="map-layer-group">
              {gi > 0 && <div className="map-layer-divider" />}
              {group.title && <div className="map-layer-group-title">{group.title}</div>}
              {group.options.map((layer, idx) => (
                <button
                  type="button"
                  key={idx}
                  className={`map-layer-option ${idx === group.activeIdx ? 'map-layer-option-active' : ''}`}
                  onClick={() => { group.onSwitch(idx); setOpen(false); }}
                >
                  {layer.label}
                </button>
              ))}
              {group.credit && <div className="map-layer-credit">{group.credit}</div>}
            </div>
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

const MO_HINH_LABELS = { TDT: 'Tự đầu tư', LK: 'Liên kết', NQ: 'Nhượng quyền', NQ_LK: 'Nhượng quyền + Liên kết' };

function parseTableRows(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return [value];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return [parsed];
    } catch { /* ignore */ }
  }
  return [];
}

function summarizeTruRows(rows) {
  const list = parseTableRows(rows).filter((r) => r && (r.loai_tru || r.so_luong));
  if (list.length === 0) return '';
  const groups = {};
  list.forEach((r) => {
    const name = r.loai_tru || 'Trụ';
    const qty = Number(r.so_luong) || 0;
    groups[name] = (groups[name] || 0) + qty;
  });
  const parts = Object.entries(groups).map(([name, qty]) => (qty > 0 ? `${qty}× ${name}` : name));
  const total = Object.values(groups).reduce((a, b) => a + b, 0);
  return total > 0 ? `${parts.join(' + ')} (tổng ${total} trụ)` : parts.join(' + ');
}

function pickProposalTru(item) {
  const moHinh = item.mo_hinh_dau_tu;
  if (moHinh === 'TDT') return summarizeTruRows(item.tdt_tru) || item.loai_tru || '';
  if (moHinh === 'NQ') return summarizeTruRows(item.loai_tru_nq) || item.loai_tru || '';
  if (moHinh === 'NQ_LK') {
    const rows = [...parseTableRows(item.loai_tru_nq), ...parseTableRows(item.loai_tru_lk)];
    return summarizeTruRows(rows) || item.loai_tru || '';
  }
  if (moHinh === 'LK') return summarizeTruRows(item.loai_tru_lk) || '';
  return summarizeTruRows(item.tdt_tru) || summarizeTruRows(item.loai_tru_nq) || summarizeTruRows(item.loai_tru_lk) || item.loai_tru || '';
}

function createStationPopupContent(item, user) {
  const div = document.createElement('div');
  div.className = 'popup-content';
  const h3 = document.createElement('h3');
  h3.textContent = item.ma_tram || item.ma_tram_gen || item.name;
  div.appendChild(h3);

  const addRow = (label, value) => {
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = `${label}: `;
    p.appendChild(strong);
    p.appendChild(document.createTextNode(value || '_'));
    div.appendChild(p);
  };

  addRow('Mã trạm', item.ma_tram || item.ma_tram_gen);
  addRow('Tên trạm', item.name);
  addRow('Địa chỉ', item.address);
  const statusP = document.createElement('p');
  const statusStrong = document.createElement('strong');
  statusStrong.textContent = 'Trạng thái: ';
  statusP.appendChild(statusStrong);
  const statusSpan = document.createElement('span');
  statusSpan.style.color = getMarkerColor(item.status, 'station');
  statusSpan.textContent = getStatusLabel(item.status, 'station');
  statusP.appendChild(statusSpan);
  div.appendChild(statusP);

  addRow('Mô hình', MO_HINH_LABELS[item.mo_hinh_tram] || item.mo_hinh_tram || '');
  const truText = [item.so_luong_tru && item.loai_tru_sac ? `${item.so_luong_tru}× ${item.loai_tru_sac}` : '',
    item.so_luong_tru && !item.loai_tru_sac ? `${item.so_luong_tru} trụ` : '',
    !item.so_luong_tru && item.loai_tru_sac ? item.loai_tru_sac : '',
    item.tower_type || '', item.power_capacity ? `${item.power_capacity} kW` : ''].filter(Boolean).join(' | ');
  addRow('Trụ', truText);
  addRow('Chủ trạm', item.chu_tram);
  addRow('SĐT chủ trạm', item.sdt_chu_tram);
  addRow('Mô tả', item.description);

  if (canOpenAdminRecord(user)) {
    renderAdminLink(div, `/admin/stations/view=${item.id}`);
  }

  return div;
}

function createProposalPopupContent(item, user) {
  const div = document.createElement('div');
  div.className = 'popup-content';
  const h3 = document.createElement('h3');
  h3.textContent = item.ma_de_xuat || `Đề xuất #${item.id}`;
  div.appendChild(h3);

  const addRow = (label, value) => {
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = `${label}: `;
    p.appendChild(strong);
    p.appendChild(document.createTextNode(value || '_'));
    div.appendChild(p);
  };

  addRow('Mã đề xuất', item.ma_de_xuat);
  addRow('Người đề xuất', item.owner_name);
  addRow('SĐT người đề xuất', item.owner_phone);
  addRow('Địa chỉ', item.address);
  const statusP = document.createElement('p');
  const statusStrong = document.createElement('strong');
  statusStrong.textContent = 'Trạng thái: ';
  statusP.appendChild(statusStrong);
  const statusSpan = document.createElement('span');
  statusSpan.style.color = getMarkerColor(item.status, 'proposal');
  statusSpan.textContent = getStatusLabel(item.status, 'proposal');
  statusP.appendChild(statusSpan);
  div.appendChild(statusP);
  addRow('Mô hình', MO_HINH_LABELS[item.mo_hinh_dau_tu] || item.mo_hinh_dau_tu || '');
  const proposalTru = pickProposalTru(item);
  addRow('Trụ', proposalTru);

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
  filters = null,
  fabSlot = null
}) => {
  const [stations, setStations] = useState([]);
  const [proposals, setProposals] = useState([]);
  const { token } = useAuth();
  const markerIconsVersion = useMarkerIcons();
  const { stationStatuses, proposalStatuses, proposalLegendStatuses } = useMapStatuses();
  void markerIconsVersion;
  const MAP_LEGEND = { stations: stationStatuses, proposals: proposalStatuses };
  const proposalChunks = [];
  for (let i = 0; i < MAP_LEGEND.proposals.length; i += 5) proposalChunks.push(MAP_LEGEND.proposals.slice(i, i + 5));
  const renderProposalLegendItem = (item) => (
    <div key={`p-${item.value}`} className="map-legend-item">
      {getMarkerIcon(item.value, 'proposal')
        ? <span className="map-legend-badge" style={{ borderColor: getMarkerColor(item.value, 'proposal') }}><MarkerIcon id={getMarkerIcon(item.value, 'proposal')} size={13} /></span>
        : <span className="map-legend-dot" style={{ backgroundColor: getMarkerColor(item.value, 'proposal') }} />}
      <span className="map-legend-label">{item.label}</span>
    </div>
  );
  const [loading, setLoading] = useState(true);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [createTarget, setCreateTarget] = useState('proposal');
  const [googleMapUrl, setGoogleMapUrl] = useState('');
  const [resolvingUrl, setResolvingUrl] = useState(false);
  const [myLocation, setMyLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [showStationLabels, setShowStationLabels] = useState(true);
  const [adminLabelVersion, setAdminLabelVersion] = useState('new');
  const [provinceLabelPoints, setProvinceLabelPoints] = useState(PROVINCES);
  const [provinceLabelPointsOld, setProvinceLabelPointsOld] = useState([]);
  const [wardLabelPoints, setWardLabelPoints] = useState([]);
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [showLegend, setShowLegend] = useState(() => (typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true));
  const [showCluster, setShowCluster] = useState(true);
  const [clusterOptions, setClusterOptions] = useState({ radius: 70, maxZoom: 18 });
  const [activeLayerIdx, setActiveLayerIdx] = useState(0);
  const [resolvedTileUrl, setResolvedTileUrl] = useState(PROXY_TILE);
  const [resolvedAttribution, setResolvedAttribution] = useState(OSM_ATTRIBUTION);
  const [resolvedSubdomains, setResolvedSubdomains] = useState('');
  const [resolvedOverlays, setResolvedOverlays] = useState([]);
  const [resolvedMaxNativeZoom, setResolvedMaxNativeZoom] = useState(19);
  const [tileFailed, setTileFailed] = useState(false);
  const [tileWarning, setTileWarning] = useState('');
  const [runtimeWarning, setRuntimeWarning] = useState('');
  const [boundaries, setBoundaries] = useState(null);
  const [configVersion, setConfigVersion] = useState(0);
  const mountedRef = useRef(true);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchPicked, setSearchPicked] = useState(null);
  const [searchFly, setSearchFly] = useState(null);
  const searchTimerRef = useRef(null);
  const searchReqRef = useRef(0);

  useEffect(() => {
    const q = searchText.trim();
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (q.length < 3) {
      setSearchResults([]);
      setSearchLoading(false);
      return undefined;
    }
    searchTimerRef.current = setTimeout(async () => {
      const reqId = searchReqRef.current + 1;
      searchReqRef.current = reqId;
      setSearchLoading(true);
      try {
        const res = await api.post('/geocode/search', { text: q, limit: 6 });
        if (searchReqRef.current !== reqId) return;
        setSearchResults((res && res.data && res.data.results) || []);
        setSearchOpen(true);
      } catch {
        if (searchReqRef.current === reqId) setSearchResults([]);
      } finally {
        if (searchReqRef.current === reqId) setSearchLoading(false);
      }
    }, 400);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchText]);

  const handleSearchPick = useCallback((item) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    setSearchText(item.name || item.formatted || '');
    setSearchResults([]);
    setSearchOpen(false);
    setSelectedPosition([lat, lng]);
    setSearchFly([lat, lng]);
    setSearchPicked({ lat, lng, label: item.formatted || item.name || '' });
  }, []);

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
  const [measureActive, setMeasureActive] = useState(false);
  const [measurePoints, setMeasurePoints] = useState([]);
  const [measureSnapped, setMeasureSnapped] = useState([]);
  const measureTotal = useMemo(() => measureTotalM(measurePoints), [measurePoints]);
  const snapCandidateRef = useRef({ stations: [], proposals: [], myLocation: null });
  const snapGuardRef = useRef(null);
  const addMeasurePoint = useCallback((point, snapped) => {
    setMeasurePoints((prev) => [...prev, point]);
    if (snapped) setMeasureSnapped((prev) => [...prev, point]);
  }, []);
  const handleMeasureSnap = useCallback((point) => {
    if (!Array.isArray(point) || Number.isNaN(parseFloat(point[0])) || Number.isNaN(parseFloat(point[1]))) return;
    const p = [parseFloat(point[0]), parseFloat(point[1])];
    snapGuardRef.current = { lat: p[0], lng: p[1], t: Date.now() };
    addMeasurePoint(p, true);
  }, [addMeasurePoint]);
  const handleMeasureClick = useCallback((lat, lng, zoom) => {
    const g = snapGuardRef.current;
    if (g && Date.now() - g.t < 400 && haversineM(lat, lng, g.lat, g.lng) < 30) {
      snapGuardRef.current = null;
      return;
    }
    const z = Number(zoom);
    const pxTol = 20;
    const mPerPx = Number.isFinite(z) ? (156543.03 * Math.cos((parseFloat(lat) * Math.PI) / 180)) / 2 ** z : 1000;
    const tolM = Math.min(50000, Math.max(5, mPerPx * pxTol));
    let best = null;
    let bestD = Infinity;
    const consider = (cLat, cLng) => {
      const d = haversineM(lat, lng, cLat, cLng);
      if (d < bestD) { bestD = d; best = [parseFloat(cLat), parseFloat(cLng)]; }
    };
    const { stations: cStations, proposals: cProposals, myLocation: cMine } = snapCandidateRef.current;
    (cStations || []).forEach((s) => consider(s.latitude, s.longitude));
    (cProposals || []).forEach((p) => consider(p.latitude, p.longitude));
    if (Array.isArray(cMine)) consider(cMine[0], cMine[1]);
    if (best && bestD <= tolM) {
      addMeasurePoint(best, true);
    } else {
      addMeasurePoint([lat, lng], false);
    }
  }, [addMeasurePoint]);
  useEffect(() => {
    if (!measureActive) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { setMeasureActive(false); setMeasurePoints([]); setMeasureSnapped([]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [measureActive]);
  useEffect(() => {
    if (selectingLocation) { setMeasureActive(false); setMeasurePoints([]); setMeasureSnapped([]); }
  }, [selectingLocation]);
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
    let cancelled = false;
    loadProvinceLabels().then((fc) => {
      if (cancelled) return;
      const points = featureCollectionToPoints(fc);
      if (points.length > 0) setProvinceLabelPoints(points);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadProvinceLabelsOld().then((fc) => {
      if (cancelled) return;
      setProvinceLabelPointsOld(featureCollectionToPoints(fc));
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (adminLabelVersion !== 'new' || wardLabelPoints.length > 0) return undefined;
    let cancelled = false;
    loadWardLabels().then((fc) => {
      if (cancelled) return;
      const points = featureCollectionToPoints(fc);
      if (points.length > 0) setWardLabelPoints(points);
    });
    return () => { cancelled = true; };
  }, [adminLabelVersion, wardLabelPoints.length]);

  useEffect(() => {
    if (highlightPosition) {
      setSelectedPosition(highlightPosition);
    }
  }, [highlightPosition]);

  const fetchData = useCallback(async (signal) => {
    try {
      const [stationsRes, proposalsRes] = await Promise.all([
        stationService.getAll(token),
        proposalService.getAll(token)
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
  }, [token]);

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
          setResolvedMaxNativeZoom(tile.maxNativeZoom || 19);
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
          setAdminLabelVersion(isConfigOn(d.show_province_labels) ? 'new' : 'off');
          setShowBoundaries(isConfigOn(d.show_boundaries));
          setShowCluster(isConfigOn(d.show_cluster));
          setClusterOptions(normalizeClusterOptions(d));
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
    setResolvedMaxNativeZoom(tile.maxNativeZoom || 19);
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
    // If both hidden, return empty
    if (filters.hideStations && filters.hideStationPlans) return [];
    let list = stations;
    // Filter PLANNING by priority (only applies when showing PLANNING)
    const planPriorities = filters.planningPriorities || [];
    const showPlans = !filters.hideStationPlans;
    const showOtherStations = !filters.hideStations;
    if (showPlans && !showOtherStations) {
      // Only showing PLANNING stations
      if (planPriorities.length > 0) {
        list = list.filter(s => s.status === 'PLANNING' && planPriorities.includes(String(s.loai_uu_tien)));
      } else {
        list = list.filter(s => s.status === 'PLANNING');
      }
    } else if (showPlans && showOtherStations) {
      // Showing all stations - apply priority filter to PLANNING if set
      if (planPriorities.length > 0) {
        list = list.filter(s => s.status !== 'PLANNING' || planPriorities.includes(String(s.loai_uu_tien)));
      }
    } else if (!showPlans && showOtherStations) {
      // Showing non-PLANNING only
      list = list.filter(s => s.status !== 'PLANNING');
    }
    // Filter other statuses
    const statuses = filters.stationStatuses || [];
    if (statuses.length > 0) {
      list = list.filter(s => statuses.includes(s.status));
    }
    return list;
  }, [stations, filters]);

  const visibleProposals = useMemo(() => {
    if (!filters) return proposals;
    if (filters.hideProposals) return [];
    let list = proposals;
    const mapSet = new Set((proposalLegendStatuses || []).map(s => s.value));
    if (mapSet.size > 0) {
      list = list.filter(p => mapSet.has(p.status));
    }
    if (filters.scope === 'mine' && user) {
      const uid = Number(user.id);
      list = list.filter(p => Number(p.user_id) === uid);
    }
    const statuses = filters.proposalStatuses || [];
    if (statuses.length > 0) {
      list = list.filter(p => statuses.includes(p.status));
    }
    return list;
  }, [proposals, filters, user, proposalLegendStatuses]);

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
    () => layerStations.map(s => ({ ...s, _color: getMarkerColor(s.status, 'station'), _icon: getMarkerIcon(s.status, 'station') })),
    [layerStations, markerIconsVersion]
  );
  const canvasProposals = useMemo(
    () => layerProposals.map(p => ({ ...p, _color: getMarkerColor(p.status, 'proposal'), _icon: getMarkerIcon(p.status, 'proposal') })),
    [layerProposals, markerIconsVersion]
  );

  snapCandidateRef.current = { stations: canvasStations, proposals: canvasProposals, myLocation };

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
    () => ({ url: resolvedTileUrl, attribution: resolvedAttribution, subdomains: resolvedSubdomains, overlays: resolvedOverlays, maxNativeZoom: resolvedMaxNativeZoom }),
    [resolvedTileUrl, resolvedAttribution, resolvedSubdomains, resolvedOverlays, resolvedMaxNativeZoom]
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
          onLocationSelected(latitude, longitude, null, createTarget);
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
  }, [onLocationSelected, createTarget]);

  const handleGoogleMapSubmit = useCallback(async () => {
    if (!googleMapUrl.trim()) return;
    setResolvingUrl(true);
    const result = parseGoogleMapsLink(googleMapUrl);
    if (result && !result.needResolve) {
      setGoogleMapUrl('');
      setResolvingUrl(false);
      setShowCreateMenu(false);
      if (onLocationSelected) onLocationSelected(result.lat, result.lng, null, createTarget);
      return;
    }
    if (result && result.needResolve) {
      const resolved = await resolveGoogleMapsShortUrl(result.url);
      setResolvingUrl(false);
      if (resolved && !resolved.needResolve) {
        setGoogleMapUrl('');
        setShowCreateMenu(false);
        if (onLocationSelected) onLocationSelected(resolved.lat, resolved.lng, null, createTarget);
        return;
      }
    }
    setResolvingUrl(false);
    alert('Không thể đọc tọa độ từ link này. Vui lòng kiểm tra lại định dạng link.');
  }, [googleMapUrl, onLocationSelected, createTarget]);

  const openCreateMenu = (target) => {
    if (showCreateMenu && createTarget === target) {
      setShowCreateMenu(false);
      return;
    }
    setCreateTarget(target);
    setShowCreateMenu(true);
  };

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

  const showAdminLabels = adminLabelVersion !== 'off';
  const activeProvincePoints = !showAdminLabels
    ? []
    : (adminLabelVersion === 'old' ? provinceLabelPointsOld : provinceLabelPoints);
  const showWardLabels = adminLabelVersion === 'new';
  const activeWardPoints = showWardLabels ? wardLabelPoints : [];
  const adminOptionIdx = Math.max(0, ADMIN_LABEL_OPTIONS.findIndex(o => o.id === adminLabelVersion));
  const handleAdminSwitch = (idx) => setAdminLabelVersion(ADMIN_LABEL_OPTIONS[idx].id);

  const layerGroups = [
    { key: 'base', title: 'Nền bản đồ', options: layerOptions, activeIdx: activeLayerIndex, onSwitch: handleLayerSwitch },
    { key: 'admin', title: 'Nhãn hành chính', options: ADMIN_LABEL_OPTIONS, activeIdx: adminOptionIdx, onSwitch: handleAdminSwitch, credit: '© Open Admin Data · viettrace (CC-BY-4.0)' },
  ];

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
        clusterOptions={clusterOptions}
        showStationLabels={showStationLabels}
        showProvinceLabels={showAdminLabels}
        showBoundaries={showBoundaries}
        boundariesGeojson={boundaries}
        provincePoints={activeProvincePoints}
        islandPoints={ISLAND_POINTS}
        wardPoints={activeWardPoints}
        showWardLabels={showWardLabels}
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
        measureActive={measureActive}
        measurePoints={measurePoints}
        measureSnapped={measureSnapped}
        onMeasureClick={handleMeasureClick}
        onMeasureSnap={handleMeasureSnap}
        flyToPosition={highlightPosition || myLocation || searchFly}
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

      <div className="map-search">
        <div className="map-search-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input
            type="text"
            placeholder="Tìm địa điểm, địa chỉ..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onFocus={() => { if (searchResults.length > 0) setSearchOpen(true); }}
          />
          {searchLoading && <span className="map-search-loading">...</span>}
          {searchText && (
            <button type="button" className="map-search-clear" onClick={() => { setSearchText(''); setSearchResults([]); setSearchOpen(false); }} aria-label="Xóa">✕</button>
          )}
        </div>
        {searchOpen && searchResults.length > 0 && (
          <ul className="map-search-results">
            {searchResults.map((r, i) => (
              <li key={`${r.lat}-${r.lon}-${i}`}>
                <button type="button" onClick={() => handleSearchPick(r)}>
                  <span className="map-search-name">{r.name || r.address_line1 || r.formatted}</span>
                  {r.formatted && <span className="map-search-addr">{r.formatted}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {searchPicked && (
          <div className="map-search-actions">
            <div className="map-search-actions-label">{searchPicked.label}</div>
            <div className="map-search-actions-btns">
              {onLocationSelected && (
                <button type="button" className="btn btn-xs btn-primary" onClick={() => { onLocationSelected(searchPicked.lat, searchPicked.lng, null, 'proposal'); setSearchPicked(null); }}>Tạo đề xuất</button>
              )}
              {onLocationSelected && user && ['SUPER_ADMIN', 'ADMIN'].includes(user.role) && (
                <button type="button" className="btn btn-xs btn-secondary" onClick={() => { onLocationSelected(searchPicked.lat, searchPicked.lng, null, 'station'); setSearchPicked(null); }}>Tạo trạm</button>
              )}
              <button type="button" className="btn btn-xs btn-ghost" onClick={() => setSearchPicked(null)}>Đóng</button>
            </div>
          </div>
        )}
      </div>

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
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="4 2"/></svg>}
          tooltip="Ranh giới"
          active={showBoundaries}
          onClick={() => setShowBoundaries(v => !v)}
        />

        <MapControlButton
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.3 8.7 8.7 21.3a1 1 0 0 1-1.4 0l-4.6-4.6a1 1 0 0 1 0-1.4L15.3 2.7a1 1 0 0 1 1.4 0l4.6 4.6a1 1 0 0 1 0 1.4Z"/><path d="m7.5 10.5 2 2"/><path d="m10.5 7.5 2 2"/><path d="m13.5 4.5 2 2"/><path d="m4.5 13.5 2 2"/></svg>}
          tooltip="Thước đo"
          active={measureActive}
          onClick={() => { setMeasureActive(v => !v); setMeasurePoints([]); setMeasureSnapped([]); }}
        />

        {isMaplibre && (
          <MapControlButton
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l9 5v10l-9 5-9-5V7l9-5z"/><path d="M12 12l9-5M12 12v10M12 12L3 7"/></svg>}
            tooltip={active3d ? 'Tắt 3D' : 'Bật 3D (nhà nổi + địa hình)'}
            active={active3d}
            onClick={() => setActive3d(v => !v)}
          />
        )}

        <MapLayerSwitcher groups={layerGroups} />
      </div>

      {showLegend && (
        <div className="map-legend">
          <div className="map-legend-title">Chú thích</div>
          <div className="map-legend-columns">
            <div className="map-legend-col">
              <div className="map-legend-col-title">Trạm</div>
              {MAP_LEGEND.stations.map((item) => (
                <div key={`s-${item.value}`} className="map-legend-item">
                  {getMarkerIcon(item.value, 'station')
                    ? <span className="map-legend-badge" style={{ borderColor: getMarkerColor(item.value, 'station') }}><MarkerIcon id={getMarkerIcon(item.value, 'station')} size={13} /></span>
                    : <span className="map-legend-dot" style={{ backgroundColor: getMarkerColor(item.value, 'station') }} />}
                  <span className="map-legend-label">{item.label}</span>
                </div>
              ))}
            </div>
            <div className="map-legend-col map-legend-col-wide">
              <div className="map-legend-col-title text-center">Đề xuất</div>
              <div className="map-legend-subcols">
                {proposalChunks.map((group, gi) => (
                  <div key={gi} className="map-legend-subcol">
                    {group.map(renderProposalLegendItem)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {measureActive && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1001] bg-white rounded-xl shadow-lg border border-base-300 px-4 py-3 flex items-center gap-3">
          <span className="text-sm font-medium text-base-content">
            {measurePoints.length < 2 ? 'Click lên bản đồ / trạm / đề xuất / vị trí của tôi để thêm điểm đo' : `Tổng: ${formatDistanceM(measureTotal)} (${measurePoints.length} điểm)`}
          </span>
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setMeasurePoints([]); setMeasureSnapped([]); }}>Xóa</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setMeasureActive(false)}>Hoàn tất</button>
          </div>
        </div>
      )}

      {!readOnly && !measureActive && (
      <div className="map-fab-group">
        {fabSlot}
        {showCreateMenu && (
          <div className="map-create-menu">
            <div className="map-create-title">
              {createTarget === 'station' ? 'Tạo trạm mới' : (createTarget === 'proposal_quick' ? 'Tạo đề xuất nhanh' : 'Tạo đề xuất mới')}
            </div>
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
              onClick={() => { setShowCreateMenu(false); if (onLocationSelected) onLocationSelected(null, null, 'select', createTarget); }}
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

        {user && ['SUPER_ADMIN', 'ADMIN'].includes(user.role) && (
          <button
            type="button"
            className={`map-fab map-fab-station ${showCreateMenu && createTarget === 'station' ? 'map-fab-station-active' : ''}`}
            onClick={() => openCreateMenu('station')}
            title="Tạo trạm nhanh"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9"/>
              <path d="M12.5 7l-4 5.5h3l-1 4.5 4-5.5h-3z"/>
            </svg>
          </button>
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
          className={`map-fab map-fab-create ${showCreateMenu && createTarget === 'proposal' ? 'map-fab-active' : ''}`}
          onClick={() => openCreateMenu('proposal')}
          title="Tạo đề xuất mới"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>

        <button
          type="button"
          className={`map-fab map-fab-quick ${showCreateMenu && createTarget === 'proposal_quick' ? 'map-fab-active' : ''}`}
          onClick={() => openCreateMenu('proposal_quick')}
          title="Tạo đề xuất nhanh"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12z"/>
          </svg>
        </button>
      </div>
      )}
    </div>
  );
};

export default MapView;
