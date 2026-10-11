import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Undo2, Redo2, Plus, ChevronDown, Save, Eye, Pencil, Grid3x3, PanelRightOpen } from 'lucide-react';

const STATUS = {
  saved: { cls: 'saved', label: 'Đã lưu' },
  dirty: { cls: 'dirty', label: 'Chưa lưu' },
  saving: { cls: 'saving', label: 'Đang lưu…' },
  error: { cls: 'error', label: 'Lỗi lưu' },
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
  name, viewMode, saveState, canUndo, canRedo, canEdit = true, showGrid,
  onToggleView, onUndo, onRedo, onAdd, onSave, onRename, onBack, onToggleGrid, onTogglePanel,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const edit = viewMode === 'edit' && canEdit;
  const st = STATUS[saveState] || STATUS.saved;

  useEffect(() => {
    const onDoc = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  return (
    <div className="re-toolbar">
      <div className="re-tb-name">
        <button type="button" className="re-tbtn" title="Quay lại danh sách báo cáo" onClick={onBack}>
          <ArrowLeft size={16} />
        </button>
        <input
          className="re-name-input"
          value={name}
          readOnly={!edit}
          onChange={(e) => onRename(e.target.value)}
          aria-label="Tên báo cáo"
        />
        <span className={`re-status ${st.cls}`}><span className="dot" />{st.label}</span>
      </div>

      <div className="re-tb-spacer" />

      {edit && (
        <>
          <div className="re-tgroup">
            <button type="button" className="re-tbtn" title="Hoàn tác (Ctrl+Z)" disabled={!canUndo} onClick={onUndo}><Undo2 size={16} /></button>
            <button type="button" className="re-tbtn" title="Làm lại (Ctrl+Y)" disabled={!canRedo} onClick={onRedo}><Redo2 size={16} /></button>
          </div>
          <button type="button" className={`re-tbtn ${showGrid ? 're-active' : ''}`} title="Bật/tắt đường lưới" onClick={onToggleGrid}><Grid3x3 size={16} /></button>
          <button type="button" className="re-tbtn re-hide-sm" title="Ẩn/hiện bảng cấu hình" onClick={onTogglePanel}><PanelRightOpen size={16} /></button>
          <div className="re-menu-wrap" ref={menuRef}>
            <button type="button" className="re-tbtn" onClick={() => setMenuOpen((v) => !v)}>
              <Plus size={15} /> Thêm <ChevronDown size={14} />
            </button>
            {menuOpen && (
              <div className="re-menu">
                {ADD_ITEMS.map((it, i) => (
                  it.key === 'sep'
                    ? <div className="sep" key={`sep${i}`} />
                    : <button key={it.key} type="button" onClick={() => { onAdd(it.key); setMenuOpen(false); }}>{it.label}</button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="re-tbtn re-primary" title="Lưu (Ctrl+S)" onClick={onSave} disabled={saveState === 'saving'}>
            <Save size={15} /> Lưu
          </button>
        </>
      )}

      {canEdit && (
        <button type="button" className="re-tbtn re-ghost" onClick={onToggleView}>
          {edit ? <Eye size={15} /> : <Pencil size={15} />} {edit ? 'Xem' : 'Chỉnh sửa'}
        </button>
      )}
    </div>
  );
}
