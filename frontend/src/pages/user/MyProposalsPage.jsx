import { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { myProposalService, excelService, proposalService } from '../../services/api';
import DynamicTable from '../../components/dynamic/DynamicTable';
import DuplicateCheckPanel from '../../components/DuplicateCheckPanel';
import DynamicForm from '../../components/dynamic/DynamicForm';
import RecordDetailPopup from '../../components/admin/RecordDetailPopup';
import Toast from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import ErrorMessage from '../../components/ErrorMessage';
import Pagination from '../../components/Pagination';
import useFieldOptions from '../../hooks/useFieldOptions';
import 'leaflet/dist/leaflet.css';
import { ClipboardList, Download, Upload, Search, MapPin, RotateCcw } from 'lucide-react';

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
  const [nearbyWarning, setNearbyWarning] = useState('');
  const [dupMode, setDupMode] = useState(false);
  const dupRef = useRef(null);
  const tableRef = useRef(null);

  const [search, setSearch] = useState('');

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

  const loadProposals = useCallback(async (page = 1, overrides = {}) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page, limit: 10 });
      const f = overrides.filter !== undefined ? overrides.filter : filter;
      const s = overrides.search !== undefined ? overrides.search : search;
      if (f) params.append('status', f);
      if (s) params.append('search', s);
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
  }, [filter, search, token]);

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
      await excelService.exportData('station_proposals', token, { search, status: filter });
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

  useEffect(() => {
    if (!showCreateForm) {
      setNearbyWarning('');
      return;
    }
    const lat = Number(mapCoords.latitude);
    const lng = Number(mapCoords.longitude);
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
      setNearbyWarning('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const nearby = await proposalService.checkNearby({ latitude: lat, longitude: lng, radius_m: 200 }, token);
        if (cancelled) return;
        if (nearby.success && nearby.data && nearby.data.is_duplicate) {
          const n = nearby.data.nearest;
          const who = n.kind === 'station' ? 'trạm' : 'đề xuất';
          setNearbyWarning(`Cảnh báo: vị trí này trùng với ${who} #${n.id} (cách ${n.distance_m}m < 200m). Bạn vẫn có thể nhập form nhưng sẽ không lưu được.`);
        } else {
          setNearbyWarning('');
        }
      } catch {
        if (!cancelled) setNearbyWarning('');
      }
    })();
    return () => { cancelled = true; };
  }, [showCreateForm, mapCoords.latitude, mapCoords.longitude, token]);

  const handleCreateProposal = async (formData) => {
    const { latitude: fLat, longitude: fLng, owner_name, full_name, owner_phone, phone, address, area, land_type, description, ...dynamicRest } = formData || {};
    const submitData = {
      latitude: mapCoords.latitude || fLat || '',
      longitude: mapCoords.longitude || fLng || '',
      owner_name: owner_name || full_name || '',
      owner_phone: owner_phone || phone || '',
      address: address || '',
      area: area || '',
      land_type: land_type || '',
      description: description || '',
      ...dynamicRest
    };
    if (!submitData.latitude || !submitData.longitude || !submitData.owner_name || !submitData.owner_phone || !submitData.address) {
      throw new Error('Vui lòng chọn vị trí trên bản đồ và nhập đầy đủ thông tin bắt buộc');
    }
    const nearby = await proposalService.checkNearby({
      latitude: submitData.latitude,
      longitude: submitData.longitude,
      radius_m: 200
    }, token);
    if (nearby.success && nearby.data && nearby.data.is_duplicate) {
      const n = nearby.data.nearest;
      const who = n.kind === 'station' ? 'trạm' : 'đề xuất';
      throw new Error(`Vị trí này trùng với ${who} #${n.id} (cách ${n.distance_m}m < 200m). Vui lòng chọn vị trí khác.`);
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
    <div className="flex gap-1">
      <button className="btn btn-sm btn-primary" onClick={() => navigate(`/my-proposals/view=${row.id}`)}>Xem</button>
      {row.status === 'PENDING' && (
        <>
          <button className="btn btn-sm btn-warning" onClick={() => navigate(`/my-proposals/edit=${row.id}`)}>Sửa</button>
          <button className="btn btn-sm btn-error" onClick={() => handleDeleteClick(row.id)}>Xóa</button>
        </>
      )}
    </div>
  );

  const handleSearch = () => {
    loadProposals(1);
  };

  const handleReset = () => {
    setSearch('');
    setFilter('');
    if (dupRef.current) dupRef.current.reset();
    setDupMode(false);
    if (tableRef.current) tableRef.current.clearFilters();
    setError('');
    loadProposals(1, { filter: '', search: '' });
  };

  return (
    <div className="p-4 md:p-6">
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

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <ClipboardList size={22} /> Đề xuất của tôi
        </h1>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary btn-sm gap-1" onClick={handleDownloadTemplate}>
            <Download size={14} /> Template
          </button>
          <button className="btn btn-secondary btn-sm gap-1" onClick={handleExport}>
            <Download size={14} /> Export
          </button>
          <button className="btn btn-secondary btn-sm gap-1" onClick={openImport}>
            <Upload size={14} /> Import
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          type="text"
          placeholder="Search theo địa chỉ..."
          className="input input-bordered input-sm flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <select className="select select-bordered select-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          {statusOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button className="btn btn-primary btn-sm gap-1" onClick={handleSearch}>
          <Search size={14} /> Tìm
        </button>
        <button className="btn btn-ghost btn-sm gap-1" onClick={handleReset}>
          <RotateCcw size={14} /> Reset
        </button>
      </div>

      <DuplicateCheckPanel
        ref={dupRef}
        fetchDuplicates={(minM, maxM) => myProposalService.duplicates(minM, maxM, token)}
        getProposalViewUrl={(id) => `/my-proposals/view=${id}`}
        onModeChange={setDupMode}
        exportDuplicatesUrl="/my-proposals/duplicates/export"
        exportToken={token}
      />

      {showCreateForm && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-2xl">
            <h3 className="font-bold text-lg mb-4">Tạo đề xuất mới</h3>
            <div className="border border-base-300 rounded-lg p-3 mb-4">
              <label className="text-sm font-medium block mb-2">Chọn vị trí trên bản đồ (click để chọn)</label>
              <MapContainer center={[10.762622, 106.660172]} zoom={13} style={{ height: '200px', width: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; <a href=&quot;https://www.openstreetmap.org/copyright&quot;>OpenStreetMap</a> contributors" />
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
              {nearbyWarning && <div className="alert alert-warning text-sm mt-2">{nearbyWarning}</div>}
            </div>
            <DynamicForm
              entity="station_proposals"
              formId={PROPOSALS_FORM_ID}
              onSubmit={handleCreateProposal}
              initialData={{ latitude: mapCoords.latitude, longitude: mapCoords.longitude }}
            >
              <button type="button" className="btn btn-ghost" onClick={() => setShowCreateForm(false)}>Hủy</button>
            </DynamicForm>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setShowCreateForm(false)}>close</button>
          </form>
        </dialog>
      )}

      {showImport && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">Import Đề xuất từ Excel</h3>
            {importStep === 'upload' && (
              <div className="space-y-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Chọn file Excel (.xlsx)</span>
                  </label>
                  <input type="file" accept=".xlsx,.xls" className="file-input file-input-bordered w-full" onChange={handleFileSelect} />
                </div>
                {importFile && (
                  <div className="alert alert-info">
                    <span>File: <strong>{importFile.name}</strong> ({(importFile.size / 1024).toFixed(1)} KB)</span>
                  </div>
                )}
                <div className="modal-action">
                  <button className="btn btn-ghost" onClick={() => setShowImport(false)}>Hủy</button>
                  <button className="btn btn-primary" onClick={handlePreviewImport} disabled={!importFile || importLoading}>
                    {importLoading ? <span className="loading loading-spinner loading-xs"></span> : null}
                    {importLoading ? 'Đang đọc...' : 'Xem trước'}
                  </button>
                </div>
              </div>
            )}
            {importStep === 'preview' && importPreview && (
              <div className="space-y-4">
                <div className="stats shadow w-full">
                  <div className="stat">
                    <div className="stat-title">Tổng dòng</div>
                    <div className="stat-value text-lg">{importPreview.totalRows}</div>
                  </div>
                  <div className="stat">
                    <div className="stat-title text-success">Hợp lệ</div>
                    <div className="stat-value text-lg text-success">{importPreview.validRows}</div>
                  </div>
                  {importPreview.errorRows > 0 && (
                    <div className="stat">
                      <div className="stat-title text-error">Lỗi</div>
                      <div className="stat-value text-lg text-error">{importPreview.errorRows}</div>
                    </div>
                  )}
                </div>
                <div className="modal-action">
                  <button className="btn btn-ghost" onClick={() => setImportStep('upload')}>Quay lại</button>
                  <button className="btn btn-ghost" onClick={() => setShowImport(false)}>Hủy</button>
                  <button className="btn btn-primary" onClick={handleConfirmImport} disabled={importPreview.rows.length === 0 || importLoading}>
                    {importLoading ? <span className="loading loading-spinner loading-xs"></span> : null}
                    {importLoading ? 'Đang import...' : `Import ${importPreview.validRows} đề xuất`}
                  </button>
                </div>
              </div>
            )}
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setShowImport(false)}>close</button>
          </form>
        </dialog>
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
          onSaved={() => loadProposals(pagination.page)}
          onSwitchMode={(newMode) => {
            const id = location.pathname.match(/=(\d+)/)?.[1];
            navigate(`/my-proposals/${newMode}=${id}`, { replace: true });
          }}
        />
      )}

      {!dupMode && (
      <>
      <DynamicTable
        ref={tableRef}
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
      </>
      )}
    </div>
  );
};

export default MyProposalsPage;
