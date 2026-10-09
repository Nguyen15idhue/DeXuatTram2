import { useState, useEffect, useMemo } from 'react';
import { X, History, ArrowDownUp } from 'lucide-react';
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
  station_created: 'Tạo trạm',
  note: 'Ghi chú từ 1Office'
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
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
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

const SAFE_HTML_TAGS = new Set(['br', 'p', 'ul', 'ol', 'li', 'b', 'strong', 'i', 'em', 'u', 'span', 'div']);
const sanitizeBasicHtml = (html) => String(html).replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (m, tag) => {
  const t = tag.toLowerCase();
  if (!SAFE_HTML_TAGS.has(t)) return '';
  if (m.startsWith('</')) return `</${t}>`;
  if (t === 'br') return '<br/>';
  return `<${t}>`;
});
const looksLikeHtml = (s) => typeof s === 'string' && /<[a-zA-Z][a-zA-Z0-9]*\b[^>]*>/.test(s);

const renderValueCell = (text) => {
  if (looksLikeHtml(text)) {
    return <span className="activity-html" style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }} dangerouslySetInnerHTML={{ __html: sanitizeBasicHtml(text) }} />;
  }
  return <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{text}</span>;
};

const StationActivityPopup = ({ stationId, onClose }) => {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [oldestFirst, setOldestFirst] = useState(false);
  const shown = useMemo(() => {
    const arr = [...items].sort((a, b) =>
      new Date(a.created_at) - new Date(b.created_at) || (a.id - b.id));
    return oldestFirst ? arr : arr.reverse();
  }, [items, oldestFirst]);

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
    const freeTable = changed && Array.isArray(changed._table) ? changed._table : null;
    const restEntries = changed
      ? Object.entries(changed).filter(([k]) => k !== '_title' && k !== '_table')
      : [];
    return (
      <div key={it.id} className="flex gap-3">
        <div className="flex flex-col items-center">
          <span className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ backgroundColor: dot }} />
          <span className="w-px flex-1 bg-base-300" />
        </div>
        <div className="pb-5 flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-sm">{(changed && changed._title) || ACTION_LABEL[it.action] || it.action}</span>
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
          {freeTable && freeTable.length > 0 && (
            <div className="mt-2 border border-base-300 rounded-lg overflow-hidden">
              <table className="table table-xs">
                <thead>
                  <tr className="bg-base-200">
                    <th className="w-10">STT</th>
                    <th>Tên trường</th>
                    <th>Giá trị</th>
                  </tr>
                </thead>
                <tbody>
                  {freeTable.map((row, i) => {
                    const label = (row && row.label) || (row && row.key) || `#${i + 1}`;
                    const newText = fmtRawValue(row && row.key, row ? row.value : null);
                    return (
                      <tr key={(row && row.key) || i}>
                        <td className="text-base-content/50">{i + 1}</td>
                        <td className="font-medium">{label}</td>
                        <td>{renderValueCell(newText)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {restEntries.length > 0 && (
            <div className="mt-2 border border-base-300 rounded-lg overflow-hidden">
              <table className="table table-xs">
                <thead>
                  <tr className="bg-base-200">
                    <th>Trường</th>
                    <th>Giá trị</th>
                  </tr>
                </thead>
                <tbody>
                  {restEntries.map(([k, v]) => {
                    const isDiff = v && typeof v === 'object' && ('new' in v || 'old' in v);
                    const label = (isDiff && v.label) || RAW_LABELS[k] || k;
                    const rawNew = isDiff ? v.new : v;
                    const newText = isDiff
                      ? ((rawNew ?? '') === '' ? '—' : String(rawNew))
                      : fmtRawValue(k, rawNew);
                    return (
                      <tr key={k}>
                        <td className="font-medium">{label}</td>
                        <td>{renderValueCell(newText)}</td>
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
          <div className="flex items-center gap-2">
            <button
              className="btn btn-ghost btn-sm gap-1"
              title={oldestFirst ? 'Đang xem cũ nhất — bấm để xem mới nhất' : 'Đang xem mới nhất — bấm để xem cũ nhất'}
              onClick={() => setOldestFirst(v => !v)}
            >
              <ArrowDownUp size={14} />
              {oldestFirst ? 'Cũ nhất' : 'Mới nhất'}
            </button>
            <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><span className="loading loading-spinner loading-lg"></span></div>
        ) : error ? (
          <div className="alert alert-error text-sm">{error}</div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-base-content/50 text-sm">Chưa có hoạt động nào được ghi</div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            {shown.map(renderItem)}
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
