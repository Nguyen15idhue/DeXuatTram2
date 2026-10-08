import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { leadService, excelService } from '../../services/api';
import DynamicTable from '../../components/dynamic/DynamicTable';
import DynamicForm from '../../components/dynamic/DynamicForm';
import LeadDetailPopup from '../../components/admin/LeadDetailPopup';
import LeadAssignDialog from '../../components/admin/LeadAssignDialog';
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
import { Users, Upload, Plus, Search, RotateCcw, X, Trash2, Split, SlidersHorizontal } from 'lucide-react';

const AdminLeadsPage = () => {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const leadsViewId = useDefaultViewId('leads', null);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const { getSelectOptions } = useFieldOptions('leads', ['stage', 'source', 'province', 'customer_classification', 'sales_outcome']);
  const stageOptions = getSelectOptions('stage');
  const sourceOptions = getSelectOptions('source');
  const provinceOptions = getSelectOptions('province');
  const classificationOptions = getSelectOptions('customer_classification');
  const salesOutcomeOptions = getSelectOptions('sales_outcome');
  const [gdkvOptions, setGdkvOptions] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null, name: '' });
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [filterStage, setFilterStage] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterProvince, setFilterProvince] = useState('');
  const [filterClassification, setFilterClassification] = useState('');
  const [filterSalesOutcome, setFilterSalesOutcome] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateField, setDateField] = useState('created_at');
  const [showFilter, setShowFilter] = useState(false);
  const [columnFilters, setColumnFilters] = useState({});
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [pageSize, setPageSize] = useState(10);
  const [popup, setPopup] = useState({ open: false, recordId: null, mode: 'view' });
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
  const [importProgress, setImportProgress] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const importPollRef = useRef(null);

  const isRestricted = user?.role === 'SALES' || user?.role === 'MKT';

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    excelService.getViews('leads', token)
      .then(res => { if (!cancelled && res && res.success) setExcelViews(res.data || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    leadService.getGdkvOptions(token)
      .then(res => { if (!cancelled && res && res.success) setGdkvOptions(res.data || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  const departmentOptions = Array.from(new Set(gdkvOptions.map(o => o.department).filter(Boolean))).sort();

  useEffect(() => {
    const match = location.pathname.match(/\/admin\/leads\/(view|edit)=(\d+)/);
    if (match) {
      const mode = match[1];
      const id = parseInt(match[2]);
      setPopup({ open: true, recordId: id, mode });
    } else {
      setPopup({ open: false, recordId: null, mode: 'view' });
    }
  }, [location.pathname]);

  const loadLeads = useCallback(async (page = 1, overrides = {}) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page, limit: pageSize });
      const s = overrides.search !== undefined ? overrides.search : debouncedSearch;
      const st = overrides.filterStage !== undefined ? overrides.filterStage : filterStage;
      const so = overrides.filterSource !== undefined ? overrides.filterSource : filterSource;
      const pr = overrides.filterProvince !== undefined ? overrides.filterProvince : filterProvince;
      const cl = overrides.filterClassification !== undefined ? overrides.filterClassification : filterClassification;
      const oc = overrides.filterSalesOutcome !== undefined ? overrides.filterSalesOutcome : filterSalesOutcome;
      const dp = overrides.filterDepartment !== undefined ? overrides.filterDepartment : filterDepartment;
      const asg = overrides.filterAssignee !== undefined ? overrides.filterAssignee : filterAssignee;
      const df = overrides.dateFrom !== undefined ? overrides.dateFrom : dateFrom;
      const dt = overrides.dateTo !== undefined ? overrides.dateTo : dateTo;
      const dfield = overrides.dateField !== undefined ? overrides.dateField : dateField;
      const cf = overrides.columnFilters !== undefined ? overrides.columnFilters : columnFilters;
      if (s) params.append('search', s);
      if (st) params.append('stage', st);
      if (so) params.append('source', so);
      if (pr) params.append('province', pr);
      if (cl) params.append('customer_classification', cl);
      if (oc) params.append('sales_outcome', oc);
      if (dp) params.append('assigned_department', dp);
      if (asg) params.append('assigned_user_id', asg);
      if (df || dt) {
        params.append('date_field', dfield);
        if (df) params.append('date_from', df);
        if (dt) params.append('date_to', dt);
      }
      if (cf && Object.keys(cf).some(k => String(cf[k] ?? '').trim())) {
        const active = Object.fromEntries(Object.entries(cf).filter(([, v]) => String(v ?? '').trim()));
        Object.entries(active).forEach(([k, v]) => params.append(k, v));
      }
      const res = await leadService.getAllWithParams(params.toString(), token);
      if (res.success) {
        setLeads(res.data);
        setPagination(res.pagination || { page: 1, limit: pageSize, total: 0, totalPages: 1 });
      } else {
        setError(res.message || 'Lỗi tải danh sách Lead');
      }
    } catch {
      setError('Lỗi tải danh sách Lead');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filterStage, filterSource, filterProvince, filterClassification, filterSalesOutcome, filterDepartment, filterAssignee, dateFrom, dateTo, dateField, columnFilters, pageSize, token]);

  const handleColumnFiltersChange = useCallback((next) => {
    setColumnFilters(prev => (JSON.stringify(prev) === JSON.stringify(next || {}) ? prev : (next || {})));
  }, []);

  useEffect(() => { if (token) loadLeads(1); }, [loadLeads, token]);

  const handleSearch = () => { loadLeads(1); };

  const handleReset = () => {
    setSearch('');
    setFilterStage('');
    setFilterSource('');
    setFilterProvince('');
    setFilterClassification('');
    setFilterSalesOutcome('');
    setFilterDepartment('');
    setFilterAssignee('');
    setDateFrom('');
    setDateTo('');
    setDateField('created_at');
    setColumnFilters({});
    if (tableRef.current) tableRef.current.clearFilters();
    setError('');
    loadLeads(1, {
      search: '', filterStage: '', filterSource: '', filterProvince: '',
      filterClassification: '', filterSalesOutcome: '', filterDepartment: '',
      filterAssignee: '', dateFrom: '', dateTo: '', dateField: 'created_at', columnFilters: {}
    });
  };

  const handleCreateSubmit = async (formData) => {
    const res = await leadService.create(formData, token);
    if (res.success) {
      setToast({ message: res.message || 'Tạo Lead thành công', type: 'success' });
      setShowCreateForm(false);
      loadLeads(1);
    } else {
      throw new Error(res.message || 'Tạo Lead thất bại');
    }
  };

  const handleDeleteClick = (id, name) => setConfirmDelete({ isOpen: true, id, name });

  const handleConfirmDelete = async () => {
    const { id } = confirmDelete;
    setConfirmDelete({ isOpen: false, id: null, name: '' });
    try {
      const res = await leadService.delete(id, token);
      if (res.success) {
        setToast({ message: 'Xóa Lead thành công', type: 'success' });
        loadLeads(pagination.page);
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
    try {
      const res = await leadService.bulkDelete(selectedIds, token);
      if (res.success) {
        setToast({ message: res.message || `Đã xóa ${selectedIds.length} Lead`, type: 'success' });
        setSelectedIds([]);
        loadLeads(1);
      } else {
        setError(res.message || 'Xóa thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    } finally {
      setBulkLoading(false);
    }
  };

  const activeFilterCount = [filterStage, filterSource, filterProvince, filterClassification, filterSalesOutcome, filterDepartment, filterAssignee, dateFrom, dateTo]
    .filter(Boolean).length;

  const filterFields = (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <select className="select select-bordered select-sm w-full" value={filterStage} onChange={(e) => setFilterStage(e.target.value)}>
        <option value="">Tất cả giai đoạn</option>
        {stageOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select className="select select-bordered select-sm w-full" value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
        <option value="">Tất cả nguồn</option>
        {sourceOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select className="select select-bordered select-sm w-full" value={filterClassification} onChange={(e) => setFilterClassification(e.target.value)}>
        <option value="">Tất cả phân loại KH</option>
        <option value="__empty__">Chưa phân loại</option>
        {classificationOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select className="select select-bordered select-sm w-full" value={filterSalesOutcome} onChange={(e) => setFilterSalesOutcome(e.target.value)}>
        <option value="">Tất cả kết quả TVBH</option>
        <option value="__empty__">Chưa cập nhật</option>
        {salesOutcomeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select className="select select-bordered select-sm w-full" value={filterProvince} onChange={(e) => setFilterProvince(e.target.value)}>
        <option value="">Tất cả tỉnh/thành</option>
        {provinceOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select className="select select-bordered select-sm w-full" value={filterDepartment} onChange={(e) => setFilterDepartment(e.target.value)}>
        <option value="">Tất cả phòng ban</option>
        {departmentOptions.map(d => <option key={d} value={d}>{d}</option>)}
      </select>
      <select className="select select-bordered select-sm w-full" value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)}>
        <option value="">Tất cả người phụ trách</option>
        <option value="__empty__">Chưa giao phụ trách</option>
        {gdkvOptions.map(o => <option key={o.id} value={o.id}>{o.full_name}</option>)}
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
  );

  const handleExportLeads = async (viewIds) => {
    try {
      await excelService.exportData('leads', token, { search, status: filterStage, viewIds: viewIds || undefined });
      setToast({ message: 'Export Lead thành công', type: 'success' });
    } catch (err) {
      setError(err.message || 'Lỗi export Lead');
    }
  };

  const handleDownloadTemplate = async (viewIds) => {
    try {
      await excelService.downloadTemplate('leads', token, { viewIds: viewIds || undefined });
    } catch (err) {
      setError(err.message || 'Lỗi download template');
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
    const viewIdToUse = overrideViewId !== undefined ? overrideViewId : importViewId;
    try {
      setImportLoading(true);
      setError('');
      const res = await excelService.previewImport('leads', importFile, token, { viewId: viewIdToUse || undefined });
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
        setToast({ message: `Import thành công: ${data.imported} Lead`, type: 'success' });
        loadLeads(1);
      } else if (data.status === 'partial') {
        setToast({ message: `Import một phần: ${data.imported}/${data.total} thành công — xem tab Excel`, type: 'warning' });
        loadLeads(1);
      } else if (data.status === 'cancelled') {
        setToast({ message: `Đã hủy import: ${data.imported} đã tạo`, type: 'warning' });
        loadLeads(1);
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
      } catch { /* poll lỗi thì bỏ qua */ }
    }, 2000);
    try {
      setImportLoading(true);
      setError('');
      const res = await excelService.confirmImport('leads', importPreview.rows, token, { viewId: importPreview.viewId, jobId, fileName: (importFile && importFile.name) || null, columns: importPreview.columns || null });
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
        setToast({ message: `Đang xử lý import ${importPreview.rows.length} dòng — xong sẽ báo tại đây.`, type: 'info', duration: 5000 });
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
      <button className="btn btn-sm btn-primary" onClick={() => navigate(`/admin/leads/view=${row.id}`)}>Xem</button>
      <button className="btn btn-sm btn-warning" onClick={() => navigate(`/admin/leads/edit=${row.id}`)}>Sửa</button>
      <button className="btn btn-sm btn-error" onClick={() => handleDeleteClick(row.id, row.full_name)}>Xóa</button>
    </div>
  );

  return (
    <div>
      <Toast message={toast.message} type={toast.type} duration={toast.duration} onClose={() => setToast({ message: '', type: 'success' })} />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <Users size={24} className="text-primary shrink-0" />
          <h1 className="text-2xl font-bold">Quản lý Leads</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary btn-sm gap-1" onClick={() => { setShowCreateForm(true); setError(''); }}>
            <Plus size={14} /> Thêm Lead
          </button>
          <ViewPickerMenu label="Template" views={excelViews} onPick={handleDownloadTemplate} title="Chọn bộ cột cho file mẫu" />
          <ViewPickerMenu label="Export" views={excelViews} onPick={handleExportLeads} title="Chọn bộ cột để export" />
          <button className="btn btn-ghost btn-sm gap-1" onClick={openImport}>
            <Upload size={14} /> Import
          </button>
        </div>
      </div>

      {error && <ErrorMessage message={error} onRetry={() => { setError(''); loadLeads(1); }} />}

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Xóa Lead"
        message={`Bạn có chắc chắn muốn xóa Lead "${confirmDelete.name}"?`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete({ isOpen: false, id: null, name: '' })}
        confirmText="Xóa"
        type="danger"
      />

      <ConfirmDialog
        isOpen={confirmBulkDelete}
        title="Xóa nhiều Lead"
        message={`Bạn có chắc chắn muốn xóa ${selectedIds.length} Lead đã chọn?`}
        onConfirm={handleConfirmBulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
        confirmText="Xóa"
        type="danger"
      />

      <div className="flex items-center gap-2 mb-3">
        <input
          type="text"
          placeholder="Search theo tên, SĐT, mã Lead..."
          className="input input-bordered input-sm flex-1 min-w-0"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button className="btn btn-primary btn-sm gap-1 shrink-0" onClick={handleSearch}>
          <Search size={14} /> <span className="hidden sm:inline">Tìm</span>
        </button>
        <button className="btn btn-outline btn-sm gap-1 shrink-0" onClick={() => setShowFilter(v => !v)}>
          <SlidersHorizontal size={14} /> <span className="hidden sm:inline">Bộ lọc</span>
          <span className="inline-flex items-center justify-center" style={{ width: 18 }}>
            {activeFilterCount > 0 ? <span className="badge badge-primary badge-sm">{activeFilterCount}</span> : null}
          </span>
        </button>
      </div>

      {isDesktop && showFilter && (
        <div className="border border-base-300 rounded-lg p-3 mb-4 bg-base-100">
          {filterFields}
        </div>
      )}

      {!isDesktop && showFilter && (
        <dialog className="modal modal-open" onCancel={(e) => { e.preventDefault(); setShowFilter(false); }}>
          <div className="modal-box max-w-lg" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, margin: 0, borderRadius: '16px 16px 0 0' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-base">Bộ lọc Lead</h3>
              <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={() => setShowFilter(false)}><X size={16} /></button>
            </div>
            {filterFields}
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={() => { setShowFilter(false); handleReset(); }}>Xóa lọc</button>
              <button className="btn btn-primary" onClick={() => { setShowFilter(false); handleSearch(); }}>Áp dụng</button>
            </div>
          </div>
          <div className="modal-backdrop bg-black/50" onClick={() => setShowFilter(false)} />
        </dialog>
      )}

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 px-3 py-2 bg-base-200 rounded-lg">
          <span className="text-sm font-medium">Đã chọn: {selectedIds.length} Lead</span>
          <button className="btn btn-primary btn-sm gap-1" onClick={() => setAssignOpen(true)} disabled={bulkLoading}>
            <Split size={14} /> Phân chia ({selectedIds.length})
          </button>
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
              <h3 className="font-bold text-lg">Import Leads từ Excel</h3>
              <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={() => setShowImport(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            {importStep === 'upload' && (
              <div className="space-y-4">
                <div className="form-control">
                  <label className="label"><span className="label-text">Chọn file Excel (.xlsx)</span></label>
                  <input type="file" accept=".xlsx,.xls" className="file-input file-input-bordered w-full" onChange={handleFileSelect} />
                </div>
                {importFile && (
                  <div className="alert alert-info">
                    <span>File: <strong>{importFile.name}</strong> ({(importFile.size / 1024).toFixed(1)} KB)</span>
                  </div>
                )}
                <div className="form-control">
                  <label className="label"><span className="label-text">Bộ cột</span></label>
                  <select className="select select-bordered w-full" value={importViewId} onChange={(e) => setImportViewId(e.target.value)}>
                    <option value="">Tự nhận diện theo file (khuyến nghị)</option>
                    {excelViews.map(v => <option key={v.id} value={v.id}>{usageLabel(v.usage)} – {v.name}</option>)}
                  </select>
                </div>
                <div className="modal-action">
                  <button className="btn btn-ghost" onClick={() => setShowImport(false)}>Hủy</button>
                  <button className="btn btn-primary" onClick={() => handlePreviewImport()} disabled={!importFile || importLoading}>
                    {importLoading && <span className="loading loading-spinner loading-xs"></span>}
                    {importLoading ? 'Đang đọc...' : 'Xem trước'}
                  </button>
                </div>
              </div>
            )}
            {importStep === 'preview' && importPreview && (
              <div className="space-y-4">
                <div className="stats shadow w-full">
                  <div className="stat"><div className="stat-title">Tổng dòng</div><div className="stat-value text-lg">{importPreview.totalRows}</div></div>
                  <div className="stat"><div className="stat-title text-success">Hợp lệ</div><div className="stat-value text-lg text-success">{importPreview.validRows}</div></div>
                  {importPreview.errorRows > 0 && (
                    <div className="stat"><div className="stat-title text-error">Lỗi</div><div className="stat-value text-lg text-error">{importPreview.errorRows}</div></div>
                  )}
                </div>
                <ImportViewPanel detection={importPreview.detection} views={excelViews} value={importViewId} onChange={handleChangeImportView} loading={importLoading} />
                <ImportErrorList errors={importPreview.errors} failures={importFailures} />
                {importLoading && importProgress && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Đang import...</span>
                      <span>{importProgress.done}/{importProgress.total} dòng</span>
                    </div>
                    <progress className="progress progress-primary w-full" value={importProgress.done} max={Math.max(importProgress.total, 1)}></progress>
                  </div>
                )}
                {importResult && (
                  <div className={`alert ${importResult.status === 'done' ? 'alert-success' : importResult.status === 'partial' || importResult.status === 'cancelled' ? 'alert-warning' : 'alert-error'} text-sm`}>
                    <span>
                      {importResult.status === 'done' && `Import thành công: ${importResult.imported} Lead.`}
                      {importResult.status === 'partial' && `Import một phần: ${importResult.imported}/${importResult.total} thành công, ${importResult.failed} lỗi.`}
                      {importResult.status === 'cancelled' && `Đã hủy import: ${importResult.imported} đã tạo, ${importResult.pending} chưa xử lý.`}
                      {importResult.status === 'failed' && `Import thất bại${importResult.error ? `: ${importResult.error}` : '.'}`}
                    </span>
                  </div>
                )}
                <div className="modal-action">
                  <button className="btn btn-ghost" onClick={() => setImportStep('upload')}>Quay lại</button>
                  <button className="btn btn-ghost" onClick={() => { setShowImport(false); setImportResult(null); }}>Hủy</button>
                  <button className="btn btn-primary" onClick={handleConfirmImport} disabled={importPreview.rows.length === 0 || importLoading}>
                    {importLoading && <span className="loading loading-spinner loading-xs"></span>}
                    {importLoading ? 'Đang import...' : `Import ${importPreview.validRows} Lead`}
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
              <h3 className="font-bold text-lg">Thêm Lead mới</h3>
              <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={() => setShowCreateForm(false)}>
                <X size={18} />
              </button>
            </div>
            <DynamicForm entity="leads" purpose="create" onSubmit={handleCreateSubmit} initialData={{}}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowCreateForm(false)}>Hủy</button>
            </DynamicForm>
          </div>
          <div className="modal-backdrop" />
        </dialog>
      )}

      <LeadAssignDialog
        open={assignOpen}
        leads={leads.filter(l => selectedIds.includes(l.id))}
        onClose={() => setAssignOpen(false)}
        onDone={(res) => {
          setToast({ message: (res && res.message) || 'Phân chia Lead thành công', type: 'success' });
          setSelectedIds([]);
          loadLeads(1);
        }}
      />

      {popup.open && (
        <LeadDetailPopup
          recordId={popup.recordId}
          mode={popup.mode}
          onClose={() => { setPopup({ open: false, recordId: null, mode: 'view' }); navigate('/admin/leads'); }}
          onSaved={() => loadLeads(pagination.page)}
          onSwitchMode={(newMode) => navigate(`/admin/leads/${newMode}=${popup.recordId}`, { replace: true })}
        />
      )}

      {leadsViewId && (
        <DynamicTable
          ref={tableRef}
          entity="leads"
          viewId={leadsViewId}
          data={leads}
          actions={renderActions}
          startIndex={(pagination.page - 1) * pagination.limit}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onColumnFiltersChange={handleColumnFiltersChange}
        />
      )}
      {!leadsViewId && !loading && <div className="text-sm text-base-content/60 py-4">Chưa có bảng (view) cho Lead.</div>}

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={loadLeads}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
};

export default AdminLeadsPage;
