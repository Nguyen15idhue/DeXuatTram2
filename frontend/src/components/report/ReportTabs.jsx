import { X } from 'lucide-react';

export default function ReportTabs({ reports, activeId, canEdit, onOpen, onAdd, onRemove }) {
  return (
    <div className="tabs tabs-boxed mb-4 w-fit max-w-full overflow-x-auto">
      {(reports || []).map((r) => (
        <a
          key={r.id}
          role="tab"
          className={`tab whitespace-nowrap ${r.id === activeId ? 'tab-active' : ''}`}
          onClick={() => onOpen(r.id)}
        >
          {r.name}
          {canEdit && reports.length > 1 && (
            <span
              role="presentation"
              className="ml-2 text-base-content/50 hover:text-error"
              onClick={(e) => { e.stopPropagation(); onRemove(r.id); }}
            >
              <X size={13} />
            </span>
          )}
        </a>
      ))}
      {canEdit && (
        <a role="tab" className="tab whitespace-nowrap" onClick={onAdd}>+ Báo cáo</a>
      )}
    </div>
  );
}
