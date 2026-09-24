import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { myProposalService, excelService, proposalService, formService } from '../../services/api';
import DynamicTable from '../../components/dynamic/DynamicTable';
import DuplicateCheckPanel from '../../components/DuplicateCheckPanel';
import DeadlineCountdown from '../../components/DeadlineCountdown';
import DynamicForm from '../../components/dynamic/DynamicForm';
import LocationMapModal, { PREVIEW_STATUS_FILTER } from '../../components/LocationMapModal';
import RecordDetailPopup from '../../components/admin/RecordDetailPopup';
import Toast from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import ErrorMessage from '../../components/ErrorMessage';
import ImportErrorList from '../../components/admin/ImportErrorList';
import Pagination from '../../components/Pagination';
import useFieldOptions from '../../hooks/useFieldOptions';
import useDefaultViewId from '../../hooks/useDefaultViewId';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { parseGoogleMapsLink, resolveGoogleMapsShortUrl } from '../../utils/mapHelpers';
import { ClipboardList, Download, Upload, Search, MapPin, RotateCcw, X, Zap, Link2, MapPinned } from 'lucide-react';

const PROPOSALS_VIEW_ID = 8;
const PROPOSALS_FORM_ID = 13;

const MyProposalsPage = () => {
  const { token, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const proposalsViewId = useDefaultViewId('station_proposals', PROPOSALS_VIEW_ID);
  const { getSelectOptions } = useFieldOptions('station_proposals', ['status']);
  const statusOptions = getSelectOptions('status');
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState({});
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [pageSize, setPageSize] = useState(10);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null });
  const [popup, setPopup] = useState({ open: false, record: null, mode: 'view', recordId: null, entity: 'station_proposals' });
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importStep, setImportStep] = useState('upload');
  const [importFailures, setImportFailures] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createFormId, setCreateFormId] = useState(PROPOSALS_FORM_ID);
  const [quickFormId, setQuickFormId] = useState(null);
  const [mapCoords, setMapCoords] = useState({ latitude: '', longitude: '' });
  const [formCoords, setFormCoords] = useState({ latitude: '', longitude: '' });
  const [showPreview, setShowPreview] = useState(false);
  const [previewSnapshot, setPreviewSnapshot] = useState(null);
  const [mapLink, setMapLink] = useState('');
  const [resolvingLink, setResolvingLink] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [dupMode, setDupMode] = useState(false);
  const dupRef = useRef(null);
  const tableRef = useRef(null);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);

  useEffect(() => {
    const match = location.pathname.match(/\/my-proposals\/(view|edit)=(\d+)/);
    if (match) {
      const mode = match[1];
      const id = parseInt(match[2]);
      const existing = proposals.find(p => p.id === id);
      setPopup({ open: true, record: existing || null, mode, recordId: null, entity: 'station_proposals' });
      if (!existing && id) loadProposalById(id);
    } else {
      setPopup({ open: false, record: null, mode: 'view', recordId: null, entity: 'station_proposals' });
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
      const params = new URLSearchParams({ page, limit: pageSize });
      const f = overrides.filter !== undefined ? overrides.filter : filter;
      const s = overrides.search !== undefined ? overrides.search : debouncedSearch;
      const cf = overrides.columnFilters !== undefined ? overrides.columnFilters : columnFilters;
      if (f) params.append('status', f);
      if (s) params.append('search', s);
      if (cf && Object.keys(cf).some(k => String(cf[k] ?? '').trim())) {
        const active = Object.fromEntries(Object.entries(cf).filter(([, v]) => String(v ?? '').trim()));
        params.append('filters', JSON.stringify(active));
      }
      const res = await myProposalService.getAllWithParams(params.toString(), token);
      if (res.success) {
        setProposals(res.data);
        setPagination(res.pagination || { page: 1, limit: pageSize, total: 0, totalPages: 1 });
      }
    } catch {
      setError('Lỗi tải danh sách đề xuất');
    } finally {
      setLoading(false);
    }
  }, [filter, debouncedSearch, columnFilters, token, pageSize]);

  const handleColumnFiltersChange = useCallback((next) => {
    setColumnFilters(prev => (JSON.stringify(prev) === JSON.stringify(next || {}) ? prev : (next || {})));
  }, []);

  useEffect(() => { loadProposals(1); }, [loadProposals]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    formService.getQuickCreate('station_proposals', token)
      .then(res => {
        if (cancelled || !res || !res.success) return;
        setQuickFormId(res.data ? res.data.id : null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

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
      await excelService.exportMyProposals(token, { search, status: filter });
      setToast({ message: 'Export đề xuất thành công', type: 'success' });
    } catch {
      setError('Lỗi export đề xuất');
    }
  };

  const handleExportByForm = async () => {
    try {
      await excelService.exportMyProposals(token, { search, status: filter, layout: 'form' });
      setToast({ message: 'Export theo form thành công', type: 'success' });
    } catch {
      setError('Lỗi export theo form');
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await excelService.downloadTemplate('station_proposals', token);
    } catch {
      setError('Lỗi download template');
    }
  };

  const openCreate = (formId) => {
    setCreateFormId(formId || PROPOSALS_FORM_ID);
    setMapCoords({ latitude: '', longitude: '' });
    setFormCoords({ latitude: '', longitude: '' });
    setShowPreview(false);
    setPreviewSnapshot(null);
    setMapLink('');
    setLinkError('');
    setShowCreateForm(true);
    setError('');
  };

  const closeCreate = () => {
    setShowCreateForm(false);
    setShowPreview(false);
    setPreviewSnapshot(null);
  };

  const parsePreviewCoords = (c) => {
    const lat = parseFloat(c.latitude);
    const lng = parseFloat(c.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { latitude: lat, longitude: lng };
  };

  const effCreateCoords = (formCoords.latitude !== '' && formCoords.latitude != null)
    ? formCoords
    : mapCoords;
  const createInitialData = useMemo(() => ({
    latitude: mapCoords.latitude,
    longitude: mapCoords.longitude
  }), [mapCoords.latitude, mapCoords.longitude]);
  const validPreviewCoords = parsePreviewCoords({
    latitude: effCreateCoords.latitude ?? '',
    longitude: effCreateCoords.longitude ?? ''
  });

  const openPreview = () => {
    if (!validPreviewCoords) return;
    setPreviewSnapshot(validPreviewCoords);
    setShowPreview(true);
  };

  const handleGoogleMapLink = async () => {
    const url = mapLink.trim();
    if (!url) return;
    setLinkError('');
    setResolvingLink(true);
    try {
      let coords = parseGoogleMapsLink(url);
      if (coords && coords.needResolve) {
        coords = await resolveGoogleMapsShortUrl(coords.url);
      }
      if (coords && coords.lat != null && coords.lng != null) {
        setMapCoords({ latitude: Number(coords.lat).toFixed(6), longitude: Number(coords.lng).toFixed(6) });
        setMapLink('');
      } else {
        setLinkError('Không đọc được tọa độ từ link Google Maps');
      }
    } catch {
      setLinkError('Không đọc được tọa độ từ link Google Maps');
    } finally {
      setResolvingLink(false);
    }
  };

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
      throw new Error('Vui lòng dán link Google Maps để lấy tọa độ và nhập đầy đủ thông tin bắt buộc');
    }
    const res = await myProposalService.create(submitData, token, createFormId);
    if (res.success) {
      const warns = res.warnings || [];
      setToast({
        message: warns.length > 0
          ? `Tạo đề xuất thành công! Lưu ý: ${warns.join('; ')}`
          : 'Tạo đề xuất thành công',
        type: warns.length > 0 ? 'warning' : 'success'
      });
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
        setImportFailures([]);
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
        const warns = (res.data && res.data.warnDetails) || [];
        setShowImport(false);
        setToast({
          message: warns.length > 0 ? `${res.message} (có ${warns.length} dòng cảnh báo trùng vị trí)` : res.message,
          type: warns.length > 0 ? 'warning' : 'success'
        });
        loadProposals(1);
      } else {
        setImportFailures((res.data && res.data.failDetails) || []);
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
      {(row.status === 'PENDING' || row.status === 'REJECTED' || row.status === 'REVIEWING' || row.status === 'PRINCIPLE_APPROVED') && (
        <button className="btn btn-sm btn-warning" onClick={() => navigate(`/my-proposals/edit=${row.id}`)}>Sửa</button>
      )}
      {row.status === 'PENDING' && (
        <button className="btn btn-sm btn-error" onClick={() => handleDeleteClick(row.id)}>Xóa</button>
      )}
    </div>
  );

  const handleSearch = () => {
    loadProposals(1);
  };

  const handleReset = () => {
    setSearch('');
    setFilter('');
    setColumnFilters({});
    if (dupRef.current) dupRef.current.reset();
    setDupMode(false);
    if (tableRef.current) tableRef.current.clearFilters();
    setError('');
    loadProposals(1, { filter: '', search: '', columnFilters: {} });
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
          <button className="btn btn-primary btn-sm gap-1" onClick={() => openCreate(PROPOSALS_FORM_ID)}>
            <MapPin size={14} /> Tạo đề xuất
          </button>
          {quickFormId && (
            <button className="btn btn-outline btn-primary btn-sm gap-1" onClick={() => openCreate(quickFormId)} title="Chỉ nhập tọa độ + thông tin cơ bản">
              <Zap size={14} /> Tạo nhanh
            </button>
          )}
          <div className="dropdown dropdown-end">
            <div tabIndex={0} role="button" className="btn btn-ghost btn-sm gap-1">
              <Download size={14} /> Export
            </div>
            <ul tabIndex={0} className="dropdown-content menu bg-base-100 rounded-box shadow-lg border border-base-300 w-72 z-50 p-2">
              <li><button onClick={handleExport}>Theo bảng (phẳng)</button></li>
              <li><button onClick={handleExportByForm}>Theo form (section/tab, 3 hàng header)</button></li>
            </ul>
          </div>
          <button className="btn btn-ghost btn-sm gap-1" onClick={openImport}>
            <Upload size={14} /> Import
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          type="text"
          placeholder="Search theo tên, địa chỉ, SĐT, mã đề xuất..."
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
        onViewItem={(kind, id) => {
          const entity = kind === 'station' ? 'stations' : 'station_proposals';
          setPopup({ open: true, record: null, mode: 'view', recordId: id, entity });
        }}
        exportDuplicatesUrl="/my-proposals/duplicates/export"
        exportToken={token}
      />

      {showCreateForm && (
        <div className="modal-overlay" onClick={closeCreate}>
          <div className="legacy-modal legacy-modal-lg popup-detail" onClick={(e) => e.stopPropagation()}>
            <div className="popup-header">
              <h2>Tạo đề xuất mới</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline btn-primary gap-1"
                  onClick={openPreview}
                  disabled={!validPreviewCoords}
                  title={validPreviewCoords ? 'Xem trạm lân cận' : 'Nhập tọa độ hợp lệ để xem trước'}
                >
                  <MapPinned size={14} />
                  Preview lân cận
                </button>
                <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={closeCreate} aria-label="Close">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="popup-body">
              <div className="border border-base-300 rounded-lg p-3 mb-4">
                <label className="text-sm font-medium block mb-2">Lấy tọa độ từ link Google Maps</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Dán link Google Maps vào đây..."
                    className="input input-bordered input-sm flex-1"
                    value={mapLink}
                    onChange={(e) => { setMapLink(e.target.value); if (linkError) setLinkError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleGoogleMapLink()}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm gap-1"
                    onClick={handleGoogleMapLink}
                    disabled={resolvingLink || !mapLink.trim()}
                  >
                    <Link2 size={14} />
                    {resolvingLink ? '...' : 'Lấy tọa độ'}
                  </button>
                </div>
                {linkError && <div className="alert alert-error text-sm mt-2">{linkError}</div>}
                {mapCoords.latitude && mapCoords.longitude && (
                  <div className="flex items-center gap-1.5 mt-2 px-3 py-2 bg-blue-50 rounded-md text-sm text-base-content/80">
                    <MapPin size={14} />
                     Vĩ độ: {mapCoords.latitude} | Kinh độ: {mapCoords.longitude}
                   </div>
                 )}
               </div>
              <DynamicForm
                entity="station_proposals"
                purpose="create"
                formId={createFormId}
                onSubmit={handleCreateProposal}
                initialData={createInitialData}
                onValuesChange={setFormCoords}
                hideActions
                htmlId="my-proposal-create-form"
              />
            </div>
            <div className="popup-footer">
              <button type="button" className="btn btn-ghost" onClick={closeCreate}>Hủy</button>
              <button type="submit" form="my-proposal-create-form" className="btn btn-primary">Lưu</button>
            </div>
          </div>
        </div>
      )}

      {showPreview && previewSnapshot && (
        <LocationMapModal
          open
          lat={previewSnapshot.latitude}
          lng={previewSnapshot.longitude}
          title="Preview vị trí đề xuất"
          statusFilter={PREVIEW_STATUS_FILTER}
          onClose={() => { setShowPreview(false); setPreviewSnapshot(null); }}
          onMarkerClick={(item, type) => {
            if (type !== 'proposal') return;
            setShowPreview(false); setPreviewSnapshot(null);
            navigate(`/my-proposals/view=${item.id}`);
          }}
        />
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
                  {(importPreview.warningRows || 0) > 0 && (
                    <div className="stat">
                      <div className="stat-title text-warning">Cảnh báo trùng</div>
                      <div className="stat-value text-lg text-warning">{importPreview.warningRows}</div>
                    </div>
                  )}
                </div>
                <ImportErrorList errors={importPreview.errors} failures={importFailures} warnings={importPreview.warnings} />
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
          entity={popup.entity}
          record={popup.record}
          recordId={isAdmin ? (popup.record ? undefined : (popup.recordId || parseInt(location.pathname.match(/=(\d+)/)?.[1]))) : undefined}
          viewId={popup.entity === 'stations' ? undefined : proposalsViewId}
          mode={popup.mode}
          allowEdit={isAdmin || (!!popup.record && ['PENDING', 'REJECTED', 'REVIEWING', 'PRINCIPLE_APPROVED'].includes(popup.record.status))}
          updateService={isAdmin ? undefined : myProposalService}
          onClose={() => {
            setPopup({ open: false, record: null, mode: 'view', recordId: null, entity: 'station_proposals' });
            navigate('/my-proposals');
          }}
          onSaved={() => loadProposals(pagination.page)}
          onSwitchMode={(newMode) => {
            const id = popup.recordId || location.pathname.match(/=(\d+)/)?.[1];
            if (id) navigate(`/my-proposals/${newMode}=${id}`, { replace: true });
          }}
        />
      )}

      {!dupMode && (
      <>
      <DynamicTable
        ref={tableRef}
        entity="station_proposals"
        viewId={proposalsViewId}
        data={proposals}
        actions={renderActions}
        startIndex={(pagination.page - 1) * pagination.limit}
        onColumnFiltersChange={handleColumnFiltersChange}
        cellFooter={(row, colKey) => (colKey === 'status' ? <DeadlineCountdown deadline={row.supplement_deadline_at} status={row.status} compact /> : null)}
      />

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={loadProposals}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
      />
      </>
      )}
    </div>
  );
};

export default MyProposalsPage;
