import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Download, Play, RefreshCw, RotateCcw, Square } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { crmFullSyncService } from '../../services/api';
import ConfirmDialog from '../ui/ConfirmDialog';
import Toast from '../ui/Toast';

const STATUS_LABELS = {
  QUEUED: 'Đang chờ',
  RUNNING: 'Đang chạy',
  SUCCESS: 'Hoàn tất',
  PARTIAL: 'Đạt giới hạn',
  FAILED: 'Lỗi',
  CANCELLED: 'Đã hủy',
};

const STATUS_BADGES = {
  QUEUED: 'badge-info',
  RUNNING: 'badge-warning',
  SUCCESS: 'badge-success',
  PARTIAL: 'badge-warning',
  FAILED: 'badge-error',
  CANCELLED: 'badge-ghost',
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('vi-VN');
};

const formatDuration = (start, end) => {
  if (!start || !end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds} giây`;
  return `${minutes} phút ${seconds} giây`;
};

const Stat = ({ label, value, tone = 'text-base-content' }) => (
  <div className="rounded-lg bg-base-200/60 px-3 py-2">
    <div className="text-[11px] uppercase tracking-wide text-base-content/60">{label}</div>
    <div className={`text-lg font-semibold ${tone}`}>{value ?? 0}</div>
  </div>
);

const CrmFullSyncPanel = () => {
  const { token } = useAuth();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [confirmStart, setConfirmStart] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [toast, setToast] = useState({ message: '', type: 'success' });

  const loadStatus = useCallback(async () => {
    if (!token) return;
    try {
      const res = await crmFullSyncService.getStatus(token);
      if (res?.success) setStatus(res.data);
    } catch (error) {
      setToast({ message: error?.message || 'Không tải được trạng thái đồng bộ', type: 'error' });
    }
  }, [token]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const active = status?.active || null;
  const activeId = active?.id || null;
  const activeStatus = active?.status || '';

  useEffect(() => {
    if (!activeId) return undefined;
    const timer = setInterval(loadStatus, 3000);
    return () => clearInterval(timer);
  }, [activeId, activeStatus, loadStatus]);

  const handleStart = async () => {
    setConfirmStart(false);
    setStarting(true);
    try {
      const res = await crmFullSyncService.start(token);
      if (!res?.success) throw new Error(res?.message || 'Không thể bắt đầu đồng bộ');
      setToast({ message: res.message || 'Đã bắt đầu đồng bộ toàn bộ', type: 'success' });
      await loadStatus();
    } catch (error) {
      setToast({ message: error?.message || 'Không thể bắt đầu đồng bộ', type: 'error' });
    } finally {
      setStarting(false);
    }
  };

  const handleResume = async (id) => {
    setBusyId(id);
    try {
      const res = await crmFullSyncService.resume(id, token);
      if (!res?.success) throw new Error(res?.message || 'Không thể tiếp tục đồng bộ');
      setToast({ message: res.message || 'Đã tiếp tục đồng bộ', type: 'success' });
      await loadStatus();
    } catch (error) {
      setToast({ message: error?.message || 'Không thể tiếp tục đồng bộ', type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async () => {
    const id = cancelTarget;
    setCancelTarget(null);
    if (!id) return;
    setBusyId(id);
    try {
      const res = await crmFullSyncService.cancel(id, token);
      if (!res?.success) throw new Error(res?.message || 'Không thể hủy đồng bộ');
      setToast({ message: res.message || 'Đã hủy đồng bộ', type: 'success' });
      await loadStatus();
    } catch (error) {
      setToast({ message: error?.message || 'Không thể hủy đồng bộ', type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const handleExport = (id) => {
    window.open(`/api/admin/crm/full-sync/${id}/export?token=${encodeURIComponent(token)}`, '_blank');
  };

  const maxLeads = status?.maxLeadsPerRun || 10000;
  const progress = active ? Math.min(100, Math.round(((active.fetched || 0) / maxLeads) * 100)) : 0;
  const runs = status?.runs || [];

  return (
    <div className="space-y-4">
      <div className="card bg-base-100 shadow p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h3 className="font-semibold mb-1">Đồng bộ toàn bộ khách hàng từ CRM</h3>
            <p className="text-sm text-base-content/70">
              Quét lại toàn bộ khách hàng từ CRM và cập nhật vào Quản lý leads. Khách đã có sẽ được cập nhật
              thông tin và trạng thái CRM (giữ nguyên phân công, trạng thái xử lý và hành trình); khách mới sẽ
              được thêm. Tối đa {maxLeads.toLocaleString('vi-VN')} khách mỗi lần.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm gap-1"
            onClick={() => setConfirmStart(true)}
            disabled={starting || !status?.configured || !!active}
          >
            {starting ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
            Đồng bộ toàn bộ
          </button>
        </div>

        {status && !status.configured && (
          <div className="alert alert-error text-sm mt-3">
            <AlertTriangle size={16} />
            <span>{status.message || 'Chưa cấu hình TMT_CRM_API_KEY'}</span>
          </div>
        )}
      </div>

      {active && (
        <div className="card bg-base-100 shadow p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <RefreshCw size={16} className="animate-spin text-primary" />
              <span className="font-semibold">Đang đồng bộ lần #{active.id}</span>
              <span className={`badge badge-sm ${STATUS_BADGES[active.status] || 'badge-ghost'}`}>
                {STATUS_LABELS[active.status] || active.status}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-xs btn-outline btn-error gap-1"
              onClick={() => setCancelTarget(active.id)}
              disabled={busyId === active.id}
            >
              <Square size={12} /> Hủy
            </button>
          </div>

          <div className="mb-3">
            <div className="flex justify-between text-xs text-base-content/60 mb-1">
              <span>Đã xử lý {Number(active.fetched || 0).toLocaleString('vi-VN')} / {maxLeads.toLocaleString('vi-VN')} khách</span>
              <span>{progress}%</span>
            </div>
            <progress className="progress progress-primary w-full" value={progress} max="100" />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Đã lấy" value={active.fetched} />
            <Stat label="Thêm mới" value={active.inserted} tone="text-success" />
            <Stat label="Cập nhật" value={active.updated} tone="text-info" />
            <Stat label="Bỏ qua" value={active.skipped} tone="text-warning" />
            <Stat label="Lỗi" value={active.failed} tone="text-error" />
            <Stat label="Số trang" value={active.pages} />
          </div>
        </div>
      )}

      {!active && status?.latest && (
        <div className="card bg-base-100 shadow p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Lần đồng bộ gần nhất #{status.latest.id}</span>
              <span className={`badge badge-sm ${STATUS_BADGES[status.latest.status] || 'badge-ghost'}`}>
                {STATUS_LABELS[status.latest.status] || status.latest.status}
              </span>
            </div>
            <span className="text-xs text-base-content/60">
              {formatDateTime(status.latest.finished_at || status.latest.created_at)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Đã lấy" value={status.latest.fetched} />
            <Stat label="Thêm mới" value={status.latest.inserted} tone="text-success" />
            <Stat label="Cập nhật" value={status.latest.updated} tone="text-info" />
            <Stat label="Bỏ qua" value={status.latest.skipped} tone="text-warning" />
            <Stat label="Lỗi" value={status.latest.failed} tone="text-error" />
            <Stat label="Số trang" value={status.latest.pages} />
          </div>
          {status.latest.last_error && (
            <div className="alert alert-warning text-xs mt-3">
              <AlertTriangle size={14} />
              <span>{status.latest.last_error}</span>
            </div>
          )}
        </div>
      )}

      <div className="card bg-base-100 shadow p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Lịch sử đồng bộ toàn bộ</h3>
          <button
            type="button"
            className="btn btn-xs btn-ghost gap-1"
            onClick={() => { setLoading(true); loadStatus().finally(() => setLoading(false)); }}
            disabled={loading}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Làm mới
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Thời gian</th>
                <th>Người bấm</th>
                <th>Trạng thái</th>
                <th className="text-right">Đã lấy</th>
                <th className="text-right">Thêm</th>
                <th className="text-right">Cập nhật</th>
                <th className="text-right">Bỏ qua</th>
                <th className="text-right">Lỗi</th>
                <th>Thời lượng</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const canCancel = ['QUEUED', 'RUNNING'].includes(run.status);
                const canResume = ['FAILED', 'PARTIAL', 'CANCELLED'].includes(run.status);
                return (
                  <tr key={run.id}>
                    <td>#{run.id}</td>
                    <td className="text-xs">{formatDateTime(run.created_at)}</td>
                    <td className="text-xs">{run.triggered_by_name || (run.triggered_by ? `#${run.triggered_by}` : 'Hệ thống')}</td>
                    <td>
                      <span className={`badge badge-sm ${STATUS_BADGES[run.status] || 'badge-ghost'}`}>
                        {STATUS_LABELS[run.status] || run.status}
                      </span>
                    </td>
                    <td className="text-right">{run.fetched || 0}</td>
                    <td className="text-right text-success">{run.inserted || 0}</td>
                    <td className="text-right text-info">{run.updated || 0}</td>
                    <td className="text-right text-warning">{run.skipped || 0}</td>
                    <td className="text-right text-error">{run.failed || 0}</td>
                    <td className="text-xs">{formatDuration(run.started_at, run.finished_at)}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1">
                        {canCancel && (
                          <button
                            type="button"
                            className="btn btn-xs btn-outline btn-error gap-1"
                            onClick={() => setCancelTarget(run.id)}
                            disabled={busyId === run.id}
                          >
                            <Square size={11} /> Hủy
                          </button>
                        )}
                        {canResume && (
                          <button
                            type="button"
                            className="btn btn-xs btn-outline btn-primary gap-1"
                            onClick={() => handleResume(run.id)}
                            disabled={busyId === run.id || !!active}
                            title={active ? `Đang có lần đồng bộ #${active.id} chạy` : 'Tiếp tục từ chỗ đã dừng'}
                          >
                            <RotateCcw size={11} /> Tiếp tục
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-xs btn-ghost gap-1"
                          onClick={() => handleExport(run.id)}
                          title="Xuất Excel tổng kết và danh sách bỏ qua/lỗi"
                        >
                          <Download size={11} /> Excel
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {runs.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center text-xs text-base-content/60 py-4">
                    Chưa có lần đồng bộ toàn bộ nào
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmStart}
        title="Đồng bộ toàn bộ khách hàng?"
        message={`Hệ thống sẽ quét toàn bộ khách hàng từ CRM (tối đa ${maxLeads.toLocaleString('vi-VN')} khách/lần). Khách đã có sẽ được cập nhật thông tin, khách mới sẽ được thêm vào Quản lý leads. Quá trình chạy nền có thể mất vài phút.`}
        confirmText="Bắt đầu"
        type="warning"
        onConfirm={handleStart}
        onCancel={() => setConfirmStart(false)}
      />

      <ConfirmDialog
        isOpen={!!cancelTarget}
        title="Hủy lần đồng bộ?"
        message="Lần đồng bộ sẽ dừng ở trang kế tiếp. Các khách đã xử lý vẫn được giữ lại và có thể bấm Tiếp tục sau."
        confirmText="Hủy đồng bộ"
        cancelText="Không hủy"
        type="danger"
        onConfirm={handleCancel}
        onCancel={() => setCancelTarget(null)}
      />

      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
    </div>
  );
};

export default CrmFullSyncPanel;
