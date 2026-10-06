import { useState, useEffect, useCallback } from 'react';
import { Save, Play, RefreshCw, Eye, Plus, Download, X, ChevronRight, Pencil, Trash2, ArrowUp, ArrowDown, Sparkles } from 'lucide-react';
import { automationService } from '../../services/api';
import Toast from '../Toast';
import ConfirmDialog from '../ConfirmDialog';
import DataTable from '../ui/DataTable';
import Pagination from '../ui/Pagination';
import Dialog from '../ui/Dialog';

const STATUS_BADGE = { pending: 'badge-warning', running: 'badge-info', success: 'badge-success', failed: 'badge-error', skipped: 'badge-ghost' };
const STATUS_LABEL = { pending: 'Đang chờ', running: 'Đang chạy', success: 'Thành công', failed: 'Thất bại', skipped: 'Bỏ qua' };
const HIDDEN_NODE_TYPES = new Set(['start', 'manualstart', 'taskstart', 'eventstart', 'taskwait', 'taskcompleted', 'decision', 'notify']);

const colName = (i) => {
  let s = '';
  let n = i;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
};

const SyncSheetPanel = ({ token, automation, view, onViewChange }) => {
  const [detail, setDetail] = useState(automation);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ enabled: false, spreadsheet_id: '', frequency_min: 15, note: '' });
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [versions, setVersions] = useState([]);
  const [version, setVersion] = useState('');
  const [tree, setTree] = useState(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [searchField, setSearchField] = useState('');
  const [searchCol, setSearchCol] = useState('');
  const [mappings, setMappings] = useState([]);
  const [sheetHeaders, setSheetHeaders] = useState([]);
  const [sheetTab, setSheetTab] = useState('');
  const [dragPath, setDragPath] = useState(null);
  const [dropCol, setDropCol] = useState(null);
  const [newColName, setNewColName] = useState('');
  const [showAddCol, setShowAddCol] = useState(false);
  const [runs, setRuns] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });
  const [statusFilter, setStatusFilter] = useState('');
  const [runsLoading, setRunsLoading] = useState(false);
  const [viewRun, setViewRun] = useState(null);
  const [dryPreview, setDryPreview] = useState(null);
  const [dryRunning, setDryRunning] = useState(false);
  const [confirmSync, setConfirmSync] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [autoMatching, setAutoMatching] = useState(false);
  const [editingLabel, setEditingLabel] = useState(null);
  const [confirmDeleteCol, setConfirmDeleteCol] = useState(null);
  const [confirmClearVersion, setConfirmClearVersion] = useState(false);
  const [dragCol, setDragCol] = useState(null);

  const showToast = (message, type = 'success') => setToast({ message, type });

  const loadDetail = useCallback(async () => {
    try {
      const res = await automationService.getByKey('sync_process_report', token);
      if (res.success) {
        setDetail(res.data);
        setForm({ enabled: !!res.data.enabled, spreadsheet_id: res.data.spreadsheet_id || '', frequency_min: res.data.frequency_min ?? 15, note: res.data.note || '' });
      }
    } catch {
      showToast('Lỗi tải cấu hình sync', 'error');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadVersions = useCallback(async () => {
    try {
      const res = await automationService.syncVersions(token);
      if (res.success) {
        setVersions(res.data);
        if (!version && res.data.length > 0) setVersion(res.data[res.data.length - 1].version);
      }
    } catch {
      showToast('Lỗi tải danh sách version', 'error');
    }
  }, [token]);

  useEffect(() => { loadDetail(); loadVersions(); }, [loadDetail, loadVersions]);

  const loadTree = useCallback(async (v, refresh = false) => {
    if (!v) return;
    try {
      setTreeLoading(true);
      const res = await automationService.syncFields(v, refresh, token);
      if (res.success) {
        setTree(res.data);
        setSheetTab(`Ver ${v}`);
      }
    } catch (e) {
      showToast(e.message || 'Lỗi tải cây field', 'error');
    } finally {
      setTreeLoading(false);
    }
  }, [token]);

  const loadMappings = useCallback(async (v) => {
    if (!v) return;
    try {
      const res = await automationService.syncMappingsGet(v, token);
      if (res.success) setMappings(normalizeMappings(res.data));
    } catch {
      showToast('Lỗi tải mapping', 'error');
    }
  }, [token]);

  const loadHeaders = useCallback(async (tab) => {
    if (!tab) return;
    try {
      const res = await automationService.syncSheetHeaders(tab, token);
      if (res.success) setSheetHeaders(res.data);
    } catch (e) {
      showToast(e.message || 'Lỗi đọc header Sheet', 'error');
    }
  }, [token]);

  useEffect(() => {
    if (view === 'mapping' && version) {
      loadTree(version);
      loadMappings(version);
    }
  }, [view, version]);

  useEffect(() => {
    if (view === 'mapping' && sheetTab) loadHeaders(sheetTab);
  }, [view, sheetTab]);

  const loadRuns = useCallback(async (page = 1, status = statusFilter) => {
    try {
      setRunsLoading(true);
      const res = await automationService.syncRuns({ page, limit: pagination.limit, status }, token);
      if (res.success) {
        setRuns(res.data);
        setPagination(res.pagination);
      }
    } catch {
      showToast('Lỗi tải lịch sử', 'error');
    } finally {
      setRunsLoading(false);
    }
  }, [token, pagination.limit, statusFilter]);

  useEffect(() => { if (view === 'history') loadRuns(1); }, [view, statusFilter]);

  const handleSaveConfig = async () => {
    try {
      setSaving(true);
      const res = await automationService.update('sync_process_report', {
        enabled: form.enabled,
        spreadsheet_id: form.spreadsheet_id.trim(),
        frequency_min: Number(form.frequency_min),
        note: form.note.trim(),
      }, token);
      if (res.success) {
        setDetail(res.data);
        showToast('Đã lưu cấu hình');
      } else {
        showToast(res.message || 'Lưu thất bại', 'error');
      }
    } catch (e) {
      showToast(e.message || 'Lưu thất bại', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDryRun = async () => {
    try {
      setDryRunning(true);
      const res = await automationService.syncTest({ version: version || undefined, limit: 3 }, token);
      if (res.success) setDryPreview(res.data);
      else showToast(res.message || 'Test thất bại', 'error');
    } catch (e) {
      showToast(e.message || 'Test thất bại', 'error');
    } finally {
      setDryRunning(false);
    }
  };

  const handleManualSync = async () => {
    try {
      setSyncing(true);
      const res = await automationService.syncRun(version || undefined, token);
      if (res.success) {
        showToast('Đồng bộ xong');
        if (view === 'history') loadRuns(1);
      } else {
        showToast(res.message || 'Thất bại', 'error');
      }
    } catch (e) {
      showToast(e.message || 'Thất bại', 'error');
    } finally {
      setSyncing(false);
      setConfirmSync(false);
    }
  };

  const colToIndex = (c) => {
    let n = 0;
    for (const ch of String(c).toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  };

  const reassignLetters = (list) => list.map((m, i) => ({ ...m, sheet_col: colName(i) }));

  const normalizeMappings = (rows) => reassignLetters([...(rows || [])].sort((a, b) => colToIndex(a.sheet_col) - colToIndex(b.sheet_col)));

  const mappedPaths = new Set(mappings.map((m) => m.source_path));

  const [hideSystem, setHideSystem] = useState(true);

  const visibleNodes = (tree?.nodes || []).filter((n) => !hideSystem || !HIDDEN_NODE_TYPES.has(n.type)).map((n) => {
    const q = searchField.trim().toLowerCase();
    if (!q) return { ...n, fields: n.fields };
    const fields = (n.fields || []).filter((f) => `${f.path} ${f.label}`.toLowerCase().includes(q));
    const hitNode = `${n.id} ${n.title} ${n.type}`.toLowerCase().includes(q);
    if (!hitNode && fields.length === 0) return null;
    return { ...n, fields: hitNode ? n.fields : fields };
  }).filter(Boolean);

  const visibleMappings = mappings.filter((m) => {
    const q = searchCol.trim().toLowerCase();
    if (!q) return true;
    const h = sheetHeaders[colToIndex(m.sheet_col)] || '';
    return `${m.sheet_col} ${m.label} ${m.source_path} ${h}`.toLowerCase().includes(q);
  });

  const emptySlots = searchCol.trim() ? [] : [mappings.length, mappings.length + 1, mappings.length + 2].map((i) => colName(i));

  const handleDrop = (colLetter) => {
    if (!dragPath) return;
    if (mappedPaths.has(dragPath)) {
      showToast('Field đã được map rồi', 'error');
    } else {
      const label = dragPath.split('.').slice(-1)[0].replace(/[{}]/g, '');
      setMappings([...mappings.filter((m) => m.sheet_col !== colLetter), { source_path: dragPath, sheet_col: colLetter, label }]);
    }
    setDragPath(null);
    setDropCol(null);
  };

  const moveColumn = (sourcePath, dir) => {
    const idx = mappings.findIndex((m) => m.source_path === sourcePath);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= mappings.length) return;
    const next = [...mappings];
    [next[idx], next[j]] = [next[j], next[idx]];
    setMappings(reassignLetters(next));
  };

  const moveColumnTo = (fromPath, toPath) => {
    if (fromPath === toPath) return;
    const next = mappings.filter((m) => m.source_path !== fromPath);
    const moving = mappings.find((m) => m.source_path === fromPath);
    if (!moving) return;
    const toIdx = next.findIndex((m) => m.source_path === toPath);
    next.splice(toIdx < 0 ? next.length : toIdx, 0, moving);
    setMappings(reassignLetters(next));
  };

  const confirmDeleteColumn = () => {
    if (!confirmDeleteCol) return;
    setMappings(reassignLetters(mappings.filter((m) => m.source_path !== confirmDeleteCol)));
    setConfirmDeleteCol(null);
    showToast('Đã xóa cột (lượt push tới sẽ ghi đè toàn bộ tab)');
  };

  const confirmClearMappings = async () => {
    try {
      const res = await automationService.syncMappingsDelete(version, token);
      if (res.success) {
        setMappings([]);
        showToast(res.message || 'Đã xóa hết mapping');
      } else {
        showToast(res.message || 'Xóa thất bại', 'error');
      }
    } catch (e) {
      showToast(e.message || 'Xóa thất bại', 'error');
    } finally {
      setConfirmClearVersion(false);
    }
  };

  const handleSaveMapping = async () => {
    try {
      const res = await automationService.syncMappingsPut(version, mappings.map((m) => ({ source_path: m.source_path, sheet_col: m.sheet_col, label: m.label })), token);
      if (res.success) {
        setMappings(normalizeMappings(res.data));
        showToast('Đã lưu mapping');
      } else {
        showToast(res.message || 'Lưu thất bại', 'error');
      }
    } catch (e) {
      showToast(e.message || 'Lưu thất bại', 'error');
    }
  };

  const handleAutoMatch = async () => {
    try {
      setAutoMatching(true);
      const res = await automationService.syncAutoMatch(version, token);
      if (res.success) {
        showToast(`Auto-match thêm ${res.data.added} trường (tổng ${res.data.total})`);
        loadMappings(version);
      } else {
        showToast(res.message || 'Auto-match thất bại', 'error');
      }
    } catch (e) {
      showToast(e.message || 'Auto-match thất bại', 'error');
    } finally {
      setAutoMatching(false);
    }
  };

  const handleAddColumn = async () => {
    if (!newColName.trim()) { showToast('Nhập tên header', 'error'); return; }    try {
      const res = await automationService.syncSheetAddColumn(sheetTab, newColName.trim(), token);
      if (res.success) {
        setNewColName('');
        setShowAddCol(false);
        loadHeaders(sheetTab);
        showToast(`Đã thêm cột ${res.data.col}`);
      } else {
        showToast(res.message || 'Thêm thất bại', 'error');
      }
    } catch (e) {
      showToast(e.message || 'Thêm thất bại', 'error');
    }
  };

  const handleSampleExcel = async () => {    try {
      const r = await fetch(`/api/admin/automations/sync/sample-excel?version=${encodeURIComponent(version)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error('Tải thất bại');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sync-mau-ver${version}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      showToast(e.message || 'Tải thất bại', 'error');
    }
  };

  const fmtDate = (v) => (v ? new Date(v).toLocaleString('vi-VN') : '--');

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  const tabs = [
    { key: 'config', label: 'Cấu hình chung' },
    { key: 'mapping', label: 'Mapping 2 cột' },
    { key: 'history', label: 'Lịch sử đồng bộ' },
  ];

  return (
    <div className="space-y-4">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      <div role="tablist" className="tabs tabs-boxed mb-2">
        {tabs.map((t) => (
          <button key={t.key} role="tab" className={`tab ${view === t.key ? 'tab-active' : ''}`} onClick={() => onViewChange(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {view === 'config' && (
        <div className="card bg-base-100 shadow-sm border border-base-300">
          <div className="card-body">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <div className="form-control mb-3">
                  <label className="label cursor-pointer justify-start gap-2">
                    <input type="checkbox" className="toggle toggle-primary" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
                    <span className="label-text">Bật đồng bộ tự động</span>
                  </label>
                </div>
                <div className="form-control mb-3">
                  <label className="label"><span className="label-text">Tần suất (phút)</span></label>
                  <select className="select select-bordered w-full" value={form.frequency_min} onChange={(e) => setForm({ ...form, frequency_min: e.target.value })}>
                    <option value={15}>15 phút</option>
                    <option value={30}>30 phút</option>
                    <option value={60}>60 phút</option>
                  </select>
                </div>
                <div className="form-control mb-3">
                  <label className="label"><span className="label-text">Chế độ ghi</span></label>
                  <input className="input input-bordered w-full" value="Upsert theo Process ID" disabled />
                </div>
              </div>
              <div>
                <div className="form-control mb-3">
                  <label className="label"><span className="label-text">Sheet ID</span></label>
                  <input className="input input-bordered w-full" value={form.spreadsheet_id} onChange={(e) => setForm({ ...form, spreadsheet_id: e.target.value })} placeholder="ID trong link Google Sheet" />
                </div>
                <div className="form-control mb-3">
                  <label className="label"><span className="label-text">Service account</span></label>
                  <input className="input input-bordered w-full" value={detail?.sa_email || 'egreen-sync@egreen-510714.iam.gserviceaccount.com'} disabled />
                </div>
                <div className="form-control mb-3">
                  <label className="label"><span className="label-text">Ghi chú</span></label>
                  <input className="input input-bordered w-full" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="card-actions justify-end mt-2 gap-2">
              <button className="btn btn-outline btn-sm gap-1" onClick={handleDryRun} disabled={dryRunning}>
                {dryRunning ? <span className="loading loading-spinner loading-xs"></span> : <Eye size={14} />}
                Test đồng bộ
              </button>
              <button className="btn btn-secondary btn-sm gap-1" onClick={() => setConfirmSync(true)} disabled={syncing}>
                {syncing ? <span className="loading loading-spinner loading-xs"></span> : <Play size={14} />}
                Đồng bộ tay
              </button>
              <button className="btn btn-primary btn-sm gap-1" onClick={handleSaveConfig} disabled={saving}>
                {saving ? <span className="loading loading-spinner loading-xs"></span> : <Save size={14} />}
                Lưu cấu hình
              </button>
            </div>
          </div>
        </div>
      )}

      {view === 'mapping' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select className="select select-bordered select-sm" value={version} onChange={(e) => setVersion(e.target.value)}>
              <option value="">Chọn version</option>
              {versions.map((v) => <option key={v.version} value={v.version}>{v.template ? `${v.template}[${v.version}]` : `Ver ${v.version}`} ({v.nodes} node)</option>)}
            </select>
            <button className="btn btn-outline btn-sm gap-1" onClick={() => { loadTree(version, true); }} disabled={!version || treeLoading}>
              <RefreshCw size={14} />
              Get mới nhất
            </button>
            <button className="btn btn-outline btn-sm gap-1" onClick={handleAutoMatch} disabled={!version || autoMatching} title="Tự map bộ trường cần thiết (bỏ qua field đã map)">
              {autoMatching ? <span className="loading loading-spinner loading-xs"></span> : <Sparkles size={14} />}
              Auto-match
            </button>
            <button className="btn btn-outline btn-sm gap-1 text-error" onClick={() => setConfirmClearVersion(true)} disabled={!version || mappings.length === 0} title="Xóa hết mapping của version này">
              <Trash2 size={14} />
              Xóa nhanh
            </button>
            {tree?.stale && <span className="badge badge-warning badge-sm">Cache cũ</span>}
            <div className="flex-1" />
            <button className="btn btn-outline btn-sm gap-1" onClick={handleSampleExcel} disabled={!version || mappings.length === 0}>
              <Download size={14} />
              Xuất Excel mẫu
            </button>
            <button className="btn btn-primary btn-sm gap-1" onClick={handleSaveMapping} disabled={!version}>
              <Save size={14} />
              Lưu mapping
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card bg-base-100 shadow-sm border border-base-300">
              <div className="card-body">
                <h4 className="font-semibold mb-2">Cột 1 — Trường 1Office</h4>
                <input className="input input-bordered input-sm w-full mb-2" value={searchField} onChange={(e) => setSearchField(e.target.value)} placeholder="🔍 Tìm trường… (vd: diem)" />
                <label className="label cursor-pointer justify-start gap-2 py-1">
                  <input type="checkbox" className="checkbox checkbox-xs" checked={hideSystem} onChange={(e) => setHideSystem(e.target.checked)} />
                  <span className="label-text text-xs">Ẩn node hệ thống (start/sự kiện/chờ/quyết định/thông báo...)</span>
                </label>
                {treeLoading ? (
                  <div className="flex justify-center py-8"><span className="loading loading-spinner"></span></div>
                ) : (
                  <div className="space-y-1 max-h-[560px] overflow-y-auto">
                    {visibleNodes.map((n) => (
                      <details key={n.id} className="border border-base-300 rounded-lg px-2 py-1 bg-base-50">
                        <summary className="cursor-pointer text-sm font-medium">{n.title || `[${n.id}]`} <code className="text-xs">({n.id})</code></summary>
                        <div className="pl-3 py-1 space-y-1">
                          {(n.fields || []).map((f) => (
                            <div
                              key={f.path}
                              draggable
                              onDragStart={(e) => { e.dataTransfer.setData('text/plain', f.path); setDragPath(f.path); }}
                              onDragEnd={() => { setDragPath(null); setDropCol(null); }}
                              className={`flex items-center gap-2 p-1.5 rounded-lg border text-xs cursor-grab bg-base-100 hover:border-primary ${mappedPaths.has(f.path) ? 'border-success' : 'border-dashed border-base-300'} ${dragPath === f.path ? 'opacity-50' : ''}`}
                              title={f.path}
                            >
                              <span className="font-mono bg-base-200 px-1 rounded">{f.path.split('.').slice(-1)[0]}</span>
                              <span>{f.label}</span>
                              <span className="ml-auto text-base-content/40">⋮⋮</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                    {visibleNodes.length === 0 && <div className="text-sm text-base-content/50 text-center py-6">Chọn version để tải cây field</div>}
                  </div>
                )}
              </div>
            </div>

            <div className="card bg-base-100 shadow-sm border border-base-300">
              <div className="card-body">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="font-semibold">Cột 2 — Cột Google Sheet</h4>
                  <span className="text-xs text-base-content/60">({sheetTab || 'chưa chọn version'})</span>
                  <div className="flex-1" />
                  <button className="btn btn-ghost btn-xs gap-1" onClick={() => loadHeaders(sheetTab)} title="Get mới nhất">
                    <RefreshCw size={12} />
                    Get
                  </button>
                  <button className="btn btn-ghost btn-xs gap-1" onClick={() => setShowAddCol(!showAddCol)} title="Cộng thêm cột">
                    <Plus size={12} />
                    Thêm cột
                  </button>
                </div>
                <input className="input input-bordered input-sm w-full mb-2" value={searchCol} onChange={(e) => setSearchCol(e.target.value)} placeholder="🔍 Tìm cột…" />
                {showAddCol && (
                  <div className="flex gap-2 mb-2">
                    <input className="input input-bordered input-sm flex-1" value={newColName} onChange={(e) => setNewColName(e.target.value)} placeholder="Tên header mới" />
                    <button className="btn btn-primary btn-xs" onClick={handleAddColumn}>Thêm</button>
                  </div>
                )}
                <div className="space-y-1 max-h-[560px] overflow-y-auto">
                  {visibleMappings.map((m) => {
                    const letter = m.sheet_col;
                    const sheetHeader = sheetHeaders[colToIndex(letter)] || '';
                    const mismatch = sheetHeader !== '' && m.label !== '' && sheetHeader !== m.label;
                    const isEditing = editingLabel && editingLabel.path === m.source_path;
                    return (
                      <div
                        key={m.source_path}
                        data-testid="sheet-col"
                        data-col={letter}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData('text/col', m.source_path); setDragCol(`move:${m.source_path}`); }}
                        onDragEnd={() => setDragCol(null)}
                        onDragOver={(e) => { if (dragCol && dragCol.startsWith('move:')) { e.preventDefault(); setDropCol(letter); } else if (dragPath) { e.preventDefault(); setDropCol(letter); } }}
                        onDrop={() => {
                          if (dragCol && dragCol.startsWith('move:')) moveColumnTo(dragCol.slice(5), m.source_path);
                          else handleDrop(letter);
                        }}
                        className={`border rounded-lg p-2 bg-base-50 text-sm cursor-grab ${dropCol === letter ? 'border-primary' : 'border-base-300'}`}
                      >
                        <div className="flex items-center gap-1 font-medium">
                          <span>Cột {letter} — {m.label || <i className="text-base-content/50">(chưa đặt tên)</i>}</span>
                          {mismatch && <span className="badge badge-warning badge-xs" title={`Trên Sheet đang là: ${sheetHeader}. Lượt sync tới sẽ ghi đè.`}>lệch Sheet</span>}
                          <span className="flex-1" />
                          <button className="btn btn-ghost btn-xs" title="Lên" onClick={() => moveColumn(m.source_path, -1)}><ArrowUp size={12} /></button>
                          <button className="btn btn-ghost btn-xs" title="Xuống" onClick={() => moveColumn(m.source_path, 1)}><ArrowDown size={12} /></button>
                          <button className="btn btn-ghost btn-xs text-error" title="Xóa cột (dồn vị trí, push sau ghi đè toàn bộ)" onClick={() => setConfirmDeleteCol(m.source_path)}><Trash2 size={12} /></button>
                        </div>
                        <div className="mt-1 text-xs text-base-content/60">Sheet đang là: {sheetHeader !== '' ? sheetHeader : <i>(trống)</i>}</div>
                        <div className="mt-1 flex items-center gap-1 text-xs bg-success/10 border border-success/30 rounded px-1.5 py-1 font-mono">
                          <span className="flex-1 truncate">🔗 {m.source_path}</span>
                          <button className="btn btn-ghost btn-xs" title="Gỡ map" onClick={() => setMappings(mappings.filter((x) => x.source_path !== m.source_path))}>
                            <X size={12} />
                          </button>
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-xs">
                          <span className="text-base-content/60">Header:</span>
                          {isEditing ? (
                            <>
                              <input
                                className="input input-bordered input-xs flex-1"
                                value={editingLabel.value}
                                onChange={(e) => setEditingLabel({ path: m.source_path, value: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    setMappings(mappings.map((x) => (x.source_path === m.source_path ? { ...x, label: editingLabel.value.trim() || x.label } : x)));
                                    setEditingLabel(null);
                                  }
                                }}
                              />
                              <button
                                className="btn btn-primary btn-xs"
                                onClick={() => {
                                  setMappings(mappings.map((x) => (x.source_path === m.source_path ? { ...x, label: editingLabel.value.trim() || x.label } : x)));
                                  setEditingLabel(null);
                                }}
                              >
                                OK
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="flex-1 truncate">{m.label || <i className="text-base-content/50">(theo field)</i>}</span>
                              <button className="btn btn-ghost btn-xs" title="Sửa header" onClick={() => setEditingLabel({ path: m.source_path, value: m.label || '' })}>
                                <Pencil size={12} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {emptySlots.map((letter) => (
                    <div
                      key={`empty-${letter}`}
                      data-testid="sheet-col-empty"
                      data-col={letter}
                      onDragOver={(e) => { e.preventDefault(); setDropCol(letter); }}
                      onDrop={() => handleDrop(letter)}
                      className={`border rounded-lg p-2 bg-base-50 text-sm ${dropCol === letter ? 'border-primary' : 'border-base-300'}`}
                    >
                      <div className="font-medium">Cột {letter} — <i className="text-base-content/50">(trống)</i></div>
                      <div className="mt-1 text-xs text-base-content/40 border border-dashed rounded px-1.5 py-1 text-center">Thả field vào đây</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {view === 'history' && (
        <div className="card bg-base-100 shadow-sm border border-base-300">
          <div className="card-body">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold">Lịch sử đồng bộ</h4>
              <div className="flex gap-2">
                <select className="select select-bordered select-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">Tất cả</option>
                  <option value="success">Thành công</option>
                  <option value="failed">Thất bại</option>
                </select>
                <button className="btn btn-ghost btn-sm" onClick={() => loadRuns(pagination.page)}>
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>
            <DataTable
              columns={[
                { key: 'created_at', label: 'Thời gian', render: (v) => fmtDate(v) },
                { key: 'trigger', label: 'Nội dung', render: (v, row) => `${v === 'manual' ? 'Chạy tay' : 'Tự động'}${row.response_json ? `: ${Object.keys(typeof row.response_json === 'string' ? JSON.parse(row.response_json).versions || {} : row.response_json.versions || {}).length} version` : ''}` },
                { key: 'status', label: 'Trạng thái', render: (v) => <span className={`badge ${STATUS_BADGE[v] || ''}`}>{STATUS_LABEL[v] || v}</span> },
                { key: 'error', label: 'Ghi chú', render: (v) => <span className="text-sm text-base-content/70">{v ? String(v).slice(0, 80) : '--'}</span> },
              ]}
              data={runs}
              loading={runsLoading}
              startIndex={(pagination.page - 1) * pagination.limit}
              actions={(row) => (
                <button className="btn btn-ghost btn-xs" title="Xem chi tiết" onClick={() => openRunDetail(row)}>
                  <Eye size={14} />
                </button>
              )}
            />
            <div className="mt-3 flex justify-center">
              <Pagination page={pagination.page} totalPages={Math.max(1, Math.ceil(pagination.total / pagination.limit))} total={pagination.total} onPageChange={(p) => loadRuns(p)} />
            </div>
          </div>
        </div>
      )}

      <Dialog isOpen={!!viewRun} onClose={() => setViewRun(null)} title={`Chi tiết lượt chạy #${viewRun?.id || ''}`}>
        {viewRun && (
          <div className="space-y-2 text-sm">
            <div><b>Kích hoạt:</b> {viewRun.trigger === 'manual' ? 'Chạy tay' : 'Tự động'} · <b>Kết quả:</b> {STATUS_LABEL[viewRun.status] || viewRun.status}</div>
            {viewRun.error && <div><b>Lỗi:</b> <span className="text-error">{viewRun.error}</span></div>}
            <div><b>Request:</b><pre className="bg-base-200 rounded p-2 mt-1 overflow-x-auto text-xs">{JSON.stringify(viewRun.request_json || {}, null, 2)}</pre></div>
            <div><b>Response:</b><pre className="bg-base-200 rounded p-2 mt-1 overflow-x-auto text-xs">{JSON.stringify(viewRun.response_json || {}, null, 2)}</pre></div>
          </div>
        )}
      </Dialog>

      <Dialog isOpen={!!dryPreview} onClose={() => setDryPreview(null)} title="Preview test đồng bộ (không ghi Sheet)">
        {dryPreview && Object.entries(dryPreview.preview || {}).map(([v, p]) => (
          <div key={v} className="mb-3 text-sm">
            <b>Tab Ver {v}</b>
            <div className="overflow-x-auto">
              <table className="table table-zebra w-full text-xs">
                <thead><tr>{(p.headers || []).map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                <tbody>{(p.rows || []).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{String(c ?? '').slice(0, 120)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </div>
        ))}
      </Dialog>

      <ConfirmDialog
        isOpen={confirmSync}
        title="Đồng bộ tay lên Sheet?"
        message="Ghi dữ liệu các version đã map lên Google Sheet (upsert theo Process ID). Tiếp tục?"
        onConfirm={handleManualSync}
        onCancel={() => setConfirmSync(false)}
      />

      <ConfirmDialog
        isOpen={!!confirmDeleteCol}
        title="Xóa hẳn cột này?"
        message={`Mapping "${(mappings.find((m) => m.source_path === confirmDeleteCol) || {}).label || confirmDeleteCol}" sẽ bị xóa, các cột sau dồn lên. Lượt push tới sẽ GHI ĐÈ TOÀN BỘ tab. Tiếp tục?`}
        onConfirm={confirmDeleteColumn}
        onCancel={() => setConfirmDeleteCol(null)}
      />

      <ConfirmDialog
        isOpen={confirmClearVersion}
        title={`Xóa hết mapping version ${version}?`}
        message={`Xóa toàn bộ mapping của version ${version} trên DB. Dữ liệu đã ghi lên Sheet giữ nguyên. Tiếp tục?`}
        onConfirm={confirmClearMappings}
        onCancel={() => setConfirmClearVersion(false)}
      />
    </div>
  );

  async function openRunDetail(row) {
    try {
      const res = await automationService.syncRunDetail(row.id, token);
      if (res.success) setViewRun(res.data);
    } catch {
      showToast('Lỗi tải chi tiết', 'error');
    }
  }
};

export default SyncSheetPanel;
