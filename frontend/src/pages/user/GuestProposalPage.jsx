import { useState, useEffect, useRef, useCallback } from 'react';
import { proposalService } from '../../services/api';
import { parseGoogleMapsLink, resolveGoogleMapsShortUrl } from '../../utils/mapHelpers';
import DynamicForm from '../../components/dynamic/DynamicForm';
import Toast from '../../components/Toast';
import ErrorMessage from '../../components/ErrorMessage';
import { MapPin, Search, Copy, Trash2, CheckCircle2, LocateFixed, Link2 } from 'lucide-react';

const PROPOSALS_FORM_ID = 9;
const LS_KEY = 'guest_proposals';
const LS_MAX = 50;
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

const loadSavedCodes = () => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

const GuestProposalPage = () => {
  const [mapCoords, setMapCoords] = useState({ latitude: '', longitude: '' });
  const [locating, setLocating] = useState(false);
  const [mapLink, setMapLink] = useState('');
  const [resolvingLink, setResolvingLink] = useState(false);
  const [nearbyWarning, setNearbyWarning] = useState('');
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [result, setResult] = useState(null);
  const [savedCodes, setSavedCodes] = useState(loadSavedCodes);
  const [trackInput, setTrackInput] = useState('');
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackResult, setTrackResult] = useState(null);
  const [trackError, setTrackError] = useState('');
  const turnstileRef = useRef(null);
  const turnstileWidget = useRef(null);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    const scriptId = 'turnstile-script';
    const renderWidget = () => {
      if (window.turnstile && turnstileRef.current && !turnstileWidget.current) {
        turnstileWidget.current = window.turnstile.render(turnstileRef.current, { sitekey: TURNSTILE_SITE_KEY });
      }
    };
    if (!document.getElementById(scriptId)) {
      const s = document.createElement('script');
      s.id = scriptId;
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      s.async = true;
      s.defer = true;
      s.onload = renderWidget;
      document.body.appendChild(s);
    } else {
      renderWidget();
    }
  }, []);

  const getCaptchaToken = () => {
    try {
      if (window.turnstile && turnstileWidget.current !== null && turnstileWidget.current !== undefined) {
        return window.turnstile.getResponse(turnstileWidget.current) || '';
      }
    } catch { /* silent */ }
    return '';
  };

  const resetCaptcha = () => {
    try {
      if (window.turnstile && turnstileWidget.current !== null && turnstileWidget.current !== undefined) {
        window.turnstile.reset(turnstileWidget.current);
      }
    } catch { /* silent */ }
  };

  useEffect(() => {
    const lat = Number(mapCoords.latitude);
    const lng = Number(mapCoords.longitude);
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
      setNearbyWarning('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const nearby = await proposalService.checkNearbyPublic({ latitude: lat, longitude: lng, radius_m: 200 });
        if (cancelled) return;
        if (nearby.success && nearby.data && nearby.data.is_duplicate) {
          const n = nearby.data.nearest;
          const who = n.kind === 'station' ? 'trạm' : 'đề xuất';
          setNearbyWarning(`Cảnh báo: vị trí này trùng với ${who} #${n.id} (cách ${n.distance_m}m < 200m). Bạn vẫn có thể nhập form nhưng sẽ không lưu được.`);
        } else {
          setNearbyWarning('');
        }
      } catch {
        if (!cancelled) setNearbyWarning('');
      }
    })();
    return () => { cancelled = true; };
  }, [mapCoords.latitude, mapCoords.longitude]);

  const handleMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Trình duyệt không hỗ trợ định vị');
      return;
    }
    setError('');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setMapCoords({ latitude: latitude.toFixed(6), longitude: longitude.toFixed(6) });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        let msg = 'Không thể lấy vị trí';
        if (err.code === 1) msg = 'Bạn đã từ chối quyền truy cập vị trí';
        else if (err.code === 2) msg = 'Không xác định được vị trí';
        else if (err.code === 3) msg = 'Timeout lấy vị trí';
        setError(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleGoogleMapLink = async () => {
    const url = mapLink.trim();
    if (!url) return;
    setError('');
    setResolvingLink(true);
    try {
      let coords = parseGoogleMapsLink(url);
      if (coords && coords.needResolve) {
        coords = await resolveGoogleMapsShortUrl(coords.url);
      }
      if (coords && coords.lat != null && coords.lng != null) {
        setMapCoords({ latitude: Number(coords.lat).toFixed(6), longitude: Number(coords.lng).toFixed(6) });
        setMapLink('');
      } else {
        setError('Không đọc được tọa độ từ link Google Maps');
      }
    } catch {
      setError('Không đọc được tọa độ từ link Google Maps');
    } finally {
      setResolvingLink(false);
    }
  };

  const saveCode = useCallback((entry) => {
    setSavedCodes(prev => {
      const next = [{ tracking_code: entry.tracking_code, ma_de_xuat: entry.ma_de_xuat || '', created_at: entry.created_at || new Date().toISOString() }, ...prev.filter(p => p.tracking_code !== entry.tracking_code)].slice(0, LS_MAX);
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* silent */ }
      return next;
    });
  }, []);

  const handleRemoveCode = (code) => {
    setSavedCodes(prev => {
      const next = prev.filter(p => p.tracking_code !== code);
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* silent */ }
      return next;
    });
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast({ message: 'Đã copy mã', type: 'success' });
    } catch {
      setToast({ message: 'Không copy được, vui lòng ghi lại mã', type: 'error' });
    }
  };

  const handleSubmit = async (formData) => {
    setError('');
    if (!mapCoords.latitude || !mapCoords.longitude) {
      throw new Error('Vui lòng chọn vị trí trên bản đồ');
    }
    setSubmitting(true);
    try {
      const res = await proposalService.createGuest({
        latitude: mapCoords.latitude,
        longitude: mapCoords.longitude,
        ...formData,
        captcha_token: getCaptchaToken(),
        website
      });
      if (res.success) {
        setResult(res.data);
        saveCode(res.data);
        setToast({ message: 'Gửi đề xuất thành công! Hãy lưu lại mã tra cứu.', type: 'success' });
        resetCaptcha();
      } else {
        throw new Error(res.message || 'Gửi đề xuất thất bại');
      }
    } finally {
      setSubmitting(false);
      resetCaptcha();
    }
  };

  const handleTrack = async (code) => {
    const c = (code !== undefined ? code : trackInput).trim();
    if (!c) return;
    setTrackError('');
    setTrackResult(null);
    setTrackLoading(true);
    try {
      const res = await proposalService.trackByCode(c);
      if (res.success) {
        setTrackResult(res.data);
      } else {
        setTrackError(res.message || 'Không tìm thấy đề xuất');
      }
    } catch {
      setTrackError('Lỗi kết nối server');
    } finally {
      setTrackLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-8">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      <section className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-bold">Đề xuất vị trí trạm sạc</h1>
        <p className="text-base-content/70">Không cần tài khoản. Điền form bên dưới, lưu mã tra cứu để theo dõi trạng thái.</p>
      </section>

      {result ? (
        <section className="card bg-base-100 shadow border border-base-300 p-5 space-y-3">
          <h2 className="font-bold text-lg flex items-center gap-2 text-success">
            <CheckCircle2 size={20} /> Gửi đề xuất thành công!
          </h2>
          <div className="flex items-center justify-between gap-2 bg-base-200 rounded-lg px-3 py-2">
            <span className="text-sm">Mã tra cứu: <strong>{result.tracking_code}</strong></span>
            <button className="btn btn-sm gap-1" onClick={() => copyText(result.tracking_code)}>
              <Copy size={14} /> Copy
            </button>
          </div>
          {result.ma_de_xuat && (
            <div className="flex items-center justify-between gap-2 bg-base-200 rounded-lg px-3 py-2">
              <span className="text-sm">Mã đề xuất: <strong>{result.ma_de_xuat}</strong></span>
              <button className="btn btn-sm gap-1" onClick={() => copyText(result.ma_de_xuat)}>
                <Copy size={14} /> Copy
              </button>
            </div>
          )}
          <p className="text-sm text-warning">Vui lòng ghi lại mã tra cứu. Danh sách này chỉ lưu trên máy/trình duyệt hiện tại.</p>
          <button className="btn btn-primary" onClick={() => { setResult(null); setMapCoords({ latitude: '', longitude: '' }); }}>
            Gửi đề xuất khác
          </button>
        </section>
      ) : (
        <section className="card bg-base-100 shadow border border-base-300 p-5 space-y-4">
          <h2 className="font-bold text-lg">Form đề xuất</h2>
          <div>
            <label className="text-sm font-medium block mb-2">1. Lấy vị trí đề xuất (chọn 1 trong 2 cách)</label>
            <div className="space-y-2">
              <button
                type="button"
                className="btn btn-secondary btn-sm gap-1 w-full sm:w-auto"
                onClick={handleMyLocation}
                disabled={locating}
              >
                <LocateFixed size={14} />
                {locating ? 'Đang lấy vị trí...' : 'Vị trí của tôi'}
              </button>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Hoặc dán link Google Maps..."
                  className="input input-bordered input-sm flex-1"
                  value={mapLink}
                  onChange={(e) => setMapLink(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGoogleMapLink()}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm gap-1"
                  onClick={handleGoogleMapLink}
                  disabled={resolvingLink || !mapLink.trim()}
                >
                  <Link2 size={14} />
                  {resolvingLink ? '...' : 'Lấy tọa độ'}
                </button>
              </div>
            </div>
            {mapCoords.latitude && mapCoords.longitude && (
              <div className="flex items-center gap-1.5 mt-2 px-3 py-2 bg-blue-50 rounded-md text-sm text-base-content/80">
                <MapPin size={14} />
                Vĩ độ: {mapCoords.latitude} | Kinh độ: {mapCoords.longitude}
              </div>
            )}
            {nearbyWarning && <div className="alert alert-warning text-sm mt-2">{nearbyWarning}</div>}
          </div>
          <div>
            <label className="text-sm font-medium block mb-2">2. Nhập thông tin</label>
            {error && <div className="alert alert-error text-sm mb-3">{error}</div>}
            <DynamicForm
              entity="station_proposals"
              formId={PROPOSALS_FORM_ID}
              onSubmit={handleSubmit}
              initialData={{ latitude: mapCoords.latitude, longitude: mapCoords.longitude }}
              guestMode
            />
            <input
              type="text"
              name="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              autoComplete="off"
              tabIndex={-1}
              aria-hidden="true"
              style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0 }}
            />
            {TURNSTILE_SITE_KEY && <div ref={turnstileRef} className="mt-3" />}
            {submitting && <div className="text-sm text-base-content/60 mt-2">Đang gửi...</div>}
          </div>
        </section>
      )}

      <section className="card bg-base-100 shadow border border-base-300 p-5 space-y-3">
        <h2 className="font-bold text-lg">Tra cứu đề xuất</h2>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Nhập mã tra cứu (VD DX-ABC123)"
            className="input input-bordered input-sm flex-1"
            value={trackInput}
            onChange={(e) => setTrackInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleTrack()}
          />
          <button className="btn btn-primary btn-sm gap-1" onClick={() => handleTrack()} disabled={trackLoading}>
            <Search size={14} /> {trackLoading ? 'Đang tra...' : 'Tra cứu'}
          </button>
        </div>
        {trackError && <div className="alert alert-error text-sm">{trackError}</div>}
        {trackResult && (
          <div className="border border-base-300 rounded-lg p-3 space-y-1 text-sm">
            <p>Mã tra cứu: <strong>{trackResult.tracking_code}</strong></p>
            {trackResult.ma_de_xuat && <p>Mã đề xuất: <strong>{trackResult.ma_de_xuat}</strong></p>}
            <p>Trạng thái: <strong>{trackResult.status}</strong></p>
            <p>Chủ mặt bằng: {trackResult.owner_name || ''}</p>
            <p>SĐT: {trackResult.owner_phone || ''}</p>
            <p>Địa chỉ: {trackResult.address || ''}</p>
            {trackResult.description && <p>Mô tả: {trackResult.description}</p>}
          </div>
        )}
      </section>

      {savedCodes.length > 0 && (
        <section className="card bg-base-100 shadow border border-base-300 p-5 space-y-3">
          <h2 className="font-bold text-lg">Đề xuất của bạn (lưu trên máy này)</h2>
          {savedCodes.map(item => (
            <div key={item.tracking_code} className="flex items-center justify-between gap-2 border border-base-300 rounded-lg px-3 py-2 text-sm">
              <button className="link link-primary font-medium" onClick={() => { setTrackInput(item.tracking_code); handleTrack(item.tracking_code); }}>
                {item.tracking_code}
              </button>
              {item.ma_de_xuat && <span className="text-base-content/60">{item.ma_de_xuat}</span>}
              <button className="btn btn-ghost btn-xs gap-1" onClick={() => handleRemoveCode(item.tracking_code)}>
                <Trash2 size={12} /> Xóa
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
};

export default GuestProposalPage;
