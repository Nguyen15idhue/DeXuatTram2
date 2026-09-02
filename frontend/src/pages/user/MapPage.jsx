import { useState, useEffect, useCallback } from 'react';
import MapView from '../../components/MapView';
import { useAuth } from '../../contexts/AuthContext';
import { proposalService } from '../../services/api';
import DynamicForm from '../../components/dynamic/DynamicForm';
import Toast from '../../components/Toast';
import { MapPin, X } from 'lucide-react';

const PROPOSALS_FORM_ID = 9;

const MapPage = () => {
  const { token, user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [coords, setCoords] = useState({ lat: 0, lng: 0 });
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [mapKey, setMapKey] = useState(0);
  const [selectingLocation, setSelectingLocation] = useState(false);
  const [highlightPosition, setHighlightPosition] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

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

  const openProposalForm = useCallback((lat, lng) => {
    setCoords({ lat, lng });
    setHighlightPosition([lat, lng]);
    setError('');
    setShowForm(true);
    setSelectingLocation(false);
  }, []);

  const handleLocationSelected = useCallback((lat, lng, mode) => {
    if (mode === 'select') {
      setSelectingLocation(true);
      setToast({ message: isMobile ? 'Kéo marker đến vị trí cần chọn, sau đó ấn Xác nhận' : 'Click trên bản đồ để chọn vị trí', type: 'info' });
      return;
    }
    if (lat !== null && lng !== null) {
      openProposalForm(lat, lng);
    }
  }, [isMobile, openProposalForm]);

  const handleMapSelectClick = useCallback((lat, lng) => {
    setHighlightPosition([lat, lng]);
  }, []);

  const handleConfirmPosition = useCallback(() => {
    if (highlightPosition) {
      openProposalForm(highlightPosition[0], highlightPosition[1]);
    }
  }, [highlightPosition, openProposalForm]);

  const handleSubmit = async (formData) => {
    setError('');
    try {
      const res = await proposalService.create({
        latitude: coords.lat,
        longitude: coords.lng,
        ...formData
      }, token);

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

  return (
    <div className="relative h-full">
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: '', type: 'success' })}
        duration={3000}
      />

      <MapView
        key={mapKey}
        selectingLocation={selectingLocation}
        onLocationSelected={handleLocationSelected}
        onMapSelectClick={handleMapSelectClick}
        highlightPosition={highlightPosition}
        refreshKey={mapKey}
        user={user}
      />

      {selectingLocation && highlightPosition && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1001] bg-white rounded-xl shadow-lg border border-base-300 px-4 py-3 flex items-center gap-4">
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
        <div className="modal-overlay" onClick={() => { setShowForm(false); setSelectingLocation(false); }}>
          <div className="legacy-modal legacy-modal-lg popup-detail" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold m-0">Đề xuất trạm mới</h2>
              <button className="btn btn-sm btn-secondary" onClick={() => { setShowForm(false); setSelectingLocation(false); }}>
                <X size={14} /> Đóng
              </button>
            </div>

            <div className="popup-body">
              <div className="popup-section">
                <div className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 rounded-md text-sm text-base-content/80 mb-3">
                  <MapPin size={14} />
                  Tọa độ: {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                </div>
              </div>

              {error && <div className="alert alert-error text-sm mb-3">{error}</div>}

              <DynamicForm
                entity="station_proposals"
                formId={PROPOSALS_FORM_ID}
                onSubmit={handleSubmit}
                initialData={{ latitude: coords.lat, longitude: coords.lng }}
              >
                <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setSelectingLocation(false); }}>Hủy</button>
              </DynamicForm>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapPage;
