import { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useAuth } from '../../contexts/AuthContext';
import { stationService, excelService } from '../../services/api';
import Loading from '../../components/Loading';
import Toast from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import ErrorMessage from '../../components/ErrorMessage';
import Pagination from '../../components/Pagination';
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
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: '', latitude: '', longitude: '',
    address: '', status: 'ACTIVE', description: ''
  });
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null, name: '' });

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importStep, setImportStep] = useState('upload');

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
    setToast({ message: '', type: 'success' });
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
    setToast({ message: '', type: 'success' });
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
        setToast({ message: editingId ? 'Cập nhật thành công' : 'Tạo trạm thành công', type: 'success' });
        setShowForm(false);
        loadStations(pagination.page);
      } else {
        setError(res.message || 'Thao tác thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const handleDeleteClick = (id, name) => {
    setConfirmDelete({ isOpen: true, id, name });
  };

  const handleConfirmDelete = async () => {
    const { id } = confirmDelete;
    setConfirmDelete({ isOpen: false, id: null, name: '' });
    try {
      const res = await stationService.delete(id, token);
      if (res.success) {
        setToast({ message: 'Xóa trạm thành công', type: 'success' });
        loadStations(pagination.page);
      } else {
        setError(res.message || 'Xóa thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const handleExportStations = async () => {
    try {
      await excelService.exportStations(token);
      setToast({ message: 'Export stations thành công', type: 'success' });
    } catch {
      setError('Lỗi export stations');
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await excelService.downloadTemplate(token);
    } catch {
      setError('Lỗi download template');
    }
  };

  const openImport = () => {
    setShowImport(true);
    setImportFile(null);
    setImportPreview(null);
    setImportStep('upload');
    setError('');
    setToast({ message: '', type: 'success' });
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImportFile(file);
      setImportPreview(null);
      setImportStep('upload');
    }
  };

  const handlePreviewImport = async () => {
    if (!importFile) {
      setError('Vui lòng chọn file Excel');
      return;
    }

    try {
      setImportLoading(true);
      setError('');
      const res = await excelService.previewImport(importFile, token);
      if (res.success) {
        setImportPreview(res.data);
        setImportStep('preview');
      } else {
        setError(res.message || 'Lỗi đọc file Excel');
      }
    } catch {
      setError('Lỗi đọc file Excel. Vui lòng kiểm tra lại định dạng file.');
    } finally {
      setImportLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview || importPreview.rows.length === 0) {
      setError('Không có dữ liệu hợp lệ để import');
      return;
    }

    try {
      setImportLoading(true);
      setError('');
      const res = await excelService.confirmImport(importPreview.rows, token);
      if (res.success) {
        setToast({ message: res.message, type: 'success' });
        setShowImport(false);
        loadStations(1);
      } else {
        setError(res.message || 'Lỗi import');
      }
    } catch {
      setError('Lỗi kết nối server');
    } finally {
      setImportLoading(false);
    }
  };

  if (loading && stations.length === 0) return <Loading message="Đang tải danh sách trạm..." />;

  return (
    <div className="admin-stations-page">
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: '', type: 'success' })}
      />

      <div className="page-header">
        <h1>Quản lý Trạm</h1>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={handleDownloadTemplate}>Download Template</button>
          <button className="btn btn-secondary" onClick={handleExportStations}>Export Excel</button>
          <button className="btn btn-secondary" onClick={openImport}>Import Excel</button>
          <button className="btn btn-primary" onClick={openCreate}>+ Thêm trạm</button>
        </div>
      </div>

      {error && <ErrorMessage message={error} onRetry={() => { setError(''); loadStations(1); }} />}

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Xóa trạm"
        message={`Bạn có chắc chắn muốn xóa trạm "${confirmDelete.name}"?`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete({ isOpen: false, id: null, name: '' })}
        confirmText="Xóa"
        type="danger"
      />

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

      {showImport && (
        <div className="modal-overlay" onClick={() => setShowImport(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <h2>Import Stations từ Excel</h2>

            {importStep === 'upload' && (
              <div className="import-upload">
                <div className="form-group">
                  <label>Chọn file Excel (.xlsx)</label>
                  <input type="file" accept=".xlsx,.xls" onChange={handleFileSelect} />
                </div>
                {importFile && (
                  <div className="import-file-info">
                    <p>File: <strong>{importFile.name}</strong></p>
                    <p>Kích thước: {(importFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                )}
                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowImport(false)}>Hủy</button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handlePreviewImport}
                    disabled={!importFile || importLoading}
                  >
                    {importLoading ? 'Đang đọc...' : 'Xem trước'}
                  </button>
                </div>
              </div>
            )}

            {importStep === 'preview' && importPreview && (
              <div className="import-preview">
                <div className="import-summary">
                  <p>Tổng dòng: <strong>{importPreview.totalRows}</strong></p>
                  <p className="success-text">Hợp lệ: <strong>{importPreview.validRows}</strong></p>
                  {importPreview.errorRows > 0 && (
                    <p className="error-text">Lỗi: <strong>{importPreview.errorRows}</strong></p>
                  )}
                </div>

                {importPreview.rows.length > 0 && (
                  <div className="import-table-section">
                    <h3>Dữ liệu hợp lệ ({importPreview.validRows} dòng)</h3>
                    <div className="table-container import-table">
                      <table>
                        <thead>
                          <tr>
                            <th>Dòng</th>
                            <th>Tên trạm</th>
                            <th>Vĩ độ</th>
                            <th>Kinh độ</th>
                            <th>Địa chỉ</th>
                            <th>Trạng thái</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.rows.map((row, idx) => (
                            <tr key={idx}>
                              <td>{row.row}</td>
                              <td>{row.name}</td>
                              <td>{row.latitude}</td>
                              <td>{row.longitude}</td>
                              <td>{row.address}</td>
                              <td><span className={`badge badge-${row.status.toLowerCase()}`}>{row.status}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {importPreview.errors.length > 0 && (
                  <div className="import-errors-section">
                    <h3>Dữ liệu lỗi ({importPreview.errorRows} dòng)</h3>
                    <div className="table-container import-table">
                      <table>
                        <thead>
                          <tr>
                            <th>Dòng</th>
                            <th>Lỗi</th>
                            <th>Dữ liệu</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.errors.map((err, idx) => (
                            <tr key={idx} className="row-error">
                              <td>{err.row}</td>
                              <td>
                                <ul className="error-list">
                                  {err.errors.map((e, i) => (
                                    <li key={i}>{e}</li>
                                  ))}
                                </ul>
                              </td>
                              <td className="error-data">
                                {err.data.name && <span>Tên: {err.data.name}</span>}
                                {err.data.latitude && <span>Lat: {err.data.latitude}</span>}
                                {err.data.longitude && <span>Lng: {err.data.longitude}</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setImportStep('upload')}>Quay lại</button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowImport(false)}
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleConfirmImport}
                    disabled={importPreview.rows.length === 0 || importLoading}
                  >
                    {importLoading ? 'Đang import...' : `Import ${importPreview.validRows} trạm`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
              <th>STT</th>
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
              <tr><td colSpan="7"><EmptyState icon="📍" title="Không có trạm nào" description="Hãy thêm trạm mới để bắt đầu" /></td></tr>
            ) : stations.map((s, idx) => (
              <tr key={s.id}>
                <td>{(pagination.page - 1) * pagination.limit + idx + 1}</td>
                <td>{s.name}</td>
                <td>{s.address}</td>
                <td>{Number(s.latitude).toFixed(4)}</td>
                <td>{Number(s.longitude).toFixed(4)}</td>
                <td>
                  <span className={`badge badge-${s.status.toLowerCase()}`}>{s.status}</span>
                </td>
                <td>
                  <button className="btn btn-sm btn-edit" onClick={() => openEdit(s)}>Sửa</button>
                  <button className="btn btn-sm btn-delete" onClick={() => handleDeleteClick(s.id, s.name)}>Xóa</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={loadStations}
      />
    </div>
  );
};

export default AdminStationsPage;
