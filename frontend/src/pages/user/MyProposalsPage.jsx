import { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { myProposalService, excelService } from '../../services/api';
import DynamicTable from '../../components/dynamic/DynamicTable';
import DynamicForm from '../../components/dynamic/DynamicForm';
import RecordDetailPopup from '../../components/admin/RecordDetailPopup';
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

const PROPOSALS_VIEW_ID = 8;
const PROPOSALS_FORM_ID = 9;

const MyProposalsPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { getSelectOptions } = useFieldOptions('station_proposals');
  const statusOptions = getSelectOptions('status');
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null });
  const [popup, setPopup] = useState({ open: false, record: null, mode: 'view' });
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importStep, setImportStep] = useState('upload');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [mapCoords, setMapCoords] = useState({ latitude: '', longitude: '' });

  useEffect(() => {
    const match = location.pathname.match(/\/my-proposals\/(view|edit)=(\d+)/);
    if (match) {
      const mode = match[1];
      const id = parseInt(match[2]);
      const existing = proposals.find(p => p.id === id);
      setPopup({ open: true, record: existing || null, mode });
      if (!existing && id) loadProposalById(id);
    } else {
      setPopup({ open: false, record: null, mode: 'view' });
    }
  }, [location.pathname, proposals.length]);

  const loadProposalById = async (id) => {
    try {
      const res = await myProposalService.getAllWithParams('', token);
      if (res.success) {
        const p = res.data.find(x => x.id === id);
        if (p) setPopup(prev => ({ ...prev, record: p }));
      }
    } catch { /* silent */ }
  };

  useEffect(() => {
    loadProposals(1);
  }, []);

  const loadProposals = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page, limit: 10 });
      if (filter) params.append('status', filter);
      const res = await myProposalService.getAllWithParams(params.toString(), token);
      if (res.success) {
        setProposals(res.data);
        setPagination(res.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
      }
    } catch {
      setError('Lỗi tải danh sách đề xuất');
    } finally {
      setLoading(false);
    }
  }, [filter, token]);

  useEffect(() => { loadProposals(1); }, [loadProposals]);

  const handleDeleteClick = (id) => {
    setConfirmDelete({ isOpen: true, id });
  };

  const handleConfirmDelete = async () => {
    const { id } = confirmDelete;
    setConfirmDelete({ isOpen: false, id: null });
    try {
      const res = await myProposalService.delete(id, token);
      if (res.success) {
        setToast({ message: 'Xóa đề xuất thành công', type: 'success' });
        loadProposals(pagination.page);
      } else {
        setError(res.message || 'Xóa thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const handleExport = async () => {
    try {
      await excelService.exportData('station_proposals', token);
      setToast({ message: 'Export đề xuất thành công', type: 'success' });
    } catch {
      setError('Lỗi export đề xuất');
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await excelService.downloadTemplate('station_proposals', token);
    } catch {
      setError('Lỗi download template');
    }
  };

  const openCreate = () => {
    setMapCoords({ latitude: '', longitude: '' });
    setShowCreateForm(true);
    setError('');
  };

  const handleMapClick = (latlng) => {
    setMapCoords({ latitude: latlng.lat.toFixed(6), longitude: latlng.lng.toFixed(6) });
  };

  const handleCreateProposal = async (formData) => {
    const submitData = {
      latitude: mapCoords.latitude || formData.latitude || '',
      longitude: mapCoords.longitude || formData.longitude || '',
      owner_name: formData.owner_name || formData.full_name || '',
      owner_phone: formData.owner_phone || formData.phone || '',
      address: formData.address || '',
      area: formData.area || '',
      land_type: formData.land_type || '',
      description: formData.description || ''
    };
    if (!submitData.latitude || !submitData.longitude || !submitData.owner_name || !submitData.owner_phone || !submitData.address) {
      throw new Error('Vui lòng chọn vị trí trên bản đồ và nhập đầy đủ thông tin bắt buộc');
    }
    const res = await myProposalService.create(submitData, token);
    if (res.success) {
      setToast({ message: 'Tạo đề xuất thành công', type: 'success' });
      setShowCreateForm(false);
      loadProposals(1);
    } else {
      throw new Error(res.message || 'Tạo đề xuất thất bại');
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
      const res = await excelService.previewImport('station_proposals', importFile, token);
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
      const res = await excelService.confirmImport('station_proposals', importPreview.rows, token);
      if (res.success) {
        setShowImport(false);
        setToast({ message: res.message, type: 'success' });
        loadProposals(1);
      } else {
        setError(res.message || 'Lỗi import');
      }
    } catch {
      setError('Lỗi import');
    } finally {
      setImportLoading(false);
    }
  };

  const renderActions = (row) => (
    <div className="action-buttons">
      <button className="btn btn-sm btn-primary" onClick={() => navigate(`/my-proposals/view=${row.id}`)}>Xem</button>
      {row.status === 'PENDING' && (
        <>
          <button className="btn btn-sm btn-edit" onClick={() => navigate(`/my-proposals/edit=${row.id}`)}>Sửa</button>
          <button className="btn btn-sm btn-delete" onClick={() => handleDeleteClick(row.id)}>Xóa</button>
        </>
      )}
    </div>
  );

  return (
    <div className="proposals-page">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Xóa đề xuất"
        message="Bạn có chắc chắn muốn xóa đề xuất này?"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete({ isOpen: false, id: null })}
        confirmText="Xóa"
        type="danger"
      />

      <div className="proposals-toolbar">
        <div className="toolbar-left">
          <h1>Đề xuất của tôi</h1>
        </div>
        <div className="toolbar-right">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="filter-select">
            <option value="">Tất cả</option>
            {statusOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button className="btn btn-primary btn-sm" onClick={openCreate}>+ Tạo đề xuất</button>
          <button className="btn btn-secondary btn-sm" onClick={handleDownloadTemplate}>Template</button>
          <button className="btn btn-secondary btn-sm" onClick={handleExport}>Export</button>
          <button className="btn btn-secondary btn-sm" onClick={openImport}>Import</button>
        </div>
      </div>

      {showCreateForm && (
        <div className="modal-overlay" onClick={() => setShowCreateForm(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-flex">
              <h2>Tạo đề xuất mới</h2>
              <button className="btn-close-x" onClick={() => setShowCreateForm(false)}>✕</button>
            </div>
            <div className="map-picker">
              <label>Chọn vị trí trên bản đồ (click để chọn)</label>
              <MapContainer center={[10.762622, 106.660172]} zoom={13} style={{ height: '200px', width: '100%' }}>
                <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                <MapClickHandler onMapClick={handleMapClick} />
                {mapCoords.latitude && mapCoords.longitude && (
                  <Marker position={[parseFloat(mapCoords.latitude), parseFloat(mapCoords.longitude)]} icon={markerIcon} />
                )}
              </MapContainer>
              {mapCoords.latitude && mapCoords.longitude && (
                <div className="form-coords-info">
                  Vĩ độ: {mapCoords.latitude} | Kinh độ: {mapCoords.longitude}
                </div>
              )}
            </div>
            <DynamicForm
              entity="station_proposals"
              formId={PROPOSALS_FORM_ID}
              onSubmit={handleCreateProposal}
              initialData={{ latitude: mapCoords.latitude, longitude: mapCoords.longitude }}
            >
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreateForm(false)}>Hủy</button>
            </DynamicForm>
          </div>
        </div>
      )}

      {showImport && (
        <div className="modal-overlay" onClick={() => setShowImport(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Import Đề xuất từ Excel</h2>
            {importStep === 'upload' && (
              <div className="import-upload">
                <label>Chọn file Excel (.xlsx)</label>
                <input type="file" accept=".xlsx,.xls" onChange={handleFileSelect} />
                {importFile && (
                  <div className="import-file-info">
                    <p>File: <strong>{importFile.name}</strong></p>
                    <p>Kích thước: {(importFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                )}
                <div className="import-actions">
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
                <div className="import-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setImportStep('upload')}>Quay lại</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowImport(false)}>Hủy</button>
                  <button type="button" className="btn btn-primary" onClick={handleConfirmImport} disabled={importPreview.rows.length === 0 || importLoading}>
                    {importLoading ? 'Đang import...' : `Import ${importPreview.validRows} đề xuất`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {error && <ErrorMessage message={error} onRetry={() => { setError(''); loadProposals(1); }} />}

      {popup.open && (
        <RecordDetailPopup
          entity="station_proposals"
          record={popup.record}
          recordId={popup.record ? undefined : parseInt(location.pathname.match(/=(\d+)/)?.[1])}
          viewId={PROPOSALS_VIEW_ID}
          mode={popup.mode}
          onClose={() => navigate('/my-proposals')}
          onSaved={() => { loadProposals(pagination.page); navigate('/my-proposals'); }}
          onSwitchMode={(newMode) => {
            const id = location.pathname.match(/=(\d+)/)?.[1];
            navigate(`/my-proposals/${newMode}=${id}`, { replace: true });
          }}
        />
      )}

      <DynamicTable
        entity="station_proposals"
        viewId={PROPOSALS_VIEW_ID}
        data={proposals}
        actions={renderActions}
        startIndex={(pagination.page - 1) * pagination.limit}
      />

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={loadProposals}
      />
    </div>
  );
};

export default MyProposalsPage;
