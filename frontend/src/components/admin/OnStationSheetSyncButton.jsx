import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { onStationSheetSyncService } from '../../services/api';
import { Toast } from '../ui';

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
  const [toast, setToast] = useState(EMPTY_TOAST);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    if (!token || !isAdmin) return;
    try {
      const res = await onStationSheetSyncService.getStatus(token);
      if (res?.success) setStatus(res.data || null);
    } catch {
      /* trạng thái là tuỳ chọn, không chặn trang */
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

  const busy = loading || (status?.queue?.processing || 0) > 0;
  const tooltip = !status?.configured
    ? (status?.message || 'Google Sheet trạm ON chưa được cấu hình')
    : `Tab: ${status?.tabName || '—'} · ${status?.activeProposals || 0} trạm ON · Lần cuối: ${formatLastSynced(status?.lastSyncedAt)}`;

  const handleClick = async () => {
    if (busy) return;
    setLoading(true);
    try {
      const res = await onStationSheetSyncService.syncDaily(token);
      if (!res?.success) throw new Error(res?.message || 'Không thể đồng bộ Sheet trạm ON');
      setToast({ message: res.message || 'Đã xếp đồng bộ Sheet trạm ON', type: 'success' });
      await load();
    } catch (error) {
      setToast({ message: error?.message || 'Không thể đồng bộ Sheet trạm ON', type: 'error' });
    } finally {
      setLoading(false);
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
        <RefreshCw size={14} className={pending ? 'animate-spin' : ''} />
        {pending ? `Đang đồng bộ ${pending}` : 'Đồng bộ Sheet trạm ON'}
      </button>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast(EMPTY_TOAST)} />
    </>
  );
};

export default OnStationSheetSyncButton;
