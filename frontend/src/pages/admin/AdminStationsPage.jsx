import { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { stationService, excelService } from '../../services/api';
import DynamicTable from '../../components/dynamic/DynamicTable';
import DynamicForm from '../../components/dynamic/DynamicForm';
import RecordDetailPopup from '../../components/admin/RecordDetailPopup';
import Toast from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import ErrorMessage from '../../components/ErrorMessage';
import Pagination from '../../components/Pagination';
import useFieldOptions from '../../hooks/useFieldOptions';
import 'leaflet/dist/leaflet.css';
import { Zap, Download, Upload, Plus, Search, X, MapPin } from 'lucide-react';

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
const STATIONS_FORM_ID = 7;

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
  const [mapCoords, setMapCoords] = useState({ latitude: '', longitude: '' });
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
    setMapCoords({ latitude: '', longitude: '' });
    setShowCreateForm(true);
    setError('');
  };

  const handleMapClick = (latlng) => {
    setMapCoords({ latitude: latlng.lat.toFixed(6), longitude: latlng.lng.toFixed(6) });
  };

  const handleCreateSubmit = async (formData) => {
    const submitData = {
      ...formData,
      latitude: mapCoords.latitude || formData.latitude || '',
      longitude: mapCoords.longitude || formData.longitude || ''
    };
    if (!submitData.name || !submitData.latitude || !submitData.longitude || !submitData.address) {
      throw new Error('Vui lòng nhập đầy đủ thông tin bắt buộc (Tên, Vĩ độ, Kinh độ, Địa chỉ)');
    }
    const res = await stationService.create(submitData, token);
    if (res.success) {
      setToast({ message: 'Tạo trạm thành công', type: 'success' });
      setShowCreateForm(false);
      loadStations(pagination.page);
    } else {
      throw new Error(res.message || 'Thao tác thất bại');
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
      await excelService.exportData('stations', token);
      setToast({ message: 'Export stations thành công', type: 'success' });
    } catch {
      setError('Lỗi export stations');
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await excelService.downloadTemplate('stations', token);
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
      const res = await excelService.previewImport('stations', importFile, token);
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
      const res = await excelService.confirmImport('stations', importPreview.rows, token);
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
    <div className="flex gap-1">
      <button className="btn btn-sm btn-primary" onClick={() => navigate(`/admin/stations/view=${row.id}`)}>Xem</button>
      <button className="btn btn-sm btn-warning" onClick={() => navigate(`/admin/stations/edit=${row.id}`)}>Sửa</button>
      <button className="btn btn-sm btn-error" onClick={() => handleDeleteClick(row.id, row.name)}>Xóa</button>
    </div>
  );

  return (
    <div className="p-4 md:p-6">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Zap size={22} /> Quản lý Trạm
        </h1>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary btn-sm gap-1" onClick={handleDownloadTemplate}>
            <Download size={14} /> Template
          </button>
          <button className="btn btn-secondary btn-sm gap-1" onClick={handleExportStations}>
            <Download size={14} /> Export Excel
          </button>
          <button className="btn btn-secondary btn-sm gap-1" onClick={openImport}>
            <Upload size={14} /> Import Excel
          </button>
          <button className="btn btn-primary btn-sm gap-1" onClick={openCreate}>
            <Plus size={14} /> Thêm trạm
          </button>
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

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          type="text"
          placeholder="Search theo tên hoặc địa chỉ..."
          className="input input-bordered input-sm flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <select className="select select-bordered select-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          {statusOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button className="btn btn-primary btn-sm gap-1" onClick={handleSearch}>
          <Search size={14} /> Tìm
        </button>
      </div>

      {showImport && (
        <div className="modal-overlay" onClick={() => setShowImport(false)}>
          <div className="legacy-modal legacy-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold m-0">Import Stations từ Excel</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowImport(false)}>
                <X size={16} />
              </button>
            </div>
            {importStep === 'upload' && (
              <div className="flex flex-col gap-3">
                <label className="text-sm font-medium">Chọn file Excel (.xlsx)</label>
                <input type="file" accept=".xlsx,.xls" className="file-input file-input-bordered w-full" onChange={handleFileSelect} />
                {importFile && (
                  <div className="bg-base-200 rounded-lg p-3 text-sm">
                    <p>File: <strong>{importFile.name}</strong></p>
                    <p>Kích thước: {(importFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowImport(false)}>Hủy</button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={handlePreviewImport} disabled={!importFile || importLoading}>
                    {importLoading ? 'Đang đọc...' : 'Xem trước'}
                  </button>
                </div>
              </div>
            )}
            {importStep === 'preview' && importPreview && (
              <div className="flex flex-col gap-3">
                <div className="bg-base-200 rounded-lg p-3 text-sm">
                  <p>Tổng dòng: <strong>{importPreview.totalRows}</strong></p>
                  <p className="text-success font-semibold">Hợp lệ: <strong>{importPreview.validRows}</strong></p>
                  {importPreview.errorRows > 0 && <p className="text-error font-semibold">Lỗi: <strong>{importPreview.errorRows}</strong></p>}
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setImportStep('upload')}>Quay lại</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowImport(false)}>Hủy</button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={handleConfirmImport} disabled={importPreview.rows.length === 0 || importLoading}>
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
          <div className="legacy-modal legacy-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold m-0">Thêm trạm mới</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCreateForm(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="border border-base-300 rounded-lg p-3 mb-4">
              <label className="text-sm font-medium block mb-2">Chọn vị trí trên bản đồ (click để chọn)</label>
              <MapContainer center={[10.762622, 106.660172]} zoom={13} style={{ height: '200px', width: '100%' }}>
                <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                <MapClickHandler onMapClick={handleMapClick} />
                {mapCoords.latitude && mapCoords.longitude && (
                  <Marker position={[parseFloat(mapCoords.latitude), parseFloat(mapCoords.longitude)]} icon={markerIcon} />
                )}
              </MapContainer>
              {mapCoords.latitude && mapCoords.longitude && (
                <div className="flex items-center gap-1.5 mt-2 px-3 py-2 bg-blue-50 rounded-md text-sm text-base-content/80">
                  <MapPin size={14} />
                  Vĩ độ: {mapCoords.latitude} | Kinh độ: {mapCoords.longitude}
                </div>
              )}
            </div>
            <DynamicForm
              entity="stations"
              formId={STATIONS_FORM_ID}
              onSubmit={handleCreateSubmit}
              initialData={{ latitude: mapCoords.latitude, longitude: mapCoords.longitude }}
            >
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreateForm(false)}>Hủy</button>
            </DynamicForm>
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
          onSaved={() => loadStations(pagination.page)}
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
        startIndex={(pagination.page - 1) * pagination.limit}
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
