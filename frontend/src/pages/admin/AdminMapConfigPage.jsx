import { useState, useEffect } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { TILE_PROVIDERS, getProviderById, TILE_CATEGORIES } from '../../utils/tileProviders';
import { useAuth } from '../../contexts/AuthContext';
import Toast from '../../components/Toast';
import { Settings, Save, Wifi, WifiOff } from 'lucide-react';

const FALLBACK_TILE = 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

function isValidTileUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const placeholderPattern = /\{[^}]+\}/g;
  const matches = url.match(placeholderPattern) || [];
  const validPlaceholders = ['{z}', '{x}', '{y}', '{s}', '{r}'];
  return matches.every(m => validPlaceholders.includes(m));
}

function getSafeTileUrl(url) {
  if (isValidTileUrl(url)) return url;
  return FALLBACK_TILE;
}

const AdminMapConfigPage = () => {
  const { token } = useAuth();
  const [config, setConfig] = useState(null);
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
  const [previewKey, setPreviewKey] = useState(0);
  const [filterType, setFilterType] = useState('all');
  const [testStatus, setTestStatus] = useState(null);
  const [testUrl, setTestUrl] = useState('');

  useEffect(() => { loadConfig(); }, []);

  useEffect(() => {
    if (toast.message) {
      const t = setTimeout(() => setToast({ message: '', type: 'success' }), 3000);
      return () => clearTimeout(t);
    }
  }, [toast.message]);

  const loadConfig = async () => {
    try {
      const res = await fetch('/api/map-configs?entity=stations', {
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
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const selectedProvider = isCustom ? null : getProviderById(selectedProviderId);

  const CARTO_LIGHT = 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
  const CARTO_ATTR = '&copy; CARTO &copy; OpenStreetMap contributors';

  const resolveTileUrl = (providerId, style, key) => {
    const p = getProviderById(providerId);
    if (!p) return CARTO_LIGHT;
    if (p.incompatible_with_leaflet) return '';
    if (p.tile_url_template) {
      let url = p.tile_url_template.replace('{key}', key || '');
      url = url.replace('{style}', style || '');
      return url;
    }
    if (p.tile_url && !p.tile_url.includes('{domain}')) return p.tile_url;
    return CARTO_LIGHT;
  };

  const isLeafletIncompatible = selectedProvider?.incompatible_with_leaflet && !isCustom;

  const getActiveTileConfig = () => {
    if (isCustom) {
      const url = getSafeTileUrl(customTileUrl);
      return { url, attribution: customAttribution, subdomains: customSubdomains };
    }
    if (!selectedProvider) return { url: CARTO_LIGHT, attribution: CARTO_ATTR, subdomains: 'a,b,c,d' };
    const url = resolveTileUrl(selectedProviderId, selectedStyle, apiKey);
    return { url, attribution: selectedProvider.attribution || CARTO_ATTR, subdomains: selectedProvider.subdomains || '' };
  };

  const handleTestConnection = async () => {
    const tile = getActiveTileConfig();
    const url = getSafeTileUrl(tile.url);
    if (!isValidTileUrl(tile.url)) {
      setTestStatus('error');
      setTestUrl('URL chứa placeholder chưa được thay thế ({domain}, ...)');
      return;
    }
    const testTileUrl = url
      .replace('{z}', '6').replace('{x}', '23').replace('{y}', '36')
      .replace('{s}', 'a').replace('{r}', '');
    setTestUrl(testTileUrl);
    setTestStatus('testing');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(testTileUrl, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timeout);
      setTestStatus(res.ok ? 'success' : 'error');
    } catch {
      setTestStatus('error');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const tile = getActiveTileConfig();
    const body = {
      tile_provider_id: isCustom ? 'custom' : selectedProviderId,
      tile_url: tile.url,
      tile_attribution: tile.attribution,
      tile_subdomains: tile.subdomains,
      tile_provider: isCustom ? 'custom' : selectedProviderId,
      api_key: apiKey,
      style_url: selectedStyle,
      auth_type: selectedProvider?.auth_type || 'none',
      show_boundaries: config.show_boundaries,
      show_cluster: config.show_cluster,
      show_province_labels: config.show_province_labels,
      center_lat: config.center_lat,
      center_lng: config.center_lng,
      default_zoom: config.default_zoom,
      label_field: config.label_field,
    };
    try {
      const res = await fetch(`/api/map-configs/${config.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        setToast({ message: 'Lưu cấu hình thành công!', type: 'success' });
        setConfig(data.data);
        setPreviewKey(prev => prev + 1);
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

  const tile = getActiveTileConfig();
  const safeTileUrl = getSafeTileUrl(tile.url);
  const center = [parseFloat(config.center_lat) || 16, parseFloat(config.center_lng) || 108];
  const subdomains = tile.subdomains ? tile.subdomains.split(',') : [];
  const filteredProviders = filterType === 'all' ? TILE_PROVIDERS : TILE_PROVIDERS.filter(p => p.type === filterType);
  const showApiKeyInput = selectedProvider?.requires_key && !isCustom;
  const showStyleSelect = (selectedProvider?.style_options || selectedProvider?.tile_url_styles) && !isCustom;
  const currentStyleOptions = selectedProvider?.tile_url_styles || selectedProvider?.style_options || [];
  const showCustomInputs = isCustom || (selectedProvider && (selectedProvider.type === 'self-hosted'));

  return (
    <div className="p-4 md:p-6">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} duration={3000} />
      <h1 className="text-xl font-bold mb-5 flex items-center gap-2">
        <Settings size={22} /> Cấu hình Bản đồ
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Config */}
        <div className="flex flex-col gap-4">
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
                <div key={p.id} onClick={() => { setIsCustom(false); setSelectedProviderId(p.id); setSelectedStyle(p.tile_url_styles?.[0]?.value || p.style_options?.[0]?.value || ''); setPreviewKey(k => k + 1); setTestStatus(null); }}
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
                <span>{selectedProvider.name} không tương thích với Leaflet TileLayer. Dùng renderer tương ứng ({selectedProvider.name}) hoặc chọn provider khác.</span>
              </div>
            )}
            <div onClick={() => { setIsCustom(true); setSelectedProviderId('custom'); setPreviewKey(k => k + 1); setTestStatus(null); }}
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
              <input className="input input-bordered input-sm w-full" value={apiKey} onChange={e => { setApiKey(e.target.value); setPreviewKey(k => k + 1); setTestStatus(null); }}
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
                    <div key={s.value} onClick={() => { setSelectedStyle(s.value); setPreviewKey(k => k + 1); setTestStatus(null); }}
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
                  <input className="input input-bordered input-sm w-full" value={customTileUrl} onChange={e => { setCustomTileUrl(e.target.value); setPreviewKey(k => k + 1); setTestStatus(null); }}
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

            {/* Connection Test */}
            <div className="mb-3 p-2.5 bg-base-200 rounded-md border border-base-300">
              <div className="flex items-center gap-2 mb-1.5">
                <button className="btn btn-xs btn-secondary gap-1" onClick={handleTestConnection} disabled={testStatus === 'testing'}>
                  {testStatus === 'testing' ? 'Đang test...' : <><Wifi size={12} /> Test kết nối</>}
                </button>
                {testStatus === 'success' && <span className="text-success font-semibold text-xs">Kết nối OK</span>}
                {testStatus === 'error' && <span className="text-error font-semibold text-xs">Lỗi kết nối</span>}
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
              <span className="text-sm font-semibold">Xem trước bản đồ</span>
              <span className="text-[11px] text-base-content/50">
                {safeTileUrl ? `Tile: ${safeTileUrl.substring(0, 40)}...` : 'Chưa có tile URL hợp lệ'}
              </span>
            </div>
            {safeTileUrl ? (
              <MapContainer key={previewKey} center={center} zoom={config.default_zoom || 6} style={{ height: 400, width: '100%' }}>
                <TileLayer attribution={tile.attribution} url={safeTileUrl} subdomains={subdomains} />
              </MapContainer>
            ) : (
              <div className="h-[400px] flex items-center justify-center text-base-content/40 text-sm">
                Nhập tile URL để xem preview
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
    </div>
  );
};

export default AdminMapConfigPage;
