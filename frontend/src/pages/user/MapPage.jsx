import { useState, useEffect, useCallback, useMemo } from 'react';
import MapView from '../../components/MapView';
import MapFilterPanel, { EMPTY_MAP_FILTERS } from '../../components/MapFilterPanel';
import { useAuth } from '../../contexts/AuthContext';
import { proposalService, stationService, formService } from '../../services/api';
import DynamicForm from '../../components/dynamic/DynamicForm';
import LocationMapModal, { PREVIEW_STATUS_FILTER } from '../../components/LocationMapModal';
import Toast from '../../components/Toast';
import { MapPin, MapPinned, X } from 'lucide-react';

const MapPage = () => {
  const { token, user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [showStationForm, setShowStationForm] = useState(false);
  const [coords, setCoords] = useState({ lat: 0, lng: 0 });
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [mapKey, setMapKey] = useState(0);
  const [selectingLocation, setSelectingLocation] = useState(false);
  const [highlightPosition, setHighlightPosition] = useState(null);
  const [pendingTarget, setPendingTarget] = useState('proposal');
  const [formCoords, setFormCoords] = useState({ latitude: '', longitude: '' });
  const [showPreview, setShowPreview] = useState(false);
  const [previewSnapshot, setPreviewSnapshot] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [filters, setFilters] = useState({ ...EMPTY_MAP_FILTERS });
  const [quickFormId, setQuickFormId] = useState(null);
  const [quickMode, setQuickMode] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    formService.getQuickCreate('station_proposals', token)
      .then(res => {
        if (cancelled || !res || !res.success) return;
        setQuickFormId(res.data ? res.data.id : null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (toast.message) {
      const timer = setTimeout(() => setToast({ message: '', type: 'success' }), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast.message]);

  const openProposalForm = useCallback((lat, lng, quick = false) => {
    setCoords({ lat, lng });
    setHighlightPosition([lat, lng]);
    setError('');
    setFormCoords({ latitude: '', longitude: '' });
    setShowPreview(false);
    setPreviewSnapshot(null);
    setQuickMode(quick);
    setShowForm(true);
    setSelectingLocation(false);
  }, []);

  const closeProposalForm = useCallback(() => {
    setShowForm(false);
    setSelectingLocation(false);
    setShowPreview(false);
    setPreviewSnapshot(null);
  }, []);

  const proposalInitialData = useMemo(() => ({
    latitude: coords.lat,
    longitude: coords.lng
  }), [coords.lat, coords.lng]);
  const stationInitialData = useMemo(() => ({
    latitude: coords.lat,
    longitude: coords.lng
  }), [coords.lat, coords.lng]);

  const effProposalCoords = (formCoords.latitude !== '' && formCoords.latitude != null)
    ? formCoords
    : { latitude: coords.lat, longitude: coords.lng };

  const parsePreviewCoords = (c) => {
    const lat = parseFloat(c.latitude);
    const lng = parseFloat(c.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { latitude: lat, longitude: lng };
  };

  const validPreviewCoords = parsePreviewCoords({
    latitude: effProposalCoords.latitude ?? '',
    longitude: effProposalCoords.longitude ?? ''
  });

  const openPreview = () => {
    if (!validPreviewCoords) return;
    setPreviewSnapshot(validPreviewCoords);
    setShowPreview(true);
  };

  const openStationForm = useCallback((lat, lng) => {
    setCoords({ lat, lng });
    setHighlightPosition([lat, lng]);
    setShowStationForm(true);
    setSelectingLocation(false);
  }, []);

  useEffect(() => {
    if (!showForm) return;
  }, [showForm]);

  const handleLocationSelected = useCallback((lat, lng, mode, target) => {
    if (mode === 'select') {
      setPendingTarget(target === 'station' ? 'station' : (target === 'proposal_quick' ? 'proposal_quick' : 'proposal'));
      setSelectingLocation(true);
      setToast({ message: isMobile ? 'Kéo marker đến vị trí cần chọn, sau đó ấn Xác nhận' : 'Click trên bản đồ để chọn vị trí', type: 'info' });
      return;
    }
    if (lat !== null && lng !== null) {
      if (target === 'station') openStationForm(lat, lng);
      else openProposalForm(lat, lng, target === 'proposal_quick');
    }
  }, [isMobile, openProposalForm, openStationForm]);

  const handleMapSelectClick = useCallback((lat, lng) => {
    setHighlightPosition([lat, lng]);
  }, []);

  const handleConfirmPosition = useCallback(() => {
    if (!highlightPosition) return;
    if (pendingTarget === 'station') openStationForm(highlightPosition[0], highlightPosition[1]);
    else openProposalForm(highlightPosition[0], highlightPosition[1], pendingTarget === 'proposal_quick');
  }, [highlightPosition, pendingTarget, openProposalForm, openStationForm]);

  const handleSubmit = async (formData) => {
    setError('');
    try {
      const res = await proposalService.create({
        latitude: coords.lat,
        longitude: coords.lng,
        ...formData
      }, token, quickMode && quickFormId ? quickFormId : undefined);

      if (res.success) {
        setShowForm(false);
        setToast({ message: 'Tạo đề xuất thành công! Marker mới xuất hiện trên bản đồ.', type: 'success' });
        setMapKey(prev => prev + 1);
        setHighlightPosition(null);
      } else {
        setError(res.message || 'Tạo đề xuất thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const handleStationSubmit = async (formData) => {
    const submitData = { ...formData };
    if (!submitData.name || !submitData.latitude || !submitData.longitude || !submitData.address) {
      throw new Error('Vui lòng nhập đầy đủ thông tin bắt buộc (Tên, Vĩ độ, Kinh độ, Địa chỉ)');
    }
    const res = await stationService.create(submitData, token);
    if (!res.success) throw new Error(res.message || 'Tạo trạm thất bại');
    setShowStationForm(false);
    setToast({ message: 'Tạo trạm thành công!', type: 'success' });
    setMapKey(prev => prev + 1);
  };

  return (
    <div className="relative h-full">
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: '', type: 'success' })}
        duration={3000}
      />

      <MapView
        selectingLocation={selectingLocation}
        onLocationSelected={handleLocationSelected}
        onMapSelectClick={handleMapSelectClick}
        highlightPosition={highlightPosition}
        refreshKey={mapKey}
        user={user}
        filters={filters}
      />

      <MapFilterPanel filters={filters} onChange={setFilters} isMobile={isMobile} />

      {selectingLocation && highlightPosition && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1001] bg-white rounded-xl shadow-lg border border-base-300 px-4 py-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 max-w-[calc(100vw-1.5rem)]">
          <span className="flex items-center gap-1.5 text-sm text-base-content/70">
            <MapPin size={14} />
            {highlightPosition[0].toFixed(6)}, {highlightPosition[1].toFixed(6)}
          </span>
          <div className="flex gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => { setSelectingLocation(false); setHighlightPosition(null); }}>Hủy</button>
            <button className="btn btn-primary btn-sm" onClick={handleConfirmPosition}>Xác nhận</button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={closeProposalForm}>
          <div className="legacy-modal legacy-modal-lg popup-detail" onClick={(e) => e.stopPropagation()}>
            <div className="popup-header">
              <h2>{quickMode ? 'Đề xuất trạm mới (tạo nhanh)' : 'Đề xuất trạm mới'}</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline btn-primary gap-1"
                  onClick={openPreview}
                  disabled={!validPreviewCoords}
                  title={validPreviewCoords ? 'Xem trạm lân cận' : 'Nhập tọa độ hợp lệ để xem trước'}
                >
                  <MapPinned size={14} />
                  Preview lân cận
                </button>
                <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={closeProposalForm} aria-label="Close">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="popup-body">
              <div className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 rounded-md text-sm text-base-content/80 mb-4">
                <MapPin size={14} />
                Tọa độ: {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
              </div>

              {error && <div className="alert alert-error text-sm mb-4">{error}</div>}


              <DynamicForm
                entity="station_proposals"
                purpose="create"
                formId={quickMode && quickFormId ? quickFormId : undefined}
                onSubmit={handleSubmit}
                initialData={proposalInitialData}
                onValuesChange={setFormCoords}
                hideActions
                htmlId="map-proposal-create-form"
              />
            </div>
            <div className="popup-footer">
              <button type="button" className="btn btn-ghost" onClick={closeProposalForm}>Hủy</button>
              <button type="submit" form="map-proposal-create-form" className="btn btn-primary">Lưu</button>
            </div>
          </div>
        </div>
      )}

      {showPreview && previewSnapshot && (
        <LocationMapModal
          open
          lat={previewSnapshot.latitude}
          lng={previewSnapshot.longitude}
          title="Preview vị trí đề xuất"
          statusFilter={PREVIEW_STATUS_FILTER}
          onClose={() => { setShowPreview(false); setPreviewSnapshot(null); }}
        />
      )}

      {showStationForm && (
        <dialog className="modal modal-open map-form-modal">
          <div className="modal-box max-w-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Thêm trạm mới</h3>
              <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={() => setShowStationForm(false)}>
                <X size={18} />
              </button>
            </div>

            <DynamicForm
              entity="stations"
              purpose="create"
              onSubmit={handleStationSubmit}
              initialData={stationInitialData}
            >
              <button type="button" className="btn btn-ghost" onClick={() => setShowStationForm(false)}>Hủy</button>
            </DynamicForm>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setShowStationForm(false)}>close</button>
          </form>
        </dialog>
      )}
    </div>
  );
};

export default MapPage;
