import { useState } from 'react';

export const CHARTS = [
  { value: 'bar', label: 'Cột' },
  { value: 'pie', label: 'Tròn' },
  { value: 'table', label: 'Bảng' },
  { value: 'kpi', label: 'Số lớn' },
  { value: 'line', label: 'Đường' },
  { value: 'funnel', label: 'Phễu' },
];

export const SIZES = [
  { value: 'sm', label: 'Nhỏ (1/3)' },
  { value: 'md', label: 'Vừa (1/2)' },
  { value: 'lg', label: 'Lớn (2/3)' },
  { value: 'full', label: 'Toàn hàng' },
];

export const AGGS = [
  { value: 'count', label: 'Đếm' },
  { value: 'count_distinct', label: 'Đếm khác nhau' },
  { value: 'sum', label: 'Tổng' },
  { value: 'avg', label: 'Trung bình' },
  { value: 'min', label: 'Nhỏ nhất' },
  { value: 'max', label: 'Lớn nhất' },
];

export const OPS = ['=', '!=', '>', '>=', '<', '<=', 'LIKE'];

const isSysWidget = (w) => !w.dataset;

const ReportPropertiesPanel = ({ open, widget, catalog, onChange, onDelete, onClose, onExport }) => {
  const [subTab, setSubTab] = useState('setup');

  if (!widget) return null;

  const dsKeys = Object.keys(catalog || {});
  const ds = widget.dataset ? catalog[widget.dataset] : null;
  const dims = ds ? Object.entries(ds.dimensions) : [];
  const mets = ds ? Object.entries(ds.metrics) : [];
  const aggs = widget.metric && ds && ds.metrics[widget.metric] ? ds.metrics[widget.metric].aggs : ['count'];
  const set = (patch) => onChange(patch);

  const inputCls = 'input input-bordered input-sm w-full';
  const selectCls = 'select select-bordered select-sm w-full';

  return (
    <div className={`report-panel ${open ? 'open' : 'closed'}`}>
      <div className="report-panel-head">
        <span className="font-semibold text-sm">Thuộc tính</span>
        <div className="tabs tabs-boxed tabs-xs">
          <button className={`tab tab-xs ${subTab === 'setup' ? 'tab-active' : ''}`} onClick={() => setSubTab('setup')}>Thiết lập</button>
          <button className={`tab tab-xs ${subTab === 'style' ? 'tab-active' : ''}`} onClick={() => setSubTab('style')}>Hiển thị</button>
        </div>
        <button type="button" className="btn btn-ghost btn-xs btn-circle" onClick={onClose} title="Thu gọn">✕</button>
      </div>

      <div className="report-panel-body">
        {subTab === 'setup' && (
          isSysWidget(widget) ? (
            <div className="text-xs space-y-2">
              <div className="alert alert-info py-2">
                Biểu đồ hệ thống dùng chỉ số tổng hợp có sẵn, không đổi được nguồn dữ liệu.
              </div>
              <p><span className="opacity-60">Chỉ số:</span> <b>{widget.metric}</b></p>
              <p className="opacity-60">Đổi tiêu đề / dạng biểu đồ / kích thước ở tab Hiển thị. Để tự chọn trường dữ liệu, hãy thêm biểu đồ mới ở thanh công cụ.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="form-control">
                <span className="label-text text-xs">Nguồn dữ liệu</span>
                <select className={selectCls} value={widget.dataset || ''} onChange={(e) => set({ dataset: e.target.value, dimension: '', metric: '', filters: [] })}>
                  <option value="">— Chọn —</option>
                  {dsKeys.map((k) => <option key={k} value={k}>{catalog[k].label}</option>)}
                </select>
              </label>
              <label className="form-control">
                <span className="label-text text-xs">Nhóm theo (dimension)</span>
                <select className={selectCls} value={widget.dimension || ''} onChange={(e) => set({ dimension: e.target.value })}>
                  <option value="">— Chọn —</option>
                  {dims.map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="form-control">
                  <span className="label-text text-xs">Chỉ số (metric)</span>
                  <select className={selectCls} value={widget.metric || ''} onChange={(e) => {
                    const m = ds && ds.metrics[e.target.value];
                    set({ metric: e.target.value, agg: m && m.aggs.includes(widget.agg) ? widget.agg : (m ? m.aggs[0] : 'count') });
                  }}>
                    <option value="">— Chọn —</option>
                    {mets.map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                  </select>
                </label>
                <label className="form-control">
                  <span className="label-text text-xs">Phép gộp</span>
                  <select className={selectCls} value={widget.agg || 'count'} onChange={(e) => set({ agg: e.target.value })}>
                    {aggs.map((a) => <option key={a} value={a}>{(AGGS.find((x) => x.value === a) || {}).label || a}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="form-control">
                  <span className="label-text text-xs">Sắp xếp</span>
                  <select className={selectCls} value={widget.sort || 'value_desc'} onChange={(e) => set({ sort: e.target.value })}>
                    <option value="value_desc">Giá trị giảm</option>
                    <option value="value_asc">Giá trị tăng</option>
                    <option value="dim_asc">Nhóm A→Z</option>
                    <option value="dim_desc">Nhóm Z→A</option>
                  </select>
                </label>
                <label className="form-control">
                  <span className="label-text text-xs">Giới hạn dòng</span>
                  <input type="number" min="1" max="200" className={inputCls} value={widget.limit || 20} onChange={(e) => set({ limit: Number(e.target.value) })} />
                </label>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Bộ lọc</span>
                  <button className="btn btn-ghost btn-xs" onClick={() => set({ filters: [...(widget.filters || []), { key: dims[0] ? dims[0][0] : '', op: '=', value: '' }] })}>+ Thêm</button>
                </div>
                {(widget.filters || []).map((f, i) => (
                  <div key={i} className="flex gap-1 mt-1">
                    <select className="select select-bordered select-xs flex-1" value={f.key} onChange={(e) => set({ filters: widget.filters.map((x, idx) => (idx === i ? { ...x, key: e.target.value } : x)) })}>
                      {dims.map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
                    </select>
                    <select className="select select-bordered select-xs w-16" value={f.op} onChange={(e) => set({ filters: widget.filters.map((x, idx) => (idx === i ? { ...x, op: e.target.value } : x)) })}>
                      {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <input className="input input-bordered input-xs flex-1" value={f.value} onChange={(e) => set({ filters: widget.filters.map((x, idx) => (idx === i ? { ...x, value: e.target.value } : x)) })} placeholder="Giá trị" />
                    <button className="btn btn-ghost btn-xs" onClick={() => set({ filters: widget.filters.filter((_, idx) => idx !== i) })}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )
        )}

        {subTab === 'style' && (
          <div className="space-y-2">
            <label className="form-control">
              <span className="label-text text-xs">Tiêu đề</span>
              <input className={inputCls} value={widget.title || ''} onChange={(e) => set({ title: e.target.value })} />
            </label>
            <label className="form-control">
              <span className="label-text text-xs">Dạng biểu đồ</span>
              <select className={selectCls} value={widget.chart || 'bar'} onChange={(e) => set({ chart: e.target.value })}>
                {CHARTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
            <label className="form-control">
              <span className="label-text text-xs">Kích thước</span>
              <select className={selectCls} value={widget.size || 'md'} onChange={(e) => set({ size: e.target.value })}>
                {SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
          </div>
        )}
      </div>

      <div className="report-panel-foot">
        {widget.dataset && onExport && (
          <button className="btn btn-outline btn-sm" onClick={onExport}>Xuất CSV</button>
        )}
        <button className="btn btn-error btn-outline btn-sm" onClick={onDelete}>Xóa phần tử</button>
      </div>
    </div>
  );
};

export default ReportPropertiesPanel;
