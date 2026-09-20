import { useState, useEffect } from 'react';

const COUNTDOWN_STATUSES = ['PENDING', 'REVIEWING', 'PRINCIPLE_APPROVED'];

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

const DeadlineCountdown = ({ deadline, status, compact = false }) => {
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [deadline]);
  if (!deadline || !COUNTDOWN_STATUSES.includes(status)) return null;
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
