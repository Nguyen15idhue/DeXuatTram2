import { useState } from 'react';
import { RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import { Button, Input, Select } from '../ui';
import useMediaQuery from '../../hooks/useMediaQuery';

const WarehouseFilterBar = ({ filters, onChange, suppliers = [], showSupplier = true, showDate = false, showDestination = false, note = 'Bộ lọc dữ liệu kho' }) => {
  const [open, setOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const activeCount = Object.entries(filters).filter(([key, value]) => key !== 'search' && Boolean(value)).length;

  const update = (key, value) => onChange({ ...filters, [key]: value });
  const apply = () => setOpen(false);
  const reset = () => {
    onChange(Object.fromEntries(Object.keys(filters).map((key) => [key, ''])));
    setOpen(false);
  };

  return (
    <div className="space-y-2 mb-4">
      <div className="flex items-center gap-2">
        <Input
          className="!mb-0 flex-1 min-w-0"
          placeholder={note}
          value={filters.search || ''}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && onChange({ ...filters, search: e.target.value })}
        />
        <Button variant="primary" size="sm" className="shrink-0" onClick={() => onChange({ ...filters, search: filters.search || '' })}>
          <Search size={14} />
          <span className="hidden sm:inline">Tìm</span>
        </Button>
        <button
          type="button"
          className={`btn btn-sm gap-1 shrink-0 ${open ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setOpen((value) => !value)}
        >
          <SlidersHorizontal size={14} />
          <span className="hidden sm:inline">Bộ lọc</span>
          {activeCount > 0 && <span className="badge badge-primary badge-sm">{activeCount}</span>}
        </button>
      </div>

      {open && isDesktop && (
        <div className="border border-base-300 rounded-lg p-3 bg-base-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {showSupplier && <Select label="Nhà cung cấp" options={suppliers.map((supplier) => ({ value: String(supplier.id), label: supplier.name }))} value={filters.supplier_id || ''} onChange={(e) => update('supplier_id', e.target.value)} placeholder="Tất cả nhà cung cấp" />}
            {showDestination && <Select label="Loại nơi nhận" options={[{ value: 'STATION', label: 'Trạm sạc' }, { value: 'WAREHOUSE', label: 'Kho' }, { value: 'PROJECT', label: 'Dự án/công trình' }, { value: 'OTHER', label: 'Khác' }]} value={filters.destination_type || ''} onChange={(e) => update('destination_type', e.target.value)} placeholder="Tất cả nơi nhận" />}
            {showDate && <Input label="Từ ngày" type="date" value={filters.date_from || ''} onChange={(e) => update('date_from', e.target.value)} />}
            {showDate && <Input label="Đến ngày" type="date" value={filters.date_to || ''} onChange={(e) => update('date_to', e.target.value)} />}
          </div>
          {activeCount > 0 && (
            <div className="flex justify-end gap-2 mt-3">
              <Button variant="ghost" size="sm" onClick={reset}><RotateCcw size={14} /> Xóa lọc</Button>
              <Button variant="primary" size="sm" onClick={apply}>Áp dụng</Button>
            </div>
          )}
        </div>
      )}

      {open && !isDesktop && (
        <dialog className="modal modal-open" onCancel={(e) => { e.preventDefault(); setOpen(false); }}>
          <div className="modal-box max-w-lg" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, margin: 0, borderRadius: '16px 16px 0 0' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-base">Bộ lọc</h3>
              <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={() => setOpen(false)}><X size={16} /></button>
            </div>
            <div className="space-y-3">
              {showSupplier && <Select label="Nhà cung cấp" options={suppliers.map((supplier) => ({ value: String(supplier.id), label: supplier.name }))} value={filters.supplier_id || ''} onChange={(e) => update('supplier_id', e.target.value)} placeholder="Tất cả nhà cung cấp" />}
              {showDestination && <Select label="Loại nơi nhận" options={[{ value: 'STATION', label: 'Trạm sạc' }, { value: 'WAREHOUSE', label: 'Kho' }, { value: 'PROJECT', label: 'Dự án/công trình' }, { value: 'OTHER', label: 'Khác' }]} value={filters.destination_type || ''} onChange={(e) => update('destination_type', e.target.value)} placeholder="Tất cả nơi nhận" />}
              {showDate && <Input label="Từ ngày" type="date" value={filters.date_from || ''} onChange={(e) => update('date_from', e.target.value)} />}
              {showDate && <Input label="Đến ngày" type="date" value={filters.date_to || ''} onChange={(e) => update('date_to', e.target.value)} />}
            </div>
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={reset}>Xóa lọc</button>
              <button className="btn btn-primary" onClick={apply}>Áp dụng</button>
            </div>
          </div>
          <div className="modal-backdrop bg-black/50" onClick={() => setOpen(false)} />
        </dialog>
      )}
    </div>
  );
};

export default WarehouseFilterBar;
