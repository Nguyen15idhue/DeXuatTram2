import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { stationService, excelService } from '../../services/api';
import DynamicTable from '../../components/dynamic/DynamicTable';
import DynamicForm from '../../components/dynamic/DynamicForm';
import RecordDetailPopup from '../../components/admin/RecordDetailPopup';
import Toast from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import ErrorMessage from '../../components/ErrorMessage';
import ImportErrorList from '../../components/admin/ImportErrorList';
import ViewPickerMenu from '../../components/admin/ViewPickerMenu';
import ImportViewPanel from '../../components/admin/ImportViewPanel';
import { usageLabel } from '../../components/admin/ViewPickerMenu';
import Pagination from '../../components/Pagination';
import useFieldOptions from '../../hooks/useFieldOptions';
import useDefaultViewId from '../../hooks/useDefaultViewId';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import useMediaQuery from '../../hooks/useMediaQuery';
import { FilterToggle, FilterBody } from '../../components/ui/FilterPanel';
import { PRIORITY_OPTIONS } from '../../utils/mapStatuses';
import { Zap, Download, Upload, Plus, Search, RotateCcw, X, Trash2 } from 'lucide-react';

const STATIONS_VIEW_ID = 6;
const STATIONS_FORM_ID = 12;

const AdminStationsPage = () => {
  const { token, isSales } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const stationsViewId = useDefaultViewId('stations', STATIONS_VIEW_ID);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const { getSelectOptions } = useFieldOptions('stations', ['status', 'mo_hinh_tram', 'province', 'vung_mien']);
  const statusOptions = getSelectOptions('status');
  const moHinhOptions = getSelectOptions('mo_hinh_tram');
  const provinceOptions = getSelectOptions('province');
  const regionOptions = getSelectOptions('vung_mien');
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null, name: '' });
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterUuTien, setFilterUuTien] = useState('');
  const [filterMoHinh, setFilterMoHinh] = useState('');
  const [filterProvince, setFilterProvince] = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateField, setDateField] = useState('created_at');
  const [showFilter, setShowFilter] = useState(false);
  const [columnFilters, setColumnFilters] = useState({});
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [pageSize, setPageSize] = useState(10);
  const [popup, setPopup] = useState({ open: false, record: null, mode: 'view' });
  const [selectedIds, setSelectedIds] = useState([]);
  const tableRef = useRef(null);

  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importStep, setImportStep] = useState('upload');
  const [importFailures, setImportFailures] = useState([]);
  const [excelViews, setExcelViews] = useState([]);
  const [importViewId, setImportViewId] = useState('');
  const [importGeocode, setImportGeocode] = useState(true);
  const [importCheckDuplicate, setImportCheckDuplicate] = useState(true);
  const [importCheckIntraFile, setImportCheckIntraFile] = useState(true);
  const [importProgress, setImportProgress] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const importPollRef = useRef(null);

  useEffect(() => {
    if (!token || isSales) return;
    let cancelled = false;
    excelService.getViews('stations', token)
      .then(res => { if (!cancelled && res && res.success) setExcelViews(res.data || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token, isSales]);

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
      const res = await stationService.getById(id);
      if (res.success) {
        setPopup({ open: true, record: res.data, mode });
      }
    } catch { /* silent */ }
  };

  const loadStations = useCallback(async (page = 1, overrides = {}) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page, limit: pageSize });
      const s = overrides.search !== undefined ? overrides.search : debouncedSearch;
      const st = overrides.filterStatus !== undefined ? overrides.filterStatus : filterStatus;
      const ut = overrides.filterUuTien !== undefined ? overrides.filterUuTien : filterUuTien;
      const mh = overrides.filterMoHinh !== undefined ? overrides.filterMoHinh : filterMoHinh;
      const pr = overrides.filterProvince !== undefined ? overrides.filterProvince : filterProvince;
      const rg = overrides.filterRegion !== undefined ? overrides.filterRegion : filterRegion;
      const df = overrides.dateFrom !== undefined ? overrides.dateFrom : dateFrom;
      const dt = overrides.dateTo !== undefined ? overrides.dateTo : dateTo;
      const dfield = overrides.dateField !== undefined ? overrides.dateField : dateField;
      const cf = overrides.columnFilters !== undefined ? overrides.columnFilters : columnFilters;
      if (s) params.append('search', s);
      if (st) params.append('status', st);
      if (ut) params.append('uu_tien', ut);
      if (mh) params.append('mo_hinh_tram', mh);
      if (pr) params.append('province', pr);
      if (rg) params.append('region', rg);
      if (df || dt) { params.append('date_field', dfield); if (df) params.append('date_from', df); if (dt) params.append('date_to', dt); }
      if (cf && Object.keys(cf).some(k => String(cf[k] ?? '').trim())) {
        const active = Object.fromEntries(Object.entries(cf).filter(([, v]) => String(v ?? '').trim()));
        params.append('filters', JSON.stringify(active));
      }
      const res = await stationService.getAllWithParams(params.toString());
      if (res.success) {
        setStations(res.data);
        setPagination(res.pagination || { page: 1, limit: pageSize, total: 0, totalPages: 1 });
      }
    } catch {
      setError('Lỗi tải danh sách trạm');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filterStatus, filterUuTien, filterMoHinh, filterProvince, filterRegion, dateFrom, dateTo, dateField, columnFilters, pageSize]);

  const handleColumnFiltersChange = useCallback((next) => {
    setColumnFilters(prev => (JSON.stringify(prev) === JSON.stringify(next || {}) ? prev : (next || {})));
  }, []);

  useEffect(() => { loadStations(1); }, [loadStations]);

  const handleSearch = () => { loadStations(1); };

  const handleReset = () => {
    setSearch('');
    setFilterStatus('');
    setFilterUuTien('');
    setFilterMoHinh('');
    setFilterProvince('');
    setFilterRegion('');
    setDateFrom('');
    setDateTo('');
    setDateField('created_at');
    setColumnFilters({});
    if (tableRef.current) tableRef.current.clearFilters();
    setError('');
    loadStations(1, { search: '', filterStatus: '', filterUuTien: '', filterMoHinh: '', filterProvince: '', filterRegion: '', dateFrom: '', dateTo: '', dateField: 'created_at', columnFilters: {} });
  };

  const openCreate = () => {
    setShowCreateForm(true);
    setError('');
  };

  const handleCreateSubmit = async (formData) => {
    const submitData = { ...formData };
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

  const handleConfirmBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setConfirmBulkDelete(false);
    setBulkLoading(true);
    let ok = 0;
    const failed = [];
    for (const id of selectedIds) {
      try {
        const res = await stationService.delete(id, token);
        if (res.success) ok++;
        else failed.push(`#${id}: ${res.message || 'Xóa thất bại'}`);
      } catch {
        failed.push(`#${id}: Lỗi kết nối server`);
      }
    }
    setBulkLoading(false);
    setSelectedIds([]);
    loadStations(pagination.page);
    if (ok > 0) {
      setToast({
        message: `Đã xóa ${ok} trạm${failed.length > 0 ? `, ${failed.length} không xóa được: ${failed.join('; ')}` : ''}`,
        type: failed.length > 0 ? 'warning' : 'success'
      });
    } else {
      setError(`Không xóa được: ${failed.join('; ')}`);
    }
  };

  const handleExportStations = async (viewIds) => {
    try {
      await excelService.exportData('stations', token, { search, status: filterStatus, viewIds: viewIds || undefined });
      setToast({ message: 'Export stations thành công', type: 'success' });
    } catch {
      setError('Lỗi export stations');
    }
  };

  const handleExportStationsByForm = async () => {
    try {
      await excelService.exportData('stations', token, { search, status: filterStatus, layout: 'form' });
      setToast({ message: 'Export theo form thành công', type: 'success' });
    } catch {
      setError('Lỗi export theo form');
    }
  };

  const handleDownloadTemplate = async (viewIds) => {
    try {
      await excelService.downloadTemplate('stations', token, { viewIds: viewIds || undefined });
    } catch {
      setError('Lỗi download template');
    }
  };

  const openImport = () => {
    setShowImport(true);
    setImportFile(null);
    setImportPreview(null);
    setImportStep('upload');
    setImportViewId('');
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

  const handlePreviewImport = async (overrideViewId) => {
    if (!importFile) { setError('Vui lòng chọn file Excel'); return; }
    if (importFile.size > 8 * 1024 * 1024) { setError('File quá lớn (>8MB). Hãy chia file <200 dòng rồi import từng phần để tránh mất kết nối trên VPS chậm.'); return; }
    const viewIdToUse = overrideViewId !== undefined ? overrideViewId : importViewId;
    try {
      setImportLoading(true);
      setError('');
      const res = await excelService.previewImport('stations', importFile, token, { viewId: viewIdToUse || undefined, checkDuplicate: importCheckDuplicate, checkIntraFile: importCheckIntraFile });
      if (res.success) {
        setImportFailures([]);
        setImportResult(null);
        setImportPreview(res.data);
        setImportStep('preview');
      } else {
        if (res.data && res.data.detection) {
          setImportPreview({ detection: res.data.detection, rows: [], errors: [], validRows: 0, totalRows: 0, errorRows: 0 });
          setImportStep('preview');
        }
        setError(res.message || 'Lỗi đọc file Excel');
      }
    } catch {
      setError('Lỗi đọc file Excel. Vui lòng kiểm tra lại định dạng file.');
    } finally {
      setImportLoading(false);
    }
  };

  const handleChangeImportView = (value) => {
    setImportViewId(value);
    if (importFile) handlePreviewImport(value);
  };

  useEffect(() => {
    if (importStep === 'preview' && importFile && importPreview && !importLoading) {
      handlePreviewImport();
    }
  }, [importCheckDuplicate, importCheckIntraFile]);

  const handleConfirmImport = async () => {
    if (!importPreview || importPreview.rows.length === 0) { setError('Không có dữ liệu hợp lệ để import'); return; }
    const jobId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `imp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setImportProgress({ done: 0, total: importPreview.rows.length });
    setImportResult(null);
    const stopPoll = () => { if (importPollRef.current) { clearInterval(importPollRef.current); importPollRef.current = null; } };
    stopPoll();
    const finishJob = (data) => {
      stopPoll();
      setImportProgress(null);
      setImportLoading(false);
      setImportResult(data);
      if (data.status === 'done') {
        setToast({ message: `Import thành công: ${data.imported} bản ghi`, type: 'success' });
        loadStations(1);
      } else if (data.status === 'partial') {
        setToast({ message: `Import một phần: ${data.imported}/${data.total} thành công, ${data.failed} lỗi — xem tab Excel`, type: 'warning' });
        loadStations(1);
      } else if (data.status === 'cancelled') {
        setToast({ message: `Đã hủy import: ${data.imported} đã tạo, ${data.failed} lỗi, ${data.pending} chưa xử lý — xem tab Excel`, type: 'warning' });
        loadStations(1);
      } else {
        setError(data.error || 'Import thất bại');
      }
    };
    importPollRef.current = setInterval(async () => {
      try {
        const p = await excelService.getImportProgress(jobId, token);
        if (p && p.success && p.data && p.data.status !== 'not_found') {
          const d = p.data;
          setImportProgress({ done: d.done, total: d.total, status: d.status });
          if (['done', 'partial', 'failed', 'cancelled'].includes(d.status)) finishJob(d);
        }
      } catch { /* poll lỗi thì bỏ qua, vòng sau thử lại */ }
    }, 2000);
    try {
      setImportLoading(true);
      setError('');
      const res = await excelService.confirmImport('stations', importPreview.rows, token, { viewId: importPreview.viewId, jobId, geocode: importGeocode, checkDuplicate: importCheckDuplicate, checkIntraFile: importCheckIntraFile, fileName: (importFile && importFile.name) || null, columns: importPreview.columns || null });
      if (!res.success) {
        stopPoll();
        setImportProgress(null);
        setImportLoading(false);
        setImportFailures((res.data && res.data.failDetails) || []);
        setError(res.message || 'Lỗi import');
      } else {
        setShowImport(false);
        setImportLoading(false);
        setImportProgress(null);
        setToast({
          message: `Đang xử lý import ${importPreview.rows.length} dòng — xong sẽ báo tại đây.`,
          type: 'info',
          duration: 5000,
          action: { label: 'Xem tiến độ', onClick: () => navigate('/admin/audit-log', { state: { tab: 'excel', jobId } }) }
        });
      }
    } catch (err) {
      stopPoll();
      setImportProgress(null);
      setImportLoading(false);
      setError((err && err.message) || 'Lỗi kết nối server');
    }
  };

  const renderActions = (row) => (
    <div className="flex gap-1">
      <button className="btn btn-sm btn-primary" onClick={() => navigate(`/admin/stations/view=${row.id}`)}>Xem</button>
      {!isSales && (
        <button className="btn btn-sm btn-warning" onClick={() => navigate(`/admin/stations/edit=${row.id}`)}>Sửa</button>
      )}
      {!isSales && (
        <button className="btn btn-sm btn-error" onClick={() => handleDeleteClick(row.id, row.name)}>Xóa</button>
      )}
    </div>
  );

  return (
    <div>
      <Toast message={toast.message} type={toast.type} duration={toast.duration} action={toast.action} onClose={() => setToast({ message: '', type: 'success' })} />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <Zap size={24} className="text-primary shrink-0" />
          <h1 className="text-2xl font-bold">Quản lý Trạm</h1>
        </div>
        {!isSales && (
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-primary btn-sm gap-1" onClick={openCreate}>
              <Plus size={14} /> Thêm trạm
            </button>
            <ViewPickerMenu label="Template" views={excelViews} onPick={handleDownloadTemplate} title="Chọn bộ cột cho file mẫu" />
            <ViewPickerMenu label="Export" views={excelViews} onPick={handleExportStations} onPickForm={handleExportStationsByForm} title="Chọn bộ cột để export" />
            <button className="btn btn-ghost btn-sm gap-1" onClick={openImport}>
              <Upload size={14} /> Import
            </button>
          </div>
        )}
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

      <ConfirmDialog
        isOpen={confirmBulkDelete}
        title="Xóa nhiều trạm"
        message={`Bạn có chắc chắn muốn xóa ${selectedIds.length} trạm đã chọn?`}
        onConfirm={handleConfirmBulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
        confirmText="Xóa"
        type="danger"
      />

      <div className="flex items-center gap-2 mb-3">
        <input
          type="text"
          placeholder="Search theo tên, địa chỉ, mã trạm..."
          className="input input-bordered input-sm flex-1 min-w-0"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button className="btn btn-primary btn-sm gap-1 shrink-0" onClick={handleSearch}>
          <Search size={14} /> <span className="hidden sm:inline">Tìm</span>
        </button>
        <FilterToggle open={showFilter} onToggle={() => setShowFilter(v => !v)} count={[filterStatus, filterUuTien, filterMoHinh, filterProvince, filterRegion, dateFrom, dateTo].filter(Boolean).length} />
      </div>

      <FilterBody
        open={showFilter}
        isDesktop={isDesktop}
        onClose={() => setShowFilter(false)}
        onApply={handleSearch}
        onReset={handleReset}
        title="Bộ lọc trạm"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select className="select select-bordered select-sm w-full" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            {statusOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          <select className="select select-bordered select-sm w-full" value={filterUuTien} onChange={(e) => setFilterUuTien(e.target.value)}>
            <option value="">Tất cả loại ưu tiên</option>
            {PRIORITY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          <select className="select select-bordered select-sm w-full" value={filterMoHinh} onChange={(e) => setFilterMoHinh(e.target.value)}>
            <option value="">Tất cả mô hình</option>
            {moHinhOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          <select className="select select-bordered select-sm w-full" value={filterProvince} onChange={(e) => setFilterProvince(e.target.value)}>
            <option value="">Tất cả tỉnh/thành</option>
            {provinceOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          <select className="select select-bordered select-sm w-full" value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)}>
            <option value="">Tất cả vùng miền</option>
            {regionOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <span className="text-xs text-base-content/60 whitespace-nowrap">Thời gian</span>
            <select className="select select-bordered select-sm flex-1" value={dateField} onChange={(e) => setDateField(e.target.value)}>
              <option value="created_at">Tạo</option>
              <option value="updated_at">Cập nhật</option>
            </select>
          </div>
          <input type="date" className="input input-bordered input-sm w-full" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input type="date" className="input input-bordered input-sm w-full" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <div className="flex items-end gap-2 col-span-1 sm:col-span-2 lg:col-span-2">
            <button className="btn btn-primary btn-sm flex-1 gap-1" onClick={handleSearch}><Search size={14} /> Áp dụng</button>
            <button className="btn btn-ghost btn-sm flex-1 gap-1" onClick={handleReset}><RotateCcw size={14} /> Xóa lọc</button>
          </div>
        </div>
      </FilterBody>

      {!isSales && selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 px-3 py-2 bg-base-200 rounded-lg">
          <span className="text-sm font-medium">Đã chọn: {selectedIds.length} trạm</span>
          <button className="btn btn-error btn-sm gap-1" onClick={() => setConfirmBulkDelete(true)} disabled={bulkLoading}>
            <Trash2 size={14} /> Xóa ({selectedIds.length})
          </button>
          <button className="btn btn-ghost btn-sm gap-1" onClick={() => setSelectedIds([])}>
            <X size={14} /> Bỏ chọn
          </button>
        </div>
      )}

      {showImport && (
        <dialog className="modal modal-open" onCancel={(e) => e.preventDefault()}>
          <div className="modal-box">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Import Stations từ Excel</h3>
              <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={() => setShowImport(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
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
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Bộ cột</span>
                  </label>
                  <select className="select select-bordered w-full" value={importViewId} onChange={(e) => setImportViewId(e.target.value)}>
                    <option value="">Tự nhận diện theo file (khuyến nghị)</option>
                    {excelViews.map(v => (
                      <option key={v.id} value={v.id}>{usageLabel(v.usage)} – {v.name}</option>
                    ))}
                  </select>
                </div>
                <div className="divider text-xs opacity-60 my-1">Tùy chọn kiểm tra</div>
                <label className="label cursor-pointer justify-start gap-3">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm checkbox-primary"
                    checked={importCheckDuplicate}
                    onChange={(e) => setImportCheckDuplicate(e.target.checked)}
                  />
                  <span className="label-text">
                    Check trùng tọa độ với hệ thống
                    <span className="block text-xs opacity-70">So sánh với trạm/đề xuất đã có trên hệ thống (bán kính 200m)</span>
                  </span>
                </label>
                <label className="label cursor-pointer justify-start gap-3">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm checkbox-primary"
                    checked={importCheckIntraFile}
                    onChange={(e) => setImportCheckIntraFile(e.target.checked)}
                  />
                  <span className="label-text">
                    Check trùng tọa độ nội bộ file Excel
                    <span className="block text-xs opacity-70">Kiểm tra các dòng trùng tọa độ trong cùng file (bán kính 200m)</span>
                  </span>
                </label>
                <div className="modal-action">
                  <button className="btn btn-ghost" onClick={() => setShowImport(false)}>Hủy</button>
                  <button className="btn btn-primary" onClick={() => handlePreviewImport()} disabled={!importFile || importLoading}>
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
                <ImportViewPanel
                  detection={importPreview.detection}
                  views={excelViews}
                  value={importViewId}
                  onChange={handleChangeImportView}
                  loading={importLoading}
                />
                <ImportErrorList errors={importPreview.errors} failures={importFailures} />
                <div className="divider text-xs opacity-60 my-1">Tùy chọn kiểm tra</div>
                <label className="label cursor-pointer justify-start gap-3">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm checkbox-primary"
                    checked={importCheckDuplicate}
                    onChange={(e) => { setImportCheckDuplicate(e.target.checked); }}
                    disabled={importLoading}
                  />
                  <span className="label-text">
                    Check trùng tọa độ với hệ thống
                    <span className="block text-xs opacity-70">So sánh với trạm/đề xuất đã có trên hệ thống (bán kính 200m)</span>
                  </span>
                </label>
                <label className="label cursor-pointer justify-start gap-3">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm checkbox-primary"
                    checked={importCheckIntraFile}
                    onChange={(e) => { setImportCheckIntraFile(e.target.checked); }}
                    disabled={importLoading}
                  />
                  <span className="label-text">
                    Check trùng tọa độ nội bộ file Excel
                    <span className="block text-xs opacity-70">Kiểm tra các dòng trùng tọa độ trong cùng file (bán kính 200m)</span>
                  </span>
                </label>
                <label className="label cursor-pointer justify-start gap-3">
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-sm"
                    checked={importGeocode}
                    onChange={(e) => setImportGeocode(e.target.checked)}
                    disabled={importLoading}
                  />
                  <span className="label-text">
                    Tự suy Địa chỉ / Xã phường từ tọa độ (reverse geocode)
                    <span className="block text-xs opacity-70">Tắt sẽ import nhanh hơn nhiều (bỏ ~1 giây/dòng)</span>
                  </span>
                </label>
                {importLoading && importProgress && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Đang import...</span>
                      <span>{importProgress.done}/{importProgress.total} dòng</span>
                    </div>
                    <progress
                      className="progress progress-primary w-full"
                      value={importProgress.done}
                      max={Math.max(importProgress.total, 1)}
                    ></progress>
                  </div>
                )}
                {importResult && (
                  <div className={`alert ${importResult.status === 'done' ? 'alert-success' : importResult.status === 'partial' ? 'alert-warning' : importResult.status === 'cancelled' ? 'alert-warning' : 'alert-error'} text-sm`}>
                    <span>
                      {importResult.status === 'done' && `Import thành công: ${importResult.imported} bản ghi.`}
                      {importResult.status === 'partial' && `Import một phần: ${importResult.imported}/${importResult.total} thành công, ${importResult.failed} lỗi.`}
                      {importResult.status === 'cancelled' && `Đã hủy import: ${importResult.imported} đã tạo, ${importResult.failed} lỗi, ${importResult.pending} chưa xử lý.`}
                      {importResult.status === 'failed' && `Import thất bại${importResult.error ? `: ${importResult.error}` : '.'}`}
                      {' '}Chi tiết trong tab Excel của Audit Log.
                    </span>
                  </div>
                )}
                <div className="modal-action">
                  <button className="btn btn-ghost" onClick={() => setImportStep('upload')}>Quay lại</button>
                  <button className="btn btn-ghost" onClick={() => { setShowImport(false); setImportResult(null); }}>Hủy</button>
                  {importResult && ['partial', 'cancelled', 'failed'].includes(importResult.status) && (
                    <button className="btn btn-info" onClick={() => { setShowImport(false); setImportResult(null); navigate('/admin/audit-log'); }}>Xem trong tab Excel</button>
                  )}
                  <button className="btn btn-primary" onClick={handleConfirmImport} disabled={importPreview.rows.length === 0 || importLoading}>
                    {importLoading ? <span className="loading loading-spinner loading-xs"></span> : null}
                    {importLoading ? 'Đang import...' : `Import ${importPreview.validRows} trạm`}
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="modal-backdrop" />
        </dialog>
      )}

      {showCreateForm && (
        <dialog className="modal modal-open" onCancel={(e) => e.preventDefault()}>
          <div className="modal-box max-w-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Thêm trạm mới</h3>
              <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={() => setShowCreateForm(false)}>
                <X size={18} />
              </button>
            </div>
            <DynamicForm
              entity="stations"
              purpose="create"
              formId={STATIONS_FORM_ID}
              onSubmit={handleCreateSubmit}
              initialData={{}}
            >
              <button type="button" className="btn btn-ghost" onClick={() => setShowCreateForm(false)}>Hủy</button>
            </DynamicForm>
          </div>
          <div className="modal-backdrop" />
        </dialog>
      )}

      {popup.open && (
        <RecordDetailPopup
          entity="stations"
          record={popup.record}
          recordId={popup.record ? undefined : parseInt(location.pathname.match(/=(\d+)/)?.[1])}
          viewId={stationsViewId}
          mode={isSales ? 'view' : popup.mode}
          allowEdit={!isSales}
          onClose={() => {
            setPopup({ open: false, record: null, mode: 'view' });
            navigate('/admin/stations');
          }}
          onSaved={() => loadStations(pagination.page)}
          onSwitchMode={(newMode) => {
            const id = location.pathname.match(/=(\d+)/)?.[1];
            navigate(`/admin/stations/${newMode}=${id}`, { replace: true });
          }}
        />
      )}

      <DynamicTable
        ref={tableRef}
        entity="stations"
        viewId={stationsViewId}
        data={stations}
        actions={renderActions}
        startIndex={(pagination.page - 1) * pagination.limit}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onColumnFiltersChange={handleColumnFiltersChange}
      />

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={loadStations}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
};

export default AdminStationsPage;
