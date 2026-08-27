import { useState } from 'react';
import MapView from '../../components/MapView';
import { useAuth } from '../../contexts/AuthContext';
import { proposalService } from '../../services/api';

const MapPage = () => {
  const { token } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [coords, setCoords] = useState({ lat: 0, lng: 0 });
  const [form, setForm] = useState({
    owner_name: '', owner_phone: '', address: '',
    area: '', land_type: '', description: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [mapKey, setMapKey] = useState(0);

  const handleMapClick = (lat, lng) => {
    setCoords({ lat, lng });
    setForm({ owner_name: '', owner_phone: '', address: '', area: '', land_type: '', description: '' });
    setError('');
    setSuccess('');
    setShowForm(true);
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
        setSuccess('Tạo đề xuất thành công!');
        setShowForm(false);
        setMapKey(prev => prev + 1);
      } else {
        setError(res.message || 'Tạo đề xuất thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  return (
    <div className="map-page">
      <div className="map-container">
        <MapView key={mapKey} onMapClick={handleMapClick} />
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Đề xuất trạm mới</h2>
            {success && <div className="success-message">{success}</div>}
            {error && <div className="error-message">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Vĩ độ (Latitude)</label>
                  <input type="text" value={coords.lat.toFixed(6)} readOnly className="readonly" />
                </div>
                <div className="form-group">
                  <label>Kinh độ (Longitude)</label>
                  <input type="text" value={coords.lng.toFixed(6)} readOnly className="readonly" />
                </div>
              </div>
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
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Hủy</button>
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
