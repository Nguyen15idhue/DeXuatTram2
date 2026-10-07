import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { getProposalStatuses } from '../../utils/mapStatuses';
import { notifyCountdownConfigChanged } from '../../utils/countdownConfig';

const emptyPart = (enabled = false, days = 0) => ({ enabled, days, hours: 0, minutes: 0 });

const DEFAULT_RULES = [
  { status: 'PENDING', supplement: emptyPart(true, 3), transition: emptyPart(false, 0) },
  { status: 'REVIEWING', supplement: emptyPart(true, 3), transition: emptyPart(false, 0) },
  { status: 'PRINCIPLE_APPROVED', supplement: emptyPart(true, 15), transition: emptyPart(false, 0) },
  { status: 'APPROVED', supplement: emptyPart(false, 10), transition: emptyPart(false, 0) },
  { status: 'ARCHIVED', supplement: emptyPart(false, 10), transition: emptyPart(false, 0) }
];

const MERGED_STATUS_GROUPS = { PENDING: ['PENDING', 'REVIEWING'] };
const MERGED_LABELS = { PENDING: 'Đang đề xuất / Đang xem xét' };
const KINDS = [
  { key: 'supplement', label: 'Bổ sung thông tin', hint: 'Quá hạn chưa xác nhận đủ thông tin → hủy đề xuất' },
  { key: 'transition', label: 'Chuyển trạng thái', hint: 'Quá hạn chưa chuyển sang trạng thái tiếp theo → hủy đề xuất' }
];

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
  const [maxTimes, setMaxTimes] = useState(3);
  const [maxDaysPerTime, setMaxDaysPerTime] = useState(30);

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
        if (res.data.maxTimes !== undefined) setMaxTimes(res.data.maxTimes);
        if (res.data.maxDaysPerTime !== undefined) setMaxDaysPerTime(res.data.maxDaysPerTime);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, token]);

  const ensureRule = (row) => {
    for (const status of row.statuses) {
      const r = rules.find((x) => x.status === status);
      if (r) return r;
    }
    return { status: row.statuses[0], supplement: emptyPart(), transition: emptyPart() };
  };

  const setPart = (row, kind, patch) => {
    setRules((prev) => {
      const next = [...prev];
      row.statuses.forEach((status) => {
        const idx = next.findIndex((r) => r.status === status);
        const base = idx >= 0 ? next[idx] : { status, supplement: emptyPart(), transition: emptyPart() };
        const updated = { ...base, [kind]: { ...(base[kind] || emptyPart()), ...patch } };
        if (idx >= 0) next[idx] = updated; else next.push(updated);
      });
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const payload = {
        warn_hours: Number(warnHours) || 24,
        extend_max_times: Number(maxTimes),
        extend_max_days_per_time: Number(maxDaysPerTime),
        rules: displayRows.flatMap((row) => {
          const r = ensureRule(row);
          const norm = (part) => ({
            enabled: !!(part && part.enabled),
            days: Number((part && part.days) || 0),
            hours: Number((part && part.hours) || 0),
            minutes: Number((part && part.minutes) || 0)
          });
          const rule = { supplement: norm(r.supplement), transition: norm(r.transition) };
          return row.statuses.map((status) => ({ status, ...rule }));
        })
      };
      const res = await api.putWithAuth('/admin/lifecycle-config', payload, token);
      if (res && res.success) {
        notifyCountdownConfigChanged();
        if (res.data?.maxTimes !== undefined) setMaxTimes(res.data.maxTimes);
        if (res.data?.maxDaysPerTime !== undefined) setMaxDaysPerTime(res.data.maxDaysPerTime);
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

  const renderPartCells = (row, rule, kind) => {
    const part = (rule && rule[kind]) || emptyPart();
    return (
      <>
        <td>
          <input
            type="checkbox"
            className="checkbox checkbox-xs"
            checked={!!part.enabled}
            onChange={(e) => setPart(row, kind, { enabled: e.target.checked })}
          />
        </td>
        <td>
          <input
            type="number" min={0} max={365}
            className="input input-bordered input-xs w-16"
            disabled={!part.enabled}
            value={part.days ?? 0}
            onChange={(e) => setPart(row, kind, { days: e.target.value })}
          />
        </td>
        <td>
          <input
            type="number" min={0} max={23}
            className="input input-bordered input-xs w-16"
            disabled={!part.enabled}
            value={part.hours ?? 0}
            onChange={(e) => setPart(row, kind, { hours: e.target.value })}
          />
        </td>
        <td>
          <input
            type="number" min={0} max={59}
            className="input input-bordered input-xs w-16"
            disabled={!part.enabled}
            value={part.minutes ?? 0}
            onChange={(e) => setPart(row, kind, { minutes: e.target.value })}
          />
        </td>
      </>
    );
  };

  return (
    <div className="card bg-base-100 border border-base-300 mb-3">
      <button type="button" className="flex items-center justify-between px-3 py-2 text-left" onClick={() => setOpen((v) => !v)}>
        <span className="font-semibold text-sm">Countdown (bổ sung thông tin / chuyển trạng thái)</span>
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
              <p className="text-xs text-gray-500 mb-1">Đang đề xuất và Đang xem xét dùng chung 1 mốc bổ sung, không đếm lại khi duyệt &amp; đẩy.</p>
              <p className="text-xs text-gray-500 mb-1">
                Mỗi trạng thái có thể bật <b>cả hai</b> countdown song song: quá hạn mốc nào (chưa bổ sung đủ thông tin / chưa chuyển trạng thái tiếp theo) thì đề xuất bị hủy.
              </p>
              <div className="flex items-center gap-2 py-2 text-sm flex-wrap">
                <span>Gia hạn tối đa</span>
                <input
                  type="number" min={0} max={99}
                  className="input input-bordered input-xs w-16"
                  value={maxTimes}
                  onChange={(e) => setMaxTimes(e.target.value)}
                  title="Số lần gia hạn tối đa cho 1 đề xuất (0 = không giới hạn)"
                />
                <span>lần (0 = không giới hạn), mỗi lần tối đa</span>
                <input
                  type="number" min={1} max={365}
                  className="input input-bordered input-xs w-16"
                  value={maxDaysPerTime}
                  onChange={(e) => setMaxDaysPerTime(e.target.value)}
                  title="Số ngày tối đa cho 1 lần gia hạn"
                />
                <span>ngày</span>
              </div>
              <table className="table table-xs w-full">
                <thead>
                  <tr>
                    <th>Trạng thái</th>
                    <th>Loại</th>
                    <th className="w-16">Áp dụng</th>
                    <th className="w-20">Ngày</th>
                    <th className="w-20">Giờ</th>
                    <th className="w-20">Phút</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((s) => {
                    const r = ensureRule(s);
                    return KINDS.map((kind, idx) => (
                      <tr key={`${s.value}-${kind.key}`} className={idx === 0 ? 'border-t border-base-200' : ''}>
                        {idx === 0 && (
                          <td rowSpan={KINDS.length} className="align-top">
                            <span className="inline-flex items-center gap-2">
                              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                              {s.label}
                            </span>
                          </td>
                        )}
                        <td title={kind.hint}>
                          {kind.label}
                        </td>
                        {renderPartCells(s, r, kind.key)}
                      </tr>
                    ));
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
