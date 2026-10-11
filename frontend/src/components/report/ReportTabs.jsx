import { Plus, X } from 'lucide-react';

export default function ReportTabs({ reports, activeId, onOpen, onAdd, onRemove }) {
  return (
    <div className="re-tabbar">
      {(reports || []).map((r) => (
        <button
          key={r.id}
          type="button"
          className={`re-tab ${r.id === activeId ? 'active' : ''}`}
          onClick={() => onOpen(r.id)}
        >
          {r.name}
          {reports.length > 1 && (
            <span
              className="re-tab-x"
              title="Xóa báo cáo"
              onClick={(e) => { e.stopPropagation(); onRemove(r.id); }}
            >
              <X size={13} />
            </span>
          )}
        </button>
      ))}
      <button type="button" className="re-tab-add" onClick={onAdd} title="Thêm báo cáo"><Plus size={14} /> Báo cáo</button>
    </div>
  );
}
