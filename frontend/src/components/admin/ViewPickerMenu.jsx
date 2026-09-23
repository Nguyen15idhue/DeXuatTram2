import { useState, useRef } from 'react';
import { Download, ChevronDown } from 'lucide-react';

export const usageLabel = (u) => {
  if (u === 'excel_basic') return 'Excel cơ bản';
  if (u === 'excel_full') return 'Excel đầy đủ';
  if (u === 'table') return 'Bảng danh sách';
  return u;
};

export const usageBadge = (u) => {
  if (u === 'excel_basic') return 'badge-info';
  if (u === 'excel_full') return 'badge-success';
  return 'badge-primary';
};

const ViewPickerMenu = ({ label, views, onPick, onPickForm, title = 'Chọn bộ cột', icon: Icon = Download }) => {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const [top, setTop] = useState(null);
  const toggle = () => {
    if (!open && btnRef.current && window.innerWidth < 768) {
      const r = btnRef.current.getBoundingClientRect();
      setTop(Math.max(8, Math.min(r.bottom + 4, window.innerHeight - 160)));
    } else {
      setTop(null);
    }
    setOpen(v => !v);
  };

  return (
    <div className="relative">
      <button ref={btnRef} className="btn btn-ghost btn-sm gap-1" onClick={toggle}>
        <Icon size={14} />
        {label}
        <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <ul className="absolute right-0 mt-1 menu bg-base-100 rounded-box shadow-lg border border-base-300 w-72 z-50 p-2 dropdown-center-mobile" style={top != null ? { top } : undefined}>
            <li className="menu-title text-xs">{title}</li>
            {onPickForm && (
              <li>
                <button onClick={() => { setOpen(false); onPickForm(); }}>
                  <span className="badge badge-xs badge-accent">Form</span>
                  <span>Theo form (section/tab, 3 hàng header)</span>
                </button>
              </li>
            )}
            {views.map(v => (
              <li key={v.id}>
                <button
                  title={`${v.field_count || 0} cột`}
                  onClick={() => { setOpen(false); onPick([v.id]); }}
                >
                  <span className={`badge badge-xs ${usageBadge(v.usage)}`}>{usageLabel(v.usage)}</span>
                  <span className="truncate">{v.name}</span>
                </button>
              </li>
            ))}
            {views.length > 1 && (
              <li>
                <button onClick={() => { setOpen(false); onPick(views.map(v => v.id)); }}>
                  <span className="badge badge-xs badge-ghost">{views.length} sheet</span>
                  <span>Tất cả bộ cột (1 file, nhiều sheet)</span>
                </button>
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
};

export default ViewPickerMenu;
