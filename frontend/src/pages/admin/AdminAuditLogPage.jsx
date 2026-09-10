import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { queueLogService } from '../../services/api';
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

function AdminAuditLogPage() {
  const { token } = useAuth();
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ message: '', type: 'error' });
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ status: '', direction: '', action: '', date_from: '', date_to: '' });
  const [showDetail, setShowDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadLogs = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await queueLogService.getAll({ ...filters, page, limit: 20 }, token);
      if (res.success) {
        setLogs(res.data || []);
        setPagination(res.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
      }
    } catch (err) {
      setToast({ message: err.message || 'Lỗi tải logs', type: 'error' });
    }
    setLoading(false);
  }, [filters, token]);

  const loadStats = useCallback(async () => {
    try {
      const res = await queueLogService.getStats(null, token);
      if (res.success) setStats(res.data);
    } catch {}
  }, [token]);

  useEffect(() => { loadLogs(1); loadStats(); }, [loadLogs, loadStats]);

  const handleFilterChange = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));
  const applyFilters = () => loadLogs(1);
  const clearFilters = () => { setFilters({ status: '', direction: '', action: '', date_from: '', date_to: '' }); };

  const handleRetry = async (id) => {
    try {
      const res = await queueLogService.retry(id, token);
      if (res.success) {
        setToast({ message: 'Đã tái xử lý job', type: 'success' });
        loadLogs(pagination.page);
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
        loadLogs(pagination.page);
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
        <h1 className="text-2xl font-bold">Audit Log — Lịch sử đồng bộ</h1>
      </div>

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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <select className="select select-bordered select-sm" value={filters.status} onChange={e => handleFilterChange('status', e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="select select-bordered select-sm" value={filters.direction} onChange={e => handleFilterChange('direction', e.target.value)}>
            <option value="">Tất cả hướng</option>
            <option value="push">Push → 1Office</option>
            <option value="pull">Pull ← 1Office</option>
          </select>
          <input type="text" className="input input-bordered input-sm" placeholder="Action..." value={filters.action} onChange={e => handleFilterChange('action', e.target.value)} />
          <input type="date" className="input input-bordered input-sm" value={filters.date_from} onChange={e => handleFilterChange('date_from', e.target.value)} />
          <input type="date" className="input input-bordered input-sm" value={filters.date_to} onChange={e => handleFilterChange('date_to', e.target.value)} />
        </div>
        <div className="flex gap-2 mt-3">
          <button className="btn btn-primary btn-sm gap-1" onClick={applyFilters}><Search size={14} /> Lọc</button>
          <button className="btn btn-ghost btn-sm gap-1" onClick={clearFilters}><X size={14} /> Xóa bộ lọc</button>
          <button className="btn btn-ghost btn-sm gap-1" onClick={() => loadLogs(pagination.page)}><RefreshCw size={14} /> Làm mới</button>
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
            {loading ? (
              <tr><td colSpan={9} className="text-center py-8 text-base-content/50">Đang tải...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-base-content/50">Không có logs</td></tr>
            ) : logs.map(log => {
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
                    <span className={`badge badge-sm ${st.color} gap-1`}>
                      <Icon size={12} /> {st.label}
                    </span>
                  </td>
                  <td className="text-xs">{log.created_at ? new Date(log.created_at).toLocaleString('vi-VN') : '—'}</td>
                  <td className="text-xs">{formatDuration(log.started_at, log.completed_at)}</td>
                  <td>
                    <div className="flex gap-1">
                      <button className="btn btn-ghost btn-xs" onClick={() => showDetailPopup(log.id)} title="Xem chi tiết"><Eye size={14} /></button>
                      {log.status === 'failed' && (
                        <button className="btn btn-ghost btn-xs text-warning" onClick={() => handleRetry(log.id)} title="Retry"><RotateCcw size={14} /></button>
                      )}
                      {(log.status === 'pending' || log.status === 'failed') && (
                        <button className="btn btn-ghost btn-xs text-error" onClick={() => handleCancel(log.id)} title="Cancel"><Ban size={14} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-base-content/60">
            Trang {pagination.page}/{pagination.totalPages} — Tổng {pagination.total} bản ghi
          </span>
          <div className="join">
            <button className="join-item btn btn-sm" disabled={pagination.page <= 1} onClick={() => loadLogs(pagination.page - 1)}><ChevronLeft size={14} /></button>
            {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
              let pageNum;
              if (pagination.totalPages <= 5) pageNum = i + 1;
              else if (pagination.page <= 3) pageNum = i + 1;
              else if (pagination.page >= pagination.totalPages - 2) pageNum = pagination.totalPages - 4 + i;
              else pageNum = pagination.page - 2 + i;
              return (
                <button key={pageNum} className={`join-item btn btn-sm ${pagination.page === pageNum ? 'btn-active' : ''}`} onClick={() => loadLogs(pageNum)}>{pageNum}</button>
              );
            })}
            <button className="join-item btn btn-sm" disabled={pagination.page >= pagination.totalPages} onClick={() => loadLogs(pagination.page + 1)}><ChevronRight size={14} /></button>
          </div>
        </div>
      )}

      {detailLoading && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <div className="flex justify-center py-8"><span className="loading loading-spinner loading-lg"></span></div>
          </div>
        </dialog>
      )}

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
