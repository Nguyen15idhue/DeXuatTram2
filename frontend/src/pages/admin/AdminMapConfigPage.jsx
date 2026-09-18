import { useState, useEffect } from 'react';
import { TILE_PROVIDER_CATALOG } from '../../utils/tileProviderCatalog';
import { loadTileProviders, getProviderById, TILE_CATEGORIES } from '../../utils/tileProviders';
import { isValidTileUrl } from '../../utils/mapTile';
import { MAP_MODES, DEFAULT_MODE } from '../../utils/mapModes';
import { buildMapStyle } from '../../utils/mapStyles';
import { listRenderers } from '../../components/map/renderers';
import MapCanvas from '../../components/map/MapCanvas';
import { CLUSTER_DEFAULTS, CLUSTER_LIMITS, normalizeClusterOptions } from '../../utils/mapCluster';
import { useAuth } from '../../contexts/AuthContext';
import Toast from '../../components/Toast';
import GeocodeConfigPanel from '../../components/admin/GeocodeConfigPanel';
import { API_URL } from '../../services/api';
import { Settings, Save, Wifi, WifiOff } from 'lucide-react';

const FALLBACK_TILE = 'https://tile.openstreetmap.de/{z}/{x}/{y}.png';

function getSafeTileUrl(url) {
  if (isValidTileUrl(url)) return url;
  return FALLBACK_TILE;
}

const AdminMapConfigPage = () => {
  const { token } = useAuth();
  const [config, setConfig] = useState(null);
  const [allProviders, setAllProviders] = useState(TILE_PROVIDER_CATALOG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [selectedProviderId, setSelectedProviderId] = useState('leaflet-osm');
  const [apiKey, setApiKey] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('');
  const [customTileUrl, setCustomTileUrl] = useState('');
  const [customAttribution, setCustomAttribution] = useState('');
  const [customSubdomains, setCustomSubdomains] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [tileMode, setTileMode] = useState('proxy');
  const [retina, setRetina] = useState(false);
  const [renderer, setRenderer] = useState('leaflet');
  const [defaultMode, setDefaultMode] = useState(DEFAULT_MODE);
  const [clusterRadius, setClusterRadius] = useState(CLUSTER_DEFAULTS.radius);
  const [clusterMaxZoom, setClusterMaxZoom] = useState(CLUSTER_DEFAULTS.maxZoom);
  const [enable3d, setEnable3d] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [testStatus, setTestStatus] = useState(null);
  const [testUrl, setTestUrl] = useState('');
  const [directTest, setDirectTest] = useState(false);

  useEffect(() => { loadConfig(); }, []);

  useEffect(() => {
    let active = true;
    loadTileProviders().then(list => { if (active && Array.isArray(list)) setAllProviders(list); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (toast.message) {
      const t = setTimeout(() => setToast({ message: '', type: 'success' }), 3000);
      return () => clearTimeout(t);
    }
  }, [toast.message]);

  const loadConfig = async () => {
    try {
      const res = await fetch(`${API_URL}/map-configs/admin?entity=stations`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.data) {
        const c = data.data;
        setConfig(c);
        const pid = c.tile_provider_id || c.tile_provider;
        const provider = getProviderById(pid);
        if (provider) {
          setSelectedProviderId(pid);
          setIsCustom(false);
          if (provider.type === 'self-hosted') {
            setCustomTileUrl(c.tile_url || provider.tile_url || '');
            setCustomAttribution(c.tile_attribution || provider.attribution || '');
            setCustomSubdomains(c.tile_subdomains || '');
          }
          if (provider.tile_url_styles && provider.tile_url_styles.length > 0) {
            if (c.style_url && provider.tile_url_styles.find(s => s.value === c.style_url)) {
              setSelectedStyle(c.style_url);
            } else {
              setSelectedStyle(provider.tile_url_styles[0].value);
            }
          } else if (provider.style_options && provider.style_options.length > 0) {
            if (c.style_url && provider.style_options.find(s => s.value === c.style_url)) {
              setSelectedStyle(c.style_url);
            } else {
              setSelectedStyle(provider.style_options[0].value);
            }
          } else {
            setSelectedStyle('');
          }
        } else {
          setIsCustom(true);
          setCustomTileUrl(c.tile_url || '');
          setCustomAttribution(c.tile_attribution || '');
          setCustomSubdomains(c.tile_subdomains || '');
        }
        setApiKey(c.api_key || '');
        setTileMode(c.tile_mode || 'proxy');
        setRetina(!!Number(c.retina));
        setRenderer(c.renderer || 'leaflet');
        setDefaultMode(c.default_mode || DEFAULT_MODE);
        setClusterRadius(c.cluster_radius ?? CLUSTER_DEFAULTS.radius);
        setClusterMaxZoom(c.cluster_max_zoom ?? CLUSTER_DEFAULTS.maxZoom);
        setEnable3d(!!Number(c.enable_3d));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const selectedProvider = isCustom ? null : getProviderById(selectedProviderId);

  const OSM_LIGHT = 'https://tile.openstreetmap.de/{z}/{x}/{y}.png';
  const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  const resolveTileUrl = (providerId, style, key) => {
    const p = getProviderById(providerId);
    if (!p) return OSM_LIGHT;
    if (p.incompatible_with_leaflet) return '';
    const styleObj = (p.tile_url_styles || []).find(s => s.value === style) || (p.tile_url_styles || [])[0];
    if (styleObj && styleObj.url) {
      let url = styleObj.url.replace('{key}', key || '');
      url = url.replace('{style}', style || '');
      return url;
    }
    if (p.tile_url_template) {
      let url = p.tile_url_template.replace('{key}', key || '');
      url = url.replace('{style}', style || '');
      return url;
    }
    if (p.tile_url && !p.tile_url.includes('{domain}')) return p.tile_url;
    return OSM_LIGHT;
  };

  const resolveStyleMeta = (providerId, style) => {
    const p = getProviderById(providerId);
    const styleObj = p ? ((p.tile_url_styles || []).find(s => s.value === style) || (p.tile_url_styles || [])[0]) : null;
    return {
      attribution: (styleObj && styleObj.attribution) || p?.attribution || OSM_ATTR,
      subdomains: (styleObj && styleObj.subdomains !== undefined) ? styleObj.subdomains : (p?.subdomains || ''),
    };
  };

  const isLeafletIncompatible = renderer === 'leaflet' && selectedProvider?.incompatible_with_leaflet && !isCustom;

  const getActiveTileConfig = () => {
    if (isCustom) {
      const url = getSafeTileUrl(customTileUrl);
      return { url, attribution: customAttribution, subdomains: customSubdomains };
    }
    if (selectedProvider?.type === 'self-hosted' && customTileUrl) {
      return { url: customTileUrl, attribution: customAttribution || selectedProvider.attribution || '', subdomains: customSubdomains || '' };
    }
    if (!selectedProvider) return { url: OSM_LIGHT, attribution: OSM_ATTR, subdomains: 'a,b,c' };
    const url = resolveTileUrl(selectedProviderId, selectedStyle, apiKey);
    const meta = resolveStyleMeta(selectedProviderId, selectedStyle);
    return { url, attribution: meta.attribution, subdomains: meta.subdomains };
  };

  const getStorageTileUrl = () => {
    if (isCustom || selectedProvider?.type === 'self-hosted') return customTileUrl;
    const p = selectedProvider;
    if (!p) return '';
    const styleObj = (p.tile_url_styles || []).find(s => s.value === selectedStyle) || (p.tile_url_styles || [])[0];
    if (styleObj && styleObj.url) return styleObj.url;
    if (p.tile_url_template) return p.tile_url_template;
    if (p.tile_url) return p.tile_url;
    return '';
  };

  const getPreviewTileConfig = () => {
    if (tileMode === 'proxy' && !isCustom && selectedProvider) {
      const styleVal = selectedStyle || '';
      const qs = styleVal ? `?style=${encodeURIComponent(styleVal)}` : '';
      const meta = resolveStyleMeta(selectedProviderId, selectedStyle);
      return { url: `/tiles/{z}/{x}/{y}${qs}`, attribution: meta.attribution, subdomains: '' };
    }
    return getActiveTileConfig();
  };

  const handleTestConnection = () => {
    const builtStyle = renderer === 'maplibre'
      ? buildMapStyle(defaultMode, {
          styleUrl: selectedProvider?.style_url || '',
          pmtilesUrl: (selectedProvider?.id === 'maplibre-self-hosted' && /\.pmtiles(\?|$)/i.test(customTileUrl || '')) ? customTileUrl : '',
        })
      : '';
    const pmtilesUrl = (renderer === 'maplibre' && typeof builtStyle === 'object' && builtStyle?.sources?.openmaptiles?.url)
      ? String(builtStyle.sources.openmaptiles.url).replace(/^pmtiles:\/\//, '')
      : '';
    if (pmtilesUrl) {
      setTestUrl(pmtilesUrl);
      setTestStatus('testing');
      let done = false;
      const timeout = setTimeout(() => { if (!done) { done = true; setTestStatus('error'); setTestUrl(`${pmtilesUrl}\nQuá thời gian 8s`); } }, 8000);
      fetch(pmtilesUrl)
        .then((r) => {
          if (done) return; done = true; clearTimeout(timeout);
          setTestStatus(r.ok ? 'success' : 'error');
          if (!r.ok) setTestUrl(`${pmtilesUrl}\nHTTP ${r.status}`);
          else setTestUrl(`${pmtilesUrl}\nPMTiles OK (${r.headers.get('accept-ranges') === 'bytes' ? 'range OK' : 'no range'})`);
        })
        .catch((e) => { if (done) return; done = true; clearTimeout(timeout); setTestStatus('error'); setTestUrl(`${pmtilesUrl}\n${e.message}`); });
      return;
    }
    const vectorStyle = typeof builtStyle === 'string' ? builtStyle : '';
    if (vectorStyle) {
      setTestUrl(vectorStyle);
      setTestStatus('testing');
      let done = false;
      const timeout = setTimeout(() => {
        if (done) return;
        done = true;
        setTestStatus('error');
        setTestUrl(`${vectorStyle}\nQuá thời gian 8s (style/vector không tải được).`);
      }, 8000);
      fetch(vectorStyle)
        .then((r) => {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          setTestStatus(r.ok ? 'success' : 'error');
          if (!r.ok) setTestUrl(`${vectorStyle}\nHTTP ${r.status}`);
        })
        .catch((e) => {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          setTestStatus('error');
          setTestUrl(`${vectorStyle}\n${e.message}`);
        });
      return;
    }
    const tile = directTest ? getActiveTileConfig() : getPreviewTileConfig();
    if (!isValidTileUrl(tile.url)) {
      setTestStatus('error');
      setTestUrl('URL chưa hợp lệ: còn placeholder chưa thay ({domain}, {key}...) hoặc chưa chọn provider phù hợp.');
      return;
    }
    if (!isCustom && selectedProvider?.requires_key && !apiKey.trim() && directTest) {
      setTestStatus('error');
      setTestUrl(`${selectedProvider.name} cần API key — hãy nhập key trước khi test.`);
      return;
    }
    const testTileUrl = tile.url
      .replace('{z}', '6').replace('{x}', '23').replace('{y}', '36')
      .replace('{s}', 'a').replace('{r}', '')
      .replace('{key}', apiKey).replace('{style}', selectedStyle);
    setTestUrl(testTileUrl);
    setTestStatus('testing');

    const img = new Image();
    let done = false;
    const timeout = setTimeout(() => finish(false, 'Quá thời gian 8s (host bị chặn, key sai hoặc mạng chậm)'), 8000);
    const finish = (ok, note) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      img.onload = img.onerror = null;
      setTestStatus(ok ? 'success' : 'error');
      if (note) setTestUrl(`${testTileUrl}\n${note}`);
    };
    img.onload = () => finish(true);
    img.onerror = () => finish(false, directTest
      ? 'Không tải được tile (host bị chặn ở trình duyệt, key sai, hoặc provider không cho phép tải trực tiếp).'
      : 'Proxy không lấy được tile (nguồn bị chặn hoặc cấu hình sai). Xem log backend [TileProxy].');
    img.src = testTileUrl;
  };

  const buildLayersConfig = () => {
    if (isCustom) {
      return [{ id: 'base', role: 'base', type: 'raster', provider: 'custom', url: customTileUrl, mode: defaultMode }];
    }
    const isVector = (selectedProvider?.capabilities || []).includes('vector') && !selectedProvider?.tile_url_styles?.length;
    return [{
      id: 'base',
      role: 'base',
      type: isVector ? 'vector' : 'raster',
      provider: selectedProviderId,
      style: selectedStyle || selectedProvider?.style_url || '',
      mode: defaultMode,
    }];
  };

  const handleSave = async () => {
    if (renderer === 'leaflet' && !isCustom && selectedProvider?.incompatible_with_leaflet) {
      setToast({ message: `${selectedProvider.name} không dùng được với Leaflet. Hãy chọn renderer MapLibre hoặc provider khác.`, type: 'error' });
      return;
    }
    if (!isCustom && selectedProvider?.requires_key && !apiKey.trim()) {
      setToast({ message: `${selectedProvider.name} yêu cầu API Key. Hãy nhập key trước khi lưu.`, type: 'error' });
      return;
    }
    const preTile = getActiveTileConfig();
    if (!isCustom && renderer === 'leaflet' && preTile.url.includes('{domain}')) {
      setToast({ message: 'Tự host cần nhập Tile URL cụ thể qua mục "Tùy chỉnh thủ công".', type: 'error' });
      return;
    }
    if (renderer === 'maplibre' && !isCustom && selectedProvider && !selectedProvider.style_url && !selectedProvider.tile_url && !selectedProvider.tile_url_styles?.length) {
      setToast({ message: `${selectedProvider.name} chưa có style/tile cho MapLibre. Nhập Tile URL thủ công.`, type: 'error' });
      return;
    }
    setSaving(true);
    const tile = getActiveTileConfig();
    const body = {
      tile_provider_id: isCustom ? 'custom' : selectedProviderId,
      tile_url: getStorageTileUrl(),
      tile_attribution: tile.attribution,
      tile_subdomains: tile.subdomains,
      tile_provider: isCustom ? 'custom' : selectedProviderId,
      api_key: apiKey,
      style_url: renderer === 'maplibre' ? (selectedProvider?.style_url || '') : selectedStyle,
      auth_type: selectedProvider?.auth_type || 'none',
      renderer,
      tile_mode: tileMode,
      retina: retina ? 1 : 0,
      default_mode: defaultMode,
      layers_config: buildLayersConfig(),
      enable_3d: enable3d ? 1 : 0,
      show_boundaries: config.show_boundaries,
      show_cluster: config.show_cluster,
      cluster_radius: parseInt(clusterRadius, 10) || CLUSTER_DEFAULTS.radius,
      cluster_max_zoom: parseInt(clusterMaxZoom, 10) || CLUSTER_DEFAULTS.maxZoom,
      show_province_labels: config.show_province_labels,
      center_lat: config.center_lat,
      center_lng: config.center_lng,
      default_zoom: config.default_zoom,
      label_field: config.label_field,
    };
    try {
      const res = await fetch(`${API_URL}/map-configs/${config.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        setToast({ message: 'Lưu cấu hình thành công!', type: 'success' });
        setConfig(data.data);
        window.dispatchEvent(new Event('mapconfig:refresh'));
      } else {
        setToast({ message: data.message || 'Lỗi lưu', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi kết nối server', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const toggleConfig = (key) => {
    setConfig(prev => ({ ...prev, [key]: prev[key] ? 0 : 1 }));
  };

  if (loading) return <div className="flex items-center justify-center h-64"><span className="loading loading-spinner loading-lg" /><p className="ml-3 text-base-content/60">Đang tải...</p></div>;
  if (!config) return <div className="alert alert-error"><span>Không tìm thấy cấu hình</span></div>;

  const tile = directTest ? getActiveTileConfig() : getPreviewTileConfig();
  const safeTileUrl = getSafeTileUrl(tile.url);
  const center = [parseFloat(config.center_lat) || 16, parseFloat(config.center_lng) || 108];
  const subdomains = tile.subdomains ? tile.subdomains.split(',') : [];
  const renderers = listRenderers();
  const compatibleProviders = renderer === 'leaflet'
    ? allProviders.filter(p => !p.incompatible_with_leaflet)
    : allProviders;
  const otherRenderers = renderer === 'leaflet' ? allProviders.filter(p => p.incompatible_with_leaflet) : [];
  const filteredProviders = filterType === 'all' ? compatibleProviders : compatibleProviders.filter(p => p.type === filterType);
  const showApiKeyInput = selectedProvider?.requires_key && !isCustom;
  const showStyleSelect = (selectedProvider?.style_options || selectedProvider?.tile_url_styles) && !isCustom;
  const currentStyleOptions = selectedProvider?.tile_url_styles || selectedProvider?.style_options || [];
  const showCustomInputs = isCustom || (selectedProvider && (selectedProvider.type === 'self-hosted'));
  const previewVectorStyle = renderer === 'maplibre'
    ? buildMapStyle(defaultMode, {
        styleUrl: selectedProvider?.style_url || '',
        pmtilesUrl: (selectedProvider?.id === 'maplibre-self-hosted' && /\.pmtiles(\?|$)/i.test(customTileUrl || '')) ? customTileUrl : '',
      })
    : '';
  const canPreview = renderer === 'maplibre' ? !!(previewVectorStyle || tile.url) : !!safeTileUrl;
  const previewStyleLabel = typeof previewVectorStyle === 'string' ? previewVectorStyle : (renderer === 'maplibre' ? `style: ${defaultMode}` : '');
  const previewCluster = normalizeClusterOptions({ radius: clusterRadius, maxZoom: clusterMaxZoom });
  const previewStations = (() => {
    const pts = [];
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * Math.PI * 2;
      const r = 0.02 + (i % 3) * 0.015;
      pts.push({
        id: `demo-${i}`,
        name: `Điểm demo ${i + 1}`,
        latitude: center[0] + Math.sin(a) * r,
        longitude: center[1] + Math.cos(a) * r,
        _color: i % 2 ? '#22c55e' : '#3b82f6',
      });
    }
    return pts;
  })();

  return (
    <div className="p-4 md:p-6">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} duration={3000} />
      <h1 className="text-xl font-bold mb-5 flex items-center gap-2">
        <Settings size={22} /> Cấu hình Bản đồ
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Config */}
        <div className="flex flex-col gap-4">
          {/* Renderer + Mode */}
          <div className="bg-white border border-base-300 rounded-lg p-4">
            <h3 className="text-base font-bold mb-3">Renderer</h3>
            <div className="grid grid-cols-2 gap-1.5 mb-4">
              {renderers.map(r => (
                <div
                  key={r.id}
                  onClick={() => { setRenderer(r.id); setTestStatus(null); }}
                  className={`px-2.5 py-2 rounded-md cursor-pointer text-xs border-2 transition-all ${renderer === r.id ? 'border-primary bg-primary/5' : 'border-base-300 bg-white'}`}
                >
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-[10px] text-base-content/50">
                    {[
                      r.supports?.raster ? 'raster' : null,
                      r.supports?.vector ? 'vector' : null,
                      r.supports?.terrain ? 'terrain' : null,
                    ].filter(Boolean).join(' · ')}
                  </div>
                </div>
              ))}
            </div>
            <h3 className="text-base font-bold mb-3">Mode / Layer</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {MAP_MODES.map(m => (
                <div
                  key={m.id}
                  onClick={() => setDefaultMode(m.id)}
                  className={`px-2.5 py-2 rounded-md cursor-pointer text-xs border-2 transition-all ${defaultMode === m.id ? 'border-primary bg-primary/5' : 'border-base-300 bg-white'}`}
                >
                  <div className="font-semibold">{m.label}</div>
                  <div className="text-[10px] text-base-content/50">{m.hint}</div>
                </div>
              ))}
            </div>
            <label className={`flex items-center gap-2 mt-3 cursor-pointer ${renderer !== 'maplibre' ? 'opacity-50' : ''}`}>
              <input type="checkbox" className="checkbox checkbox-sm" checked={enable3d} disabled={renderer !== 'maplibre'} onChange={() => setEnable3d(v => !v)} />
              <span className="text-sm">3D (nhà nổi + địa hình) — chỉ renderer MapLibre; mobile tự tắt</span>
            </label>
          </div>

          {/* Map Provider */}
          <div className="bg-white border border-base-300 rounded-lg p-4">
            <h3 className="text-base font-bold mb-3">Map Provider</h3>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {[{ id: 'all', label: 'Tất cả' }, ...TILE_CATEGORIES].map(cat => (
                <button key={cat.id} className={`btn btn-xs ${filterType === cat.id ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setFilterType(cat.id)}>{cat.label}</button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto">
              {filteredProviders.map(p => (
                <div key={p.id} onClick={() => { setIsCustom(false); setSelectedProviderId(p.id); setSelectedStyle(p.tile_url_styles?.[0]?.value || p.style_options?.[0]?.value || ''); setTestStatus(null); }}
                  className={`p-2.5 rounded-lg cursor-pointer border-2 transition-all ${!isCustom && selectedProviderId === p.id ? 'border-primary bg-primary/5' : 'border-base-300 bg-white hover:border-primary/40'}`}>
                  <div className="text-sm font-semibold">{p.name}</div>
                  <div className="text-xs text-base-content/50 mt-0.5">{p.description}</div>
                  <div className="flex gap-1.5 mt-1.5 text-[10px]">
                    <span className={`px-1.5 py-0.5 rounded font-semibold ${p.type === 'free' ? 'bg-success/10 text-success' : p.type === 'self-hosted' ? 'bg-warning/10 text-warning' : 'bg-info/10 text-info'}`}>
                      {p.type === 'free' ? 'Miễn phí' : p.type === 'self-hosted' ? 'Tự host' : 'API'}
                    </span>
                    {p.requires_key && <span className="text-warning font-semibold">Cần Key</span>}
                    {p.has_cluster && <span className="text-success font-semibold">Cluster: {p.cluster_method}</span>}
                    {p.incompatible_with_leaflet && <span className="text-error font-semibold">Không tương thích Leaflet</span>}
                  </div>
                </div>
              ))}
            </div>
            {isLeafletIncompatible && (
              <div className="alert alert-warning text-sm mt-2">
                <span>{selectedProvider.name} không tương thích Leaflet. Chọn renderer MapLibre hoặc provider khác.</span>
              </div>
            )}
            {otherRenderers.length > 0 && (
              <details className="mt-2 text-xs text-base-content/60">
                <summary className="cursor-pointer font-semibold">Provider cần renderer khác ({otherRenderers.length})</summary>
                <ul className="mt-1 ml-4 list-disc">
                  {otherRenderers.map(p => (
                    <li key={p.id}><span className="font-semibold">{p.name}</span> — cần renderer MapLibre</li>
                  ))}
                </ul>
              </details>
            )}
            <div onClick={() => { setIsCustom(true); setSelectedProviderId('custom'); setTestStatus(null); }}
              className={`mt-2 p-2.5 rounded-lg cursor-pointer border-2 transition-all ${isCustom ? 'border-primary bg-primary/5' : 'border-base-300 bg-white hover:border-primary/40'}`}>
              <div className="text-sm font-semibold">Tùy chỉnh thủ công (Custom)</div>
              <div className="text-xs text-base-content/50">Nhập tile URL, attribution, subdomains thủ công</div>
            </div>
          </div>

          {/* Authentication */}
          {showApiKeyInput && (
            <div className="bg-white border border-base-300 rounded-lg p-4">
              <h3 className="text-base font-bold mb-3">Authentication</h3>
              <label className="text-sm font-semibold block mb-1.5">API Key / Token</label>
              <input className="input input-bordered input-sm w-full" value={apiKey} onChange={e => { setApiKey(e.target.value); setTestStatus(null); }}
                placeholder={selectedProvider.api_key_placeholder || 'Nhập API Key'} />
              <div className="text-xs text-base-content/50 mt-1">{selectedProvider.description}</div>
            </div>
          )}

          {/* Map Config */}
          <div className="bg-white border border-base-300 rounded-lg p-4">
            <h3 className="text-base font-bold mb-3">Map Config</h3>

            {showStyleSelect && (
              <div className="mb-3">
                <label className="text-sm font-semibold block mb-1.5">Style</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {currentStyleOptions.map(s => (
                    <div key={s.value} onClick={() => { setSelectedStyle(s.value); setTestStatus(null); }}
                      className={`px-2.5 py-2 rounded-md cursor-pointer text-xs font-medium border-2 transition-all ${selectedStyle === s.value ? 'border-primary bg-primary/5' : 'border-base-300 bg-white'}`}>
                      {s.label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showCustomInputs && (
              <div className="flex flex-col gap-2.5 mb-3">
                <div>
                  <label className="text-sm font-semibold block mb-1.5">Tile URL</label>
                  <input className="input input-bordered input-sm w-full" value={customTileUrl} onChange={e => { setCustomTileUrl(e.target.value); setTestStatus(null); }}
                    placeholder="https://{s}.example.com/{z}/{x}/{y}.png" />
                </div>
                <div>
                  <label className="text-sm font-semibold block mb-1.5">Attribution</label>
                  <input className="input input-bordered input-sm w-full" value={customAttribution} onChange={e => setCustomAttribution(e.target.value)}
                    placeholder="&copy; Example" />
                </div>
                <div>
                  <label className="text-sm font-semibold block mb-1.5">Subdomains (phẩy cách)</label>
                  <input className="input input-bordered input-sm w-full" value={customSubdomains} onChange={e => setCustomSubdomains(e.target.value)}
                    placeholder="a,b,c" />
                </div>
              </div>
            )}

            {/* Tile mode + Retina */}
            <div className="mb-3">
              <label className="text-sm font-semibold block mb-1.5">Chế độ tải tile</label>
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                {[
                  { value: 'proxy', label: 'Proxy server', desc: 'Ẩn API key (khuyến nghị)' },
                  { value: 'direct', label: 'Trực tiếp', desc: 'Client giữ key, giới hạn referrer' },
                ].map(opt => (
                  <div key={opt.value} onClick={() => setTileMode(opt.value)}
                    className={`px-2.5 py-2 rounded-md cursor-pointer text-xs border-2 transition-all ${tileMode === opt.value ? 'border-primary bg-primary/5' : 'border-base-300 bg-white'}`}>
                    <div className="font-semibold">{opt.label}</div>
                    <div className="text-[10px] text-base-content/50">{opt.desc}</div>
                  </div>
                ))}
              </div>
              {tileMode === 'direct' && (
                <div className="text-[11px] text-warning mb-1">API key sẽ lộ ở trình duyệt. Hãy giới hạn key theo HTTP referrer trên nhà cung cấp.</div>
              )}
              <label className="flex items-center gap-2 mt-1 cursor-pointer">
                <input type="checkbox" className="checkbox checkbox-sm" checked={retina} onChange={() => setRetina(v => !v)} />
                <span className="text-sm">Retina (@2x) — nét hơn trên màn hình mật độ cao</span>
              </label>
            </div>

            {/* Connection Test */}
            <div className="mb-3 p-2.5 bg-base-200 rounded-md border border-base-300">
              <div className="flex items-center gap-2 mb-1.5">
                <button className="btn btn-xs btn-secondary gap-1" onClick={handleTestConnection} disabled={testStatus === 'testing'}>
                  {testStatus === 'testing' ? 'Đang test...' : <><Wifi size={12} /> Test kết nối</>}
                </button>
                {testStatus === 'success' && <span className="text-success font-semibold text-xs">Kết nối OK</span>}
                {testStatus === 'error' && <span className="text-error font-semibold text-xs">Lỗi kết nối</span>}
              </div>
              <label className="flex items-center gap-2 mb-1.5 cursor-pointer">
                <input type="checkbox" className="checkbox checkbox-xs" checked={directTest} onChange={() => { setDirectTest(v => !v); setTestStatus(null); }} />
                <span className="text-[11px] text-base-content/60">Test trực tiếp (bỏ qua proxy) — dùng để chẩn đoán</span>
              </label>
              <div className="text-[11px] text-base-content/50 mb-1.5">
                {directTest ? 'Đang test URL trực tiếp tới provider.' : 'Đang test qua proxy /tiles (giống production).'}
              </div>
              {testUrl && (
                <div className="text-[11px] text-base-content/60 break-all font-mono bg-white px-2 py-1 rounded border border-base-300">
                  {testUrl}
                </div>
              )}
            </div>

            {/* Display toggles */}
            <div className="border-t border-base-300 pt-3">
              <label className="text-sm font-semibold block mb-1.5">Hiển thị</label>
              {[
                { key: 'show_province_labels', label: 'Tên tỉnh trên bản đồ' },
                { key: 'show_boundaries', label: 'Ranh giới tỉnh (nét đứt)' },
                { key: 'show_cluster', label: 'Gộp marker (Cluster)' },
              ].map(item => (
                <label key={item.key} className="flex items-center gap-2 mb-1.5 cursor-pointer">
                  <input type="checkbox" className="checkbox checkbox-sm" checked={!!config[item.key]} onChange={() => toggleConfig(item.key)} />
                  <span className="text-sm">{item.label}</span>
                </label>
              ))}
              {!!config.show_cluster && (
                <div className="mt-2 ml-6 flex flex-col gap-2 border-l-2 border-primary/30 pl-3">
                  <div>
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-medium">Bán kính gộp</label>
                      <span className="text-sm font-semibold text-primary">{clusterRadius}px</span>
                    </div>
                    <input
                      type="range" className="range range-primary range-xs w-full"
                      min={CLUSTER_LIMITS.radiusMin} max={CLUSTER_LIMITS.radiusMax} step={5}
                      value={clusterRadius} onChange={e => setClusterRadius(parseInt(e.target.value, 10))}
                    />
                    <div className="text-[11px] text-base-content/50">Nhỏ → ít gộp hơn; lớn → gộp xa hơn</div>
                  </div>
                  <div>
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-medium">Zoom tách cluster</label>
                      <span className="text-sm font-semibold text-primary">{clusterMaxZoom}</span>
                    </div>
                    <input
                      type="range" className="range range-primary range-xs w-full"
                      min={CLUSTER_LIMITS.maxZoomMin} max={CLUSTER_LIMITS.maxZoomMax} step={1}
                      value={clusterMaxZoom} onChange={e => setClusterMaxZoom(parseInt(e.target.value, 10))}
                    />
                    <div className="text-[11px] text-base-content/50">Từ zoom này trở lên marker tách riêng, không gộp nữa</div>
                  </div>
                </div>
              )}
            </div>

            {/* Center + Zoom */}
            <div className="mt-3 border-t border-base-300 pt-3">
              <label className="text-sm font-semibold block mb-1.5">Trung tâm & Zoom</label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                <div>
                  <label className="text-[11px] text-base-content/50">Vĩ độ</label>
                  <input className="input input-bordered input-sm w-full" type="number" step="0.01" value={config.center_lat}
                    onChange={e => setConfig(prev => ({ ...prev, center_lat: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[11px] text-base-content/50">Kinh độ</label>
                  <input className="input input-bordered input-sm w-full" type="number" step="0.01" value={config.center_lng}
                    onChange={e => setConfig(prev => ({ ...prev, center_lng: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[11px] text-base-content/50">Zoom</label>
                  <input className="input input-bordered input-sm w-full" type="number" min="1" max="18" value={config.default_zoom}
                    onChange={e => setConfig(prev => ({ ...prev, default_zoom: parseInt(e.target.value) || 6 }))} />
                </div>
              </div>
            </div>
          </div>

          <button className="btn btn-primary w-full gap-1" onClick={handleSave} disabled={saving}>
            <Save size={16} /> {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
          </button>
        </div>

        {/* Right: Preview Map + Info */}
        <div className="flex flex-col gap-4">
          <div className="bg-white border border-base-300 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-base-200 border-b border-base-300 flex justify-between items-center">
              <span className="text-sm font-semibold">Xem trước bản đồ ({renderer})</span>
              <span className="text-[11px] text-base-content/50">
                {renderer === 'maplibre'
                  ? (previewStyleLabel ? `Style: ${String(previewStyleLabel).substring(0, 40)}` : 'Chưa có style/vector')
                  : (safeTileUrl ? `Tile: ${safeTileUrl.substring(0, 40)}...` : 'Chưa có tile URL hợp lệ')}
              </span>
            </div>
            {canPreview ? (
              <div style={{ height: 400, width: '100%' }}>
                <MapCanvas
                  renderer={renderer}
                  center={center}
                  zoom={config.default_zoom || 6}
                  tile={{ url: tile.url, attribution: tile.attribution, subdomains: tile.subdomains }}
                  vectorStyle={previewVectorStyle}
                  apiKey={apiKey}
                  stations={previewStations}
                  proposals={[]}
                  showCluster={!!config.show_cluster}
                  clusterOptions={previewCluster}
                  showStationLabels={false}
                  showProvinceLabels={false}
                  showBoundaries={false}
                  provincePoints={[]}
                />
              </div>
            ) : (
              <div className="h-[400px] flex items-center justify-center text-base-content/40 text-sm">
                Chọn provider/style để xem preview
              </div>
            )}
          </div>

          {selectedProvider && !isCustom && (
            <div className="bg-white border border-base-300 rounded-lg p-4">
              <h3 className="text-base font-bold mb-3">Thông tin Provider</h3>
              <table className="w-full text-sm">
                <tbody>
                  <tr><td className="py-1 text-base-content/50 w-[30%]">Tên</td><td className="py-1 font-semibold">{selectedProvider.name}</td></tr>
                  <tr><td className="py-1 text-base-content/50">Loại</td><td className="py-1 font-semibold">{selectedProvider.type === 'free' ? 'Miễn phí' : selectedProvider.type === 'self-hosted' ? 'Tự host' : 'API'}</td></tr>
                  <tr><td className="py-1 text-base-content/50">Xác thực</td><td className="py-1 font-semibold">{selectedProvider.auth_type === 'none' ? 'Không cần' : 'API Key / Token'}</td></tr>
                  <tr><td className="py-1 text-base-content/50">Cluster</td><td className="py-1 font-semibold">{selectedProvider.has_cluster ? `Có (${selectedProvider.cluster_method})` : 'Không'}</td></tr>
                  {selectedProvider.style_url && <tr><td className="py-1 text-base-content/50">Style URL</td><td className="py-1 font-semibold break-all">{selectedProvider.style_url}</td></tr>}
                  <tr><td className="py-1 text-base-content/50">Tile URL</td><td className="py-1 font-semibold break-all text-[11px] font-mono">{tile.url || '—'}</td></tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <GeocodeConfigPanel />
    </div>
  );
};

export default AdminMapConfigPage;
