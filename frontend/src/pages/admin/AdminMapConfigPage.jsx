import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { TILE_PROVIDERS, getProviderById, TILE_CATEGORIES } from '../../utils/tileProviders';
import { useAuth } from '../../contexts/AuthContext';

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
import Toast from '../../components/Toast';

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
  const [previewBounds, setPreviewBounds] = useState(null);

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
    if (p.tile_url_template) {
      let url = p.tile_url_template.replace('{key}', key || '');
      url = url.replace('{style}', style || '');
      return url;
    }
    if (p.tile_url && !p.tile_url.includes('{domain}')) return p.tile_url;
    return CARTO_LIGHT;
  };

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
      if (res.ok) {
        setTestStatus('success');
      } else {
        setTestStatus('error');
      }
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

  if (loading) return <div className="loading-container"><div className="spinner" /><p>Đang tải...</p></div>;
  if (!config) return <div className="error-alert"><span>Không tìm thấy cấu hình</span></div>;

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
    <div className="admin-page">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} duration={3000} />
      <h1 style={{ marginBottom: 20 }}>Cấu hình Bản đồ</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Left: Config */}
        <div>
          {/* Map Provider */}
          <div style={sectionStyle}>
            <h3 style={sectionTitleStyle}>Map Provider</h3>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {[{ id: 'all', label: 'Tất cả' }, ...TILE_CATEGORIES].map(cat => (
                <button key={cat.id} className={`btn btn-sm ${filterType === cat.id ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setFilterType(cat.id)}>{cat.label}</button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
              {filteredProviders.map(p => (
                <div key={p.id} onClick={() => { setIsCustom(false); setSelectedProviderId(p.id); setSelectedStyle(p.tile_url_styles?.[0]?.value || p.style_options?.[0]?.value || ''); setPreviewKey(k => k + 1); setTestStatus(null); }}
                  style={{
                    padding: '10px 12px', border: `2px solid ${!isCustom && selectedProviderId === p.id ? '#4a6cf7' : '#e0e0e0'}`,
                    borderRadius: 8, cursor: 'pointer', background: !isCustom && selectedProviderId === p.id ? '#f5f7ff' : '#fff', transition: 'all 0.15s'
                  }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{p.description}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, fontSize: 10 }}>
                    <span style={{ background: p.type === 'free' ? '#e8f5e9' : p.type === 'self-hosted' ? '#fff3e0' : '#e3f2fd', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                      {p.type === 'free' ? 'Miễn phí' : p.type === 'self-hosted' ? 'Tự host' : 'API'}
                    </span>
                    {p.requires_key && <span style={{ color: '#f57c00', fontWeight: 600 }}>Cần Key</span>}
                    {p.has_cluster && <span style={{ color: '#388e3c', fontWeight: 600 }}>Cluster: {p.cluster_method}</span>}
                  </div>
                </div>
              ))}
            </div>
            {/* Custom tile option */}
            <div onClick={() => { setIsCustom(true); setSelectedProviderId('custom'); setPreviewKey(k => k + 1); setTestStatus(null); }}
              style={{
                marginTop: 8, padding: '10px 12px', border: `2px solid ${isCustom ? '#4a6cf7' : '#e0e0e0'}`,
                borderRadius: 8, cursor: 'pointer', background: isCustom ? '#f5f7ff' : '#fff'
              }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Tùy chỉnh thủ công (Custom)</div>
              <div style={{ fontSize: 11, color: '#888' }}>Nhập tile URL, attribution, subdomains thủ công</div>
            </div>
          </div>

          {/* Authentication */}
          {showApiKeyInput && (
            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>Authentication</h3>
              <div>
                <label style={labelStyle}>API Key / Token</label>
                <input className="form-control" value={apiKey} onChange={e => { setApiKey(e.target.value); setPreviewKey(k => k + 1); setTestStatus(null); }}
                  placeholder={selectedProvider.api_key_placeholder || 'Nhập API Key'} />
                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{selectedProvider.description}</div>
              </div>
            </div>
          )}

          {/* Map Config */}
          <div style={sectionStyle}>
            <h3 style={sectionTitleStyle}>Map Config</h3>

            {/* Style selector */}
            {showStyleSelect && (
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Style</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {currentStyleOptions.map(s => (
                    <div key={s.value} onClick={() => { setSelectedStyle(s.value); setPreviewKey(k => k + 1); setTestStatus(null); }}
                      style={{
                        padding: '8px 10px', border: `2px solid ${selectedStyle === s.value ? '#4a6cf7' : '#e0e0e0'}`,
                        borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500,
                        background: selectedStyle === s.value ? '#f5f7ff' : '#fff'
                      }}>
                      {s.label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Custom/Self-hosted tile inputs */}
            {showCustomInputs && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>Tile URL</label>
                  <input className="form-control" value={customTileUrl} onChange={e => { setCustomTileUrl(e.target.value); setPreviewKey(k => k + 1); setTestStatus(null); }}
                    placeholder="https://{s}.example.com/{z}/{x}/{y}.png" />
                </div>
                <div>
                  <label style={labelStyle}>Attribution</label>
                  <input className="form-control" value={customAttribution} onChange={e => setCustomAttribution(e.target.value)}
                    placeholder="&copy; Example" />
                </div>
                <div>
                  <label style={labelStyle}>Subdomains (phẩy cách)</label>
                  <input className="form-control" value={customSubdomains} onChange={e => setCustomSubdomains(e.target.value)}
                    placeholder="a,b,c" />
                </div>
              </div>
            )}

            {/* Connection Test */}
            <div style={{ marginBottom: 12, padding: '10px 12px', background: '#f8f9fa', borderRadius: 6, border: '1px solid #e0e0e0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <button className="btn btn-sm btn-secondary" onClick={handleTestConnection} disabled={testStatus === 'testing'}>
                  {testStatus === 'testing' ? 'Đang test...' : 'Test kết nối'}
                </button>
                {testStatus === 'success' && <span style={{ color: '#388e3c', fontWeight: 600, fontSize: 12 }}>Kết nối OK</span>}
                {testStatus === 'error' && <span style={{ color: '#d32f2f', fontWeight: 600, fontSize: 12 }}>Lỗi kết nối</span>}
              </div>
              {testUrl && (
                <div style={{ fontSize: 11, color: '#666', wordBreak: 'break-all', fontFamily: 'monospace', background: '#fff', padding: '4px 8px', borderRadius: 4, border: '1px solid #eee' }}>
                  {testUrl}
                </div>
              )}
            </div>

            {/* Display toggles */}
            <div style={{ borderTop: '1px solid #eee', paddingTop: 12 }}>
              <label style={labelStyle}>Hiển thị</label>
              {[
                { key: 'show_province_labels', label: 'Tên tỉnh trên bản đồ' },
                { key: 'show_boundaries', label: 'Ranh giới tỉnh (nét đứt)' },
                { key: 'show_cluster', label: 'Gộp marker (Cluster)' },
              ].map(item => (
                <label key={item.key} className="checkbox-label" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={!!config[item.key]} onChange={() => toggleConfig(item.key)} />
                  <span style={{ fontSize: 13 }}>{item.label}</span>
                </label>
              ))}
            </div>

            {/* Center + Zoom */}
            <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 12 }}>
              <label style={labelStyle}>Trung tâm & Zoom</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 6 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#888' }}>Vĩ độ</label>
                  <input className="form-control" type="number" step="0.01" value={config.center_lat}
                    onChange={e => setConfig(prev => ({ ...prev, center_lat: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#888' }}>Kinh độ</label>
                  <input className="form-control" type="number" step="0.01" value={config.center_lng}
                    onChange={e => setConfig(prev => ({ ...prev, center_lng: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#888' }}>Zoom</label>
                  <input className="form-control" type="number" min="1" max="18" value={config.default_zoom}
                    onChange={e => setConfig(prev => ({ ...prev, default_zoom: parseInt(e.target.value) || 6 }))} />
                </div>
              </div>
            </div>
          </div>

          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ width: '100%' }}>
            {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
          </button>
        </div>

        {/* Right: Preview Map + Info */}
        <div>
          <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: '10px 16px', background: '#f8f9fa', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Xem trước bản đồ</span>
              <span style={{ fontSize: 11, color: '#888' }}>
                {safeTileUrl ? `Tile: ${safeTileUrl.substring(0, 40)}...` : 'Chưa có tile URL hợp lệ'}
              </span>
            </div>
            {safeTileUrl ? (
              <MapContainer key={previewKey} center={center} zoom={config.default_zoom || 6} style={{ height: 400, width: '100%' }}>
                <TileLayer attribution={tile.attribution} url={safeTileUrl} subdomains={subdomains} />
              </MapContainer>
            ) : (
              <div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 14 }}>
                Nhập tile URL để xem preview
              </div>
            )}
          </div>

          {/* Provider Info */}
          {selectedProvider && !isCustom && (
            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>Thông tin Provider</h3>
              <table style={{ width: '100%', fontSize: 13 }}>
                <tbody>
                  <tr><td style={tdLabel}>Tên</td><td style={tdValue}>{selectedProvider.name}</td></tr>
                  <tr><td style={tdLabel}>Loại</td><td style={tdValue}>{selectedProvider.type === 'free' ? 'Miễn phí' : selectedProvider.type === 'self-hosted' ? 'Tự host' : 'API'}</td></tr>
                  <tr><td style={tdLabel}>Xác thực</td><td style={tdValue}>{selectedProvider.auth_type === 'none' ? 'Không cần' : 'API Key / Token'}</td></tr>
                  <tr><td style={tdLabel}>Cluster</td><td style={tdValue}>{selectedProvider.has_cluster ? `Có (${selectedProvider.cluster_method})` : 'Không'}</td></tr>
                  {selectedProvider.style_url && <tr><td style={tdLabel}>Style URL</td><td style={{ ...tdValue, wordBreak: 'break-all' }}>{selectedProvider.style_url}</td></tr>}
                  <tr><td style={tdLabel}>Tile URL</td><td style={{ ...tdValue, wordBreak: 'break-all', fontSize: 11, fontFamily: 'monospace' }}>{tile.url || '—'}</td></tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const sectionStyle = { background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: 16, marginBottom: 16 };
const sectionTitleStyle = { margin: '0 0 12px', fontSize: 15, fontWeight: 700 };
const labelStyle = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 };
const tdLabel = { padding: '4px 0', color: '#888', width: '30%' };
const tdValue = { padding: '4px 0', fontWeight: 600 };

export default AdminMapConfigPage;
