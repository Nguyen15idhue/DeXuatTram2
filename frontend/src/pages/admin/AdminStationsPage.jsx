import { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useAuth } from '../../contexts/AuthContext';
import { stationService } from '../../services/api';
import 'leaflet/dist/leaflet.css';

const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

function MapClickHandler({ onMapClick }) {
  useMapEvents({ click(e) { onMapClick(e.latlng); } });
  return null;
}

const AdminStationsPage = () => {
  const { token } = useAuth();
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: '', latitude: '', longitude: '',
    address: '', status: 'ACTIVE', description: ''
  });

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

  const loadStations = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page, limit: 10 });
      if (search) params.append('search', search);
      if (filterStatus) params.append('status', filterStatus);
      const res = await stationService.getAllWithParams(params.toString());
      if (res.success) {
        setStations(res.data);
        setPagination(res.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
      }
    } catch {
      setError('Lỗi tải danh sách trạm');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus]);

  useEffect(() => { loadStations(1); }, [loadStations]);

  const handleSearch = () => { loadStations(1); };

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: '', latitude: '', longitude: '', address: '', status: 'ACTIVE', description: '' });
    setShowForm(true);
    setError('');
    setSuccess('');
  };

  const openEdit = (station) => {
    setEditingId(station.id);
    setForm({
      name: station.name,
      latitude: station.latitude,
      longitude: station.longitude,
      address: station.address,
      status: station.status,
      description: station.description || ''
    });
    setShowForm(true);
    setError('');
    setSuccess('');
  };

  const handleMapClick = (latlng) => {
    setForm({ ...form, latitude: latlng.lat.toFixed(6), longitude: latlng.lng.toFixed(6) });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!form.name || !form.latitude || !form.longitude || !form.address) {
      setError('Vui lòng nhập đầy đủ thông tin bắt buộc');
      return;
    }

    try {
      let res;
      if (editingId) {
        res = await stationService.update(editingId, form, token);
      } else {
        res = await stationService.create(form, token);
      }

      if (res.success) {
        setSuccess(editingId ? 'Cập nhật thành công' : 'Tạo trạm thành công');
        setShowForm(false);
        loadStations(pagination.page);
      } else {
        setError(res.message || 'Thao tác thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Xóa trạm "${name}"?`)) return;

    try {
      const res = await stationService.delete(id, token);
      if (res.success) {
        setSuccess('Xóa trạm thành công');
        loadStations(pagination.page);
      } else {
        setError(res.message || 'Xóa thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  if (loading && stations.length === 0) return <div className="loading">Đang tải...</div>;

  return (
    <div className="admin-stations-page">
      <div className="page-header">
        <h1>Quản lý Trạm</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ Thêm trạm</button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search theo tên hoặc địa chỉ..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="DEPLOYING">DEPLOYING</option>
        </select>
        <button className="btn btn-primary" onClick={handleSearch}>Tìm</button>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <h2>{editingId ? 'Sửa trạm' : 'Thêm trạm mới'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Tên trạm *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Latitude *</label>
                  <input type="text" readOnly value={form.latitude} placeholder="Click trên bản đồ" />
                </div>
                <div className="form-group">
                  <label>Longitude *</label>
                  <input type="text" readOnly value={form.longitude} placeholder="Click trên bản đồ" />
                </div>
              </div>
              <div className="map-picker">
                <label>Chọn vị trí trên bản đồ</label>
                <MapContainer
                  center={[10.762622, 106.660172]}
                  zoom={13}
                  style={{ height: '250px', width: '100%' }}
                >
                  <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                  <MapClickHandler onMapClick={handleMapClick} />
                  {form.latitude && form.longitude && (
                    <Marker position={[parseFloat(form.latitude), parseFloat(form.longitude)]} icon={markerIcon} />
                  )}
                </MapContainer>
              </div>
              <div className="form-group">
                <label>Địa chỉ *</label>
                <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Trạng thái</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="ACTIVE">ACTIVE - Đang hoạt động</option>
                  <option value="DEPLOYING">DEPLOYING - Đang triển khai</option>
                </select>
              </div>
              <div className="form-group">
                <label>Mô tả</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows="3" />
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">{editingId ? 'Cập nhật' : 'Tạo mới'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Tên trạm</th>
              <th>Địa chỉ</th>
              <th>Vĩ độ</th>
              <th>Kinh độ</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {stations.length === 0 ? (
              <tr><td colSpan="7" className="empty">Không có trạm nào</td></tr>
            ) : stations.map((s) => (
              <tr key={s.id}>
                <td>{s.id}</td>
                <td>{s.name}</td>
                <td>{s.address}</td>
                <td>{Number(s.latitude).toFixed(4)}</td>
                <td>{Number(s.longitude).toFixed(4)}</td>
                <td>
                  <span className={`badge badge-${s.status.toLowerCase()}`}>{s.status}</span>
                </td>
                <td>
                  <button className="btn btn-sm btn-edit" onClick={() => openEdit(s)}>Sửa</button>
                  <button className="btn btn-sm btn-delete" onClick={() => handleDelete(s.id, s.name)}>Xóa</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button disabled={pagination.page <= 1} onClick={() => loadStations(pagination.page - 1)}>Trước</button>
        <span>Trang {pagination.page} / {pagination.totalPages} (Tổng: {pagination.total})</span>
        <button disabled={pagination.page >= pagination.totalPages} onClick={() => loadStations(pagination.page + 1)}>Sau</button>
      </div>
    </div>
  );
};

export default AdminStationsPage;
