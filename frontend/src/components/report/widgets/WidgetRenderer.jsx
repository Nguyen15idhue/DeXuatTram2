export default function WidgetRenderer({ widget, controls = {}, onControlChange }) {
  if (!widget) return null;

  if (widget.type === 'text') {
    return (
      <div className={`re-text align-${(widget.visualConfig && widget.visualConfig.align) || 'left'}`}
        style={{ fontSize: `${(widget.visualConfig && widget.visualConfig.fontSize) || 18}px` }}>
        {(widget.visualConfig && widget.visualConfig.text) || widget.title}
      </div>
    );
  }

  if (widget.type === 'control') {
    const val = controls[widget.id];
    if (widget.controlType === 'dateRange') {
      const v = val || {};
      return (
        <div className="re-control">
          <label>{widget.title || 'Khoảng thời gian'}</label>
          <div className="row">
            <input type="date" value={v.from || ''} onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => onControlChange && onControlChange(widget.id, { ...v, from: e.target.value })} />
            <input type="date" value={v.to || ''} onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => onControlChange && onControlChange(widget.id, { ...v, to: e.target.value })} />
          </div>
        </div>
      );
    }
    return (
      <div className="re-control" onPointerDown={(e) => e.stopPropagation()}>
        <label>{widget.title || widget.field || 'Bộ lọc'}</label>
        <select value={val || ''} onChange={(e) => onControlChange && onControlChange(widget.id, e.target.value)}>
          <option value="">Tất cả</option>
        </select>
      </div>
    );
  }

  if (widget.type === 'kpi') {
    return <div className="re-kpi"><div className="val">—</div><div className="sub">{widget.title}</div></div>;
  }

  return <div className="re-placeholder">Chưa có dữ liệu</div>;
}
