import { useState, useEffect } from 'react';
import { loadCountdownConfig, getCountdownFlags, COUNTDOWN_CONFIG_EVENT, FALLBACK_SUPPLEMENT_STATUSES } from '../utils/countdownConfig';

const pad = (n) => String(n).padStart(2, '0');

const TABULAR_STYLE = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' };
const ZERO_BADGE_STYLE = { ...TABULAR_STYLE, background: '#f3f4f6', color: '#6b7280', borderColor: '#e5e7eb' };

export const formatCountdown = (deadline) => {
  const t = new Date(deadline).getTime();
  if (Number.isNaN(t)) return null;
  const diff = t - Date.now();
  if (diff <= 0) return { overdue: true, text: '00 ngày 00:00:00', under24h: false };
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return { overdue: false, text: `${pad(d)} ngày ${pad(h)}:${pad(m)}:${pad(s)}`, under24h: diff <= 86400000 };
};

const FALLBACK_FLAGS = { supplement: true, transition: false };

const DeadlineCountdown = ({ deadline, transitionDeadline = null, status, compact = false, completedAt = null }) => {
  const [, setNow] = useState(Date.now());
  const [flags, setFlags] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const apply = (cfg) => { if (!cancelled && cfg) setFlags(getCountdownFlags(cfg)); };
    loadCountdownConfig().then(apply);
    const refresh = () => { loadCountdownConfig(true).then(apply); };
    window.addEventListener(COUNTDOWN_CONFIG_EVENT, refresh);
    return () => { cancelled = true; window.removeEventListener(COUNTDOWN_CONFIG_EVENT, refresh); };
  }, []);

  useEffect(() => {
    const hasFuture = [deadline, transitionDeadline].some((d) => d && new Date(d).getTime() > Date.now());
    if (!hasFuture) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [deadline, transitionDeadline]);

  const flag = (flags && flags[status]) || FALLBACK_FLAGS;
  const items = [];
  if (flag.supplement && deadline && !completedAt) items.push({ kind: 'supplement', deadline, label: 'bổ sung thông tin' });
  if (flag.transition && transitionDeadline) items.push({ kind: 'transition', deadline: transitionDeadline, label: 'chuyển trạng thái tiếp theo' });
  if (items.length === 0) return null;

  const rendered = items.map((it) => ({ ...it, c: formatCountdown(it.deadline) })).filter((it) => it.c);
  if (rendered.length === 0) return null;

  if (compact) {
    return (
      <span className="inline-flex flex-wrap gap-1">
        {rendered.map((it) => (
          <span
            key={it.kind}
            className={`badge ${it.c.overdue ? '' : (it.c.under24h ? 'badge-warning' : 'badge-info')} badge-xs gap-1 whitespace-nowrap`}
            style={it.c.overdue ? ZERO_BADGE_STYLE : TABULAR_STYLE}
            title={`Còn ${it.c.text} để ${it.label}`}
          >
            {it.kind === 'transition' ? 'Chuyển TT' : 'Bổ sung'}: {it.c.text}
          </span>
        ))}
      </span>
    );
  }

  return (
    <>
      {rendered.map((it) => (
        <div
          key={it.kind}
          className={`alert ${it.c.overdue ? '' : (it.c.under24h ? 'alert-warning' : 'alert-info')} py-2 px-3 text-sm`}
          style={{ marginBottom: 12 }}
        >
          <span>Còn {it.c.text} để {it.label}</span>
        </div>
      ))}
    </>
  );
};

export default DeadlineCountdown;
