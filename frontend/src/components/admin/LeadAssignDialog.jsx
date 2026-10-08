import { useState, useEffect } from 'react';
import { leadService } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { X, Users, Split } from 'lucide-react';

const GDKV_GROUP = 'Giám đốc Khu vực';

const normalizeUserId = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const raw = (typeof v === 'object') ? (v.id ?? v.user_id ?? v.value) : v;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? String(n) : null;
};

// GĐKV hiện tại: lead đơn → id đã giao; nhiều lead → id chung nếu tất cả cùng 1 người.
const currentAssigneeOf = (leads) => {
  const ids = (leads || []).map(l => normalizeUserId(l.assigned_user_id)).filter(Boolean);
  if (ids.length === 0) return null;
  const unique = [...new Set(ids)];
  return unique.length === 1 ? unique[0] : null;
};

const currentAssigneeLabelOf = (leads) => {
  const first = (leads || []).find(l => l.assigned_user_id);
  if (!first) return null;
  const v = first.assigned_user_id;
  return (typeof v === 'object' && v.label) ? v.label : null;
};

const LeadAssignDialog = ({ open, leads = [], onClose, onDone }) => {
  const { token } = useAuth();
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignee, setAssignee] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [extraOption, setExtraOption] = useState(null);

  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    const initial = currentAssigneeOf(leads);
    setAssignee(initial || '');
    setReason('');
    setExtraOption(null);
    leadService.getGdkvOptions(token)
      .then(res => {
        if (cancelled) return;
        if (res && res.success) {
          const all = res.data || [];
          const gdkv = all.filter(o => (o.group || GDKV_GROUP) === GDKV_GROUP);
          const list = gdkv.length > 0 ? gdkv : all;
          setOptions(list);
          // Nếu GĐKV hiện tại không nằm trong danh sách (vd ngoài phạm vi chọn) → thêm option hiển thị tên đã giao.
          if (initial && !list.some(o => String(o.id) === String(initial))) {
            setExtraOption({ id: initial, full_name: currentAssigneeLabelOf(leads) || `GĐKV #${initial}`, department: '' });
          }
        } else {
          setError((res && res.message) || 'Không tải được danh sách GĐKV');
        }
      })
      .catch(() => { if (!cancelled) setError('Lỗi tải danh sách GĐKV'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, token]);

  if (!open) return null;

  const handleConfirm = async () => {
    if (!assignee) { setError('Vui lòng chọn Giám đốc Khu vực'); return; }
    setSubmitting(true);
    setError('');
    try {
      const ids = leads.map(l => l.id);
      const res = ids.length === 1
        ? await leadService.assign(ids[0], Number(assignee), token, reason)
        : await leadService.bulkAssign(ids, Number(assignee), token, reason);
      if (res && res.success) {
        if (onDone) onDone(res);
        onClose();
      } else {
        setError((res && res.message) || 'Phân chia thất bại');
      }
    } catch (err) {
      setError((err && err.message) || 'Lỗi kết nối server');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog className="modal modal-open" onClick={(e) => e.stopPropagation()}>
      <div className="modal-box max-w-3xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Split size={18} className="text-primary" />
            Phân chia Leads {leads.length > 1 ? `(${leads.length})` : ''}
          </h3>
          <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        {error && <div className="alert alert-error text-sm mb-3">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm font-semibold mb-2 flex items-center gap-1"><Users size={14} /> Danh sách Lead</div>
            <div className="border border-base-300 rounded-lg max-h-64 overflow-y-auto">
              {leads.length === 0 ? (
                <div className="p-3 text-sm text-base-content/50">Không có Lead</div>
              ) : leads.map(l => (
                <div key={l.id} className="px-3 py-2 border-b border-base-200 last:border-b-0 text-sm">
                  <div className="font-medium truncate">{l.lead_code || `#${l.id}`} · {l.full_name}</div>
                  <div className="text-xs text-base-content/60">{l.assigned_department || 'Chưa rõ phòng ban'}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold mb-2">Giám đốc Khu vực phụ trách</div>
            <select
              className="select select-bordered w-full"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              disabled={loading}
            >
              <option value="">{loading ? 'Đang tải...' : 'Chọn GĐKV'}</option>
              {extraOption && (
                <option value={extraOption.id}>{extraOption.full_name}{extraOption.department ? ` — ${extraOption.department}` : ''}</option>
              )}
              {options.map(o => (
                <option key={o.id} value={o.id}>
                  {o.full_name}{o.department ? ` — ${o.department}` : ''}
                </option>
              ))}
            </select>
            <div className="text-xs text-base-content/60 mt-1">
              {options.length} GĐKV khả dụng
            </div>
            <div className="form-control mt-3">
              <label className="label py-1"><span className="label-text text-xs">Lý do (tùy chọn)</span></label>
              <input
                type="text"
                className="input input-bordered input-sm"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="VD: Phân chia theo khu vực"
              />
            </div>
          </div>
        </div>

        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>Hủy</button>
          <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={submitting || !assignee}>
            {submitting && <span className="loading loading-spinner loading-xs"></span>}
            {submitting ? 'Đang phân chia...' : 'Phân chia'}
          </button>
        </div>
      </div>
      <div className="modal-backdrop bg-black/50" onClick={onClose} />
    </dialog>
  );
};

export default LeadAssignDialog;
