import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { builderService, reportService } from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import ErrorMessage from '../../components/ErrorMessage';
import Toast from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import ReportWidget from '../../components/admin/ReportWidget';
import DragDropList from '../../components/admin/DragDropList';

const CHARTS = [
  { value: 'bar', label: 'Cột' },
  { value: 'pie', label: 'Tròn' },
  { value: 'table', label: 'Bảng' },
  { value: 'kpi', label: 'Số lớn' },
  { value: 'line', label: 'Đường' },
  { value: 'funnel', label: 'Phễu' },
];

const SIZES = [
  { value: 'sm', label: 'Nhỏ' },
  { value: 'md', label: 'Vừa' },
  { value: 'lg', label: 'Lớn' },
  { value: 'full', label: 'Full' },
];

const AGGS = [
  { value: 'count', label: 'Đếm' },
  { value: 'count_distinct', label: 'Đếm khác nhau' },
  { value: 'sum', label: 'Tổng' },
  { value: 'avg', label: 'Trung bình' },
  { value: 'min', label: 'Nhỏ nhất' },
  { value: 'max', label: 'Lớn nhất' },
];

const OPS = ['=', '!=', '>', '>=', '<', '<=', 'LIKE'];

const DEFAULT_LEAD_SECTIONS = [
  { key: 'header', title: 'Thông tin chung' },
  { key: 'durations', title: 'Thời gian chuyển giai đoạn' },
  { key: 'cskh', title: 'Chăm sóc khách hàng' },
  { key: 'tvbh', title: 'Tư vấn bán hàng' },
  { key: 'proposals', title: 'Đề xuất + gương 1Office' },
  { key: 'stations', title: 'Trạm + gương ON' },
  { key: 'timeline', title: 'Dòng thời gian' },
  { key: 'sync', title: 'Đồng bộ 1Office' },
];

const emptyEditor = () => ({
  dataset: '', dimension: '', metric: '', agg: 'count',
  chart: 'bar', size: 'md', title: '', filters: [], sort: 'value_desc', limit: 20,
});

const ReportBuilderPage = () => {
  const { token, isSuperAdmin } = useAuth();
  const [catalog, setCatalog] = useState({});
  const [dashboards, setDashboards] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [dashName, setDashName] = useState('');
  const [widgets, setWidgets] = useState([]);
  const [editor, setEditor] = useState(emptyEditor());
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null, name: '' });
  const [leadSections, setLeadSections] = useState(DEFAULT_LEAD_SECTIONS.map((s, i) => ({ ...s, visible: true, order: i + 1 })));
  const [leadCustomized, setLeadCustomized] = useState(false);
  const [savingLead, setSavingLead] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [c, d, l] = await Promise.all([
        builderService.getDatasets(token),
        builderService.listDashboards(token),
        reportService.getLead360Config(token),
      ]);
      if (c.success) setCatalog(c.data || {});
      if (d.success) setDashboards(d.data || []);
      if (l.success && l.data.layout && Array.isArray(l.data.layout.sections) && l.data.layout.sections.length > 0) {
        setLeadSections(l.data.layout.sections);
        setLeadCustomized(true);
      }
    } catch {
      setError('Lỗi tải dữ liệu builder');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const dsKeys = Object.keys(catalog);
  const ds = editor.dataset ? catalog[editor.dataset] : null;
  const dims = ds ? Object.entries(ds.dimensions) : [];
  const mets = ds ? Object.entries(ds.metrics) : [];
  const aggOptions = editor.metric && ds && ds.metrics[editor.metric] ? ds.metrics[editor.metric].aggs : ['count'];

  const setE = (patch) => setEditor((prev) => ({ ...prev, ...patch }));

  const onDropField = (e, kind) => {
    e.preventDefault();
    try {
      const payload = JSON.parse(e.dataTransfer.getData('application/x-report-field'));
      if (!payload || !payload.key) return;
      if (payload.kind === 'dim' && kind === 'dim') setE({ dimension: payload.key });
      if (payload.kind === 'metric' && kind === 'metric') {
        const m = ds && ds.metrics[payload.key];
        setE({ metric: payload.key, agg: m && m.aggs.includes(editor.agg) ? editor.agg : (m ? m.aggs[0] : 'count') });
      }
    } catch { /* ignore */ }
  };

  const fieldChip = (kind, key, label) => (
    <span
      key={key}
      draggable
      onDragStart={(e) => e.dataTransfer.setData('application/x-report-field', JSON.stringify({ kind, key }))}
      onClick={() => {
        if (kind === 'dim') setE({ dimension: key });
        else {
          const m = ds && ds.metrics[key];
          setE({ metric: key, agg: m && m.aggs.includes(editor.agg) ? editor.agg : (m ? m.aggs[0] : 'count') });
        }
      }}
      title="Kéo vào ô hoặc bấm để chọn"
      className="badge badge-outline badge-sm cursor-grab m-0.5 p-2"
    >
      {label}
    </span>
  );

  const addFilter = () => {
    if (!ds || dims.length === 0) return;
    setE({ filters: [...editor.filters, { key: dims[0][0], op: '=', value: '' }] });
  };

  const setFilter = (i, patch) => {
    const next = editor.filters.map((f, idx) => (idx === i ? { ...f, ...patch } : f));
    setE({ filters: next });
  };

  const removeFilter = (i) => setE({ filters: editor.filters.filter((_, idx) => idx !== i) });

  const doPreview = async () => {
    if (!editor.dataset || !editor.dimension || !editor.metric) {
      setToast({ message: 'Chọn dataset, dimension và metric trước', type: 'error' });
      return;
    }
    try {
      setPreviewLoading(true);
      const res = await builderService.previewWidget(editor, token);
      if (res.success) setPreview(res.data);
      else setToast({ message: res.message || 'Xem trước thất bại', type: 'error' });
    } catch {
      setToast({ message: 'Lỗi xem trước widget', type: 'error' });
    } finally {
      setPreviewLoading(false);
    }
  };

  const defaultWidgetTitle = (ed) => {
    const d = ed.dataset ? catalog[ed.dataset] : null;
    const dimLabel = d && d.dimensions[ed.dimension] ? d.dimensions[ed.dimension].label : ed.dimension;
    const metLabel = d && d.metrics[ed.metric] ? d.metrics[ed.metric].label : ed.metric;
    return `${metLabel} theo ${dimLabel}`;
  };

  const addToDashboard = () => {
    if (!editor.dataset || !editor.dimension || !editor.metric) {
      setToast({ message: 'Chọn dataset, dimension và metric trước', type: 'error' });
      return;
    }
    const ed = editor.title ? editor : { ...editor, title: defaultWidgetTitle(editor) };
    setWidgets((prev) => [...prev, { ...ed, tmpId: `w${Date.now()}${prev.length}` }]);
    setEditor(emptyEditor());
    setPreview(null);
  };

  const loadDashboard = async (id) => {
    try {
      const res = await builderService.getDashboard(id, token);
      if (res.success) {
        setCurrentId(res.data.id);
        setDashName(res.data.name);
        setWidgets((res.data.widgets || []).map((w, i) => ({ ...w, tmpId: `w${res.data.id}_${i}` })));
      } else {
        setToast({ message: res.message || 'Không tải được dashboard', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi tải dashboard', type: 'error' });
    }
  };

  const saveDashboard = async () => {
    if (!isSuperAdmin) {
      setToast({ message: 'Chỉ SUPER_ADMIN được lưu dashboard', type: 'error' });
      return;
    }
    if (!dashName.trim()) {
      setToast({ message: 'Nhập tên dashboard', type: 'error' });
      return;
    }
    if (widgets.length === 0) {
      setToast({ message: 'Dashboard cần ít nhất 1 widget', type: 'error' });
      return;
    }
    try {
      setSaving(true);
      const body = { name: dashName.trim(), widgets: widgets.map(({ tmpId, ...w }) => w) };
      const res = currentId
        ? await builderService.updateDashboard(currentId, body, token)
        : await builderService.createDashboard(body, token);
      if (res.success) {
        setToast({ message: 'Lưu dashboard thành công', type: 'success' });
        setCurrentId(res.data.id);
        const d = await builderService.listDashboards(token);
        if (d.success) setDashboards(d.data || []);
      } else {
        setToast({ message: res.message || 'Lưu thất bại', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi lưu dashboard', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const newDashboard = () => {
    setCurrentId(null);
    setDashName('');
    setWidgets([]);
    setEditor(emptyEditor());
    setPreview(null);
  };

  const moveLeadSection = (i, dir) => {
    setLeadSections((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      const [x] = next.splice(i, 1);
      next.splice(j, 0, x);
      return next.map((s, idx) => ({ ...s, order: idx + 1 }));
    });
  };

  const toggleLeadSection = (i) => {
    setLeadSections((prev) => prev.map((s, idx) => (idx === i ? { ...s, visible: !s.visible } : s)));
  };

  const saveLeadSections = async () => {
    if (!isSuperAdmin) {
      setToast({ message: 'Chỉ SUPER_ADMIN được lưu cấu hình', type: 'error' });
      return;
    }
    try {
      setSavingLead(true);
      const res = await reportService.updateLead360Config(leadSections, token);
      if (res.success) {
        setToast({ message: 'Lưu hiển thị Lead 360 thành công', type: 'success' });
        setLeadCustomized(true);
      } else {
        setToast({ message: res.message || 'Lưu thất bại', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi lưu cấu hình', type: 'error' });
    } finally {
      setSavingLead(false);
    }
  };

  const inputCls = 'input input-bordered input-sm w-full';
  const selectCls = 'select select-bordered select-sm w-full';

  return (
    <div>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
      <PageHeader title="Dựng báo cáo" subtitle="Kéo trường vào chart, cấu hình và lưu dashboard" />

      {loading && <Loading message="Đang tải builder..." />}
      {!loading && error && <ErrorMessage message={error} onRetry={loadAll} />}

      {!loading && !error && (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-4 space-y-4">
            <div className="card bg-base-100 shadow p-4">
              <h3 className="font-semibold mb-2">1. Dataset</h3>
              <select className={selectCls} value={editor.dataset} onChange={(e) => setE({ dataset: e.target.value, dimension: '', metric: '', filters: [] })}>
                <option value="">— Chọn dataset —</option>
                {dsKeys.map((k) => <option key={k} value={k}>{catalog[k].label}</option>)}
              </select>
              {ds && (
                <div className="mt-3">
                  <p className="text-xs font-medium mb-1">Dimension (nhóm theo) — kéo/bấm:</p>
                  <div>{dims.map(([k, d]) => fieldChip('dim', k, d.label))}</div>
                  <p className="text-xs font-medium mt-2 mb-1">Metric (đo) — kéo/bấm:</p>
                  <div>{mets.map(([k, m]) => fieldChip('metric', k, m.label))}</div>
                </div>
              )}
            </div>

            <div className="card bg-base-100 shadow p-4">
              <h3 className="font-semibold mb-2">2. Widget</h3>
              <div className="space-y-2">
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDropField(e, 'dim')}
                  className="border border-dashed border-base-300 rounded p-2 min-h-10 text-sm"
                >
                  <span className="text-xs opacity-60">Dimension: </span>
                  <b>{editor.dimension ? (ds && ds.dimensions[editor.dimension] ? ds.dimensions[editor.dimension].label : editor.dimension) : '(thả/bấm trường)'}</b>
                </div>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDropField(e, 'metric')}
                  className="border border-dashed border-base-300 rounded p-2 min-h-10 text-sm"
                >
                  <span className="text-xs opacity-60">Metric: </span>
                  <b>{editor.metric ? (ds && ds.metrics[editor.metric] ? ds.metrics[editor.metric].label : editor.metric) : '(thả/bấm trường)'}</b>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="form-control">
                    <span className="label-text text-xs">Phép gộp</span>
                    <select className={selectCls} value={editor.agg} onChange={(e) => setE({ agg: e.target.value })}>
                      {aggOptions.map((a) => <option key={a} value={a}>{(AGGS.find((x) => x.value === a) || {}).label || a}</option>)}
                    </select>
                  </label>
                  <label className="form-control">
                    <span className="label-text text-xs">Chart</span>
                    <select className={selectCls} value={editor.chart} onChange={(e) => setE({ chart: e.target.value })}>
                      {CHARTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </label>
                </div>
                <label className="form-control">
                  <span className="label-text text-xs">Tiêu đề</span>
                  <input className={inputCls} value={editor.title} onChange={(e) => setE({ title: e.target.value })} placeholder="Để trống = tự đặt" />
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <label className="form-control">
                    <span className="label-text text-xs">Sắp xếp</span>
                    <select className={selectCls} value={editor.sort} onChange={(e) => setE({ sort: e.target.value })}>
                      <option value="value_desc">Giá trị giảm</option>
                      <option value="value_asc">Giá trị tăng</option>
                      <option value="dim_asc">Nhóm A→Z</option>
                      <option value="dim_desc">Nhóm Z→A</option>
                    </select>
                  </label>
                  <label className="form-control">
                    <span className="label-text text-xs">Giới hạn</span>
                    <input type="number" min="1" max="200" className={inputCls} value={editor.limit} onChange={(e) => setE({ limit: e.target.value })} />
                  </label>
                  <label className="form-control">
                    <span className="label-text text-xs">Kích thước</span>
                    <select className={selectCls} value={editor.size} onChange={(e) => setE({ size: e.target.value })}>
                      {SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </label>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">Filter</span>
                    <button className="btn btn-ghost btn-xs" onClick={addFilter}>+ Thêm</button>
                  </div>
                  {editor.filters.map((f, i) => (
                    <div key={i} className="flex gap-1 mt-1">
                      <select className="select select-bordered select-xs flex-1" value={f.key} onChange={(e) => setFilter(i, { key: e.target.value })}>
                        {dims.map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
                      </select>
                      <select className="select select-bordered select-xs w-20" value={f.op} onChange={(e) => setFilter(i, { op: e.target.value })}>
                        {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                      <input className="input input-bordered input-xs flex-1" value={f.value} onChange={(e) => setFilter(i, { value: e.target.value })} placeholder="Giá trị" />
                      <button className="btn btn-ghost btn-xs" onClick={() => removeFilter(i)}>✕</button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-outline btn-sm flex-1" onClick={doPreview} disabled={previewLoading}>
                    {previewLoading ? 'Đang xem...' : 'Xem trước'}
                  </button>
                  <button className="btn btn-primary btn-sm flex-1" onClick={addToDashboard}>+ Thêm vào dashboard</button>
                </div>
              </div>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-8 space-y-4">
            {preview && (
              <ReportWidget widget={{ ...preview.widget, size: 'full' }} data={{ rows: preview.rows }} />
            )}

            <div className="card bg-base-100 shadow p-4">
              <h3 className="font-semibold mb-2">3. Dashboard ({widgets.length} widget)</h3>
              <div className="flex gap-2 mb-2">
                <input className={inputCls} value={dashName} onChange={(e) => setDashName(e.target.value)} placeholder="Tên dashboard" />
                <button className="btn btn-ghost btn-sm" onClick={newDashboard}>Mới</button>
                <button className="btn btn-primary btn-sm" onClick={saveDashboard} disabled={saving || !isSuperAdmin} title={isSuperAdmin ? '' : 'Chỉ SUPER_ADMIN được lưu'}>
                  {saving ? 'Đang lưu...' : currentId ? 'Lưu' : 'Tạo mới'}
                </button>
              </div>
              {widgets.length === 0 ? (
                <p className="text-sm opacity-60">Chưa có widget. Thêm widget ở panel trái.</p>
              ) : (
                <DragDropList
                  items={widgets.map((w) => ({ id: w.tmpId, label: `${w.title || `${w.metric} theo ${w.dimension}`} (${w.chart})` }))}
                  onReorder={(items) => {
                    const order = new Map(items.map((it, i) => [it.id, i]));
                    setWidgets((prev) => [...prev].sort((a, b) => order.get(a.tmpId) - order.get(b.tmpId)));
                  }}
                  onRemove={(item) => setWidgets((prev) => prev.filter((w) => w.tmpId !== item.id))}
                  renderItem={(item) => {
                    const w = widgets.find((x) => x.tmpId === item.id);
                    return <span className="text-sm">{w ? `${w.title || `${w.metric} theo ${w.dimension}`} (${w.chart})` : item.label}</span>;
                  }}
                />
              )}
              {widgets.length > 0 && (
                <div className="grid grid-cols-12 gap-4 mt-3">
                  {widgets.map((w) => (
                    <div key={w.tmpId} className="col-span-12 opacity-70">
                      <p className="text-xs mb-1">{w.title || `${w.metric} theo ${w.dimension}`} (xem trước cần chạy lại)</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card bg-base-100 shadow p-4">
              <h3 className="font-semibold mb-2">Dashboard đã lưu ({dashboards.length})</h3>
              {dashboards.length === 0 ? (
                <p className="text-sm opacity-60">Chưa có dashboard nào.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table table-xs w-full">
                    <thead><tr><th>Tên</th><th className="text-right">Cập nhật</th><th></th></tr></thead>
                    <tbody>
                      {dashboards.map((d) => (
                        <tr key={d.id} className={d.id === currentId ? 'bg-base-200' : ''}>
                          <td>{d.name}</td>
                          <td className="text-right">{d.updated_at ? new Date(d.updated_at).toLocaleString('vi-VN', { hour12: false }) : ''}</td>
                          <td className="text-right whitespace-nowrap">
                            <button className="btn btn-ghost btn-xs" onClick={() => loadDashboard(d.id)}>Mở</button>
                            {isSuperAdmin && (
                              <button className="btn btn-ghost btn-xs text-error" onClick={() => setConfirmDelete({ isOpen: true, id: d.id, name: d.name })}>Xóa</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card bg-base-100 shadow p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">4. Hiển thị Lead 360 {leadCustomized ? <span className="badge badge-xs badge-info ml-1">đã tùy chỉnh</span> : null}</h3>
                <button className="btn btn-primary btn-sm" onClick={saveLeadSections} disabled={savingLead || !isSuperAdmin} title={isSuperAdmin ? '' : 'Chỉ SUPER_ADMIN được lưu'}>
                  {savingLead ? 'Đang lưu...' : 'Lưu hiển thị'}
                </button>
              </div>
              {leadSections.map((s, i) => (
                <div key={s.key} className="flex items-center gap-2 py-1 border-b border-base-200 last:border-0">
                  <input type="checkbox" className="checkbox checkbox-xs" checked={!!s.visible} onChange={() => toggleLeadSection(i)} />
                  <span className="text-sm flex-1">{s.title || s.key}</span>
                  <button className="btn btn-ghost btn-xs" disabled={i === 0} onClick={() => moveLeadSection(i, -1)}>▲</button>
                  <button className="btn btn-ghost btn-xs" disabled={i === leadSections.length - 1} onClick={() => moveLeadSection(i, 1)}>▼</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Xóa dashboard?"
        message={`Xóa dashboard "${confirmDelete.name}"?`}
        onConfirm={async () => {
          try {
            const res = await builderService.deleteDashboard(confirmDelete.id, token);
            if (res.success) {
              setToast({ message: 'Đã xóa dashboard', type: 'success' });
              if (currentId === confirmDelete.id) newDashboard();
              const d = await builderService.listDashboards(token);
              if (d.success) setDashboards(d.data || []);
            } else {
              setToast({ message: res.message || 'Xóa thất bại', type: 'error' });
            }
          } catch {
            setToast({ message: 'Lỗi xóa dashboard', type: 'error' });
          } finally {
            setConfirmDelete({ isOpen: false, id: null, name: '' });
          }
        }}
        onCancel={() => setConfirmDelete({ isOpen: false, id: null, name: '' })}
      />
    </div>
  );
};

export default ReportBuilderPage;
