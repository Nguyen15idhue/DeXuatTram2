import { useState, useEffect, useCallback } from 'react';
import { Save, Wifi, Eye, Play, RefreshCw, Bot, ChevronRight, ArrowLeft, Plus, X } from 'lucide-react';
import { automationService } from '../../services/api';
import Toast from '../Toast';
import ConfirmDialog from '../ConfirmDialog';
import DataTable from '../ui/DataTable';
import Pagination from '../ui/Pagination';
import Dialog from '../ui/Dialog';
import SyncSheetPanel from './SyncSheetPanel';

const STATUS_BADGE = {
  pending: 'badge-warning',
  running: 'badge-info',
  success: 'badge-success',
  failed: 'badge-error',
  skipped: 'badge-ghost',
};

const STATUS_LABEL = {
  pending: 'Đang chờ',
  running: 'Đang chạy',
  success: 'Thành công',
  failed: 'Thất bại',
  skipped: 'Bỏ qua',
};

const AUTOMATION_TYPES = [
  { value: 'assign_process', label: 'Tự động gán công việc quy trình vào dự án' },
  { value: 'sync_sheet', label: 'Đồng bộ dữ liệu sang Google Sheet' },
];

const TYPE_LABEL = {
  assign_process: 'Gán dự án',
  sync_sheet: 'Sync Sheet',
};

const TYPE_BADGE = {
  assign_process: 'badge-primary',
  sync_sheet: 'badge-info',
};

const Field = ({ label, hint, children }) => (
  <div className="form-control mb-3">
    <label className="label">
      <span className="label-text">{label} {hint && <span className="text-success">{hint}</span>}</span>
    </label>
    {children}
  </div>
);

const AutomationPanel = ({ token, selectedId, onSelect, onBack, view, onViewChange }) => {
  const [list, setList] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [autoKey, setAutoKey] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [form, setForm] = useState({ name: '', enabled: false, project_code: '2', retry_max: 3, retry_interval_s: 20, find_timeout_s: 60, username: '', password: '', api_token: '', note: '' });
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [runs, setRuns] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });
  const [statusFilter, setStatusFilter] = useState('');
  const [runsLoading, setRunsLoading] = useState(false);
  const [viewRun, setViewRun] = useState(null);
  const [manualCode, setManualCode] = useState('');
  const [manualRunning, setManualRunning] = useState(false);
  const [confirmRun, setConfirmRun] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ automation_type: 'assign_process', name: '', enabled: false });
  const [createError, setCreateError] = useState('');

  const showToast = (message, type = 'success') => setToast({ message, type });

  const loadList = useCallback(async () => {
    try {
      setListLoading(true);
      const res = await automationService.list(token);
      if (res.success) setList(res.data);
    } catch {
      showToast('Lỗi tải danh sách automation', 'error');
    } finally {
      setListLoading(false);
    }
  }, [token]);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    if (!selectedId || list.length === 0) { setAutoKey(null); return; }
    const hit = list.find((a) => String(a.id) === String(selectedId));
    setAutoKey(hit ? hit.automation_key : null);
  }, [selectedId, list]);

  const handleCreate = async () => {
    setCreateError('');
    if (!createForm.name.trim()) { setCreateError('Tên automation không được để trống'); return; }
    try {
      const res = await automationService.create(createForm, token);
      if (res.success) {
        showToast('Tạo automation thành công');
        setShowCreateModal(false);
        setCreateForm({ automation_type: 'assign_process', name: '', enabled: false });
        loadList();
      } else {
        setCreateError(res.message || 'Tạo thất bại');
      }
    } catch (e) {
      setCreateError(e.message || 'Tạo thất bại');
    }
  };

  const loadDetail = useCallback(async () => {
    if (!autoKey) return;
    try {
      setLoading(true);
      const res = await automationService.get(autoKey, token);
      if (res.success) {
        setDetail(res.data);
        setForm({
          name: res.data.name || '',
          enabled: !!res.data.enabled,
          project_code: res.data.project_code || '2',
          retry_max: res.data.retry_max ?? 3,
          retry_interval_s: res.data.retry_interval_s ?? 20,
          find_timeout_s: res.data.find_timeout_s ?? 60,
          username: res.data.username || '',
          password: '',
          api_token: '',
          note: res.data.note || '',
        });
      }
    } catch {
      showToast('Lỗi tải cấu hình automation', 'error');
    } finally {
      setLoading(false);
    }
  }, [token, autoKey]);

  const loadRuns = useCallback(async (page = 1, status = statusFilter) => {
    if (!autoKey) return;
    try {
      setRunsLoading(true);
      const res = await automationService.runs(autoKey, { page, limit: pagination.limit, status }, token);
      if (res.success) {
        setRuns(res.data);
        setPagination(res.pagination);
      }
    } catch {
      showToast('Lỗi tải lịch sử chạy', 'error');
    } finally {
      setRunsLoading(false);
    }
  }, [token, pagination.limit, statusFilter, autoKey]);

  useEffect(() => { loadDetail(); }, [loadDetail]);
  useEffect(() => { if (autoKey) loadRuns(1); }, [statusFilter, autoKey]);

  const handleSave = async () => {
    if (!form.project_code.trim()) { showToast('Mã dự án không được để trống', 'error'); return; }
    try {
      setSaving(true);
      const payload = {
        name: form.name.trim(),
        enabled: form.enabled,
        project_code: form.project_code.trim(),
        retry_max: Number(form.retry_max),
        retry_interval_s: Number(form.retry_interval_s),
        find_timeout_s: Number(form.find_timeout_s),
        username: form.username.trim(),
        note: form.note.trim(),
      };
      if (form.password) payload.password = form.password;
      if (form.api_token) payload.api_token = form.api_token;
      const res = await automationService.update(autoKey, payload, token);
      if (res.success) {
        setDetail(res.data);
        setForm((f) => ({ ...f, password: '', api_token: '' }));
        loadList();
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

  const handleTest = async () => {
    try {
      setTesting(true);
      const payload = {};
      if (form.username.trim()) payload.username = form.username.trim();
      if (form.password) payload.password = form.password;
      if (form.api_token) payload.api_token = form.api_token;
      const res = await automationService.testLogin(autoKey, payload, token);
      if (res.success) showToast(`Đăng nhập OK (web${res.data.api ? ' + work API' : ''})`);
      else showToast(res.message || 'Đăng nhập thất bại', 'error');
    } catch (e) {
      showToast(e.message || 'Đăng nhập thất bại', 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleManualRun = async () => {
    if (!manualCode.trim()) { showToast('Nhập mã đề xuất', 'error'); return; }
    try {
      setManualRunning(true);
      const res = await automationService.runManual(autoKey, manualCode.trim(), token);
      if (res.success) {
        showToast(`Chạy xong: ${STATUS_LABEL[res.data.status] || res.data.status}`);
        setViewRun(res.data);
        loadRuns(1);
      } else {
        showToast(res.message || 'Chạy thất bại', 'error');
      }
    } catch (e) {
      showToast(e.message || 'Chạy thất bại', 'error');
    } finally {
      setManualRunning(false);
      setConfirmRun(false);
    }
  };

  const openRunDetail = async (row) => {
    try {
      const res = await automationService.runDetail(autoKey, row.id, token);
      if (res.success) setViewRun(res.data);
    } catch {
      showToast('Lỗi tải chi tiết', 'error');
    }
  };

  const fmtDate = (v) => (v ? new Date(v).toLocaleString('vi-VN') : '--');

  const groupedList = AUTOMATION_TYPES.map((type) => ({
    ...type,
    items: list.filter((a) => a.automation_type === type.value),
  }));

  if (listLoading) {
    return (
      <div className="flex justify-center py-12">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (!selectedId) {
    return (
      <div className="space-y-4">
        <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Danh sách Automation</h2>
          <button className="btn btn-primary btn-sm gap-1" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} />
            Thêm mới
          </button>
        </div>
        {list.length === 0 ? (
          <div className="text-center py-12 text-base-content/50">Chưa có automation nào</div>
        ) : (
          <div className="space-y-6">
            {groupedList.map((group) => (
              <div key={group.value}>
                <h3 className="text-sm font-semibold text-base-content/60 uppercase tracking-wide mb-2">{group.label}</h3>
                {group.items.length === 0 ? (
                  <div className="text-sm text-base-content/40 py-2">Chưa có automation nào trong nhóm này</div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {group.items.map((a) => (
                      <button
                        key={a.id}
                        className="card bg-base-100 shadow-sm border border-base-300 hover:border-primary text-left"
                        onClick={() => onSelect && onSelect(a.id)}
                      >
                        <div className="card-body flex flex-row items-center gap-3 py-4">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${a.enabled ? 'bg-success/10' : 'bg-base-300'}`}>
                            <Bot size={20} className={a.enabled ? 'text-success' : 'text-base-content/40'} />
                          </div>
                          <div className="flex-1">
                            <div className="font-semibold">{a.name} <span className="badge badge-ghost badge-sm ml-1">ID {a.id}</span></div>
                            <div className="text-sm text-base-content/60 mt-1 flex flex-wrap gap-2">
                              <span className={`badge ${TYPE_BADGE[a.automation_type] || 'badge-ghost'} badge-sm`}>{TYPE_LABEL[a.automation_type] || a.automation_type}</span>
                              <span className={`badge ${a.enabled ? 'badge-success' : 'badge-ghost'} badge-sm`}>{a.enabled ? 'Đang bật' : 'Đang tắt'}</span>
                              {a.project_code && <span className="badge badge-outline badge-sm">Dự án: {a.project_code}</span>}
                            </div>
                          </div>
                          <ChevronRight size={18} className="text-base-content/40" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {showCreateModal && (
          <div className="modal modal-open">
            <div className="modal-box max-w-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg">Tạo Automation mới</h3>
                <button className="btn btn-ghost btn-sm btn-circle" onClick={() => { setShowCreateModal(false); setCreateForm({ automation_type: 'assign_process', name: '', enabled: false }); setCreateError(''); }}>
                  <X size={18} />
                </button>
              </div>

              {createError && (
                <div className="alert alert-error mb-3">
                  <span className="text-sm">{createError}</span>
                </div>
              )}

              <div className="space-y-3">
                <div className="form-control">
                  <label className="label"><span className="label-text">Loại automation *</span></label>
                  <select
                    className="select select-bordered select-sm"
                    value={createForm.automation_type}
                    onChange={(e) => setCreateForm({ ...createForm, automation_type: e.target.value })}
                  >
                    {AUTOMATION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>

                <div className="form-control">
                  <label className="label"><span className="label-text">Tên automation *</span></label>
                  <input
                    type="text"
                    className="input input-bordered input-sm"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    placeholder="VD: Đồng bộ Sheet đầu tư trạm"
                  />
                </div>

                <div className="form-control">
                  <label className="label cursor-pointer justify-start gap-2">
                    <input type="checkbox" className="toggle toggle-primary" checked={createForm.enabled} onChange={(e) => setCreateForm({ ...createForm, enabled: e.target.checked })} />
                    <span className="label-text">Bật ngay sau khi tạo</span>
                  </label>
                </div>
              </div>

              <div className="modal-action">
                <button className="btn btn-ghost btn-sm" onClick={() => { setShowCreateModal(false); setCreateForm({ automation_type: 'assign_process', name: '', enabled: false }); setCreateError(''); }}>Hủy</button>
                <button className="btn btn-primary btn-sm gap-1" onClick={handleCreate}>
                  <Save size={14} />
                  Tạo mới
                </button>
              </div>
            </div>
            <div className="modal-backdrop bg-black/50" />
          </div>
        )}
      </div>
    );
  }

  const selected = list.find((a) => String(a.id) === String(selectedId));
  if (!selected) {
    return (
      <div className="space-y-4">
        <button className="btn btn-ghost btn-sm gap-1" onClick={onBack}>
          <ArrowLeft size={14} />
          Danh sách automation
        </button>
        <div className="alert alert-error"><span>Không tìm thấy automation ID {selectedId}</span></div>
      </div>
    );
  }

  if (selected.automation_type === 'sync_sheet') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost btn-sm gap-1" onClick={onBack}>
            <ArrowLeft size={14} />
            Danh sách automation
          </button>
        </div>
        <div className="card bg-base-100 shadow-sm border border-base-300">
          <div className="card-body py-3">
            <h3 className="font-bold text-lg">{selected.name} <span className="badge badge-ghost badge-sm ml-1">ID {selected.id}</span> <span className="badge badge-info badge-sm ml-1">Sync Sheet</span></h3>
          </div>
        </div>
        <SyncSheetPanel token={token} automationKey={selected.automation_key} view={view || 'config'} onViewChange={onViewChange} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
      <div className="flex items-center gap-2">
        <button className="btn btn-ghost btn-sm gap-1" onClick={onBack}>
          <ArrowLeft size={14} />
          Danh sách automation
        </button>
      </div>

      <div className="card bg-base-100 shadow-sm border border-base-300">
        <div className="card-body">
          <div className="flex items-center gap-2 mb-1">
            <input className="input input-bordered input-sm font-bold text-lg flex-1 max-w-md" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tên automation" />
            <span className="badge badge-ghost badge-sm">ID {selected.id}</span>
          </div>
          <p className="text-sm text-base-content/60 mb-4">Sau khi duyệt &amp; đẩy đề xuất sang 1Office, tìm quy trình theo mã đề xuất rồi gán vào dự án qua session web (giữ khối Liên quan).</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold mb-3">Tài khoản 1Office</h4>
              <Field label="Tên đăng nhập">
                <input className="input input-bordered w-full" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="vd: nguyendv" />
              </Field>
              <Field label="Mật khẩu" hint={detail?.password_set && !form.password ? '(đã lưu ••••••)' : ''}>
                <input type="password" className="input input-bordered w-full" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={detail?.password_set ? '•••••• (bỏ trống = giữ cũ)' : 'Nhập mật khẩu'} autoComplete="new-password" />
              </Field>
              <Field label="Work API token" hint={detail?.api_token_set && !form.api_token ? '(đã lưu ••••••)' : ''}>
                <input type="password" className="input input-bordered w-full" value={form.api_token} onChange={(e) => setForm({ ...form, api_token: e.target.value })} placeholder={detail?.api_token_set ? '•••••• (bỏ trống = giữ cũ)' : 'Token object work (lấy ở document API)'} autoComplete="new-password" />
              </Field>
              <button className="btn btn-outline btn-sm gap-1" onClick={handleTest} disabled={testing}>
                {testing ? <span className="loading loading-spinner loading-xs"></span> : <Wifi size={14} />}
                Test đăng nhập
              </button>
            </div>

            <div>
              <h4 className="font-semibold mb-3">Cấu hình</h4>
              <div className="form-control mb-3">
                <label className="label cursor-pointer justify-start gap-2">
                  <input type="checkbox" className="toggle toggle-primary" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
                  <span className="label-text">Bật tự động gán</span>
                </label>
              </div>
              <Field label={`Mã dự án${detail?.project_title ? ` (${detail.project_title})` : ''}`}>
                <input className="input input-bordered w-full" value={form.project_code} onChange={(e) => setForm({ ...form, project_code: e.target.value })} placeholder="2" />
              </Field>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="form-control">
                  <label className="label"><span className="label-text">Timeout (giây)</span></label>
                  <input type="number" min={1} max={3600} className="input input-bordered w-full" value={form.find_timeout_s} onChange={(e) => setForm({ ...form, find_timeout_s: e.target.value })} />
                </div>
                <div className="form-control">
                  <label className="label"><span className="label-text">Số lần thử</span></label>
                  <input type="number" min={1} max={20} className="input input-bordered w-full" value={form.retry_max} onChange={(e) => setForm({ ...form, retry_max: e.target.value })} />
                </div>
                <div className="form-control">
                  <label className="label"><span className="label-text">Giãn cách (giây)</span></label>
                  <input type="number" min={1} max={3600} className="input input-bordered w-full" value={form.retry_interval_s} onChange={(e) => setForm({ ...form, retry_interval_s: e.target.value })} />
                </div>
              </div>
              <Field label="Ghi chú">
                <input className="input input-bordered w-full" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </Field>
            </div>
          </div>

          <div className="card-actions justify-end mt-2">
            <button className="btn btn-primary btn-sm gap-1" onClick={handleSave} disabled={saving}>
              {saving ? <span className="loading loading-spinner loading-xs"></span> : <Save size={14} />}
              Lưu cấu hình
            </button>
          </div>
        </div>
      </div>

      <div className="card bg-base-100 shadow-sm border border-base-300">
        <div className="card-body">
          <h4 className="font-semibold mb-3">Chạy thủ công</h4>
          <div className="flex gap-2">
            <input className="input input-bordered flex-1" value={manualCode} onChange={(e) => setManualCode(e.target.value)} placeholder="Nhập mã đề xuất (vd: LK_HNO_0006)" />
            <button className="btn btn-secondary btn-sm gap-1" onClick={() => setConfirmRun(true)} disabled={manualRunning || !manualCode.trim()}>
              {manualRunning ? <span className="loading loading-spinner loading-xs"></span> : <Play size={14} />}
              Chạy
            </button>
          </div>
        </div>
      </div>

      <div className="card bg-base-100 shadow-sm border border-base-300">
        <div className="card-body">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold">Lịch sử thực hiện</h4>
            <div className="flex gap-2">
              <select className="select select-bordered select-sm" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); }}>
                <option value="">Tất cả</option>
                <option value="pending">Đang chờ</option>
                <option value="running">Đang chạy</option>
                <option value="success">Thành công</option>
                <option value="failed">Thất bại</option>
                <option value="skipped">Bỏ qua</option>
              </select>
              <button className="btn btn-ghost btn-sm" onClick={() => loadRuns(pagination.page)}>
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
          <DataTable
            columns={[
              { key: 'proposal_code', label: 'Mã đề xuất' },
              { key: 'action', label: 'Thao tác', render: () => 'Gán vào dự án' },
              { key: 'status', label: 'Kết quả', render: (v) => <span className={`badge ${STATUS_BADGE[v] || ''}`}>{STATUS_LABEL[v] || v}</span> },
              { key: 'attempt', label: 'Lần thử' },
              { key: 'created_at', label: 'Thời gian', render: (v) => fmtDate(v) },
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

      <Dialog isOpen={!!viewRun} onClose={() => setViewRun(null)} title={`Chi tiết lượt chạy #${viewRun?.id || ''}`}>
        {viewRun && (
          <div className="space-y-2 text-sm">
            <div><b>Mã đề xuất:</b> {viewRun.proposal_code || '--'} · <b>Contact:</b> {viewRun.contact_code || '--'} · <b>Process:</b> {viewRun.process_id || '--'}</div>
            <div><b>Kích hoạt:</b> {viewRun.trigger === 'manual' ? 'Chạy tay' : 'Tự động'} · <b>Kết quả:</b> {STATUS_LABEL[viewRun.status] || viewRun.status} · <b>Lần thử:</b> {viewRun.attempt}</div>
            {viewRun.error && <div><b>Lỗi:</b> <span className="text-error">{viewRun.error}</span></div>}
            <div><b>Request:</b><pre className="bg-base-200 rounded p-2 mt-1 overflow-x-auto text-xs">{JSON.stringify(viewRun.request_json || {}, null, 2)}</pre></div>
            <div><b>Response:</b><pre className="bg-base-200 rounded p-2 mt-1 overflow-x-auto text-xs">{JSON.stringify(viewRun.response_json || {}, null, 2)}</pre></div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        isOpen={confirmRun}
        title="Chạy automation thủ công?"
        message={`Gán quy trình của đề xuất "${manualCode.trim()}" vào dự án (tối đa ${form.find_timeout_s}s / ${form.retry_max} lần thử). Tiếp tục?`}
        onConfirm={handleManualRun}
        onCancel={() => setConfirmRun(false)}
      />
    </div>
  );
};

export default AutomationPanel;