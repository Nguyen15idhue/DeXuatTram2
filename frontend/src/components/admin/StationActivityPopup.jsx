import { useState, useEffect } from 'react';
import { X, History } from 'lucide-react';
import { stationService } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { getStatusLabel } from '../../utils/mapStatuses';

const STATUS_DOT = {
  PLANNING: '#a855f7',
  ACTIVE: '#22c55e',
  DEPLOYING: '#eab308',
  REJECTED: '#b91c1c'
};

const ACTION_LABEL = {
  created: 'Tạo trạm',
  updated: 'Cập nhật thông tin',
  status_change: 'Đổi trạng thái',
  status_change_denied: 'Đổi trạng thái bị chặn',
  station_created: 'Tạo trạm'
};

const SOURCE_LABEL = {
  user: 'Người dùng',
  webhook: 'Webhook 1Office',
  script: 'Script demo',
  system_auto: 'Tự động',
  admin_override: 'Admin ghi đè',
  import: 'Nhập Excel'
};

const fmtTime = (t) => {
  if (!t) return '—';
  return new Date(t).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
};

const RAW_LABELS = {
  ma_tram: 'Mã trạm',
  station_id: 'Trạm',
  station_name: 'Tên trạm',
  _inbound: 'Nội dung 1Office'
};

const fmtRawValue = (key, v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
};

const StationActivityPopup = ({ stationId, onClose }) => {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    stationService.activity(stationId, token)
      .then(res => {
        if (cancelled) return;
        if (res.success) setItems(res.data || []);
        else setError(res.message || 'Lỗi tải lịch sử');
      })
      .catch(() => { if (!cancelled) setError('Lỗi kết nối server'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [stationId, token]);

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
              <span className="text-xs text-base-content/70">{it.from_status ? getStatusLabel(it.from_status, 'station') : '—'} → <b>{it.to_status ? getStatusLabel(it.to_status, 'station') : '—'}</b></span>
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
            <div className="alert alert-info py-1.5 px-3 mt-2 text-xs">
              <span><b>Ghi chú:</b> {it.reject_reason}</span>
            </div>
          )}
          {changed && Object.keys(changed).length > 0 && (
            <div className="mt-2 border border-base-300 rounded-lg overflow-hidden">
              <table className="table table-xs">
                <thead>
                  <tr className="bg-base-200">
                    <th>Trường</th>
                    <th>Giá trị</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(changed).map(([k, v]) => {
                    const isDiff = v && typeof v === 'object' && ('new' in v || 'old' in v);
                    const label = (isDiff && v.label) || RAW_LABELS[k] || k;
                    const rawNew = isDiff ? v.new : v;
                    const newText = isDiff
                      ? ((rawNew ?? '') === '' ? '—' : String(rawNew))
                      : fmtRawValue(k, rawNew);
                    return (
                      <tr key={k}>
                        <td className="font-medium">{label}</td>
                        <td className="max-w-[320px] truncate" title={newText}>{newText}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <dialog className="modal modal-open" onClick={(e) => e.stopPropagation()}>
      <div className="modal-box max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <History size={18} className="text-primary" />
            Hoạt động trạm #{stationId}
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

export default StationActivityPopup;
