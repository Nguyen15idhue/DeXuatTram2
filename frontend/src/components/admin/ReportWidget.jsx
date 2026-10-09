import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts';

export const PALETTE = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#f97316', '#64748b'];

export const SIZE_CLASS = {
  sm: 'col-span-12 md:col-span-4',
  md: 'col-span-12 md:col-span-6',
  lg: 'col-span-12 md:col-span-8',
  full: 'col-span-12',
};

export const labelOf = (row) => {
  if (row.name !== undefined && row.name !== null && row.name !== '') return row.name;
  const key = Object.keys(row).find((k) => k !== 'total' && k !== 'id');
  const v = key ? row[key] : '';
  return v === null || v === undefined || v === '' ? '(Trống)' : String(v);
};

export const toPairs = (data) => {
  if (!Array.isArray(data)) return [];
  return data.map((r) => ({ name: labelOf(r), value: Number(r.total || 0) }));
};

export const toChartPairs = (preview) => {
  if (!preview || !Array.isArray(preview.rows)) return [];
  return preview.rows.map((r) => ({ name: r.dim === null || r.dim === undefined || r.dim === '' ? '(Trống)' : String(r.dim), value: Number(r.value || 0) }));
};

const KpiCards = ({ data, suffix }) => {
  const entries = Object.entries(data || {}).filter(([, v]) => v !== null && v !== undefined);
  if (entries.length === 0) return <p className="text-sm opacity-60">Chưa có số liệu</p>;
  return (
    <div className="grid grid-cols-2 gap-3">
      {entries.map(([k, v]) => (
        <div key={k} className="stat bg-base-200 rounded-box p-3">
          <div className="stat-title text-xs">{k}</div>
          <div className="stat-value text-2xl">{v}{suffix || ''}</div>
        </div>
      ))}
    </div>
  );
};

const BarWidget = ({ pairs }) => {
  if (pairs.length === 0) return <p className="text-sm opacity-60">Chưa có số liệu</p>;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={pairs} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Bar dataKey="value" fill={PALETTE[0]} />
      </BarChart>
    </ResponsiveContainer>
  );
};

const PieWidget = ({ pairs }) => {
  if (pairs.length === 0) return <p className="text-sm opacity-60">Chưa có số liệu</p>;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={pairs} dataKey="value" nameKey="name" outerRadius={90} label>
          {pairs.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
};

const FunnelWidget = ({ data }) => {
  const order = ['total', 'cskh', 'tvbh', 'has_proposal', 'has_station', 'on_stage'];
  const labels = { total: 'Lead', cskh: 'CSKH', tvbh: 'TVBH', has_proposal: 'Đề xuất', has_station: 'Trạm', on_stage: 'ON' };
  const pairs = order.map((k, i) => ({ name: labels[k], value: Number((data || {})[k] || 0), fill: PALETTE[i % PALETTE.length] }));
  const max = Math.max(1, ...pairs.map((p) => p.value));
  if (pairs.every((p) => p.value === 0)) return <p className="text-sm opacity-60">Chưa có số liệu</p>;
  return (
    <div className="space-y-2">
      {pairs.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-20 text-xs shrink-0">{p.name}</span>
          <div className="flex-1 bg-base-200 rounded h-6 overflow-hidden">
            <div className="h-full rounded text-xs text-white flex items-center px-2" style={{ width: `${Math.max(4, Math.round((p.value / max) * 100))}%`, background: p.fill }}>
              {p.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const LineWidget = ({ data }) => {
  const points = (data && data.points) || [];
  if (points.length === 0) return <p className="text-sm opacity-60">Chưa có số liệu</p>;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={points}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="leads" name="Lead" stroke={PALETTE[0]} dot={false} />
        <Line type="monotone" dataKey="proposals" name="Đề xuất" stroke={PALETTE[1]} dot={false} />
        <Line type="monotone" dataKey="stations" name="Trạm" stroke={PALETTE[2]} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
};

const TableWidget = ({ data }) => {
  if (Array.isArray(data)) {
    if (data.length === 0) return <p className="text-sm opacity-60">Chưa có số liệu</p>;
    return (
      <div className="overflow-x-auto max-h-72 overflow-y-auto">
        <table className="table table-xs w-full">
          <thead><tr><th>Tên</th><th className="text-right">Tổng</th></tr></thead>
          <tbody>
            {toPairs(data).map((r, i) => (
              <tr key={i}><td>{r.name}</td><td className="text-right">{r.value}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const items = (data && data.items) || [];
  const cols = items.length > 0 ? Object.keys(items[0]) : [];
  return (
    <div>
      <div className="badge badge-primary mb-2">Tổng: {Number((data && data.total) || 0)}</div>
      {items.length === 0 ? (
        <p className="text-sm opacity-60">Không có mục nào</p>
      ) : (
        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <table className="table table-xs w-full">
            <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {items.slice(0, 20).map((row, i) => (
                <tr key={i}>{cols.map((c) => <td key={c}>{String(row[c] ?? '')}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const RowsSummary = ({ rows }) => {
  const list = Array.isArray(rows) ? rows : [];
  const sum = list.reduce((s, r) => s + (Number(r.value) || 0), 0);
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="stat bg-base-200 rounded-box p-3">
        <div className="stat-title text-xs">Số dòng</div>
        <div className="stat-value text-2xl">{list.length}</div>
      </div>
      <div className="stat bg-base-200 rounded-box p-3">
        <div className="stat-title text-xs">Tổng giá trị</div>
        <div className="stat-value text-2xl">{sum}</div>
      </div>
    </div>
  );
};

const RowsTable = ({ rows }) => {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return <p className="text-sm opacity-60">Chưa có số liệu</p>;
  return (
    <div className="overflow-x-auto max-h-72 overflow-y-auto">
      <table className="table table-xs w-full">
        <thead><tr><th>Nhóm</th><th className="text-right">Giá trị</th></tr></thead>
        <tbody>
          {list.map((r, i) => (
            <tr key={i}><td>{r.dim === null || r.dim === '' ? '(Trống)' : String(r.dim)}</td><td className="text-right">{r.value}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const renderWidgetBody = (widget, dataset) => {
  const hasRows = dataset && Array.isArray(dataset.rows);
  switch (widget.chart) {
    case 'kpi':
      if (hasRows) return <RowsSummary rows={dataset.rows} />;
      return <KpiCards data={dataset} suffix={widget.metric === 'conversion_rates' ? '%' : ''} />;
    case 'bar':
      return <BarWidget pairs={dataset && dataset.rows ? toChartPairs(dataset) : toPairs(dataset)} />;
    case 'pie':
      return <PieWidget pairs={dataset && dataset.rows ? toChartPairs(dataset) : toPairs(dataset)} />;
    case 'line':
      if (hasRows) return <RowsTable rows={dataset.rows} />;
      return <LineWidget data={dataset} />;
    case 'funnel':
      if (hasRows) return <RowsTable rows={dataset.rows} />;
      return <FunnelWidget data={dataset} />;
    case 'table':
    default:
      if (dataset && dataset.rows) {
        const rows = dataset.rows;
        if (rows.length === 0) return <p className="text-sm opacity-60">Chưa có số liệu</p>;
        return (
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="table table-xs w-full">
              <thead><tr><th>Nhóm</th><th className="text-right">Giá trị</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}><td>{r.dim === null || r.dim === '' ? '(Trống)' : String(r.dim)}</td><td className="text-right">{r.value}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      return <TableWidget data={dataset} />;
  }
};

const ReportWidget = ({ widget, data }) => (
  <div className={`card bg-base-100 shadow p-4 ${SIZE_CLASS[widget.size] || SIZE_CLASS.md}`}>
    <h3 className="font-semibold mb-2">{widget.title || widget.metric || widget.dataset}</h3>
    {renderWidgetBody(widget, data)}
  </div>
);

export default ReportWidget;
