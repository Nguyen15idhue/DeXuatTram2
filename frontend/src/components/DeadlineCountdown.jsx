import { useState, useEffect } from 'react';
import { loadCountdownConfig, getCountdownStatuses, COUNTDOWN_CONFIG_EVENT, FALLBACK_COUNTDOWN_STATUSES } from '../utils/countdownConfig';

const pad = (n) => String(n).padStart(2, '0');

export const formatCountdown = (deadline) => {
  const t = new Date(deadline).getTime();
  if (Number.isNaN(t)) return null;
  const diff = t - Date.now();
  const abs = Math.abs(diff);
  const d = Math.floor(abs / 86400000);
  const h = Math.floor((abs % 86400000) / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  const s = Math.floor((abs % 60000) / 1000);
  return { overdue: diff <= 0, text: `${pad(d)} ngày ${pad(h)}:${pad(m)}:${pad(s)}`, under24h: diff > 0 && diff <= 86400000 };
};

const DeadlineCountdown = ({ deadline, status, compact = false, enabledStatuses = null }) => {
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
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [deadline]);

  const statuses = enabled || FALLBACK_COUNTDOWN_STATUSES;
  if (!deadline || !statuses.includes(status)) return null;
  const c = formatCountdown(deadline);
  if (!c) return null;
  if (compact) {
    if (c.overdue) return <span className="badge badge-error badge-xs gap-1 whitespace-nowrap">Quá hạn {c.text}</span>;
    if (c.under24h) return <span className="badge badge-warning badge-xs gap-1 whitespace-nowrap">Còn {c.text}</span>;
    return null;
  }
  return (
    <div className={`alert ${c.overdue ? 'alert-error' : (c.under24h ? 'alert-warning' : 'alert-info')} py-2 px-3 text-sm`} style={{ marginBottom: 12 }}>
      <span>{c.overdue ? `Đã quá hạn bổ sung thông tin: ${c.text}` : `Còn ${c.text} để bổ sung thông tin`}</span>
    </div>
  );
};

export default DeadlineCountdown;
