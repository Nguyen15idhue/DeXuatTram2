import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { AGGS, CHART_TYPES } from '../../utils/reportModel';

const HIDDEN = new Set(['oneoffice_mirror', 'automation_runs']);
const SORTS = [['value_desc', 'Giá trị giảm'], ['value_asc', 'Giá trị tăng'], ['dim_asc', 'Nhóm A→Z'], ['dim_desc', 'Nhóm Z→A']];

const dsVisible = (catalog) => Object.entries(catalog || {}).filter(([k]) => !HIDDEN.has(k));

export default function ReportConfigPanel({ widget, name, page, catalog, onRename, onUpdateData, onUpdateVisual, onUpdateWidget, onRestoreLayout, onDelete, onDuplicate }) {
  const [sub, setSub] = useState('setup');

  useEffect(() => { setSub('setup'); }, [widget && widget.id]);

  if (!widget) {
    return (
      <div className="re-config">
        <details className="re-section" open>
          <summary>Cấu hình trang báo cáo</summary>
          <div className="re-sinner">
            <label className="re-fld"><span>Tên báo cáo</span>
              <input value={name} onChange={(e) => onRename(e.target.value)} />
            </label>
            <div className="re-two">
              <label className="re-fld"><span>Số cột lưới</span><input value={page.columns} disabled /></label>
              <label className="re-fld"><span>Chiều cao hàng</span><input value={`${page.rowHeight} px`} disabled /></label>
            </div>
            <div className="re-hint">Chọn một thành phần trên canvas để cấu hình chi tiết.</div>
          </div>
        </details>
        <details className="re-section" open>
          <summary>Bố cục</summary>
          <div className="re-sinner">
            <button type="button" className="re-btn" onClick={onRestoreLayout}>Khôi phục bố cục mặc định</button>
          </div>
        </details>
      </div>
    );
  }

  const isChart = !['control', 'text', 'detail'].includes(widget.type);
  const ds = widget.dataSourceId && catalog ? catalog[widget.dataSourceId] : null;
  const dims = ds ? Object.entries(ds.dimensions || {}) : [];
  const mets = ds ? Object.entries(ds.metrics || {}) : [];
  const metricDef = widget.dataConfig && mets.find(([k]) => k === widget.dataConfig.metric);
  const aggs = metricDef && metricDef[1].aggs ? metricDef[1].aggs : AGGS.map((a) => a[0]);

  const tabs = (
    <div className="re-minitabs">
      <button type="button" className={`re-minitab ${sub === 'setup' ? 'active' : ''}`} onClick={() => setSub('setup')}>Thiết lập</button>
      {isChart && <button type="button" className={`re-minitab ${sub === 'style' ? 'active' : ''}`} onClick={() => setSub('style')}>Kiểu</button>}
      {isChart && <button type="button" className={`re-minitab ${sub === 'type' ? 'active' : ''}`} onClick={() => setSub('type')}>Loại biểu đồ</button>}
    </div>
  );

  const dc = widget.dataConfig || {};
  const vc = widget.visualConfig || {};
  const ct = vc.chartType || 'bar';
  const pieLike = ct === 'pie' || ct === 'donut';

  let body = null;
  if (sub === 'setup') {
    if (widget.type === 'control') {
      body = (
        <>
          <label className="re-fld"><span>Loại điều khiển</span>
            <select value={widget.controlType} onChange={(e) => onUpdateWidget({ controlType: e.target.value })}>
              <option value="dateRange">Ngày (khoảng)</option>
              <option value="select">Danh mục (chọn 1)</option>
            </select>
          </label>
          {widget.controlType === 'select' && (
            <label className="re-fld"><span>Trường lọc (field)</span>
              <input value={widget.field || ''} onChange={(e) => onUpdateWidget({ field: e.target.value })} />
            </label>
          )}
          <div className="re-hint">Bộ lọc cấp dashboard — áp cho mọi biểu đồ cùng nguồn dữ liệu.</div>
        </>
      );
    } else if (widget.type === 'text') {
      body = <div className="re-hint">Thành phần văn bản: sửa nội dung ở tab Kiểu (bên cạnh) nếu có, hoặc chỉnh tiêu đề.</div>;
    } else if (widget.type === 'detail') {
      body = <div className="re-hint">Bảng chi tiết Lead → ON dùng endpoint <code>/lead-details</code> + bộ lọc chung.</div>;
    } else {
      body = (
        <>
          <label className="re-fld"><span>Nguồn dữ liệu</span>
            <select value={widget.dataSourceId || ''} onChange={(e) => onUpdateWidget({ dataSourceId: e.target.value })}>
              <option value="">— Chọn —</option>
              {dsVisible(catalog).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
            </select>
          </label>
          <label className="re-fld"><span>Phương diện (dimension)</span>
            <select value={dc.dimension || ''} onChange={(e) => onUpdateData({ dimension: e.target.value })}>
              {dims.map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
            </select>
          </label>
          <div className="re-two">
            <label className="re-fld"><span>Chỉ số</span>
              <select value={dc.metric || ''} onChange={(e) => {
                const m = mets.find(([k]) => k === e.target.value);
                const okAgg = m && m[1].aggs && m[1].aggs.includes(dc.agg) ? dc.agg : (m && m[1].aggs ? m[1].aggs[0] : 'count');
                onUpdateData({ metric: e.target.value, agg: okAgg });
              }}>
                {mets.map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
              </select>
            </label>
            <label className="re-fld"><span>Phép gộp</span>
              <select value={dc.agg || 'count'} onChange={(e) => onUpdateData({ agg: e.target.value })}>
                {aggs.map((a) => <option key={a} value={a}>{(AGGS.find((x) => x[0] === a) || [a, a])[1]}</option>)}
              </select>
            </label>
          </div>
          <div className="re-two">
            <label className="re-fld"><span>Sắp xếp</span>
              <select value={dc.sort || 'value_desc'} onChange={(e) => onUpdateData({ sort: e.target.value })}>
                {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <label className="re-fld"><span>Giới hạn (số hàng)</span>
              <input type="number" min="1" max="200" value={dc.limit || 20} onChange={(e) => onUpdateData({ limit: Number(e.target.value) })} />
            </label>
          </div>
          <div className="re-filters">
            <div className="re-filters-head">
              <span>Bộ lọc (widget)</span>
              <button type="button" className="re-btn xs" onClick={() => onUpdateData({ filters: [...(dc.filters || []), { key: dims[0] ? dims[0][0] : '', op: '=', value: '' }] })}>
                <Plus size={12} /> Thêm
              </button>
            </div>
            {(dc.filters || []).map((fl, i) => (
              <div className="re-filter-row" key={i}>
                <select value={fl.key} onChange={(e) => onUpdateData({ filters: dc.filters.map((x, idx) => idx === i ? { ...x, key: e.target.value } : x) })}>
                  {dims.map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
                </select>
                <select value={fl.op} onChange={(e) => onUpdateData({ filters: dc.filters.map((x, idx) => idx === i ? { ...x, op: e.target.value } : x) })}>
                  {['=', '!=', '>', '>=', '<', '<=', 'LIKE'].map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <input value={fl.value} onChange={(e) => onUpdateData({ filters: dc.filters.map((x, idx) => idx === i ? { ...x, value: e.target.value } : x) })} />
                <button type="button" className="re-btn xs danger" onClick={() => onUpdateData({ filters: dc.filters.filter((_, idx) => idx !== i) })}><X size={12} /></button>
              </div>
            ))}
          </div>
        </>
      );
    }
  } else if (sub === 'style') {
    body = (
      <>
        <label className="re-fld"><span>Tên biểu đồ</span>
          <input value={widget.title || ''} onChange={(e) => onUpdateWidget({ title: e.target.value })} />
        </label>
        {widget.type === 'text' && (
          <label className="re-fld"><span>Nội dung</span>
            <textarea rows={2} value={(vc.text) || ''} onChange={(e) => onUpdateVisual({ text: e.target.value })} />
          </label>
        )}
        {pieLike && (
          <>
            <label className="re-fld"><span>Bán kính trong</span>
              <input type="range" min="0" max="80" value={vc.innerRadius || (ct === 'donut' ? 40 : 0)} onChange={(e) => onUpdateVisual({ innerRadius: Number(e.target.value) })} />
            </label>
            <label className="re-check"><input type="checkbox" checked={!!vc.groupOthers} onChange={(e) => onUpdateVisual({ groupOthers: e.target.checked })} /> Nhóm phần còn lại thành "Khác"</label>
          </>
        )}
        <label className="re-check"><input type="checkbox" checked={!!vc.showLegend} onChange={(e) => onUpdateVisual({ showLegend: e.target.checked })} /> Hiển thị chú giải</label>
        {!pieLike && widget.type !== 'table' && (
          <label className="re-check"><input type="checkbox" checked={!!vc.showLabels} onChange={(e) => onUpdateVisual({ showLabels: e.target.checked })} /> Hiện nhãn dữ liệu</label>
        )}
        <label className="re-fld"><span>Định dạng số</span>
          <select value={vc.numberFormat || 'plain'} onChange={(e) => onUpdateVisual({ numberFormat: e.target.value })}>
            <option value="plain">1000</option>
            <option value="comma">1,000</option>
            <option value="dot">1.000</option>
          </select>
        </label>
      </>
    );
  } else {
    body = (
      <>
        <div className="re-typegrid">
          {CHART_TYPES.map(([k, l]) => (
            <button key={k} type="button" className={ct === k ? 'active' : ''} onClick={() => onUpdateVisual({ chartType: k })}>{l}</button>
          ))}
        </div>
        <div className="re-hint">Chọn loại biểu đồ; tuỳ chọn ở tab Kiểu tự thích ứng theo loại.</div>
      </>
    );
  }

  return (
    <div className="re-config">
      {tabs}
      <div className="re-config-body">{body}</div>
      <div className="re-config-foot">
        <button type="button" className="re-btn" onClick={onDuplicate}>Nhân bản</button>
        <button type="button" className="re-btn danger" onClick={onDelete}>Xóa phần tử</button>
      </div>
    </div>
  );
}
