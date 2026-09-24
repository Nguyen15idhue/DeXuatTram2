import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { getProposalStatuses } from '../../utils/mapStatuses';
import { notifyCountdownConfigChanged } from '../../utils/countdownConfig';

const DEFAULT_RULES = [
  { status: 'PENDING', days: 3, hours: 0, minutes: 0, enabled: true },
  { status: 'REVIEWING', days: 3, hours: 0, minutes: 0, enabled: true },
  { status: 'PRINCIPLE_APPROVED', days: 15, hours: 0, minutes: 0, enabled: true },
  { status: 'APPROVED', days: 10, hours: 0, minutes: 0, enabled: false },
  { status: 'ARCHIVED', days: 10, hours: 0, minutes: 0, enabled: false }
];

const MERGED_STATUS_GROUPS = { PENDING: ['PENDING', 'REVIEWING'] };
const MERGED_LABELS = { PENDING: 'Đang đề xuất / Đang xem xét' };

const buildDisplayRows = (statuses) => {
  const rows = [];
  const consumed = new Set();
  statuses.forEach((s) => {
    if (consumed.has(s.value)) return;
    const group = MERGED_STATUS_GROUPS[s.value];
    if (group && group.length > 1) {
      group.forEach((v) => consumed.add(v));
      rows.push({ value: s.value, label: MERGED_LABELS[s.value] || s.label, color: s.color, statuses: group });
    } else {
      consumed.add(s.value);
      rows.push({ value: s.value, label: s.label, color: s.color, statuses: [s.value] });
    }
  });
  return rows;
};

const CountdownConfigPanel = () => {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [warnHours, setWarnHours] = useState(24);
  const [rules, setRules] = useState(DEFAULT_RULES);

  const statuses = getProposalStatuses();
  const displayRows = buildDisplayRows(statuses);

  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    setLoading(true);
    api.getWithAuth('/admin/lifecycle-config', token)
      .then((res) => {
        if (cancelled || !res || !res.success || !res.data) return;
        setWarnHours(res.data.warn_hours || 24);
        setRules(Array.isArray(res.data.rules) && res.data.rules.length > 0 ? res.data.rules : DEFAULT_RULES);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, token]);

  const setRule = (row, patch) => {
    setRules((prev) => {
      const next = [...prev];
      row.statuses.forEach((status) => {
        const idx = next.findIndex((r) => r.status === status);
        if (idx >= 0) next[idx] = { ...next[idx], ...patch };
        else next.push({ status, ...patch });
      });
      return next;
    });
  };

  const ensureRule = (row) => {
    for (const status of row.statuses) {
      const r = rules.find((x) => x.status === status);
      if (r) return r;
    }
    return { days: 3, hours: 0, minutes: 0, enabled: false };
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const payload = {
        warn_hours: Number(warnHours) || 24,
        rules: displayRows.flatMap((row) => {
          const r = ensureRule(row);
          const rule = {
            days: Number(r.days) || 0,
            hours: Number(r.hours) || 0,
            minutes: Number(r.minutes) || 0,
            enabled: !!r.enabled
          };
          return row.statuses.map((status) => ({ status, ...rule }));
        })
      };
      const res = await api.putWithAuth('/admin/lifecycle-config', payload, token);
      if (res && res.success) {
        notifyCountdownConfigChanged();
        setMessage('Đã lưu cấu hình countdown');
      } else {
        setMessage('Lưu thất bại');
      }
    } catch {
      setMessage('Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card bg-base-100 border border-base-300 mb-3">
      <button type="button" className="flex items-center justify-between px-3 py-2 text-left" onClick={() => setOpen((v) => !v)}>
        <span className="font-semibold text-sm">Countdown bổ sung thông tin</span>
        <span className="text-xs text-gray-500">{open ? 'Thu gọn ▲' : 'Mở rộng ▼'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-base-200">
          {loading ? (
            <div className="text-sm text-gray-500 py-3">Đang tải...</div>
          ) : (
            <>
              <div className="flex items-center gap-2 py-2 text-sm">
                <span>Cảnh báo trước</span>
                <input
                  type="number"
                  min={1}
                  max={168}
                  className="input input-bordered input-xs w-20"
                  value={warnHours}
                  onChange={(e) => setWarnHours(e.target.value)}
                />
                <span>giờ (mặc định 24)</span>
              </div>
              <p className="text-xs text-gray-500 mb-1">Đang đề xuất và Đang xem xét dùng chung 1 mốc, không đếm lại khi duyệt &amp; đẩy.</p>
              <table className="table table-xs w-full">
                <thead>
                  <tr>
                    <th>Trạng thái</th>
                    <th className="w-16">Áp dụng</th>
                    <th className="w-20">Ngày</th>
                    <th className="w-20">Giờ</th>
                    <th className="w-20">Phút</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((s) => {
                    const r = ensureRule(s);
                    return (
                      <tr key={s.value}>
                        <td>
                          <span className="inline-flex items-center gap-2">
                            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                            {s.label}
                          </span>
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            className="checkbox checkbox-xs"
                            checked={!!r.enabled}
                            onChange={(e) => setRule(s, { enabled: e.target.checked, days: r.days ?? 3, hours: r.hours ?? 0, minutes: r.minutes ?? 0 })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            max={365}
                            className="input input-bordered input-xs w-16"
                            disabled={!r.enabled}
                            value={r.days ?? 0}
                            onChange={(e) => setRule(s, { days: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            max={23}
                            className="input input-bordered input-xs w-16"
                            disabled={!r.enabled}
                            value={r.hours ?? 0}
                            onChange={(e) => setRule(s, { hours: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            max={59}
                            className="input input-bordered input-xs w-16"
                            disabled={!r.enabled}
                            value={r.minutes ?? 0}
                            onChange={(e) => setRule(s, { minutes: e.target.value })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="flex items-center gap-3 mt-2">
                <button type="button" className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                  {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
                </button>
                {message && <span className="text-xs text-gray-600">{message}</span>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default CountdownConfigPanel;
