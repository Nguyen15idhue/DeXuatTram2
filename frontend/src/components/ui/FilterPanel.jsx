import { SlidersHorizontal, X } from 'lucide-react';

export const FilterToggle = ({ open, onToggle, count = 0 }) => (
  <button type="button" className={`btn btn-sm gap-1 shrink-0 ${open ? 'btn-primary' : 'btn-outline'}`} onClick={onToggle}>
    <SlidersHorizontal size={14} />
    <span className="hidden sm:inline">Bộ lọc</span>
    <span className="inline-flex items-center justify-center" style={{ width: 18 }}>
      {count > 0 ? <span className="badge badge-primary badge-sm">{count}</span> : null}
    </span>
  </button>
);

export const FilterBody = ({ open, isDesktop, onClose, onApply, onReset, title = 'Bộ lọc', children }) => {
  if (!open) return null;
  if (isDesktop) {
    return (
      <div className="border border-base-300 rounded-lg p-3 mb-4 bg-base-100">
        {children}
      </div>
    );
  }
  return (
    <dialog className="modal modal-open" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <div className="modal-box max-w-lg" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, margin: 0, borderRadius: '16px 16px 0 0' }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-base">{title}</h3>
          <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={onClose}><X size={16} /></button>
        </div>
        {children}
        <div className="modal-action">
          <button className="btn btn-ghost" onClick={() => { onClose(); if (onReset) onReset(); }}>Xóa lọc</button>
          <button className="btn btn-primary" onClick={() => { onClose(); if (onApply) onApply(); }}>Áp dụng</button>
        </div>
      </div>
      <div className="modal-backdrop bg-black/50" onClick={onClose} />
    </dialog>
  );
};
