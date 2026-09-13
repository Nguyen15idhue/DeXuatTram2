import { useEffect, useState } from 'react';
import { geocodeService } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import Toast from '../Toast';
import { MapPinned, Save, Wifi } from 'lucide-react';

const GeocodeConfigPanel = () => {
  const { token } = useAuth();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [lang, setLang] = useState('vi');
  const [countrycodes, setCountrycodes] = useState('vn');
  const [cacheTtl, setCacheTtl] = useState(30);
  const [testStatus, setTestStatus] = useState(null);
  const [testResult, setTestResult] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (toast.message) {
      const t = setTimeout(() => setToast({ message: '', type: 'success' }), 3000);
      return () => clearTimeout(t);
    }
  }, [toast.message]);

  const load = async () => {
    try {
      const res = await geocodeService.getConfig(token);
      if (res.success && res.data) {
        const c = res.data;
        setConfig(c);
        setApiKey(c.api_key || '');
        setEnabled(!!Number(c.enabled));
        setLang(c.lang || 'vi');
        setCountrycodes(c.countrycodes || 'vn');
        setCacheTtl(c.cache_ttl_days || 30);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await geocodeService.updateConfig({
        provider: 'geoapify',
        api_key: apiKey,
        enabled: enabled ? 1 : 0,
        lang,
        countrycodes,
        cache_ttl_days: Number(cacheTtl) || 30,
      }, token);
      if (res.success) {
        setConfig(res.data);
        setToast({ message: 'Lưu cấu hình địa chỉ thành công!', type: 'success' });
      } else {
        setToast({ message: res.message || 'Lỗi lưu', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi kết nối server', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTestStatus('testing');
    setTestResult('');
    try {
      const res = await geocodeService.test({ lat: 21.0285, lng: 105.8542 }, token);
      if (res.success && res.data && res.data.found) {
        setTestStatus('success');
        setTestResult(res.data.formatted || '');
      } else {
        setTestStatus('error');
        setTestResult(res.message || 'Không tìm thấy địa chỉ');
      }
    } catch (e) {
      setTestStatus('error');
      setTestResult(e.message || 'Lỗi test');
    }
  };

  if (loading) return null;

  return (
    <div className="bg-white border border-base-300 rounded-lg p-4 mt-5">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} duration={3000} />
      <h3 className="text-base font-bold mb-3 flex items-center gap-2">
        <MapPinned size={18} /> Địa chỉ (Reverse Geocoding)
      </h3>

      <label className="flex items-center gap-2 mb-3 cursor-pointer">
        <input type="checkbox" className="toggle toggle-sm" checked={enabled} onChange={() => setEnabled(v => !v)} />
        <span className="text-sm font-semibold">Tự động điền địa chỉ/tỉnh/phường từ tọa độ</span>
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <label className="text-sm font-semibold block mb-1.5">API Key (Geoapify)</label>
          <div className="flex gap-2">
            <input
              className="input input-bordered input-sm w-full"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => { setApiKey(e.target.value); setTestStatus(null); }}
              placeholder="YOUR_GEOAPIFY_KEY"
            />
            <button type="button" className="btn btn-xs btn-ghost" onClick={() => setShowKey(v => !v)}>
              {showKey ? 'Ẩn' : 'Hiện'}
            </button>
          </div>
        </div>
        <div>
          <label className="text-[11px] text-base-content/50">Ngôn ngữ (lang)</label>
          <input className="input input-bordered input-sm w-full" value={lang} onChange={e => setLang(e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] text-base-content/50">Quốc gia (countrycodes)</label>
          <input className="input input-bordered input-sm w-full" value={countrycodes} onChange={e => setCountrycodes(e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] text-base-content/50">Cache (ngày)</label>
          <input className="input input-bordered input-sm w-full" type="number" min="1" value={cacheTtl}
            onChange={e => setCacheTtl(e.target.value)} />
        </div>
      </div>

      <div className="mt-3 p-2.5 bg-base-200 rounded-md border border-base-300">
        <div className="flex items-center gap-2">
          <button className="btn btn-xs btn-secondary gap-1" onClick={handleTest} disabled={testStatus === 'testing'}>
            {testStatus === 'testing' ? 'Đang test...' : <><Wifi size={12} /> Test (21.0285, 105.8542)</>}
          </button>
          {testStatus === 'success' && <span className="text-success font-semibold text-xs">OK</span>}
          {testStatus === 'error' && <span className="text-error font-semibold text-xs">Lỗi</span>}
        </div>
        {testResult && <div className="text-[11px] text-base-content/60 mt-1 break-all">{testResult}</div>}
      </div>

      <button className="btn btn-primary btn-sm w-full gap-1 mt-3" onClick={handleSave} disabled={saving}>
        <Save size={14} /> {saving ? 'Đang lưu...' : 'Lưu cấu hình địa chỉ'}
      </button>
    </div>
  );
};

export default GeocodeConfigPanel;
