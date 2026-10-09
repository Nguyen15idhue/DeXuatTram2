import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { reportService } from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import ErrorMessage from '../../components/ErrorMessage';
import Toast from '../../components/Toast';
import ReportWidget from '../../components/admin/ReportWidget';

const EMPTY_FILTERS = {
  date_from: '', date_to: '', region: '', department: '',
  source: '', stage: '', assigned_user_id: '', province: '',
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
                  <ReportWidget key={w.metric} widget={w} data={datasets[w.metric]} />
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
