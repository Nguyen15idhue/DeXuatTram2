import { useState, useEffect } from 'react';
import { X, History } from 'lucide-react';
import { proposalLogService } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import useMapStatuses from '../../hooks/useMapStatuses';
import { getStatusLabel } from '../../utils/mapStatuses';

const STATUS_DOT = {
  PENDING: '#facc15',
  REVIEWING: '#3b82f6',
  APPROVED: '#16a34a',
  REJECTED: '#dc2626',
  CANCELLED: '#6b7280',
  CONTRACT_SIGNED: '#0d9488',
  CONTRACT_FAILED: '#f59e0b'
};

const ACTION_LABEL = {
  created: 'Tạo đề xuất',
  updated: 'Cập nhật nội dung',
  status_change: 'Đổi trạng thái',
  status_change_denied: 'Đổi trạng thái bị chặn',
  station_created: 'Tạo trạm',
  auto_failed: 'Tự động thất bại'
};

const SOURCE_LABEL = {
  user: 'Người dùng',
  webhook: 'Webhook 1Office',
  script: 'Script demo',
  system_auto: 'Tự động',
  admin_override: 'Admin ghi đè'
};

const fmtTime = (t) => {
  if (!t) return '—';
  return new Date(t).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
};

const ProposalActivityPopup = ({ proposalId, onClose }) => {
  const { token } = useAuth();
  useMapStatuses();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    proposalLogService.timeline(proposalId, token)
      .then(res => {
        if (cancelled) return;
        if (res.success) setItems(res.data || []);
        else setError(res.message || 'Lỗi tải lịch sử');
      })
      .catch(() => { if (!cancelled) setError('Lỗi kết nối server'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [proposalId, token]);

  const renderItem = (it) => {
    const dot = STATUS_DOT[it.to_status] || '#9ca3af';
    let changed = null;
    try {
      changed = typeof it.changed_fields === 'string' ? JSON.parse(it.changed_fields) : it.changed_fields;
    } catch { changed = null; }
    return (
      <div key={it.id} className="flex gap-3">
        <div className="flex flex-col items-center">
          <span className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ backgroundColor: dot }} />
          <span className="w-px flex-1 bg-base-300" />
        </div>
        <div className="pb-5 flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-sm">{ACTION_LABEL[it.action] || it.action}</span>
            {(it.action === 'status_change' || it.action === 'status_change_denied') && (
              <span className="text-xs text-base-content/70">{it.from_status ? getStatusLabel(it.from_status, 'proposal') : '—'} → <b>{it.to_status ? getStatusLabel(it.to_status, 'proposal') : '—'}</b></span>
            )}
            <span className="badge badge-ghost badge-xs">{SOURCE_LABEL[it.source] || it.source}</span>
            {it.manual_override ? <span className="badge badge-warning badge-xs">demo/tay</span> : null}
          </div>
          <div className="text-xs text-base-content/60 mt-0.5">
            {fmtTime(it.created_at)}
            {it.actor_name ? ` · ${it.actor_name}` : ''}
            {it.actor_role ? ` (${it.actor_role})` : ''}
          </div>
          {it.reject_reason && (
            <div className="alert alert-error py-1.5 px-3 mt-2 text-xs">
              <span><b>Lý do:</b> {it.reject_reason}</span>
            </div>
          )}
          {changed && Object.keys(changed).length > 0 && (
            <div className="mt-2 border border-base-300 rounded-lg overflow-hidden">
              <table className="table table-xs">
                <thead>
                  <tr className="bg-base-200">
                    <th>Trường</th>
                    <th>Cũ</th>
                    <th>Mới</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(changed).map(([k, v]) => (
                    <tr key={k}>
                      <td className="font-medium">{(v && v.label) || k}</td>
                      <td className="text-base-content/70 max-w-[160px] truncate" title={v && v.old}>{(v && v.old) || '—'}</td>
                      <td className="max-w-[160px] truncate" title={v && v.new}>{(v && v.new) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <History size={18} className="text-primary" />
            Hoạt động đề xuất #{proposalId}
          </h3>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><span className="loading loading-spinner loading-lg"></span></div>
        ) : error ? (
          <div className="alert alert-error text-sm">{error}</div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-base-content/50 text-sm">Chưa có hoạt động nào được ghi</div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            {items.map(renderItem)}
          </div>
        )}
        <div className="modal-action">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Đóng</button>
        </div>
      </div>
      <div className="modal-backdrop bg-black/50" onClick={onClose} />
    </dialog>
  );
};

export default ProposalActivityPopup;
