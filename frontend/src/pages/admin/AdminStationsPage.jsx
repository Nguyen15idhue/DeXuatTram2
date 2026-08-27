import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { stationService } from '../../services/api';

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

  const loadStations = async () => {
    try {
      setLoading(true);
      const res = await stationService.getAll();
      if (res.success) setStations(res.data);
    } catch {
      setError('Lỗi tải danh sách trạm');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStations(); }, []);

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
        loadStations();
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
        loadStations();
      } else {
        setError(res.message || 'Xóa thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  if (loading) return <div className="loading">Đang tải...</div>;

  return (
    <div className="admin-stations-page">
      <div className="page-header">
        <h1>Quản lý Trạm</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ Thêm trạm</button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingId ? 'Sửa trạm' : 'Thêm trạm mới'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Tên trạm *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Latitude *</label>
                  <input type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Longitude *</label>
                  <input type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} />
                </div>
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
    </div>
  );
};

export default AdminStationsPage;
