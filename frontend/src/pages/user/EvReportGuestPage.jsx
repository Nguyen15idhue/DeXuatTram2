import { useState, useEffect, useRef, useMemo } from 'react';
import { evReportService, api } from '../../services/api';
import { parseGoogleMapsLink, resolveGoogleMapsShortUrl } from '../../utils/mapHelpers';
import { VIETNAM_CENTER } from '../../utils/provinceData';
import DynamicForm from '../../components/dynamic/DynamicForm';
import MapCanvas from '../../components/map/MapCanvas';
import useMapConfig from '../../hooks/useMapConfig';
import Toast from '../../components/Toast';
import { MapPin, LocateFixed, Link2, Search, CheckCircle2, PlusCircle } from 'lucide-react';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

const EvReportGuestPage = () => {
  const [locMode, setLocMode] = useState('gps');
  const [mapCoords, setMapCoords] = useState({ latitude: '', longitude: '' });
  const [locating, setLocating] = useState(false);
  const [mapLink, setMapLink] = useState('');
  const [resolvingLink, setResolvingLink] = useState(false);
  const [searching, setSearching] = useState(false);
  const [flyTo, setFlyTo] = useState(null);
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [done, setDone] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const [formValues, setFormValues] = useState({});
  const [geoFill, setGeoFill] = useState({});
  const turnstileRef = useRef(null);
  const turnstileWidget = useRef(null);
  const mapCfg = useMapConfig();

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || document.getElementById('turnstile-script')) return;
    const s = document.createElement('script');
    s.id = 'turnstile-script';
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true;
    s.defer = true;
    s.onload = () => {
      try {
        if (window.turnstile && turnstileRef.current && turnstileWidget.current == null) {
          turnstileWidget.current = window.turnstile.render(turnstileRef.current, { sitekey: TURNSTILE_SITE_KEY });
        }
      } catch { /* silent */ }
    };
    document.body.appendChild(s);
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

  const applyCoords = (lat, lng) => {
    setMapCoords({ latitude: Number(lat).toFixed(6), longitude: Number(lng).toFixed(6) });
    setFlyTo([Number(lat), Number(lng)]);
  };

  const reverseFillAddress = async (lat, lng) => {
    try {
      const res = await api.post('/geocode/reverse', { lat: Number(lat), lng: Number(lng) });
      const data = res && res.data;
      if (!data || !data.found) return;
      const admin = data.admin || {};
      const next = {};
      if (data.address) next.address = data.address;
      if (admin.province) next.province = admin.province;
      if (admin.xa_phuong) next.ward = admin.xa_phuong;
      if (Object.keys(next).length > 0) {
        setGeoFill(next);
        setToast({ message: 'Đã tự động điền Tỉnh/Xã/địa chỉ theo định vị. Bạn có thể sửa lại trong form.', type: 'success' });
      }
    } catch { /* silent: giữ tọa độ, người dùng nhập tay */ }
  };

  const handleMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Trình duyệt không hỗ trợ định vị');
      return;
    }
    setError('');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        applyCoords(position.coords.latitude, position.coords.longitude);
        setLocating(false);
        reverseFillAddress(position.coords.latitude, position.coords.longitude);
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
        applyCoords(coords.lat, coords.lng);
        setMapLink('');
        reverseFillAddress(coords.lat, coords.lng);
      } else {
        setError('Không đọc được tọa độ từ link Google Maps');
      }
    } catch {
      setError('Không đọc được tọa độ từ link Google Maps');
    } finally {
      setResolvingLink(false);
    }
  };

  const handleFindOnMap = async () => {
    const parts = [formValues.address, formValues.ward, formValues.province].filter((v) => v && String(v).trim() !== '');
    if (parts.length === 0) {
      setError('Vui lòng nhập Tỉnh/Xã/địa chỉ trong form trước khi tìm');
      return;
    }
    setError('');
    setSearching(true);
    try {
      const res = await api.post('/geocode/search', { text: `${parts.join(', ')}, Việt Nam`, limit: 1 });
      const item = res && res.data && res.data.results && res.data.results[0];
      const lat = item ? parseFloat(item.lat) : NaN;
      const lng = item ? parseFloat(item.lon) : NaN;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        applyCoords(lat, lng);
        setToast({ message: `Đã tự động chọn vị trí: ${item.formatted || item.name || ''}. Bạn có thể bấm trực tiếp lên bản đồ để chỉnh ghim.`, type: 'success' });
      } else {
        setError('Không tìm thấy vị trí cho địa chỉ đã nhập, vui lòng bấm trực tiếp lên bản đồ để ghim');
      }
    } catch {
      setError('Lỗi kết nối server khi tìm địa chỉ');
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = async (formData) => {
    setError('');
    if (!mapCoords.latitude || !mapCoords.longitude) {
      throw new Error('Vui lòng chọn vị trí sạc trên bản đồ');
    }
    setSubmitting(true);
    try {
      const res = await evReportService.createGuest({
        latitude: mapCoords.latitude,
        longitude: mapCoords.longitude,
        ...formData,
        captcha_token: getCaptchaToken(),
        website
      });
      if (res.success) {
        setDone(res.data);
        const warns = res.warnings || [];
        setToast({
          message: warns.length > 0 ? `Gửi thành công! Lưu ý: ${warns.join('; ')}` : 'Gửi thông tin thành công! Cảm ơn bạn đã chia sẻ.',
          type: warns.length > 0 ? 'warning' : 'success'
        });
        resetCaptcha();
      } else {
        throw new Error(res.message || 'Gửi thông tin thất bại');
      }
    } finally {
      setSubmitting(false);
      resetCaptcha();
    }
  };

  const handleSendAnother = () => {
    setDone(null);
    setMapCoords({ latitude: '', longitude: '' });
    setFlyTo(null);
    setGeoFill({});
    setError('');
    setFormKey((k) => k + 1);
  };

  const switchMode = (mode) => {
    setLocMode(mode);
    setGeoFill({});
    setFormKey((k) => k + 1);
  };

  const guestInitialData = useMemo(
    () => ({ ...(locMode !== 'manual' ? geoFill : {}) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geoFill, formKey, locMode]
  );

  const center = mapCoords.latitude && mapCoords.longitude
    ? [Number(mapCoords.latitude), Number(mapCoords.longitude)]
    : [VIETNAM_CENTER.lat, VIETNAM_CENTER.lng];

  const gpsControls = (
    <div className="space-y-2">
      <button
        type="button"
        className="btn btn-secondary btn-sm gap-1 w-full sm:w-auto"
        onClick={handleMyLocation}
        disabled={locating}
      >
        <LocateFixed size={14} />
        {locating ? 'Đang lấy vị trí...' : 'Lấy vị trí của tôi'}
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
  );

  const manualControls = (
    <div className="space-y-2">
      <p className="text-sm text-base-content/70">Chọn Tỉnh/Xã và nhập địa chỉ chi tiết trong form bên trên, rồi bấm tìm — hệ thống sẽ tự ghim vị trí, bạn có thể bấm lên bản đồ để chỉnh lại.</p>
      <button
        type="button"
        className="btn btn-secondary btn-sm gap-1 w-full sm:w-auto"
        onClick={handleFindOnMap}
        disabled={searching}
      >
        <Search size={14} />
        {searching ? 'Đang tìm...' : 'Tìm vị trí trên bản đồ'}
      </button>
    </div>
  );

  const coordsChip = mapCoords.latitude && mapCoords.longitude && (
    <div className="flex items-center gap-1.5 mt-2 px-3 py-2 bg-blue-50 rounded-md text-sm text-base-content/80">
      <MapPin size={14} />
      Vĩ độ: {mapCoords.latitude} | Kinh độ: {mapCoords.longitude}
    </div>
  );

  const mapBlock = (
    <>
      {coordsChip}
      <div className="mt-2 rounded-lg overflow-hidden border border-base-300" style={{ height: 300 }}>
        <MapCanvas
          renderer={mapCfg.renderer}
          center={center}
          zoom={mapCoords.latitude ? 15 : 6}
          tile={{ url: mapCfg.tileUrl, attribution: mapCfg.attribution, subdomains: mapCfg.subdomains }}
          vectorStyle={mapCfg.vectorStyle}
          apiKey={mapCfg.apiKey}
          stations={[]}
          proposals={[]}
          showCluster={false}
          showStationLabels={false}
          showProvinceLabels={false}
          showBoundaries={false}
          provincePoints={[]}
          selectingLocation
          onMapSelectClick={(lat, lng) => applyCoords(lat, lng)}
          selectedPosition={mapCoords.latitude && mapCoords.longitude ? [Number(mapCoords.latitude), Number(mapCoords.longitude)] : null}
          locationPoint
          flyToPosition={flyTo}
        />
      </div>
      <p className="text-xs text-base-content/60 mt-1">Bấm trực tiếp lên bản đồ để di chuyển ghim tới đúng vị trí sạc.</p>
    </>
  );

  const saveButton = (
    <button
      type="submit"
      form="evr-guest-form"
      className="btn btn-primary w-full mt-4"
      disabled={submitting}
    >
      {submitting ? 'Đang gửi...' : 'Lưu thông tin'}
    </button>
  );

  const guestForm = (formPurpose, withSave = true) => (
    <div>
      {error && <div className="alert alert-error text-sm mb-3">{error}</div>}
      <DynamicForm
        key={`${formKey}-${locMode}`}
        entity="ev_charging_reports"
        purpose={formPurpose}
        onSubmit={handleSubmit}
        onValuesChange={(patch) => setFormValues((prev) => ({ ...prev, ...patch }))}
        initialData={guestInitialData}
        guestMode
        hideActions
        htmlId="evr-guest-form"
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
      {withSave && saveButton}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-8">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      <section className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-bold">Chia sẻ điểm sạc xe điện</h1>
        <p className="text-base-content/70">Không cần tài khoản. Cho chúng tôi biết bạn thường sạc xe ở đâu để mở thêm trạm sạc gần bạn.</p>
      </section>

      {done ? (
        <section className="card bg-base-100 shadow border border-base-300 p-5 space-y-3">
          <h2 className="font-bold text-lg flex items-center gap-2 text-success">
            <CheckCircle2 size={20} /> Cảm ơn bạn đã chia sẻ!
          </h2>
          <div className="bg-base-200 rounded-lg px-3 py-2 text-sm space-y-1">
            <div>Hãng xe: <strong>{done.hang_xe || '—'}</strong></div>
            <div>Địa chỉ: <strong>{done.address || done.province || '—'}</strong></div>
          </div>
          <p className="text-sm text-base-content/70">Thông tin của bạn sẽ giúp chúng tôi chọn vị trí mở trạm sạc mới. Bạn có thể gửi thêm nhiều vị trí khác.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary gap-1" onClick={handleSendAnother}>
              <PlusCircle size={16} /> Gửi thêm vị trí khác
            </button>
            <a className="btn btn-ghost" href="/">Về trang chủ</a>
          </div>
        </section>
      ) : (
        <section className="card bg-base-100 shadow border border-base-300 p-5 space-y-4">
          <h2 className="font-bold text-lg">Form chia sẻ</h2>
          <div>
            <label className="text-sm font-medium block mb-2">1. Vị trí thường xuyên sạc (chọn 1 trong 2 cách)</label>
            <div className="map-filter-seg mb-3">
              <button
                type="button"
                className={locMode !== 'manual' ? 'active' : ''}
                onClick={() => switchMode('gps')}
              >
                Vị trí hiện tại
              </button>
              <button
                type="button"
                className={locMode === 'manual' ? 'active' : ''}
                onClick={() => switchMode('manual')}
              >
                Nhập địa chỉ
              </button>
            </div>
            {locMode !== 'manual' ? (
              <>
                {gpsControls}
                {mapBlock}
                <div className="mt-2">
                  <p className="text-sm text-base-content/70 mb-2">Địa chỉ bên dưới tự điền từ vị trí đã lấy — bạn chỉ cần bổ sung họ tên, SĐT và hãng xe.</p>
                </div>
                {guestForm('create')}
              </>
            ) : (
              <>
                {guestForm('all', false)}
                <div className="mt-4">
                  <label className="text-sm font-medium block mb-2">2. Vị trí thường xuyên sạc trên bản đồ</label>
                </div>
                {manualControls}
                {mapBlock}
                {saveButton}
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

export default EvReportGuestPage;
