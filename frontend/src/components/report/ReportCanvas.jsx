import { useEffect, useMemo, useRef, useState } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { GripVertical, Trash2 } from 'lucide-react';
import { COLS, RGL_ROW_H, RGL_MARGIN, DESIGN_W, contentHeight, toGridLayout } from '../../utils/reportModel';
import WidgetRenderer from './widgets/WidgetRenderer';

const ResponsiveGrid = WidthProvider(Responsive);

export default function ReportCanvas({
  widgets, selectedId, viewMode, showGrid = true, onSelect, onLayoutChange, onLayoutCommit, onDelete, controls, onControlChange, previews, token,
}) {
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const calc = () => {
      const avail = el.clientWidth - 32;
      setScale(Math.max(0.3, avail / DESIGN_W));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    window.addEventListener('resize', calc);
    return () => { ro.disconnect(); window.removeEventListener('resize', calc); };
  }, []);

  const gridH = useMemo(() => {
    if (!widgets || widgets.length === 0) return 0;
    const maxY = Math.max(...widgets.map((w) => w.layout.y + w.layout.h));
    return maxY * RGL_ROW_H + (maxY - 1) * RGL_MARGIN;
  }, [widgets]);

  const editable = viewMode === 'edit';

  if (!widgets || widgets.length === 0) {
    return (
      <div className="re-canvas-wrap" ref={wrapRef}>
        <div className="re-canvas-empty">
          Khung vẽ trống.<br />Bấm <b>Thêm</b> để thêm biểu đồ, KPI, bảng, bộ lọc…
        </div>
      </div>
    );
  }

  return (
    <div className="re-canvas-wrap" ref={wrapRef}>
      <div className="re-zoomtag">{Math.round(scale * 100)}%</div>
      <div className="re-canvas-inner" style={{ height: Math.round(gridH * scale) }}>
        <div className="re-canvas-scaler" style={{ width: DESIGN_W, transform: `scale(${scale})` }}>
          <ResponsiveGrid
            className={`re-grid${editable && showGrid ? ' showlines' : ''}`}
            width={DESIGN_W}
            layouts={{ lg: toGridLayout(widgets) }}
            breakpoints={{ lg: 0 }}
            cols={{ lg: COLS }}
            rowHeight={RGL_ROW_H}
            margin={[RGL_MARGIN, RGL_MARGIN]}
            compactType={null}
            preventCollision
            allowOverlap={false}
            isDraggable={editable}
            isResizable={editable}
            draggableHandle=".re-drag"
            onLayoutChange={editable && onLayoutChange ? onLayoutChange : undefined}
            onDragStop={editable && onLayoutCommit ? onLayoutCommit : undefined}
            onResizeStop={editable && onLayoutCommit ? onLayoutCommit : undefined}
          >
            {widgets.map((w) => {
              const selected = editable && w.id === selectedId;
              return (
                <div
                  key={w.id}
                  className={`re-widget ${selected ? 'selected' : ''}`}
                  onClick={(e) => { e.stopPropagation(); if (editable && onSelect) onSelect(w.id); }}
                >
                  <div className="re-widget-head">
                    {editable && <span className="re-drag" title="Kéo để di chuyển"><GripVertical size={14} /></span>}
                    <span className="re-widget-title">{w.title || w.type}</span>
                    {selected && (
                      <button type="button" className="re-widget-del" title="Xóa phần tử"
                        onClick={(e) => { e.stopPropagation(); onDelete && onDelete(w.id); }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <div className="re-widget-body" style={{ height: Math.max(0, contentHeight(w.layout)) }}>
                    <WidgetRenderer
                      widget={w}
                      data={previews && previews[w.id] ? previews[w.id].rows : null}
                      options={previews && previews[w.id] && previews[w.id].options ? previews[w.id].options : []}
                      controls={controls}
                      onControlChange={onControlChange}
                      token={token}
                    />
                  </div>
                </div>
              );
            })}
          </ResponsiveGrid>
        </div>
      </div>
    </div>
  );
}
