import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { onStationSheetSyncService } from '../../services/api';
import { ConfirmDialog, Toast } from '../ui';

const EMPTY_TOAST = { message: '', type: 'success' };

const formatLastSynced = (value) => {
  if (!value) return 'chưa đồng bộ lần nào';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('vi-VN');
};

const OnStationSheetSyncButton = () => {
  const { token, isAdmin } = useAuth();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmWarning, setConfirmWarning] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState(EMPTY_TOAST);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    if (!token || !isAdmin) return;
    try {
      const res = await onStationSheetSyncService.getStatus(token);
      if (!res?.success) throw new Error(res?.message || 'Không tải được trạng thái đồng bộ Sheet trạm ON');
      setStatus(res.data || null);
      setLoadError('');
    } catch (error) {
      console.error('[OnStationSheetSyncButton] Status error:', error);
      setLoadError(error?.message || 'Không tải được trạng thái đồng bộ Sheet trạm ON');
    }
  }, [token, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const pending = (status?.queue?.pending || 0) + (status?.queue?.processing || 0);

  useEffect(() => {
    if (!pending) return undefined;
    timerRef.current = setInterval(load, 3000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [pending, load]);

  if (!isAdmin) return null;

  const failed = status?.queue?.failed || 0;
  const cancellable = (status?.queue?.pending || 0) + failed;
  const busy = loading || cancelling || (status?.queue?.processing || 0) > 0;
  const tooltip = !status?.configured
    ? (status?.message || 'Google Sheet trạm ON chưa được cấu hình')
    : `Tab: ${status?.tabName || '—'} · ${status?.activeProposals || 0} trạm ON · Lần cuối: ${formatLastSynced(status?.lastSyncedAt)}`;

  const handleClick = async () => {
    if (!status?.configured || busy) return;
    setLoading(true);
    try {
      const res = await onStationSheetSyncService.syncDaily(token);
      if (!res?.success) throw new Error(res?.message || 'Không thể đồng bộ Sheet trạm ON');
      setToast({ message: res.message || 'Đã xếp đồng bộ Sheet trạm ON', type: 'success' });
      await load();
    } catch (error) {
      console.error('[OnStationSheetSyncButton] Sync error:', error);
      setToast({ message: 'Không thể bắt đầu đồng bộ Sheet trạm ON. Vui lòng thử lại hoặc liên hệ quản trị viên.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (loading || cancelling) return;
    setConfirmCancel(false);
    if (!cancellable) {
      setToast({ message: 'Không còn mục đồng bộ đang chờ hoặc thất bại để hủy', type: 'success' });
      return;
    }
    setCancelling(true);
    try {
      const res = await onStationSheetSyncService.cancelQueued(token);
      if (!res?.success) throw new Error(res?.message || 'Không thể hủy đồng bộ đang chờ');
      setToast({ message: res.message, type: 'success' });
    } catch (error) {
      console.error('[OnStationSheetSyncButton] Cancel error:', error);
      setToast({ message: error.message || 'Không thể hủy đồng bộ đang chờ', type: 'error' });
    } finally {
      await load();
      setCancelling(false);
    }
  };

  const handleResolveWarning = async () => {
    if (!confirmWarning || resolving) return;
    setResolving(true);
    try {
      const res = await onStationSheetSyncService.resolveWarning(confirmWarning.id, token);
      if (!res?.success) throw new Error(res?.message || 'Không thể xác nhận cảnh báo');
      setConfirmWarning(null);
      setToast({ message: res.message, type: 'success' });
      await load();
    } catch (error) {
      setToast({ message: error.message || 'Không thể xác nhận cảnh báo', type: 'error' });
    } finally {
      setResolving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-outline btn-sm gap-1"
        onClick={handleClick}
        disabled={!status?.configured || busy}
        title={tooltip}
      >
        <RefreshCw size={14} className={status?.configured && pending ? 'animate-spin' : ''} />
        {status?.configured && pending ? `Đang đồng bộ ${pending}` : 'Đồng bộ Sheet trạm ON'}
      </button>
      {(cancellable > 0 || cancelling) && <button
        type="button"
        className="btn btn-outline btn-warning btn-sm"
        onClick={() => setConfirmCancel(true)}
        disabled={loading || cancelling}
      >
        {cancelling ? 'Đang hủy đồng bộ…' : 'Hủy đồng bộ đang chờ'}
      </button>}
      {status && !status.configured && <span className="text-sm text-warning">Google Sheet trạm ON chưa được cấu hình.</span>}
      {(loadError || failed > 0) && (
        <div role="alert" className="text-sm text-error max-w-xl">
          {loadError
            ? 'Không tải được trạng thái đồng bộ. Vui lòng thử lại.'
            : `Có ${failed} mục đồng bộ chưa thành công.${status.configured ? ' Bạn có thể thử đồng bộ lại hoặc hủy các mục này.' : ''}`}
        </div>
      )}
      {!loadError && status?.errors?.length > 0 && (
        <ul className="text-sm text-error max-w-xl">
          {status.errors.map((item) => <li key={item.proposal_id}>{item.message}</li>)}
        </ul>
      )}
      {status?.warningCount > 0 && (
        <div role="alert" className="text-sm text-warning max-w-xl">
          <div>Có {status.warningCount} cảnh báo mã CMS cũ cần kiểm tra thủ công trên Sheet. Dòng cũ không tự xóa.</div>
          {(status.warnings || []).map((item) => (
            <div key={item.id}>
              Đề xuất {item.proposal_id}: {item.old_cms_code} → {item.new_cms_code}{' '}
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setConfirmWarning(item)}>
                Đã xử lý
              </button>
            </div>
          ))}
        </div>
      )}
      {status?.queue?.cancelled > 0 && <span className="text-sm text-base-content/70">Đã hủy đồng bộ: {status.queue.cancelled}</span>}
      <ConfirmDialog
        isOpen={confirmCancel}
        title="Hủy các mục đồng bộ đang chờ?"
        message={`Hiện có ${cancellable} mục đang chờ hoặc thất bại. Thao tác không hủy đề xuất, không thay đổi Google Sheet và không dừng mục đã bắt đầu xử lý.`}
        confirmText="Xác nhận hủy đồng bộ"
        cancelText="Quay lại"
        type="warning"
        onConfirm={handleCancel}
        onCancel={() => setConfirmCancel(false)}
      />
      <ConfirmDialog
        isOpen={!!confirmWarning}
        title="Xác nhận đã xử lý mã CMS cũ?"
        message={`Xác nhận đã kiểm tra và xử lý thủ công mã ${confirmWarning?.old_cms_code || ''} trên Sheet. Thao tác này không thay đổi Sheet.`}
        confirmText="Đã xử lý"
        cancelText="Quay lại"
        onConfirm={handleResolveWarning}
        onCancel={() => !resolving && setConfirmWarning(null)}
      />
      <Toast message={toast.message} type={toast.type} onClose={() => setToast(EMPTY_TOAST)} />
    </>
  );
};

export default OnStationSheetSyncButton;
