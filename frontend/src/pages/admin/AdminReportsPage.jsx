import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { reportService, leadService, builderService } from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import ErrorMessage from '../../components/ErrorMessage';
import Toast from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import ReportWidget from '../../components/admin/ReportWidget';
import ReportPropertiesPanel from '../../components/admin/ReportPropertiesPanel';
import LeadJourneyPopup from '../../components/admin/LeadJourneyPopup';
import { Settings, Search, Plus, Save, XCircle, PanelRightOpen, Trash2 } from 'lucide-react';

const EMPTY_FILTERS = {
  date_from: '', date_to: '', region: '', department: '',
  source: '', stage: '', assigned_user_id: '', province: '',
};

const sig = (w) => JSON.stringify({
  dataset: w.dataset, dimension: w.dimension, metric: w.metric, agg: w.agg,
  filters: w.filters || [], sort: w.sort, limit: w.limit,
});

const AdminReportsPage = () => {
  const { token, isSuperAdmin } = useAuth();
  const [tab, setTab] = useState('charts');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [config, setConfig] = useState([]);
  const [datasets, setDatasets] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });

  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState([]);
  const [selected, setSelected] = useState(-1);
  const [panelOpen, setPanelOpen] = useState(false);
  const [catalog, setCatalog] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const [previewMap, setPreviewMap] = useState({});
  const previewPending = useRef(new Set());

  const [leadQuery, setLeadQuery] = useState('');
  const [leadResults, setLeadResults] = useState([]);
  const [leadSearching, setLeadSearching] = useState(false);
  const [journeyLeadId, setJourneyLeadId] = useState(null);

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
      if (res.success) setDatasets(res.data.datasets || {});
      else setError(res.message || 'Lỗi tải báo cáo');
    } catch {
      setError('Lỗi kết nối server');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadCatalog = useCallback(async () => {
    try {
      const res = await builderService.getDatasets(token);
      if (res.success) setCatalog(res.data || {});
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => { loadConfig(); loadData(applied); loadCatalog(); }, [loadConfig, loadData, loadCatalog]);

  const ensurePreviews = useCallback(async (widgets) => {
    const builderWidgets = (widgets || []).filter((w) => w.dataset && w.dataset);
    for (const w of builderWidgets) {
      const key = sig(w);
      if (previewMap[key] || previewPending.current.has(key)) continue;
      if (!w.dataset || !w.dimension || !w.metric) continue;
      previewPending.current.add(key);
      try {
        const res = await builderService.previewWidget(w, token);
        if (res.success) setPreviewMap((prev) => ({ ...prev, [key]: res.data.rows }));
      } catch { /* ignore */ } finally {
        previewPending.current.delete(key);
      }
    }
  }, [token, previewMap]);

  useEffect(() => {
    ensurePreviews(editMode ? draft : config);
  }, [editMode, draft, config, ensurePreviews]);

  const enterEdit = () => {
    if (!isSuperAdmin) {
      setToast({ message: 'Chỉ SUPER_ADMIN được chỉnh sửa báo cáo', type: 'error' });
      return;
    }
    setDraft(config.map((w, i) => ({ ...w, order: i + 1, filters: w.filters ? [...w.filters] : undefined })));
    setSelected(-1);
    setPanelOpen(false);
    setTab('charts');
    setEditMode(true);
  };

  const exitEdit = () => {
    setEditMode(false);
    setSelected(-1);
    setPanelOpen(false);
  };

  const saveEdit = async () => {
    try {
      setSaving(true);
      const res = await reportService.updateConfig(draft.map((w, i) => ({ ...w, order: i + 1 })), token);
      if (res.success) {
        setConfig(draft.map((w, i) => ({ ...w, order: i + 1 })));
        setToast({ message: 'Đã lưu giao diện báo cáo', type: 'success' });
        exitEdit();
      } else {
        setToast({ message: res.message || 'Lưu thất bại', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi lưu cấu hình', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const addWidget = () => {
    const w = { dataset: 'leads', dimension: 'stage', metric: 'id', agg: 'count', chart: 'bar', size: 'md', title: '', filters: [], sort: 'value_desc', limit: 20 };
    setDraft((prev) => {
      const next = [...prev, w];
      setSelected(next.length - 1);
      return next;
    });
    setPanelOpen(true);
  };

  const updateWidget = (patch) => {
    setDraft((prev) => prev.map((w, i) => (i === selected ? { ...w, ...patch } : w)));
  };

  const deleteWidget = (index) => {
    setDraft((prev) => prev.filter((_, i) => i !== index));
    setSelected(-1);
    setPanelOpen(false);
  };

  const selectWidget = (i) => {
    setSelected(i);
    setPanelOpen(true);
  };

  const searchLeads = async () => {
    const q = leadQuery.trim();
    if (!q) { setLeadResults([]); return; }
    try {
      setLeadSearching(true);
      const params = new URLSearchParams({ search: q, limit: '10', page: '1' }).toString();
      const res = await leadService.getAllWithParams(params, token);
      if (res.success) setLeadResults(res.data || []);
      else setToast({ message: res.message || 'Lỗi tìm lead', type: 'error' });
    } catch {
      setToast({ message: 'Lỗi tìm lead', type: 'error' });
    } finally {
      setLeadSearching(false);
    }
  };

  const exportWidgetCsv = async (w) => {
    try {
      const res = await fetch('/api/admin/reports/builder/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ widget: w }),
      });
      if (!res.ok) {
        setToast({ message: 'Xuất CSV thất bại', type: 'error' });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(w.title || w.metric || 'widget').replace(/[^\w\-]+/g, '_')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setToast({ message: 'Lỗi xuất CSV', type: 'error' });
    }
  };

  const widgetData = (w) => {
    if (w.dataset) {
      const rows = previewMap[sig(w)];
      return rows ? { rows } : null;
    }
    return datasets ? datasets[w.metric] : null;
  };

  const inputCls = 'input input-bordered input-sm w-full';
  const filterField = (label, key, type) => (
    <label className="form-control w-full sm:w-auto">
      <span className="label-text text-xs">{label}</span>
      <input type={type || 'text'} className={inputCls} value={filters[key]} onChange={(e) => setF(key, e.target.value)} placeholder={label} />
    </label>
  );
  const setF = (k, v) => setFilters((prev) => ({ ...prev, [k]: v }));

  const activeWidgets = editMode ? draft : config;

  return (
    <div>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
      <PageHeader
        title="Báo cáo"
        subtitle={editMode ? 'Chế độ chỉnh sửa — click chọn phần tử để cấu hình, kéo panel bên phải' : 'Biểu đồ dữ liệu pipeline và hành trình chi tiết từng Lead'}
        actions={(
          editMode ? (
            <div className="flex gap-2">
              <button className="btn btn-outline btn-sm gap-1" onClick={addWidget}><Plus size={14} /> Thêm biểu đồ</button>
              <button className="btn btn-ghost btn-sm gap-1" onClick={() => setConfirmCancel(true)}><XCircle size={14} /> Hủy</button>
              <button className="btn btn-primary btn-sm gap-1" onClick={saveEdit} disabled={saving}><Save size={14} /> {saving ? 'Đang lưu...' : 'Lưu'}</button>
            </div>
          ) : (
            <button className="btn btn-outline btn-sm gap-1" onClick={enterEdit}><Settings size={14} /> Cài đặt</button>
          )
        )}
      />

      {!editMode && (
        <div className="tabs tabs-boxed mb-4 w-fit">
          <button className={`tab ${tab === 'charts' ? 'tab-active' : ''}`} onClick={() => setTab('charts')}>Biểu đồ dữ liệu</button>
          <button className={`tab ${tab === 'journey' ? 'tab-active' : ''}`} onClick={() => setTab('journey')}>Hành trình Lead</button>
        </div>
      )}

      {editMode && (
        <div className="report-edit-layout">
          <div className={`report-canvas ${panelOpen ? 'with-panel' : ''}`}>
            {activeWidgets.length === 0 && (
              <div className="text-sm opacity-60 border border-dashed border-base-300 rounded p-6 text-center">
                Khung vẽ trống. Bấm <b>Thêm biểu đồ</b> để thêm phần tử.
              </div>
            )}
            <div className="grid grid-cols-12 gap-4">
              {activeWidgets.map((w, i) => {
                const data = widgetData(w);
                const isSelected = i === selected;
                const colClass = w.size === 'full' ? 'col-span-12' : w.size === 'lg' ? 'col-span-12 md:col-span-8' : w.size === 'sm' ? 'col-span-12 md:col-span-4' : 'col-span-12 md:col-span-6';
                return (
                  <div
                    key={i}
                    className={`report-widget-wrap ${colClass} ${isSelected ? 'selected' : ''}`}
                    onClick={(e) => { e.stopPropagation(); selectWidget(i); }}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); selectWidget(i); }}
                  >
                    <div className="report-widget-badge">{w.chart}{w.dataset ? '' : ' · hệ thống'}</div>
                    <button
                      type="button"
                      className="report-widget-del"
                      title="Xóa phần tử"
                      onClick={(e) => { e.stopPropagation(); deleteWidget(i); }}
                    >
                      <Trash2 size={13} />
                    </button>
                    <div className="card bg-base-100 shadow p-4 h-full">
                      <h3 className="font-semibold mb-2">{w.title || w.metric || w.dataset}</h3>
                      {data ? <ReportWidget widget={{ ...w, size: 'full' }} data={data} bare /> : <p className="text-sm opacity-50">Đang tải dữ liệu…</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {!panelOpen && (
            <button type="button" className="report-panel-handle" onClick={() => setPanelOpen(true)} title="Mở bảng thuộc tính">
              <PanelRightOpen size={16} />
              <span>Thuộc tính</span>
            </button>
          )}
          <ReportPropertiesPanel
            open={panelOpen}
            widget={selected >= 0 ? draft[selected] : null}
            catalog={catalog}
            onChange={updateWidget}
            onDelete={() => deleteWidget(selected)}
            onClose={() => setPanelOpen(false)}
            onExport={() => exportWidgetCsv(draft[selected])}
          />
        </div>
      )}

      {!editMode && tab === 'charts' && (
        <div>
          <div className="card bg-base-100 shadow p-4 mb-4">
            <div className="flex flex-wrap gap-2 items-end">
              {filterField('Từ ngày', 'date_from', 'date')}
              {filterField('Đến ngày', 'date_to', 'date')}
              {filterField('Vùng miền', 'region')}
              {filterField('Phòng ban', 'department')}
              {filterField('Nguồn', 'source')}
              {filterField('Giai đoạn', 'stage')}
              {filterField('Tỉnh/Thành', 'province')}
              {filterField('Người phụ trách (ID)', 'assigned_user_id', 'number')}
              <button className="btn btn-primary btn-sm" onClick={() => setApplied({ ...filters })}>Áp dụng</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setFilters({ ...EMPTY_FILTERS }); setApplied({ ...EMPTY_FILTERS }); }}>Xóa lọc</button>
            </div>
          </div>

          {loading && <Loading message="Đang tải báo cáo..." />}
          {!loading && error && <ErrorMessage message={error} onRetry={() => loadData(applied)} />}

          {!loading && !error && (
            config.length === 0 ? (
              <EmptyState title="Chưa có widget" description="Bấm Cài đặt để thêm biểu đồ." />
            ) : (
              <div className="grid grid-cols-12 gap-4">
                {config.map((w, i) => {
                  const data = widgetData(w);
                  return (
                    <div key={i} className={w.size === 'full' ? 'col-span-12' : w.size === 'lg' ? 'col-span-12 md:col-span-8' : w.size === 'sm' ? 'col-span-12 md:col-span-4' : 'col-span-12 md:col-span-6'}>
                      <div className="card bg-base-100 shadow p-4 h-full">
                        <h3 className="font-semibold mb-2">{w.title || w.metric}</h3>
                        {data ? <ReportWidget widget={{ ...w, size: 'full' }} data={data} bare /> : <p className="text-sm opacity-50">Đang tải dữ liệu…</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      )}

      {!editMode && tab === 'journey' && (
        <div>
          <div className="card bg-base-100 shadow p-4 mb-4">
            <p className="text-sm font-medium mb-2">Chọn Lead để xem hành trình trực quan (giai đoạn, cây đề xuất/trạm, dòng thời gian)</p>
            <div className="flex gap-2">
              <input
                className={inputCls}
                value={leadQuery}
                onChange={(e) => setLeadQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') searchLeads(); }}
                placeholder="Nhập mã Lead / họ tên / SĐT rồi Enter"
              />
              <button className="btn btn-primary btn-sm gap-1" onClick={searchLeads} disabled={leadSearching}>
                <Search size={14} /> {leadSearching ? 'Đang tìm...' : 'Tìm'}
              </button>
            </div>
            {leadResults.length > 0 && (
              <div className="mt-2 border border-base-300 rounded max-h-56 overflow-y-auto">
                {leadResults.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => { setJourneyLeadId(l.id); setLeadResults([]); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-base-200 flex items-center justify-between gap-2 ${journeyLeadId === l.id ? 'bg-base-200' : ''}`}
                  >
                    <span><b>{l.lead_code}</b> · {l.full_name} · {l.phone || ''}</span>
                    <span className="badge badge-xs badge-ghost">{l.stage || ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {!journeyLeadId && <EmptyState title="Chưa chọn Lead" description="Tìm và chọn một Lead ở trên để xem hành trình trực quan." />}
          {journeyLeadId && (
            <div className="card bg-base-100 shadow p-4">
              <LeadJourneyPopup leadId={journeyLeadId} embedded />
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmCancel}
        title="Hủy chỉnh sửa?"
        message="Bỏ các thay đổi chưa lưu trên khung vẽ?"
        onConfirm={() => { setConfirmCancel(false); exitEdit(); }}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
};

export default AdminReportsPage;
