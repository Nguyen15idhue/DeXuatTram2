import { useState, useEffect } from 'react';
import MapView from '../../components/MapView';
import { useAuth } from '../../contexts/AuthContext';
import { proposalService } from '../../services/api';
import Toast from '../../components/Toast';
import ErrorMessage from '../../components/ErrorMessage';

const MapPage = () => {
  const { token } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [coords, setCoords] = useState({ lat: 0, lng: 0 });
  const [form, setForm] = useState({
    owner_name: '', owner_phone: '', address: '',
    area: '', land_type: '', description: ''
  });
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
    setForm({ owner_name: '', owner_phone: '', address: '', area: '', land_type: '', description: '' });
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.owner_name || !form.owner_phone || !form.address) {
      setError('Vui lòng nhập đầy đủ thông tin bắt buộc');
      return;
    }

    try {
      const res = await proposalService.create({
        latitude: coords.lat,
        longitude: coords.lng,
        ...form
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
      <div className="map-top-bar">
        <button
          className="btn btn-primary btn-my-location"
          onClick={() => {
            if (!navigator.geolocation) {
              alert('Trình duyệt không hỗ trợ định vị');
              return;
            }
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                setHighlightPosition([pos.coords.latitude, pos.coords.longitude]);
                openProposalForm(pos.coords.latitude, pos.coords.longitude);
              },
              (err) => {
                let msg = 'Không thể lấy vị trí';
                if (err.code === 1) msg = 'Bạn đã từ chối quyền truy cập vị trí';
                alert(msg);
              },
              { enableHighAccuracy: true, timeout: 10000 }
            );
          }}
        >
          📍 Vị trí của tôi
        </button>
        {selectingLocation && (
          <span className="map-selecting-hint">Click trên bản đồ để chọn vị trí</span>
        )}
      </div>

      <div className="map-container">
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
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => { setShowForm(false); setSelectingLocation(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Đề xuất trạm mới</h2>
            <div className="form-coords-info">
              <span>📍 Tọa độ: {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}</span>
            </div>
            {error && <ErrorMessage message={error} />}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Họ tên chủ mặt bằng *</label>
                <input type="text" value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Số điện thoại *</label>
                <input type="text" value={form.owner_phone} onChange={(e) => setForm({ ...form, owner_phone: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Địa chỉ *</label>
                <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Diện tích</label>
                  <input type="text" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="VD: 50m2" />
                </div>
                <div className="form-group">
                  <label>Loại mặt bằng</label>
                  <input type="text" value={form.land_type} onChange={(e) => setForm({ ...form, land_type: e.target.value })} placeholder="VD: Nhà riêng" />
                </div>
              </div>
              <div className="form-group">
                <label>Ghi chú</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows="3" />
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setSelectingLocation(false); }}>Hủy</button>
                <button type="submit" className="btn btn-primary">Gửi đề xuất</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapPage;
