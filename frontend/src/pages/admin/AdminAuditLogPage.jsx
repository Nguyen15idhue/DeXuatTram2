import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { queueLogService, proposalLogService, importJobService } from '../../services/api';
import { getStatusLabel } from '../../utils/mapStatuses';
import { History, RefreshCw, Search, X, RotateCcw, Ban, Eye, ChevronLeft, ChevronRight, Filter, AlertTriangle, CheckCircle2, Clock, XCircle, Loader2 } from 'lucide-react';
import Toast from '../../components/Toast';

const STATUS_CONFIG = {
  pending: { label: 'Chờ xử lý', color: 'badge-warning', icon: Clock },
  processing: { label: 'Đang xử lý', color: 'badge-info', icon: Loader2 },
  completed: { label: 'Thành công', color: 'badge-success', icon: CheckCircle2 },
  failed: { label: 'Thất bại', color: 'badge-error', icon: XCircle },
  cancelled: { label: 'Đã hủy', color: 'badge-ghost', icon: Ban }
};

const DIRECTION_LABEL = { push: 'Push → 1Office', pull: 'Pull ← 1Office' };

const ACTIVITY_ACTIONS = [
  { value: '', label: 'Tất cả hành động' },
  { value: 'created', label: 'Tạo đề xuất' },
  { value: 'updated', label: 'Cập nhật nội dung' },
  { value: 'status_change', label: 'Đổi trạng thái' },
  { value: 'status_change_denied', label: 'Đổi trạng thái bị chặn' },
  { value: 'station_created', label: 'Tạo trạm' },
  { value: 'auto_failed', label: 'Tự động thất bại' },
  { value: 'info_completed', label: 'Xác nhận đủ thông tin' },
  { value: 'info_reopened', label: 'Mở lại bổ sung' },
  { value: 'deadline_extended', label: 'Gia hạn bổ sung' },
  { value: 'deadline_expiring', label: 'Sắp hết hạn bổ sung' },
  { value: 'deadline_overdue', label: 'Quá hạn bổ sung' }
];

const ACTIVITY_SOURCES = [
  { value: '', label: 'Tất cả nguồn' },
  { value: 'user', label: 'Người dùng' },
  { value: 'webhook', label: 'Webhook 1Office' },
  { value: 'script', label: 'Script demo' },
  { value: 'system_auto', label: 'Tự động' },
  { value: 'admin_override', label: 'Admin ghi đè' },
  { value: 'import', label: 'Nhập Excel' },
  { value: 'restore', label: 'Khôi phục 1Office' }
];

const ACTIVITY_ACTION_LABEL = Object.fromEntries(ACTIVITY_ACTIONS.filter(o => o.value).map(o => [o.value, o.label]));
const ACTIVITY_SOURCE_LABEL = Object.fromEntries(ACTIVITY_SOURCES.filter(o => o.value).map(o => [o.value, o.label]));

const ACTIVITY_ACTION_BADGE = {
  created: 'badge-info',
  updated: 'badge-ghost',
  status_change: 'badge-success',
  status_change_denied: 'badge-error',
  station_created: 'badge-primary',
  auto_failed: 'badge-warning',
  info_completed: 'badge-success',
  info_reopened: 'badge-warning',
  deadline_extended: 'badge-info',
  deadline_expiring: 'badge-warning',
  deadline_overdue: 'badge-error'
};

const IMPORT_STATUS_CONFIG = {
  queued: { label: 'Chờ', color: 'badge-warning', icon: Clock },
  processing: { label: 'Đang chạy', color: 'badge-info', icon: Loader2 },
  done: { label: 'Xong', color: 'badge-success', icon: CheckCircle2 },
  partial: { label: 'Một phần', color: 'badge-warning', icon: AlertTriangle },
  failed: { label: 'Thất bại', color: 'badge-error', icon: XCircle },
  cancelled: { label: 'Đã hủy', color: 'badge-ghost', icon: Ban }
};

const IMPORT_ENTITY_LABEL = {
  stations: 'Trạm',
  station_proposals: 'Đề xuất',
  users: 'Người dùng'
};

const IMPORT_ENTITY_BADGE = {
  stations: 'badge-info',
  station_proposals: 'badge-warning',
  users: 'badge-primary'
};

const importEntityLabel = (entity) => {
  if (!entity) return '—';
  if (IMPORT_ENTITY_LABEL[entity]) return IMPORT_ENTITY_LABEL[entity];
  if (String(entity).startsWith('data_list:')) return 'Danh mục';
  return entity;
};

const summarizeRowData = (data) => {
  if (!data || typeof data !== 'object') return '—';
  const pick = ['name', 'full_name', 'owner_name', 'ma_tram', 'email', 'phone', 'owner_phone', 'address'];
  const parts = [];
  pick.forEach((k) => {
    if (data[k] !== undefined && data[k] !== null && String(data[k]).trim() !== '') parts.push(String(data[k]).slice(0, 40));
  });
  Object.keys(data).forEach((k) => {
    if (parts.length >= 3 || pick.includes(k)) return;
    const v = data[k];
    if (v !== undefined && v !== null && String(v).trim() !== '' && typeof v !== 'object') parts.push(String(v).slice(0, 40));
  });
  return parts.slice(0, 3).join(' · ') || '—';
};

function AdminAuditLogPage() {
  const { token, isSuperAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ message: '', type: 'error' });
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ id: '', status: '', direction: '', action: '', code: '', actor: '', date_from: '', date_to: '' });
  const [showDetail, setShowDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('sync');
  const [alogs, setAlogs] = useState([]);
  const [aloading, setAloading] = useState(false);
  const [apagination, setApagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [logPageSize, setLogPageSize] = useState(20);
  const [activityPageSize, setActivityPageSize] = useState(20);
  const logPageSizeRef = useRef(20);
  const activityPageSizeRef = useRef(20);
  const [afilters, setAfilters] = useState({ id: '', proposal_id: '', code: '', actor: '', action: '', source: '', date_from: '', date_to: '' });
  const [activityDetail, setActivityDetail] = useState(null);
  const [elogs, setElogs] = useState([]);
  const [eloading, setEloading] = useState(false);
  const [epagination, setEpagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [excelPageSize, setExcelPageSize] = useState(20);
  const excelPageSizeRef = useRef(20);
  const [efilters, setEfilters] = useState({ entity: '', status: '', date_from: '', date_to: '' });
  const [excelDetail, setExcelDetail] = useState(null);
  const [excelDetailLoading, setExcelDetailLoading] = useState(false);
  const [excelFailPage, setExcelFailPage] = useState(1);
  const [excelPendingPage, setExcelPendingPage] = useState(1);
  const [excelCancelling, setExcelCancelling] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const res = await queueLogService.getStats(null, token);
      if (res.success) setStats(res.data);
    } catch {}
  }, [token]);

  const loadLogsWith = useCallback(async (applied, page = 1, limit = logPageSizeRef.current) => {
    setLoading(true);
    try {
      const res = await queueLogService.getAll({ ...applied, page, limit }, token);
      if (res.success) {
        setLogs(res.data || []);
        setPagination(res.pagination || { page: 1, limit, total: 0, totalPages: 0 });
      }
    } catch (err) {
      setToast({ message: err.message || 'Lỗi tải logs', type: 'error' });
    }
    setLoading(false);
  }, [token]);

  const loadActivityWith = useCallback(async (applied, page = 1, limit = activityPageSizeRef.current) => {
    setAloading(true);
    try {
      const res = await proposalLogService.getAll({ ...applied, page, limit }, token);
      if (res.success) {
        setAlogs(res.data || []);
        setApagination(res.pagination || { page: 1, limit, total: 0, totalPages: 0 });
      }
    } catch (err) {
      setToast({ message: err.message || 'Lỗi tải log hoạt động', type: 'error' });
    }
    setAloading(false);
  }, [token]);

  const changeLogPageSize = (n) => {
    logPageSizeRef.current = n;
    setLogPageSize(n);
    loadLogsWith(filters, 1, n);
  };

  const changeActivityPageSize = (n) => {
    activityPageSizeRef.current = n;
    setActivityPageSize(n);
    loadActivityWith(afilters, 1, n);
  };

  const loadExcelWith = useCallback(async (applied, page = 1, limit = excelPageSizeRef.current) => {
    setEloading(true);
    try {
      const res = await importJobService.list({ ...applied, page, limit }, token);
      if (res.success) {
        setElogs(res.data || []);
        setEpagination(res.pagination || { page: 1, limit, total: 0, totalPages: 0 });
      }
    } catch (err) {
      setToast({ message: err.message || 'Lỗi tải log import', type: 'error' });
    }
    setEloading(false);
  }, [token]);

  const changeExcelPageSize = (n) => {
    excelPageSizeRef.current = n;
    setExcelPageSize(n);
    loadExcelWith(efilters, 1, n);
  };

  const showExcelDetail = async (id) => {
    setExcelDetailLoading(true);
    setExcelDetail(null);
    setExcelFailPage(1);
    setExcelPendingPage(1);
    try {
      const res = await importJobService.getById(id, token);
      if (res.success) setExcelDetail(res.data);
    } catch (err) {
      setToast({ message: err.message || 'Lỗi tải chi tiết', type: 'error' });
    }
    setExcelDetailLoading(false);
  };

  const handleExcelCancel = async (id) => {
    setExcelCancelling(true);
    try {
      const res = await importJobService.cancel(id, token);
      if (res.success) {
        setToast({ message: 'Đã hủy job import', type: 'success' });
        if (excelDetail && excelDetail.id === id) setExcelDetail(res.data);
        loadExcelWith(efilters, epagination.page);
      } else {
        setToast({ message: res.message || 'Lỗi hủy job', type: 'error' });
      }
    } catch (err) {
      setToast({ message: err.message || 'Lỗi hủy job', type: 'error' });
    }
    setExcelCancelling(false);
  };

  const handleExcelExport = async (id, kind) => {
    try {
      if (kind === 'success') await importJobService.exportSuccess(id, token);
      else await importJobService.exportFailed(id, token);
      setToast({ message: 'Đã tải file', type: 'success' });
    } catch (err) {
      setToast({ message: err.message || 'Lỗi xuất file', type: 'error' });
    }
  };

  useEffect(() => { loadLogsWith(filters, 1); loadStats(); }, []);
  useEffect(() => { if (activeTab === 'activity') loadActivityWith(afilters, 1); }, [activeTab]);
  useEffect(() => { if (activeTab === 'excel') loadExcelWith(efilters, 1); }, [activeTab]);
  useEffect(() => {
    const st = location.state;
    if (st && st.tab === 'excel') {
      setActiveTab('excel');
      if (st.jobId) showExcelDetail(st.jobId);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, []);
  useEffect(() => {
    if (activeTab !== 'excel') return undefined;
    if (!(elogs || []).some((l) => l.status === 'queued' || l.status === 'processing')) return undefined;
    const timer = setInterval(() => loadExcelWith(efilters, epagination.page), 3000);
    return () => clearInterval(timer);
  }, [activeTab, elogs, efilters, epagination.page, loadExcelWith]);

  const TEXT_KEYS = ['id', 'action', 'code', 'actor'];
  const ATEXT_KEYS = ['id', 'proposal_id', 'code', 'actor'];
  const [draft, setDraft] = useState({ id: '', action: '', code: '', actor: '' });
  const [adraft, setAdraft] = useState({ id: '', proposal_id: '', code: '', actor: '' });

  const handleDraftChange = (key, value) => setDraft(prev => ({ ...prev, [key]: value }));
  const handleADraftChange = (key, value) => setAdraft(prev => ({ ...prev, [key]: value }));
  const applyFilters = () => {
    const next = { ...filters };
    TEXT_KEYS.forEach(k => { next[k] = draft[k] || ''; });
    setFilters(next);
    loadLogsWith(next, 1);
  };
  const applySelectFilter = (key, value) => {
    const next = { ...filters, [key]: value };
    setFilters(next);
    loadLogsWith(next, 1);
  };
  const clearFilters = () => {
    const cleared = { id: '', status: '', direction: '', action: '', code: '', actor: '', date_from: '', date_to: '' };
    setDraft({ id: '', action: '', code: '', actor: '' });
    setFilters(cleared);
    loadLogsWith(cleared, 1);
  };
  const applyAFilters = () => {
    const next = { ...afilters };
    ATEXT_KEYS.forEach(k => { next[k] = adraft[k] || ''; });
    setAfilters(next);
    loadActivityWith(next, 1);
  };
  const applyASelectFilter = (key, value) => {
    const next = { ...afilters, [key]: value };
    setAfilters(next);
    loadActivityWith(next, 1);
  };
  const clearAFilters = () => {
    const cleared = { id: '', proposal_id: '', code: '', actor: '', action: '', source: '', date_from: '', date_to: '' };
    setAdraft({ id: '', proposal_id: '', code: '', actor: '' });
    setAfilters(cleared);
    loadActivityWith(cleared, 1);
  };
  const applyESelectFilter = (key, value) => {
    const next = { ...efilters, [key]: value };
    setEfilters(next);
    loadExcelWith(next, 1);
  };
  const clearEFilters = () => {
    const cleared = { entity: '', status: '', date_from: '', date_to: '' };
    setEfilters(cleared);
    loadExcelWith(cleared, 1);
  };
  const onEnterApply = (fn) => (e) => { if (e.key === 'Enter') fn(); };

  const syncActors = useMemo(() => {
    const s = new Set();
    (logs || []).forEach(l => { if (l.full_name) s.add(l.full_name); });
    return [...s].sort();
  }, [logs]);
  const activityActors = useMemo(() => {
    const s = new Set();
    (alogs || []).forEach(l => { if (l.actor_name) s.add(l.actor_name); });
    return [...s].sort();
  }, [alogs]);

  const parseChanged = (log) => {
    const raw = log && log.changed_fields;
    if (!raw) return null;
    try {
      const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return obj && Object.keys(obj).length > 0 ? obj : null;
    } catch { return null; }
  };

  const handleRetry = async (id) => {
    try {
      const res = await queueLogService.retry(id, token);
      if (res.success) {
        setToast({ message: 'Đã tái xử lý job', type: 'success' });
        loadLogsWith(filters, pagination.page);
        loadStats();
      }
    } catch (err) {
      setToast({ message: err.message || 'Lỗi retry', type: 'error' });
    }
  };

  const handleCancel = async (id) => {
    try {
      const res = await queueLogService.cancel(id, token);
      if (res.success) {
        setToast({ message: 'Đã hủy job', type: 'success' });
        loadLogsWith(filters, pagination.page);
        loadStats();
      }
    } catch (err) {
      setToast({ message: err.message || 'Lỗi cancel', type: 'error' });
    }
  };

  const showDetailPopup = async (id) => {
    setDetailLoading(true);
    setShowDetail(null);
    try {
      const res = await queueLogService.getById(id, token);
      if (res.success) setShowDetail(res.data);
    } catch (err) {
      setToast({ message: err.message || 'Lỗi tải chi tiết', type: 'error' });
    }
    setDetailLoading(false);
  };

  const formatJson = (obj) => {
    if (!obj) return '—';
    try {
      const str = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
      return str.length > 500 ? str.slice(0, 500) + '...' : str;
    } catch { return String(obj); }
  };

  const formatDuration = (start, end) => {
    if (!start || !end) return '—';
    const ms = new Date(end) - new Date(start);
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="space-y-6">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'error' })} />

      <div className="flex items-center gap-3">
        <History size={24} className="text-primary" />
        <h1 className="text-2xl font-bold">Audit Log</h1>
      </div>

      <div className="tabs tabs-boxed w-fit">
        <button className={`tab ${activeTab === 'sync' ? 'tab-active' : ''}`} onClick={() => setActiveTab('sync')}>
          Lịch sử đồng bộ
        </button>
        <button className={`tab ${activeTab === 'activity' ? 'tab-active' : ''}`} onClick={() => setActiveTab('activity')}>
          Hoạt động đề xuất
        </button>
        <button className={`tab ${activeTab === 'excel' ? 'tab-active' : ''}`} onClick={() => setActiveTab('excel')}>
          Excel
        </button>
      </div>

      {activeTab === 'sync' && (<>
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { key: 'total', label: 'Tổng cộng', color: 'bg-base-100 border border-base-300' },
            { key: 'pending', label: 'Chờ xử lý', color: 'bg-warning/10 border border-warning/30' },
            { key: 'processing', label: 'Đang xử lý', color: 'bg-info/10 border border-info/30' },
            { key: 'completed', label: 'Thành công', color: 'bg-success/10 border border-success/30' },
            { key: 'failed', label: 'Thất bại', color: 'bg-error/10 border border-error/30' }
          ].map(item => (
            <div key={item.key} className={`rounded-lg p-4 ${item.color}`}>
              <div className="text-sm text-base-content/60">{item.label}</div>
              <div className="text-2xl font-bold mt-1">{stats[item.key] || 0}</div>
            </div>
          ))}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-base-100 rounded-lg border border-base-300 p-4">
            <div className="text-sm font-medium mb-3">Phân bổ trạng thái</div>
            <div className="space-y-2">
              {[
                { key: 'completed', label: 'Thành công', color: 'bg-success' },
                { key: 'failed', label: 'Thất bại', color: 'bg-error' },
                { key: 'pending', label: 'Chờ xử lý', color: 'bg-warning' },
                { key: 'processing', label: 'Đang xử lý', color: 'bg-info' },
                { key: 'cancelled', label: 'Đã hủy', color: 'bg-base-content/30' }
              ].map(item => {
                const count = stats[item.key] || 0;
                const total = stats.total || 1;
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={item.key} className="flex items-center gap-2">
                    <span className="text-xs w-24 text-base-content/70">{item.label}</span>
                    <div className="flex-1 bg-base-200 rounded-full h-4 overflow-hidden">
                      <div className={`${item.color} h-full rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs w-16 text-right text-base-content/60">{count} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
          </div>

          {stats.topErrors && stats.topErrors.length > 0 && (
            <div className="bg-base-100 rounded-lg border border-base-300 p-4">
              <div className="text-sm font-medium mb-3">Lỗi thường gặp</div>
              <div className="space-y-2">
                {stats.topErrors.map((err, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="badge badge-error badge-sm mt-0.5">{err.count}</span>
                    <span className="text-base-content/70 line-clamp-2">{err.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-base-100 rounded-lg border border-base-300 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={16} />
          <span className="text-sm font-medium">Bộ lọc</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input type="number" className="input input-bordered input-sm" placeholder="ID..." value={draft.id} onChange={e => handleDraftChange('id', e.target.value)} onKeyDown={onEnterApply(applyFilters)} />
          <select className="select select-bordered select-sm" value={filters.status} onChange={e => applySelectFilter('status', e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="select select-bordered select-sm" value={filters.direction} onChange={e => applySelectFilter('direction', e.target.value)}>
            <option value="">Tất cả hướng</option>
            <option value="push">Push → 1Office</option>
            <option value="pull">Pull ← 1Office</option>
          </select>
          <input type="text" className="input input-bordered input-sm" placeholder="Action..." value={draft.action} onChange={e => handleDraftChange('action', e.target.value)} onKeyDown={onEnterApply(applyFilters)} />
          <input type="text" className="input input-bordered input-sm" placeholder="Mã đề xuất..." value={draft.code} onChange={e => handleDraftChange('code', e.target.value)} onKeyDown={onEnterApply(applyFilters)} />
          <input type="text" className="input input-bordered input-sm" placeholder="Người thực hiện..." list="sync-actors" value={draft.actor} onChange={e => handleDraftChange('actor', e.target.value)} onKeyDown={onEnterApply(applyFilters)} />
          <datalist id="sync-actors">
            {syncActors.map(n => <option key={n} value={n} />)}
          </datalist>
          <input type="date" className="input input-bordered input-sm" value={filters.date_from} onChange={e => applySelectFilter('date_from', e.target.value)} />
          <input type="date" className="input input-bordered input-sm" value={filters.date_to} onChange={e => applySelectFilter('date_to', e.target.value)} />
        </div>
        <div className="flex gap-2 mt-3">
          <button className="btn btn-primary btn-sm gap-1" onClick={applyFilters}><Search size={14} /> Lọc</button>
          <button className="btn btn-ghost btn-sm gap-1" onClick={clearFilters}><X size={14} /> Xóa bộ lọc</button>
          <button className="btn btn-ghost btn-sm gap-1" onClick={() => loadLogsWith(filters, pagination.page)}><RefreshCw size={14} /> Làm mới</button>
        </div>
      </div>

      <div className="bg-base-100 rounded-lg border border-base-300 overflow-x-auto">
        <table className="table table-zebra table-sm">
          <thead>
            <tr className="bg-base-200">
              <th className="w-16">ID</th>
              <th>Hướng</th>
              <th>Action</th>
              <th>Mã đề xuất</th>
              <th>Người thực hiện</th>
              <th>Trạng thái</th>
              <th>Thời gian</th>
              <th>Thời gian xử lý</th>
              <th className="w-24">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-base-content/50">{loading ? 'Đang tải...' : 'Không có logs'}</td></tr>
            ) : (
            <>
            {loading && (
              <tr><td colSpan={9} className="text-center text-xs text-base-content/40 py-1">Đang tải...</td></tr>
            )}
            {logs.map(log => {
              const st = STATUS_CONFIG[log.status] || STATUS_CONFIG.pending;
              const Icon = st.icon;
              return (
                <tr key={log.id} className="hover">
                  <td className="font-mono text-xs">{log.id}</td>
                  <td><span className="text-xs">{DIRECTION_LABEL[log.direction] || log.direction}</span></td>
                  <td><span className="badge badge-sm badge-outline">{log.action}</span></td>
                  <td className="text-xs font-medium">{log.ma_de_xuat || `#${log.entity_id}`}</td>
                  <td className="text-xs">{log.full_name || '—'}</td>
                  <td>
                    <span className={`badge badge-sm ${st.color} gap-1 whitespace-nowrap`}>
                      <Icon size={12} className="shrink-0" /> {st.label}
                    </span>
                  </td>
                  <td className="text-xs">{log.created_at ? new Date(log.created_at).toLocaleString('vi-VN') : '—'}</td>
                  <td className="text-xs">{formatDuration(log.started_at, log.completed_at)}</td>
                  <td>
                    <div className="flex gap-1">
                      <button className="btn btn-ghost btn-xs" onClick={() => showDetailPopup(log.id)} title="Xem chi tiết"><Eye size={14} /></button>
                      {isSuperAdmin && log.status === 'failed' && (
                        <button className="btn btn-ghost btn-xs text-warning" onClick={() => handleRetry(log.id)} title="Retry"><RotateCcw size={14} /></button>
                      )}
                      {isSuperAdmin && (log.status === 'pending' || log.status === 'failed') && (
                        <button className="btn btn-ghost btn-xs text-error" onClick={() => handleCancel(log.id)} title="Cancel"><Ban size={14} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            </>
            )}
          </tbody>
        </table>
      </div>

      {pagination.total > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-base-content/60">
            Trang {pagination.page}/{pagination.totalPages} — Tổng {pagination.total} bản ghi
          </span>
          <div className="flex items-center gap-2">
            <select className="select select-bordered select-sm w-28" value={logPageSize} onChange={(e) => changeLogPageSize(Number(e.target.value))}>
              {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n} / trang</option>)}
            </select>
            <div className="join">
              <button className="join-item btn btn-sm" disabled={pagination.page <= 1} onClick={() => loadLogsWith(filters, pagination.page - 1)}><ChevronLeft size={14} /></button>
              {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
                let pageNum;
                if (pagination.totalPages <= 5) pageNum = i + 1;
                else if (pagination.page <= 3) pageNum = i + 1;
                else if (pagination.page >= pagination.totalPages - 2) pageNum = pagination.totalPages - 4 + i;
                else pageNum = pagination.page - 2 + i;
                return (
                  <button key={pageNum} className={`join-item btn btn-sm ${pagination.page === pageNum ? 'btn-active' : ''}`} onClick={() => loadLogsWith(filters, pageNum)}>{pageNum}</button>
                );
              })}
              <button className="join-item btn btn-sm" disabled={pagination.page >= pagination.totalPages} onClick={() => loadLogsWith(filters, pagination.page + 1)}><ChevronRight size={14} /></button>
            </div>
          </div>
        </div>
      )}
      </>)}

      {activeTab === 'excel' && (<>      {activeTab === 'excel' && (
      <>
      <div className="bg-base-100 rounded-lg border border-base-300 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={16} />
          <span className="text-sm font-medium">Bộ lọc import</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <select className="select select-bordered select-sm" value={efilters.entity} onChange={e => applyESelectFilter('entity', e.target.value)}>
            <option value="">Tất cả phân loại</option>
            <option value="stations">Trạm</option>
            <option value="station_proposals">Đề xuất</option>
            <option value="users">Người dùng</option>
          </select>
          <select className="select select-bordered select-sm" value={efilters.status} onChange={e => applyESelectFilter('status', e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            {Object.entries(IMPORT_STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <input type="date" className="input input-bordered input-sm" value={efilters.date_from} onChange={e => applyESelectFilter('date_from', e.target.value)} />
          <input type="date" className="input input-bordered input-sm" value={efilters.date_to} onChange={e => applyESelectFilter('date_to', e.target.value)} />
        </div>
        <div className="flex gap-2 mt-3">
          <button className="btn btn-ghost btn-sm gap-1" onClick={clearEFilters}><X size={14} /> Xóa bộ lọc</button>
          <button className="btn btn-ghost btn-sm gap-1" onClick={() => loadExcelWith(efilters, epagination.page)}><RefreshCw size={14} /> Làm mới</button>
        </div>
      </div>

      <div className="bg-base-100 rounded-lg border border-base-300 overflow-x-auto">
        <table className="table table-zebra table-sm">
          <thead>
            <tr className="bg-base-200">
              <th className="w-16">STT</th>
              <th>Hành động</th>
              <th>Phân loại</th>
              <th>Người thực hiện</th>
              <th>Thời gian</th>
              <th>Trạng thái</th>
              <th className="w-16">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {elogs.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-base-content/50">{eloading ? 'Đang tải...' : 'Không có job import'}</td></tr>
            ) : (
            <>
            {eloading && (
              <tr><td colSpan={7} className="text-center text-xs text-base-content/40 py-1">Đang tải...</td></tr>
            )}
            {elogs.map((log, idx) => {
              const st = IMPORT_STATUS_CONFIG[log.status] || IMPORT_STATUS_CONFIG.queued;
              const Icon = st.icon;
              const stt = (epagination.page - 1) * epagination.limit + idx + 1;
              return (
                <tr key={log.id} className="hover">
                  <td className="text-xs">{stt}</td>
                  <td><span className="badge badge-sm badge-outline whitespace-nowrap">Import Excel</span></td>
                  <td><span className={`badge badge-sm whitespace-nowrap ${IMPORT_ENTITY_BADGE[log.entity] || 'badge-ghost'}`}>{importEntityLabel(log.entity)}</span></td>
                  <td className="text-xs">{log.full_name || '—'}</td>
                  <td className="text-xs whitespace-nowrap">{log.created_at ? new Date(log.created_at).toLocaleString('vi-VN') : '—'}</td>
                  <td>
                    <span className={`badge badge-sm ${st.color} gap-1 whitespace-nowrap`}>
                      <Icon size={12} className="shrink-0" /> {st.label}
                      {(log.status === 'partial' || log.status === 'cancelled') && ` ${log.imported}/${log.total}`}
                    </span>
                    {(log.status === 'queued' || log.status === 'processing') && (
                      <span className="block text-[11px] text-base-content/60 mt-0.5">{log.done}/{log.total} dòng</span>
                    )}
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-xs" onClick={() => showExcelDetail(log.id)} title="Xem chi tiết"><Eye size={14} /></button>
                  </td>
                </tr>
              );
            })}
            </>
            )}
          </tbody>
        </table>
      </div>

      {epagination.total > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-base-content/60">
            Trang {epagination.page}/{epagination.totalPages} — Tổng {epagination.total} bản ghi
          </span>
          <div className="flex items-center gap-2">
            <select className="select select-bordered select-sm w-28" value={excelPageSize} onChange={(e) => changeExcelPageSize(Number(e.target.value))}>
              {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n} / trang</option>)}
            </select>
            <div className="join">
              <button className="join-item btn btn-sm" disabled={epagination.page <= 1} onClick={() => loadExcelWith(efilters, epagination.page - 1)}><ChevronLeft size={14} /></button>
              <button className="join-item btn btn-sm" disabled={epagination.page >= epagination.totalPages} onClick={() => loadExcelWith(efilters, epagination.page + 1)}><ChevronRight size={14} /></button>
            </div>
          </div>
        </div>
      )}
      </>
      )}</>)}
      {activeTab === 'activity' && (<>
      <div className="bg-base-100 rounded-lg border border-base-300 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={16} />
          <span className="text-sm font-medium">Bộ lọc hoạt động</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input type="number" className="input input-bordered input-sm" placeholder="ID log..." value={adraft.id} onChange={e => handleADraftChange('id', e.target.value)} onKeyDown={onEnterApply(applyAFilters)} />
          <input type="number" className="input input-bordered input-sm" placeholder="ID đề xuất..." value={adraft.proposal_id} onChange={e => handleADraftChange('proposal_id', e.target.value)} onKeyDown={onEnterApply(applyAFilters)} />
          <input type="text" className="input input-bordered input-sm" placeholder="Mã đề xuất..." value={adraft.code} onChange={e => handleADraftChange('code', e.target.value)} onKeyDown={onEnterApply(applyAFilters)} />
          <input type="text" className="input input-bordered input-sm" placeholder="Người thực hiện..." list="activity-actors" value={adraft.actor} onChange={e => handleADraftChange('actor', e.target.value)} onKeyDown={onEnterApply(applyAFilters)} />
          <datalist id="activity-actors">
            {activityActors.map(n => <option key={n} value={n} />)}
          </datalist>
          <select className="select select-bordered select-sm" value={afilters.action} onChange={e => applyASelectFilter('action', e.target.value)}>
            {ACTIVITY_ACTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className="select select-bordered select-sm" value={afilters.source} onChange={e => applyASelectFilter('source', e.target.value)}>
            {ACTIVITY_SOURCES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input type="date" className="input input-bordered input-sm" value={afilters.date_from} onChange={e => applyASelectFilter('date_from', e.target.value)} />
          <input type="date" className="input input-bordered input-sm" value={afilters.date_to} onChange={e => applyASelectFilter('date_to', e.target.value)} />
        </div>
        <div className="flex gap-2 mt-3">
          <button className="btn btn-primary btn-sm gap-1" onClick={() => applyAFilters()}><Search size={14} /> Lọc</button>
          <button className="btn btn-ghost btn-sm gap-1" onClick={clearAFilters}><X size={14} /> Xóa bộ lọc</button>
          <button className="btn btn-ghost btn-sm gap-1" onClick={() => loadActivityWith(afilters, apagination.page)}><RefreshCw size={14} /> Làm mới</button>
        </div>
      </div>

      <div className="bg-base-100 rounded-lg border border-base-300 overflow-x-auto">
        <table className="table table-zebra table-sm">
          <thead>
            <tr className="bg-base-200">
              <th className="w-16">ID</th>
              <th>Thời gian</th>
              <th>Mã đề xuất</th>
              <th>Hành động</th>
              <th>Chuyển trạng thái</th>
              <th>Người thực hiện</th>
              <th>Nguồn</th>
              <th className="w-16">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {alogs.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-base-content/50">{aloading ? 'Đang tải...' : 'Không có logs'}</td></tr>
            ) : (
            <>
            {aloading && (
              <tr><td colSpan={8} className="text-center text-xs text-base-content/40 py-1">Đang tải...</td></tr>
            )}
            {alogs.map(log => (
              <tr key={log.id} className="hover">
                <td className="font-mono text-xs">{log.id}</td>
                <td className="text-xs">{log.created_at ? new Date(log.created_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</td>
                <td className="text-xs font-medium">{log.ma_de_xuat || log.tracking_code || `#${log.proposal_id}`}</td>
                <td><span className={`badge badge-sm whitespace-nowrap ${ACTIVITY_ACTION_BADGE[log.action] || 'badge-outline'}`}>{ACTIVITY_ACTION_LABEL[log.action] || log.action}</span></td>
                <td className="text-xs">{log.action === 'status_change' || log.action === 'status_change_denied' ? `${log.from_status ? getStatusLabel(log.from_status, 'proposal') : '—'} → ${log.to_status ? getStatusLabel(log.to_status, 'proposal') : '—'}` : '—'}</td>
                <td className="text-xs">{log.actor_name || '—'}</td>
                <td><span className="text-xs">{ACTIVITY_SOURCE_LABEL[log.source] || log.source}</span></td>
                <td>
                  <button className="btn btn-ghost btn-xs" onClick={() => setActivityDetail(log)} title="Xem chi tiết thay đổi"><Eye size={14} /></button>
                </td>
              </tr>
            ))}
            </>
            )}
          </tbody>
        </table>
      </div>

      {apagination.total > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-base-content/60">
            Trang {apagination.page}/{apagination.totalPages} — Tổng {apagination.total} bản ghi
          </span>
          <div className="flex items-center gap-2">
            <select className="select select-bordered select-sm w-28" value={activityPageSize} onChange={(e) => changeActivityPageSize(Number(e.target.value))}>
              {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n} / trang</option>)}
            </select>
            <div className="join">
              <button className="join-item btn btn-sm" disabled={apagination.page <= 1} onClick={() => loadActivityWith(afilters, apagination.page - 1)}><ChevronLeft size={14} /></button>
              <button className="join-item btn btn-sm" disabled={apagination.page >= apagination.totalPages} onClick={() => loadActivityWith(afilters, apagination.page + 1)}><ChevronRight size={14} /></button>
            </div>
          </div>
        </div>
      )}
      </>)}


      {detailLoading && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <div className="flex justify-center py-8"><span className="loading loading-spinner loading-lg"></span></div>
          </div>
        </dialog>
      )}

      {activityDetail && (() => {
        const changed = parseChanged(activityDetail);
        return (
          <dialog className="modal modal-open">
            <div className="modal-box max-w-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg">Chi tiết hoạt động #{activityDetail.id}</h3>
                <button className="btn btn-ghost btn-sm btn-circle" onClick={() => setActivityDetail(null)}><X size={18} /></button>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                <div><span className="font-medium">Đề xuất:</span> {activityDetail.ma_de_xuat || activityDetail.tracking_code || `#${activityDetail.proposal_id}`}</div>
                <div><span className="font-medium">Hành động:</span>{' '}
                  <span className={`badge badge-sm ${ACTIVITY_ACTION_BADGE[activityDetail.action] || 'badge-outline'}`}>
                    {ACTIVITY_ACTION_LABEL[activityDetail.action] || activityDetail.action}
                  </span>
                </div>
                {(activityDetail.action === 'status_change' || activityDetail.action === 'status_change_denied') && (
                  <>
                    <div><span className="font-medium">Từ:</span> {activityDetail.from_status ? getStatusLabel(activityDetail.from_status, 'proposal') : '—'}</div>
                    <div><span className="font-medium">Đến:</span> {activityDetail.to_status ? getStatusLabel(activityDetail.to_status, 'proposal') : '—'}</div>
                  </>
                )}
                <div><span className="font-medium">Người thực hiện:</span> {activityDetail.actor_name || '—'}{activityDetail.actor_role ? ` (${activityDetail.actor_role})` : ''}</div>
                <div><span className="font-medium">Nguồn:</span> {ACTIVITY_SOURCE_LABEL[activityDetail.source] || activityDetail.source}{activityDetail.manual_override ? ' (demo/tay)' : ''}</div>
                <div className="col-span-2"><span className="font-medium">Thời gian:</span> {activityDetail.created_at ? new Date(activityDetail.created_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</div>
              </div>
              {activityDetail.reject_reason && (
                <div className="alert alert-error py-2 px-3 text-xs mb-3">
                  <span><b>Lý do:</b> {activityDetail.reject_reason}</span>
                </div>
              )}
              {changed ? (
                <div className="border border-base-300 rounded-lg overflow-hidden">
                  <table className="table table-xs">
                    <thead>
                      <tr className="bg-base-200">
                        <th>Trường</th>
                        <th>Giá trị cũ</th>
                        <th>Giá trị mới</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(changed).map(([k, v]) => (
                        <tr key={k}>
                          <td className="font-medium">{(v && v.label) || k}</td>
                          <td className="text-base-content/70 max-w-[180px] break-words">{(v && v.old) || '—'}</td>
                          <td className="max-w-[180px] break-words">{(v && v.new) || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-base-content/50">Không có thay đổi nội dung chi tiết.</div>
              )}
              <div className="modal-action">
                <button className="btn btn-ghost btn-sm" onClick={() => setActivityDetail(null)}>Đóng</button>
              </div>
            </div>
            <div className="modal-backdrop bg-black/50" onClick={() => setActivityDetail(null)} />
          </dialog>
        );
      })()}

      {excelDetailLoading && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <div className="flex justify-center py-8"><span className="loading loading-spinner loading-lg"></span></div>
          </div>
        </dialog>
      )}

      {excelDetail && (() => {
        const d = excelDetail;
        const dst = IMPORT_STATUS_CONFIG[d.status] || IMPORT_STATUS_CONFIG.queued;
        const failedRows = Array.isArray(d.failed_rows) ? d.failed_rows : [];
        const pendingRows = Array.isArray(d.pending_rows) ? d.pending_rows : [];
        const warns = Array.isArray(d.warn_details) ? d.warn_details : [];
        const failTotal = Math.ceil(failedRows.length / 20);
        const pendTotal = Math.ceil(pendingRows.length / 20);
        const failPage = Math.min(excelFailPage, Math.max(failTotal, 1));
        const pendPage = Math.min(excelPendingPage, Math.max(pendTotal, 1));
        const failSlice = failedRows.slice((failPage - 1) * 20, failPage * 20);
        const pendSlice = pendingRows.slice((pendPage - 1) * 20, pendPage * 20);
        const params = d.params || {};
        return (
          <dialog className="modal modal-open">
            <div className="modal-box max-w-3xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg">Chi tiết import {importEntityLabel(d.entity)}</h3>
                <button className="btn btn-ghost btn-sm btn-circle" onClick={() => setExcelDetail(null)}><X size={18} /></button>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                <div><span className="font-medium">File:</span> {d.file_name || d.id}</div>
                <div><span className="font-medium">Trạng thái:</span>{' '}
                  <span className={`badge badge-sm ${dst.color}`}>{dst.label}</span>
                </div>
                <div><span className="font-medium">Tùy chọn:</span> {`geocode=${params.geocode !== false ? 'bật' : 'tắt'}, trùng=${params.checkDuplicate !== false ? 'bật' : 'tắt'}`}</div>
                <div><span className="font-medium">Thời gian:</span> {d.created_at ? new Date(d.created_at).toLocaleString('vi-VN') : '—'}{d.finished_at ? ` → ${new Date(d.finished_at).toLocaleString('vi-VN')}` : ''}</div>
              </div>
              <div className="w-full bg-base-200 rounded-full h-3 overflow-hidden mb-1">
                <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${d.total > 0 ? Math.round((d.done / d.total) * 100) : 0}%` }} />
              </div>
              <div className="stats shadow w-full mb-3">
                <div className="stat"><div className="stat-title">Tổng</div><div className="stat-value text-lg">{d.total}</div></div>
                <div className="stat"><div className="stat-title text-success">Đã tạo</div><div className="stat-value text-lg text-success">{d.imported}</div></div>
                <div className="stat"><div className="stat-title text-error">Lỗi</div><div className="stat-value text-lg text-error">{d.failed}</div></div>
                {d.pending > 0 && (
                  <div className="stat"><div className="stat-title text-warning">Chưa xử lý</div><div className="stat-value text-lg text-warning">{d.pending}</div></div>
                )}
              </div>
              {d.pending_summary && (
                <div className="alert alert-warning py-2 px-3 text-xs mb-3"><span>{d.pending_summary}</span></div>
              )}
              {d.failed_truncated === 1 && (
                <div className="alert py-2 px-3 text-xs mb-3"><span>Chỉ hiện 2000 dòng lỗi đầu — tải file để xem đầy đủ.</span></div>
              )}
              {failedRows.length > 0 && (
                <div className="mb-3">
                  <div className="font-medium text-sm mb-1">Dòng lỗi ({failedRows.length})</div>
                  <div className="border border-base-300 rounded-lg overflow-hidden">
                    <table className="table table-xs">
                      <thead><tr className="bg-base-200"><th>Dòng</th><th>Dữ liệu</th><th>Lỗi</th></tr></thead>
                      <tbody>
                        {failSlice.map((r, i) => (
                          <tr key={i}>
                            <td className="font-mono">{r.row}</td>
                            <td className="max-w-[220px] break-words text-base-content/70">{summarizeRowData(r.data)}</td>
                            <td className="max-w-[220px] break-words text-error">{r.error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {failTotal > 1 && (
                    <div className="flex items-center justify-end gap-2 mt-1 text-xs">
                      <button className="btn btn-xs" disabled={failPage <= 1} onClick={() => setExcelFailPage(failPage - 1)}>‹</button>
                      <span>{failPage}/{failTotal}</span>
                      <button className="btn btn-xs" disabled={failPage >= failTotal} onClick={() => setExcelFailPage(failPage + 1)}>›</button>
                    </div>
                  )}
                </div>
              )}
              {pendingRows.length > 0 && (
                <div className="mb-3">
                  <div className="font-medium text-sm mb-1">Dòng chưa được import ({pendingRows.length})</div>
                  {d.pending_truncated === 1 && (
                    <div className="alert py-2 px-3 text-xs mb-2"><span>Chỉ hiện 2000 dòng đầu — tải file để xem đầy đủ.</span></div>
                  )}
                  <div className="border border-base-300 rounded-lg overflow-hidden">
                    <table className="table table-xs">
                      <thead><tr className="bg-base-200"><th>Dòng</th><th>Dữ liệu</th></tr></thead>
                      <tbody>
                        {pendSlice.map((r, i) => (
                          <tr key={i}>
                            <td className="font-mono">{r.row}</td>
                            <td className="max-w-[340px] break-words text-base-content/70">{summarizeRowData(r.data)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {pendTotal > 1 && (
                    <div className="flex items-center justify-end gap-2 mt-1 text-xs">
                      <button className="btn btn-xs" disabled={pendPage <= 1} onClick={() => setExcelPendingPage(pendPage - 1)}>‹</button>
                      <span>{pendPage}/{pendTotal}</span>
                      <button className="btn btn-xs" disabled={pendPage >= pendTotal} onClick={() => setExcelPendingPage(pendPage + 1)}>›</button>
                    </div>
                  )}
                </div>
              )}
              {warns.length > 0 && (
                <div className="text-xs text-base-content/60 mb-3">{warns.length} dòng cảnh báo trùng vị trí (vẫn đã import).</div>
              )}
              {d.error_message && (
                <div className="bg-error/10 border border-error/30 rounded-lg p-3 mb-3">
                  <pre className="text-xs whitespace-pre-wrap">{d.error_message}</pre>
                </div>
              )}
              <div className="modal-action flex-wrap gap-2">
                <button
                  className="btn btn-success btn-sm"
                  disabled={d.imported === 0}
                  title={d.imported === 0 ? 'Không có bản ghi thành công' : undefined}
                  onClick={() => handleExcelExport(d.id, 'success')}
                >Xuất bản ghi thành công ({d.imported})</button>
                <button
                  className="btn btn-warning btn-sm"
                  disabled={d.failed === 0 && d.pending === 0}
                  title={(d.failed === 0 && d.pending === 0) ? 'Không có dòng lỗi/chưa xử lý' : (d.pending > 0 ? 'Xuất dòng lỗi + dòng chưa xử lý' : undefined)}
                  onClick={() => handleExcelExport(d.id, 'failed')}
                >Xuất bản ghi thất bại ({d.failed + (d.pending || 0)})</button>
                {(d.status === 'queued' || d.status === 'processing') && (
                  <button className="btn btn-error btn-sm" disabled={excelCancelling} onClick={() => handleExcelCancel(d.id)}>
                    {excelCancelling ? 'Đang hủy...' : 'Hủy job'}
                  </button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => setExcelDetail(null)}>Đóng</button>
              </div>
            </div>
            <div className="modal-backdrop bg-black/50" onClick={() => setExcelDetail(null)} />
          </dialog>
        );
      })()}
      {showDetail && (
        <dialog className="modal modal-open" onClick={() => setShowDetail(null)}>
          <div className="modal-box max-w-3xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Chi tiết Log #{showDetail.id}</h3>
              <button className="btn btn-ghost btn-sm btn-circle" onClick={() => setShowDetail(null)}><X size={18} /></button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="font-medium">Hướng:</span> {DIRECTION_LABEL[showDetail.direction] || showDetail.direction}</div>
                <div><span className="font-medium">Action:</span> {showDetail.action}</div>
                <div><span className="font-medium">Entity:</span> {showDetail.entity_type} #{showDetail.entity_id}</div>
                <div>
                  <span className="font-medium">Trạng thái:</span>{' '}
                  <span className={`badge badge-sm ${(STATUS_CONFIG[showDetail.status] || STATUS_CONFIG.pending).color}`}>
                    {(STATUS_CONFIG[showDetail.status] || STATUS_CONFIG.pending).label}
                  </span>
                </div>
                <div><span className="font-medium">Retry:</span> {showDetail.retry_count}/{showDetail.max_retries}</div>
                <div><span className="font-medium">Tạo:</span> {showDetail.created_at ? new Date(showDetail.created_at).toLocaleString('vi-VN') : '—'}</div>
                <div><span className="font-medium">Bắt đầu:</span> {showDetail.started_at ? new Date(showDetail.started_at).toLocaleString('vi-VN') : '—'}</div>
                <div><span className="font-medium">Hoàn thành:</span> {showDetail.completed_at ? new Date(showDetail.completed_at).toLocaleString('vi-VN') : '—'}</div>
              </div>

              {showDetail.error_message && (
                <div className="bg-error/10 border border-error/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-error font-medium text-sm mb-1">
                    <AlertTriangle size={14} /> Lỗi
                  </div>
                  <pre className="text-xs whitespace-pre-wrap">{showDetail.error_message}</pre>
                </div>
              )}

              <div>
                <div className="font-medium text-sm mb-1">Request Payload</div>
                <pre className="bg-base-200 rounded-lg p-3 text-xs whitespace-pre-wrap max-h-60 overflow-auto">{formatJson(showDetail.request_payload)}</pre>
              </div>

              <div>
                <div className="font-medium text-sm mb-1">Response Payload</div>
                <pre className="bg-base-200 rounded-lg p-3 text-xs whitespace-pre-wrap max-h-60 overflow-auto">{formatJson(showDetail.response_payload)}</pre>
              </div>

              {showDetail.status === 'failed' && (
                <div className="flex gap-2">
                  <button className="btn btn-warning btn-sm gap-1" onClick={() => { handleRetry(showDetail.id); setShowDetail(null); }}>
                    <RotateCcw size={14} /> Retry
                  </button>
                  <button className="btn btn-error btn-sm gap-1" onClick={() => { handleCancel(showDetail.id); setShowDetail(null); }}>
                    <Ban size={14} /> Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}

export default AdminAuditLogPage;
