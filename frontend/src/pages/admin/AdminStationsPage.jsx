import { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { stationService, excelService } from '../../services/api';
import DynamicTable from '../../components/dynamic/DynamicTable';
import RecordDetailPopup from '../../components/admin/RecordDetailPopup';
import Loading from '../../components/Loading';
import Toast from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import ErrorMessage from '../../components/ErrorMessage';
import Pagination from '../../components/Pagination';
import useFieldOptions from '../../hooks/useFieldOptions';
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

const STATIONS_VIEW_ID = 6;

const AdminStationsPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { getSelectOptions } = useFieldOptions('stations');
  const statusOptions = getSelectOptions('status');
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState({
    name: '', latitude: '', longitude: '',
    address: '', status: statusOptions[0]?.value || 'ACTIVE', description: ''
  });
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null, name: '' });
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [popup, setPopup] = useState({ open: false, record: null, mode: 'view' });

  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importStep, setImportStep] = useState('upload');

  useEffect(() => {
    const match = location.pathname.match(/\/admin\/stations\/(view|edit)=(\d+)/);
    if (match) {
      const mode = match[1];
      const id = parseInt(match[2]);
      const existing = stations.find(s => s.id === id);
      setPopup({ open: true, record: existing || null, mode });
      if (!existing && id) loadStationById(id, mode);
    } else {
      setPopup({ open: false, record: null, mode: 'view' });
    }
  }, [location.pathname, stations.length]);

  const loadStationById = async (id, mode) => {
    try {
      const res = await stationService.getAllWithParams('');
      if (res.success) {
        const station = res.data.find(s => s.id === id);
        if (station) setPopup({ open: true, record: station, mode });
      }
    } catch { /* silent */ }
  };

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
    setForm({ name: '', latitude: '', longitude: '', address: '', status: 'ACTIVE', description: '' });
    setShowCreateForm(true);
    setError('');
  };

  const handleMapClick = (latlng) => {
    setForm({ ...form, latitude: latlng.lat.toFixed(6), longitude: latlng.lng.toFixed(6) });
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name || !form.latitude || !form.longitude || !form.address) {
      setError('Vui lòng nhập đầy đủ thông tin bắt buộc');
      return;
    }
    try {
      const res = await stationService.create(form, token);
      if (res.success) {
        setToast({ message: 'Tạo trạm thành công', type: 'success' });
        setShowCreateForm(false);
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
    if (!importFile) { setError('Vui lòng chọn file Excel'); return; }
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
    if (!importPreview || importPreview.rows.length === 0) { setError('Không có dữ liệu hợp lệ để import'); return; }
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

  const renderActions = (row) => (
    <div className="action-buttons">
      <button className="btn btn-sm btn-primary" onClick={() => navigate(`/admin/stations/view=${row.id}`)}>Xem</button>
      <button className="btn btn-sm btn-edit" onClick={() => navigate(`/admin/stations/edit=${row.id}`)}>Sửa</button>
      <button className="btn btn-sm btn-delete" onClick={() => handleDeleteClick(row.id, row.name)}>Xóa</button>
    </div>
  );

  if (loading && stations.length === 0) return <Loading message="Đang tải danh sách trạm..." />;

  return (
    <div className="admin-stations-page">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

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
        <input type="text" placeholder="Search theo tên hoặc địa chỉ..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          {statusOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
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
                  <button type="button" className="btn btn-primary" onClick={handlePreviewImport} disabled={!importFile || importLoading}>
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
                  {importPreview.errorRows > 0 && <p className="error-text">Lỗi: <strong>{importPreview.errorRows}</strong></p>}
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setImportStep('upload')}>Quay lại</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowImport(false)}>Hủy</button>
                  <button type="button" className="btn btn-primary" onClick={handleConfirmImport} disabled={importPreview.rows.length === 0 || importLoading}>
                    {importLoading ? 'Đang import...' : `Import ${importPreview.validRows} trạm`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showCreateForm && (
        <div className="modal-overlay" onClick={() => setShowCreateForm(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <h2>Thêm trạm mới</h2>
            <form onSubmit={handleCreateSubmit}>
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
                <MapContainer center={[10.762622, 106.660172]} zoom={13} style={{ height: '250px', width: '100%' }}>
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
                  {statusOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.value} - {opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Mô tả</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows="3" />
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateForm(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">Tạo mới</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {popup.open && (
        <RecordDetailPopup
          entity="stations"
          record={popup.record}
          recordId={popup.record ? undefined : parseInt(location.pathname.match(/=(\d+)/)?.[1])}
          viewId={STATIONS_VIEW_ID}
          mode={popup.mode}
          onClose={() => navigate('/admin/stations')}
          onSaved={() => { loadStations(pagination.page); navigate('/admin/stations'); }}
          onSwitchMode={(newMode) => {
            const id = location.pathname.match(/=(\d+)/)?.[1];
            navigate(`/admin/stations/${newMode}=${id}`, { replace: true });
          }}
        />
      )}

      <DynamicTable
        entity="stations"
        viewId={STATIONS_VIEW_ID}
        data={stations}
        actions={renderActions}
      />

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
