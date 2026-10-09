import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { reportService } from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import ErrorMessage from '../../components/ErrorMessage';
import Toast from '../../components/Toast';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts';

const PALETTE = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#f97316', '#64748b'];

const SIZE_CLASS = {
  sm: 'col-span-12 md:col-span-4',
  md: 'col-span-12 md:col-span-6',
  lg: 'col-span-12 md:col-span-8',
  full: 'col-span-12',
};

const EMPTY_FILTERS = {
  date_from: '', date_to: '', region: '', department: '',
  source: '', stage: '', assigned_user_id: '', province: '',
};

const labelOf = (row) => {
  if (row.name !== undefined && row.name !== null && row.name !== '') return row.name;
  const key = Object.keys(row).find((k) => k !== 'total' && k !== 'id');
  const v = key ? row[key] : '';
  return v === null || v === undefined || v === '' ? '(Trống)' : String(v);
};

const toPairs = (data) => {
  if (!Array.isArray(data)) return [];
  return data.map((r) => ({ name: labelOf(r), value: Number(r.total || 0) }));
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

const BarWidget = ({ data }) => {
  const pairs = toPairs(data);
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

const PieWidget = ({ data }) => {
  const pairs = toPairs(data);
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

const renderWidgetBody = (widget, dataset) => {
  switch (widget.chart) {
    case 'kpi':
      return <KpiCards data={dataset} suffix={widget.metric === 'conversion_rates' ? '%' : ''} />;
    case 'bar':
      return <BarWidget data={dataset} />;
    case 'pie':
      return <PieWidget data={dataset} />;
    case 'line':
      return <LineWidget data={dataset} />;
    case 'funnel':
      return <FunnelWidget data={dataset} />;
    case 'table':
    default:
      return <TableWidget data={dataset} />;
  }
};

const AdminReportsPage = () => {
  const { token } = useAuth();
  const [tab, setTab] = useState('detail');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [config, setConfig] = useState([]);
  const [datasets, setDatasets] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });

  const loadConfig = useCallback(async () => {
    try {
      const res = await reportService.getConfig(token);
      if (res.success) setConfig(res.data.widgets || []);
    } catch {
      setToast({ message: 'Không tải được cấu hình dashboard', type: 'error' });
    }
  }, [token]);

  const loadData = useCallback(async (f) => {
    try {
      setLoading(true);
      setError('');
      const params = {};
      Object.entries(f || {}).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) params[k] = v; });
      const res = await reportService.getPipeline(params, token);
      if (res.success) {
        setDatasets(res.data.datasets || {});
      } else {
        setError(res.message || 'Lỗi tải báo cáo');
      }
    } catch {
      setError('Lỗi kết nối server');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadConfig(); }, [loadConfig]);
  useEffect(() => { loadData(applied); }, [applied, loadData]);

  const setF = (k, v) => setFilters((prev) => ({ ...prev, [k]: v }));

  const inputCls = 'input input-bordered input-sm w-full';
  const filterField = (label, key, type) => (
    <label className="form-control w-full sm:w-auto">
      <span className="label-text text-xs">{label}</span>
      <input type={type || 'text'} className={inputCls} value={filters[key]} onChange={(e) => setF(key, e.target.value)} placeholder={label} />
    </label>
  );

  return (
    <div>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
      <PageHeader title="Báo cáo" subtitle="Tổng hợp pipeline Lead → Đề xuất → Trạm → ON" />
      <div className="tabs tabs-boxed mb-4 w-fit">
        <button className={`tab ${tab === 'overview' ? 'tab-active' : ''}`} onClick={() => setTab('overview')}>Tổng quan</button>
        <button className={`tab ${tab === 'detail' ? 'tab-active' : ''}`} onClick={() => setTab('detail')}>Báo cáo chi tiết</button>
      </div>

      {tab === 'overview' && (
        <EmptyState title="Tab Tổng quan" description="Tab này để trống theo thiết kế. Xem số liệu ở tab Báo cáo chi tiết." />
      )}

      {tab === 'detail' && (
        <div>
          <div className="card bg-base-100 shadow p-4 mb-4">
            <div className="flex flex-wrap gap-2 items-end">
              {filterField('Từ ngày', 'date_from', 'date')}
              {filterField('Đến ngày', 'date_to', 'date')}
              {filterField('Vùng miền', 'region')}
              {filterField('Phòng ban', 'department')}
              {filterField('Nguồn', 'source')}
              {filterField('Stage', 'stage')}
              {filterField('Tỉnh/Thành', 'province')}
              {filterField('Người phụ trách (ID)', 'assigned_user_id', 'number')}
              <button className="btn btn-primary btn-sm" onClick={() => setApplied({ ...filters })}>Áp dụng</button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setFilters({ ...EMPTY_FILTERS }); setApplied({ ...EMPTY_FILTERS }); }}
              >
                Xóa lọc
              </button>
            </div>
          </div>

          {loading && <Loading message="Đang tải báo cáo..." />}
          {!loading && error && <ErrorMessage message={error} onRetry={() => loadData(applied)} />}

          {!loading && !error && datasets && (
            config.length === 0 ? (
              <EmptyState title="Chưa có widget" description="Dashboard chưa được cấu hình. Liên hệ SUPER_ADMIN." />
            ) : (
              <div className="grid grid-cols-12 gap-4">
                {config.map((w) => (
                  <div key={w.metric} className={`card bg-base-100 shadow p-4 ${SIZE_CLASS[w.size] || SIZE_CLASS.md}`}>
                    <h3 className="font-semibold mb-2">{w.title || w.metric}</h3>
                    {renderWidgetBody(w, datasets[w.metric])}
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};

export default AdminReportsPage;
