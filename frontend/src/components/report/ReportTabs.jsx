export default function ReportTabs({ reports, activeId, canEdit, onOpen, onAdd }) {
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
        </a>
      ))}
      {canEdit && (
        <a role="tab" className="tab whitespace-nowrap" onClick={onAdd}>+ Báo cáo</a>
      )}
    </div>
  );
}
