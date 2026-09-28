import { useState, useEffect } from 'react';
import { loadCountdownConfig, getCountdownStatuses, COUNTDOWN_CONFIG_EVENT, FALLBACK_COUNTDOWN_STATUSES } from '../utils/countdownConfig';

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

const DeadlineCountdown = ({ deadline, status, compact = false, enabledStatuses = null, completedAt = null }) => {
  const [, setNow] = useState(Date.now());
  const [enabled, setEnabled] = useState(enabledStatuses || null);

  useEffect(() => {
    if (enabledStatuses) { setEnabled(enabledStatuses); return undefined; }
    let cancelled = false;
    const refresh = () => {
      loadCountdownConfig(true).then((cfg) => { if (!cancelled) setEnabled(getCountdownStatuses(cfg)); });
    };
    loadCountdownConfig().then((cfg) => { if (!cancelled && cfg) setEnabled(getCountdownStatuses(cfg)); });
    window.addEventListener(COUNTDOWN_CONFIG_EVENT, refresh);
    return () => { cancelled = true; window.removeEventListener(COUNTDOWN_CONFIG_EVENT, refresh); };
  }, [enabledStatuses]);

  useEffect(() => {
    if (!deadline) return undefined;
    if (new Date(deadline).getTime() <= Date.now()) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [deadline]);

  const statuses = enabled || FALLBACK_COUNTDOWN_STATUSES;
  if (completedAt) return null;
  if (!deadline || !statuses.includes(status)) return null;
  const c = formatCountdown(deadline);
  if (!c) return null;
  if (c.overdue) {
    if (compact) {
      return <span className="badge badge-xs gap-1 whitespace-nowrap" style={ZERO_BADGE_STYLE}>Còn {c.text}</span>;
    }
    return (
      <div className="alert py-2 px-3 text-sm" style={{ marginBottom: 12 }}>
        <span>Còn {c.text} để bổ sung thông tin</span>
      </div>
    );
  }
  if (compact) {
    return <span className={`badge ${c.under24h ? 'badge-warning' : 'badge-info'} badge-xs gap-1 whitespace-nowrap`} style={TABULAR_STYLE}>Còn {c.text}</span>;
  }
  return (
    <div className={`alert ${c.under24h ? 'alert-warning' : 'alert-info'} py-2 px-3 text-sm`} style={{ marginBottom: 12 }}>
      <span>Còn {c.text} để bổ sung thông tin</span>
    </div>
  );
};

export default DeadlineCountdown;
