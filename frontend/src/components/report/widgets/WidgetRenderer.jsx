import { useEffect, useState } from 'react';
import ChartBox from './ChartBox';
import { reportService } from '../../../services/api';

const fmt = (v, format) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v == null ? '' : v);
  if (format === 'comma') return n.toLocaleString('en-US');
  if (format === 'dot') return n.toLocaleString('de-DE');
  return n.toLocaleString('vi-VN');
};

const DetailWidget = ({ token }) => {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    reportService.getLeadDetails({ page: 1, limit: 10 }, token)
      .then((res) => { if (!cancelled) { if (res.success) setRows(res.data.items || []); else setErr(res.message || 'Lỗi tải'); } })
      .catch(() => { if (!cancelled) setErr('Lỗi tải dữ liệu'); });
    return () => { cancelled = true; };
  }, [token]);
  if (err) return <div className="re-placeholder">{err}</div>;
  if (!rows) return <div className="re-placeholder">Đang tải…</div>;
  if (rows.length === 0) return <div className="re-placeholder">Không có dữ liệu</div>;
  return (
    <div className="re-tablewrap">
      <table className="re-table">
        <thead><tr><th>Mã Lead</th><th>Họ tên</th><th>Phụ trách</th><th className="num">ĐX</th><th className="num">Trạm</th><th>Ngày ON</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.lead_code}</td>
              <td>{r.full_name}</td>
              <td>{r.assignee_name || '—'}</td>
              <td className="num">{r.proposals.length}</td>
              <td className="num">{r.stations.length}</td>
              <td>{r.on_at ? new Date(r.on_at).toLocaleDateString('vi-VN') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default function WidgetRenderer({ widget, data, controls = {}, onControlChange, token, options = [] }) {
  if (!widget) return null;

  if (widget.type === 'text') {
    const vc = widget.visualConfig || {};
    return (
      <div className={`re-text align-${vc.align || 'left'}`} style={{ fontSize: `${vc.fontSize || 18}px` }}>
        {vc.text || widget.title}
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
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }

  if (widget.type === 'detail') return <DetailWidget token={token} />;

  const rows = Array.isArray(data) ? data : null;
  if (!rows) return <div className="re-placeholder">Đang tải dữ liệu…</div>;
  if (rows.length === 0) return <div className="re-placeholder">Chưa có dữ liệu</div>;

  const ct = (widget.visualConfig && widget.visualConfig.chartType) || 'bar';
  const vc = widget.visualConfig || {};

  if (ct === 'kpi') {
    const total = rows.reduce((s, r) => s + (Number(r.value) || 0), 0);
    return <div className="re-kpi"><div className="val">{fmt(total, vc.numberFormat)}</div><div className="sub">{widget.title}</div></div>;
  }

  if (ct === 'table') {
    return (
      <div className="re-tablewrap">
        <table className="re-table">
          <thead><tr><th>Nhóm</th><th className="num">Giá trị</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}><td>{r.dim === null || r.dim === '' ? '(Trống)' : r.dim}</td><td className="num">{fmt(r.value, vc.numberFormat)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <ChartBox
      chartType={ct}
      rows={rows}
      showLegend={!!vc.showLegend}
      showLabels={!!vc.showLabels}
      innerRadius={vc.innerRadius || 0}
      numberFormat={vc.numberFormat || 'plain'}
    />
  );
}
