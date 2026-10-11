import { useEffect, useRef, useState } from 'react';
import { Undo2, Redo2, Plus, ChevronDown, Save, Eye, Grid3x3, PanelRightOpen } from 'lucide-react';

const STATUS = {
  saved: { cls: 'badge-success', label: 'Đã lưu' },
  dirty: { cls: 'badge-warning', label: 'Chưa lưu' },
  saving: { cls: 'badge-info', label: 'Đang lưu…' },
  error: { cls: 'badge-error', label: 'Lỗi lưu' },
};

const ADD_ITEMS = [
  { key: 'chart', label: 'Biểu đồ' },
  { key: 'kpi', label: 'Thẻ KPI' },
  { key: 'table', label: 'Bảng dữ liệu' },
  { key: 'detail', label: 'Bảng chi tiết Lead → ON' },
  { key: 'text', label: 'Văn bản / tiêu đề' },
  { key: 'sep' },
  { key: 'controlDate', label: 'Bộ lọc ngày' },
  { key: 'controlSelect', label: 'Bộ lọc danh mục' },
];

export default function ReportToolbar({
  saveState, canUndo, canRedo, showGrid,
  onUndo, onRedo, onAdd, onSave, onToggleGrid, onTogglePanel, onToggleView,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const st = STATUS[saveState] || STATUS.saved;

  useEffect(() => {
    const onDoc = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  return (
    <>
      <span className={`badge badge-sm ${st.cls}`}>{st.label}</span>
      <button type="button" className="btn btn-sm btn-ghost btn-circle" title="Hoàn tác (Ctrl+Z)" disabled={!canUndo} onClick={onUndo}><Undo2 size={16} /></button>
      <button type="button" className="btn btn-sm btn-ghost btn-circle" title="Làm lại (Ctrl+Y)" disabled={!canRedo} onClick={onRedo}><Redo2 size={16} /></button>
      <button type="button" className={`btn btn-sm btn-ghost btn-circle ${showGrid ? 'btn-active' : ''}`} title="Bật/tắt đường lưới" onClick={onToggleGrid}><Grid3x3 size={16} /></button>
      <button type="button" className="btn btn-sm btn-ghost btn-circle" title="Ẩn/hiện bảng cấu hình" onClick={onTogglePanel}><PanelRightOpen size={16} /></button>
      <div className="dropdown dropdown-end" ref={menuRef}>
        <button type="button" className="btn btn-sm btn-outline gap-1" onClick={() => setMenuOpen((v) => !v)}>
          <Plus size={15} /> Thêm <ChevronDown size={14} />
        </button>
        {menuOpen && (
          <ul className="dropdown-content menu bg-base-100 rounded-box z-[60] w-56 p-2 shadow">
            {ADD_ITEMS.map((it, i) => (
              it.key === 'sep'
                ? <li key={`sep${i}`} className="menu-title opacity-0 py-0"><span className="h-0" /></li>
                : <li key={it.key}><button type="button" onClick={() => { onAdd(it.key); setMenuOpen(false); }}>{it.label}</button></li>
            ))}
          </ul>
        )}
      </div>
      <button type="button" className="btn btn-sm btn-primary gap-1" title="Lưu (Ctrl+S)" onClick={onSave} disabled={saveState === 'saving'}><Save size={15} /> Lưu</button>
      <button type="button" className="btn btn-sm btn-outline gap-1" onClick={onToggleView}><Eye size={15} /> Xem</button>
    </>
  );
}
