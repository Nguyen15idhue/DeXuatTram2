import { useState, useMemo } from 'react';
import { ArrowDownUp } from 'lucide-react';

const ACTION_LABEL = {
  lead_created: 'Tạo Lead',
  lead_updated: 'Cập nhật Lead',
  assigned: 'Giao Lead',
  classification_changed: 'Đổi phân loại',
  stage_changed: 'Đổi giai đoạn',
  proposal_created: 'Tạo đề xuất',
  proposal_updated: 'Cập nhật đề xuất',
  proposal_status_changed: 'Đổi trạng thái đề xuất',
  station_created: 'Tạo trạm',
  station_updated: 'Cập nhật trạm',
  station_status_changed: 'Đổi trạng thái trạm'
};

const ACTION_COLOR = {
  lead_created: '#0ea5e9',
  lead_updated: '#6366f1',
  assigned: '#f59e0b',
  classification_changed: '#14b8a6',
  stage_changed: '#8b5cf6',
  proposal_created: '#22c55e',
  proposal_updated: '#2563eb',
  proposal_status_changed: '#3b82f6',
  station_created: '#0d9488',
  station_updated: '#0891b2',
  station_status_changed: '#16a34a'
};

const ENTITY_LABEL = { lead: 'Lead', proposal: 'Đề xuất', station: 'Trạm' };

const SOURCE_LABEL = {
  user: 'Người dùng',
  admin: 'Admin',
  webhook: 'Webhook 1Office',
  system_auto: 'Tự động',
  admin_override: 'Admin ghi đè',
  import: 'Nhập Excel'
};

const fmtTime = (t) => {
  if (!t) return '—';
  return new Date(t).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

const parseChanged = (v) => {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
};

const ProcessTimeline = ({ events = [], loading = false, error = '', emptyText = 'Chưa có hoạt động nào được ghi', oldestFirst: oldestFirstProp, labelFor = null }) => {
  const [oldestFirst, setOldestFirst] = useState(oldestFirstProp === undefined ? false : oldestFirstProp);
  const shown = useMemo(() => {
    const arr = [...events].sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || (a.id - b.id));
    return oldestFirst ? arr : arr.reverse();
  }, [events, oldestFirst]);

  const renderItem = (it) => {
    const color = ACTION_COLOR[it.action] || '#9ca3af';
    const changed = parseChanged(it.changed_fields);
    return (
      <div key={it.id} className="flex gap-3">
        <div className="flex flex-col items-center">
          <span className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ backgroundColor: color }} />
          <span className="w-px flex-1 bg-base-300" />
        </div>
        <div className="pb-5 flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-sm">{ACTION_LABEL[it.action] || it.action}</span>
            <span className="badge badge-ghost badge-xs">{(labelFor && labelFor(it)) || ENTITY_LABEL[it.entity_type] || it.entity_type}</span>
            {it.status_after && (
              <span className="text-xs text-base-content/70">
                {it.status_before ? `${it.status_before} → ` : ''}<b>{it.status_after}</b>
              </span>
            )}
            <span className="badge badge-ghost badge-xs">{SOURCE_LABEL[it.source] || it.source}</span>
          </div>
          <div className="text-xs text-base-content/60 mt-0.5">
            {fmtTime(it.created_at)}
            {it.actor_name ? ` · ${it.actor_name}` : ''}
            {it.actor_role ? ` (${it.actor_role})` : ''}
          </div>
          {changed && Object.keys(changed).length > 0 && (
            <div className="mt-2 border border-base-300 rounded-lg overflow-hidden">
              <table className="table table-xs">
                <thead>
                  <tr className="bg-base-200"><th>Trường</th><th>Giá trị</th></tr>
                </thead>
                <tbody>
                  {Object.entries(changed).map(([k, v]) => {
                    const isDiff = v && typeof v === 'object' && ('new' in v || 'old' in v);
                    const label = (isDiff && v.label) || k;
                    const newText = isDiff
                      ? ((v.new ?? '') === '' ? '—' : String(v.new))
                      : (v === null || v === undefined || v === '' ? '—' : (typeof v === 'object' ? JSON.stringify(v) : String(v)));
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

  if (loading) return <div className="flex justify-center py-6"><span className="loading loading-spinner loading-lg"></span></div>;
  if (error) return <div className="alert alert-error text-sm">{error}</div>;
  if (!events || events.length === 0) return <div className="text-center py-6 text-base-content/50 text-sm">{emptyText}</div>;

  return (
    <div>
      <div className="flex justify-end mb-2">
        <button
          type="button"
          className="btn btn-ghost btn-xs gap-1"
          onClick={() => setOldestFirst(v => !v)}
          title={oldestFirst ? 'Đang xem cũ nhất' : 'Đang xem mới nhất'}
        >
          <ArrowDownUp size={12} />
          {oldestFirst ? 'Cũ nhất' : 'Mới nhất'}
        </button>
      </div>
      <div className="max-h-[50vh] overflow-y-auto pr-1">
        {shown.map(renderItem)}
      </div>
    </div>
  );
};

export default ProcessTimeline;
