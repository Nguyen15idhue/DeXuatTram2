import { useState, useEffect } from 'react';
import MapView from '../../components/MapView';
import { useAuth } from '../../contexts/AuthContext';
import { proposalService } from '../../services/api';
import DynamicForm from '../../components/dynamic/DynamicForm';
import Toast from '../../components/Toast';

const PROPOSALS_FORM_ID = 9;

const MapPage = () => {
  const { token } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [coords, setCoords] = useState({ lat: 0, lng: 0 });
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [mapKey, setMapKey] = useState(0);
  const [selectingLocation, setSelectingLocation] = useState(false);
  const [highlightPosition, setHighlightPosition] = useState(null);

  useEffect(() => {
    if (toast.message) {
      const timer = setTimeout(() => setToast({ message: '', type: 'success' }), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast.message]);

  const openProposalForm = (lat, lng) => {
    setCoords({ lat, lng });
    setHighlightPosition([lat, lng]);
    setError('');
    setShowForm(true);
    setSelectingLocation(false);
  };

  const handleMapClick = (lat, lng, mode) => {
    if (mode === 'select') {
      setSelectingLocation(true);
      setToast({ message: 'Di chuyển bản đồ đến vị trí cần chọn, sau đó click để xác nhận', type: 'info' });
      return;
    }

    if (selectingLocation && lat !== null) {
      openProposalForm(lat, lng);
      return;
    }

    if (lat !== null && lng !== null) {
      openProposalForm(lat, lng);
    }
  };

  const handleLocationSelected = (lat, lng) => {
    openProposalForm(lat, lng);
  };

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
    <div className="map-page">
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: '', type: 'success' })}
        duration={3000}
      />

      <MapView
        key={mapKey}
        onMapClick={handleMapClick}
        selectingLocation={selectingLocation}
        onLocationSelected={handleLocationSelected}
        highlightPosition={highlightPosition}
        refreshKey={mapKey}
      />

      {showForm && (
        <div className="modal-overlay" onClick={() => { setShowForm(false); setSelectingLocation(false); }}>
          <div className="modal modal-lg popup-detail" onClick={(e) => e.stopPropagation()}>
            <div className="popup-header">
              <h2>Đề xuất trạm mới</h2>
              <button className="btn btn-sm btn-secondary" onClick={() => { setShowForm(false); setSelectingLocation(false); }}>✕ Đóng</button>
            </div>

            <div className="popup-body">
              <div className="popup-section">
                <div style={{ padding: '8px 12px', background: '#f0f7ff', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
                  📍 Tọa độ: {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                </div>
              </div>

              {error && <div className="error-message">{error}</div>}

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
