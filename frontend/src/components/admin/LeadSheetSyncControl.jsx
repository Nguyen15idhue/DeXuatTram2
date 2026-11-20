import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import ConfirmDialog from '../ConfirmDialog';
import { leadSheetSyncService } from '../../services/api';

export default function LeadSheetSyncControl({ token }) {
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const requestId = useRef(0);
  const running = Boolean(status?.run?.pending);
  const loadStatus = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const { data } = await leadSheetSyncService.getStatus(token);
      if (id !== requestId.current) return;
      setStatus(data);
      setStatusError('');
    } catch (error) {
      if (id === requestId.current) setStatusError(error.message || 'Không thể tải trạng thái đồng bộ');
    }
  }, [token]);
  useEffect(() => {
    void loadStatus();
    const interval = setInterval(loadStatus, running || submitting ? 3000 : 10000);
    return () => {
      clearInterval(interval);
      requestId.current++;
    };
  }, [loadStatus, running, submitting]);

  const start = async () => {
    if (submitting) return;
    setConfirm(false);
    setSubmitting(true);
    setSubmitError('');
    try {
      await leadSheetSyncService.start(token);
      await loadStatus();
    } catch (error) {
      setSubmitError(error.message || 'Không thể bắt đầu đồng bộ');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="flex flex-col items-start gap-1">
      <button type="button" className="btn btn-outline btn-sm gap-1"
        disabled={!status?.configured || !!statusError || running || submitting}
        onClick={() => setConfirm(true)}>
        <RefreshCw size={14} className={running || submitting ? 'animate-spin' : ''} />
        {running ? `Đang đồng bộ ${status.run.synced}/${status.run.total}` : 'Đồng bộ Google Sheet'}
      </button>
      <div role="status" className="text-xs">
        {statusError || submitError || status?.message || (status?.configured &&
          `Đã đồng bộ: ${status.run?.synced ?? status.synced} · Đang chờ: ${status.pending} · Lỗi: ${status.failed}`)}
        {status?.error && !statusError && <p className="text-error">{status.error}</p>}
      </div>
      {status?.configured && !statusError && !running && Boolean(status.failed) && (
        <button type="button" className="link text-xs" disabled={submitting} onClick={() => setConfirm(true)}>
          Thử đồng bộ lại
        </button>
      )}
      <ConfirmDialog isOpen={confirm} title="Đồng bộ Google Sheet"
        message="Đồng bộ toàn bộ khách hàng vào tab QL_khach_hang, không áp dụng bộ lọc đang xem."
        onConfirm={start} onCancel={() => setConfirm(false)} confirmText="Đồng bộ" />
    </div>
  );
}
