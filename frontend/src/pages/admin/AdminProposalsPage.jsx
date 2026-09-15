import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { adminProposalService, proposalService, excelService } from '../../services/api';
import DynamicTable from '../../components/dynamic/DynamicTable';
import DynamicForm from '../../components/dynamic/DynamicForm';
import DuplicateCheckPanel from '../../components/DuplicateCheckPanel';
import RecordDetailPopup from '../../components/admin/RecordDetailPopup';
import Toast from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import ErrorMessage from '../../components/ErrorMessage';
import Pagination from '../../components/Pagination';
import useFieldOptions from '../../hooks/useFieldOptions';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { PRIORITY_OPTIONS } from '../../utils/mapStatuses';
import { ClipboardList, Download, Eye, Pencil, Trash2, RotateCcw, Plus, X, Upload, Link, Unlink, ArrowDownToLine, MoreVertical } from 'lucide-react';
import { oneOfficeSyncService, queueLogService } from '../../services/api';
import { notifyBellRefresh } from '../../components/layout/NotificationBell';

const PROPOSALS_VIEW_ID = 8;
const PROPOSALS_CREATE_FORM_ID = 13;

const AdminProposalsPage = () => {
  const { token, isSales, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { getSelectOptions, getFieldLabel } = useFieldOptions('station_proposals', ['status']);
  const statusOptions = getSelectOptions('status');
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [filterUuTien, setFilterUuTien] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null });
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [popup, setPopup] = useState({ open: false, record: null, mode: 'view', recordId: null });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [dupMode, setDupMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [linkModal, setLinkModal] = useState({ open: false, proposalId: null, code: '' });
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [rejectModal, setRejectModal] = useState({ open: false, id: null, reason: '', saving: false });
  const [approveModal, setApproveModal] = useState({ open: false, id: null, saving: false });
  const approveRow = approveModal.id ? proposals.find(p => p.id === approveModal.id) : null;
  const [pushConfirm, setPushConfirm] = useState({ open: false, blocked: [] });
  const [blockModal, setBlockModal] = useState({ open: false, missing: [] });
  const dupRef = useRef(null);
  const tableRef = useRef(null);
  const syncPollRef = useRef(null);

  useEffect(() => {
    return () => {
      if (syncPollRef.current) {
        clearInterval(syncPollRef.current);
        syncPollRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const match = location.pathname.match(/\/admin\/proposals\/(view|edit)=(\d+)/);
    if (match) {
      const mode = match[1];
      const id = parseInt(match[2]);
      const existing = proposals.find(p => p.id === id);
      setPopup({ open: true, record: existing || null, mode });
      if (!existing && id) loadProposalById(id);
    } else {
      setPopup({ open: false, record: null, mode: 'view' });
    }
  }, [location.pathname, proposals.length]);

  const loadProposalById = async (id) => {
    try {
      const res = await adminProposalService.getById(id, token);
      if (res.success) {
        setPopup(prev => ({ ...prev, record: res.data }));
      }
    } catch { /* silent */ }
  };

  const loadProposals = useCallback(async (page = 1, overrides = {}) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page, limit: 10 });
      const f = overrides.filter !== undefined ? overrides.filter : filter;
      const ut = overrides.filterUuTien !== undefined ? overrides.filterUuTien : filterUuTien;
      const s = overrides.search !== undefined ? overrides.search : debouncedSearch;
      if (f) params.append('status', f);
      if (ut) params.append('uu_tien', ut);
      if (s) params.append('search', s);
      const res = await adminProposalService.getAllWithParams(params.toString(), token);
      if (res.success) {
        setProposals(res.data);
        setPagination(res.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
      }
    } catch {
      setError('Lỗi tải danh sách đề xuất');
    } finally {
      setLoading(false);
    }
  }, [filter, filterUuTien, debouncedSearch, token]);

  useEffect(() => { loadProposals(1); }, [loadProposals]);

  useEffect(() => {
    if (!showMoreMenu) return;
    const onKey = (e) => { if (e.key === 'Escape') setShowMoreMenu(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showMoreMenu]);

  const PUSH_USER_KEYS = ['nguoi_phu_trach', 'nguoi_giao_phu_trach'];

  const pushUserValue = (row, key) => {
    const custom = (row && row.custom_data) || {};
    const direct = row ? row[key] : null;
    const v = (direct !== undefined && direct !== null && direct !== '') ? direct : custom[key];
    if (!v) return null;
    if (typeof v === 'object') return v.label || (v.id ? `User #${v.id}` : null);
    return String(v);
  };

  const pushUserRows = (row) => PUSH_USER_KEYS.map(key => ({
    key,
    label: getFieldLabel(key),
    value: pushUserValue(row, key),
  }));

  const missingUserFieldLabels = (row) => {
    const custom = (row && row.custom_data) || {};
    const labels = [];
    for (const key of PUSH_USER_KEYS) {
      const direct = row ? row[key] : null;
      const v = (direct !== undefined && direct !== null && direct !== '') ? direct : custom[key];
      const idVal = v && typeof v === 'object' ? (v.id ?? v.user_id) : v;
      if (!idVal) labels.push(getFieldLabel(key));
    }
    return labels;
  };

  const handleStatusChange = async (id, newStatus) => {
    if (newStatus === 'REJECTED') {
      setRejectModal({ open: true, id, reason: '', saving: false });
      return;
    }
    if (newStatus === 'APPROVED') {
      const row = proposals.find(p => p.id === id);
      const missing = missingUserFieldLabels(row);
      if (missing.length > 0) {
        setBlockModal({ open: true, missing });
        return;
      }
      setApproveModal({ open: true, id, saving: false });
      return;
    }
    try {
      const res = await adminProposalService.updateStatus(id, newStatus, token);
      if (res.success) {
        setToast({ message: 'Cập nhật trạng thái thành công', type: 'success' });
        notifyBellRefresh();
        loadProposals(pagination.page);
      } else {
        setError(res.message || 'Cập nhật thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectModal.reason.trim()) return;
    setRejectModal(prev => ({ ...prev, saving: true }));
    try {
      const res = await adminProposalService.updateStatus(rejectModal.id, 'REJECTED', token, rejectModal.reason.trim());
      if (res.success) {
        setToast({ message: 'Đã từ chối và thông báo cho người tạo', type: 'success' });
        setRejectModal({ open: false, id: null, reason: '', saving: false });
        notifyBellRefresh();
        loadProposals(pagination.page);
      } else {
        setError(res.message || 'Từ chối thất bại');
        setRejectModal(prev => ({ ...prev, saving: false }));
      }
    } catch {
      setError('Lỗi kết nối server');
      setRejectModal(prev => ({ ...prev, saving: false }));
    }
  };

  const handleConfirmApprove = async () => {
    const { id } = approveModal;
    setApproveModal(prev => ({ ...prev, saving: true }));
    try {
      const res = await adminProposalService.updateStatus(id, 'APPROVED', token);
      if (res.success) {
        const auto = res.autoPush;
        let msg = 'Đã duyệt đề xuất';
        if (auto && auto.queued) {
          msg += ' — đã tạo lệnh đẩy sang 1Office, theo dõi trong Audit Log';
        } else if (auto && !auto.queued) {
          msg += ` — chưa đẩy được sang 1Office (${auto.reason || 'thiếu cấu hình'}), hãy đẩy thủ công`;
        }
        setToast({ message: msg, type: auto && auto.queued === false ? 'warning' : 'success' });
        setApproveModal({ open: false, id: null, saving: false });
        notifyBellRefresh();
        loadProposals(pagination.page);
        if (auto && auto.queued && auto.jobId) {
          pollSyncJobs([auto.jobId], (jobs) => {
            const ok = jobs.filter(j => j.status === 'completed').length;
            const bad = jobs.filter(j => j.status !== 'completed').length;
            setToast({
              message: ok > 0 ? 'Đẩy sang 1Office thành công' : `Đẩy sang 1Office thất bại (${bad}) — xem Audit Log để Retry`,
              type: ok > 0 ? 'success' : 'error'
            });
            loadProposals(pagination.page);
          });
        }
      } else {
        setError(res.message || 'Duyệt thất bại');
        setApproveModal(prev => ({ ...prev, saving: false }));
      }
    } catch {
      setError('Lỗi kết nối server');
      setApproveModal(prev => ({ ...prev, saving: false }));
    }
  };

  const handleDeleteClick = (id) => {
    setConfirmDelete({ isOpen: true, id });
  };

  const handleConfirmDelete = async () => {
    const { id } = confirmDelete;
    setConfirmDelete({ isOpen: false, id: null });
    try {
      const res = await adminProposalService.delete(id, token);
      if (res.success) {
        setToast({ message: 'Xóa đề xuất thành công', type: 'success' });
        loadProposals(pagination.page);
      } else {
        setError(res.message || 'Xóa thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const handleReset = () => {
    setSearch('');
    setFilter('');
    setFilterUuTien('');
    if (dupRef.current) dupRef.current.reset();
    setDupMode(false);
    if (tableRef.current) tableRef.current.clearFilters();
    setError('');
    loadProposals(1, { filter: '', filterUuTien: '', search: '' });
  };

  const handleExportProposals = async () => {
    try {
      await excelService.exportData('station_proposals', token, { search, status: filter });
      setToast({ message: 'Export proposals thành công', type: 'success' });
    } catch {
      setError('Lỗi export proposals');
    }
  };

  const parsePayload = (job) => {
    if (!job) return {};
    const p = job.response_payload;
    if (!p) return {};
    if (typeof p === 'object') return p;
    try { return JSON.parse(p); } catch { return {}; }
  };

  const pollSyncJobs = (jobIds, onDone) => {
    if (!jobIds || jobIds.length === 0) return;
    if (syncPollRef.current) clearInterval(syncPollRef.current);
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts++;
      try {
        const jobs = [];
        for (const jid of jobIds) {
          const r = await queueLogService.getById(jid, token);
          if (r.success && r.data) jobs.push(r.data);
        }
        const done = jobs.length === jobIds.length && jobs.every(j => ['completed', 'failed', 'cancelled'].includes(j.status));
        if (done) {
          clearInterval(timer);
          syncPollRef.current = null;
          onDone(jobs);
        } else if (attempts >= 30) {
          clearInterval(timer);
          syncPollRef.current = null;
          setToast({ message: 'Lệnh vẫn đang xử lý — theo dõi trong Audit Log', type: 'info' });
        }
      } catch {
        clearInterval(timer);
        syncPollRef.current = null;
      }
    }, 3000);
    syncPollRef.current = timer;
  };

  const openPushConfirm = () => {
    const blocked = selectedIds
      .map(id => proposals.find(p => p.id === id))
      .filter(Boolean)
      .map(row => ({ id: row.id, missing: missingUserFieldLabels(row) }))
      .filter(x => x.missing.length > 0);
    setPushConfirm({ open: true, blocked });
  };

  const handleBatchPush = async () => {
    setPushConfirm({ open: false, blocked: [] });
    if (selectedIds.length === 0) return;
    setBatchLoading(true);
    try {
      const res = await oneOfficeSyncService.push({ proposalIds: selectedIds, apiConfigId: 3 }, token);
      if (res.success && Array.isArray(res.data)) {
        const queued = res.data.filter(r => r.success);
        const failed = res.data.filter(r => !r.success);
        const queuedNew = queued.filter(r => !r.isUpdate).length;
        const queuedUpd = queued.filter(r => r.isUpdate).length;
        const parts = [];
        if (queuedNew > 0) parts.push(`${queuedNew} đẩy mới`);
        if (queuedUpd > 0) parts.push(`${queuedUpd} cập nhật đã liên kết`);
        if (queued.length > 0) {
          setToast({
            message: `Đã tạo ${queued.length} lệnh (${parts.join(', ')}) — theo dõi trong Audit Log${failed.length > 0 ? `; ${failed.length} không đẩy được: ${failed.map(f => `#${f.proposalId}: ${f.error}`).join('; ')}` : ''}`,
            type: failed.length > 0 ? 'warning' : 'success'
          });
          pollSyncJobs(queued.map(r => r.jobId), (jobs) => {
            const ok = jobs.filter(j => j.status === 'completed');
            const bad = jobs.filter(j => j.status !== 'completed');
            let created = 0, updated = 0, recreated = 0;
            ok.forEach(j => {
              const p = parsePayload(j);
              if (p.contact_recreated) recreated++;
              else if (p.contact_updated) updated++;
              else created++;
            });
            const msgParts = [];
            if (created > 0) msgParts.push(`${created} tạo mới`);
            if (updated > 0) msgParts.push(`${updated} cập nhật`);
            if (recreated > 0) msgParts.push(`${recreated} tạo lại (contact từng bị xóa bên 1Office)`);
            if (ok.length > 0) {
              setToast({ message: `Đẩy xong: ${msgParts.join(', ')}${bad.length > 0 ? `; ${bad.length} thất bại (xem Audit Log)` : ''}`, type: bad.length > 0 ? 'warning' : 'success' });
            } else {
              setError(`Đẩy thất bại cả ${bad.length} lệnh (xem Audit Log)`);
            }
            loadProposals(pagination.page);
          });
        } else {
          setError(`Không tạo được lệnh đẩy: ${failed.map(f => `#${f.proposalId}: ${f.error}`).join('; ')}`);
        }
        setSelectedIds([]);
        loadProposals(pagination.page);
      } else {
        setError(res.message || 'Đẩy thất bại');
      }
    } catch {
      setError('Lỗi khi đẩy sang 1Office');
    }
    setBatchLoading(false);
  };

  const handleBatchPull = async () => {
    setBatchLoading(true);
    try {
      const res = await oneOfficeSyncService.pull({ apiConfigId: 3 }, token);
      if (res.success) {
        const jobId = res.data && res.data.jobId;
        setToast({ message: 'Đã tạo lệnh lấy về từ 1Office (theo dõi trong Audit Log)', type: 'success' });
        if (jobId) {
          pollSyncJobs([jobId], (jobs) => {
            const job = jobs[0];
            if (job.status === 'completed') {
              const p = parsePayload(job);
              const d = (p.details && p.details.dangling) || [];
              setToast({
                message: `Lấy về xong: ${p.updated || 0} cập nhật, ${p.skipped || 0} bỏ qua${d.length > 0 ? `, ${d.length} link treo (contact bị xóa bên 1Office: ${d.map(x => `#${x.proposalId}`).join(', ')})` : ''}`,
                type: d.length > 0 ? 'warning' : 'success'
              });
            } else {
              setError('Lệnh lấy về thất bại (xem Audit Log)');
            }
            loadProposals(pagination.page);
          });
        }
        loadProposals(pagination.page);
      } else {
        setError(res.message || 'Lấy về thất bại');
      }
    } catch {
      setError('Lỗi khi lấy về từ 1Office');
    }
    setBatchLoading(false);
  };

  const handleLinkSubmit = async () => {
    if (!linkModal.proposalId || !linkModal.code.trim()) return;
    setBatchLoading(true);
    try {
      const res = await oneOfficeSyncService.link({ proposalId: linkModal.proposalId, contactCode: linkModal.code.trim(), apiConfigId: 3 }, token);
      if (res.success) {
        setToast({ message: `Đã liên kết đề xuất #${linkModal.proposalId} với mã ${linkModal.code.trim()}`, type: 'success' });
        setLinkModal({ open: false, proposalId: null, code: '' });
        loadProposals(pagination.page);
      } else {
        setError(res.message || 'Liên kết thất bại');
      }
    } catch {
      setError('Lỗi khi liên kết với 1Office');
    }
    setBatchLoading(false);
  };

  const handleUnlink = async (proposalId) => {
    setBatchLoading(true);
    try {
      const res = await oneOfficeSyncService.unlink({ proposalId }, token);
      if (res.success) {
        setToast({ message: `Đã hủy liên kết đề xuất #${proposalId}`, type: 'success' });
        loadProposals(pagination.page);
      } else {
        setError(res.message || 'Hủy liên kết thất bại');
      }
    } catch {
      setError('Lỗi khi hủy liên kết');
    }
    setBatchLoading(false);
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setConfirmBulkDelete(false);
    setBatchLoading(true);
    let ok = 0;
    const failed = [];
    for (const id of selectedIds) {
      try {
        const res = await adminProposalService.delete(id, token);
        if (res.success) ok++;
        else failed.push(`#${id}: ${res.message || 'Xóa thất bại'}`);
      } catch {
        failed.push(`#${id}: Lỗi kết nối server`);
      }
    }
    setBatchLoading(false);
    setSelectedIds([]);
    loadProposals(pagination.page);
    if (ok > 0) {
      setToast({
        message: `Đã xóa ${ok} đề xuất${failed.length > 0 ? `, ${failed.length} không xóa được: ${failed.join('; ')}` : ''}`,
        type: failed.length > 0 ? 'warning' : 'success'
      });
    } else {
      setError(`Không xóa được: ${failed.join('; ')}`);
    }
  };

  const handleCreateSubmit = async (formData) => {
    const submitData = { ...formData };
    if (!submitData.owner_name || !submitData.address || !submitData.latitude || !submitData.longitude) {
      throw new Error('Vui lòng nhập đầy đủ thông tin bắt buộc');
    }
    const res = await proposalService.create(submitData, token);
    if (res.success) {
      setToast({ message: 'Tạo đề xuất thành công', type: 'success' });
      setShowCreateForm(false);
      loadProposals(1);
    } else {
      throw new Error(res.message || 'Tạo đề xuất thất bại');
    }
  };

  const renderActions = (row) => (
    <div className="flex flex-wrap gap-1 items-center">
      <button className="btn btn-primary btn-xs gap-1" onClick={() => navigate(`/admin/proposals/view=${row.id}`)}>
        <Eye size={12} />
        Xem
      </button>
      {isAdmin && (
      <button className="btn btn-warning btn-xs gap-1" onClick={() => navigate(`/admin/proposals/edit=${row.id}`)}>
        <Pencil size={12} />
        Sửa
      </button>
      )}
      <select
        value={row.status}
        onChange={(e) => handleStatusChange(row.id, e.target.value)}
        className="select select-bordered select-xs"
      >
        {statusOptions.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <button className="btn btn-error btn-outline btn-xs gap-1" onClick={() => handleDeleteClick(row.id)}>
        <Trash2 size={12} />
        Xóa
      </button>
      {isAdmin && (row.contact_1office_code ? (
        <button className="btn btn-ghost btn-xs gap-1" onClick={() => handleUnlink(row.id)} disabled={batchLoading} title={`Đã liên kết: ${row.contact_1office_code}`}>
          <Unlink size={12} />
          Hủy link
        </button>
      ) : (
        <button className="btn btn-accent btn-outline btn-xs gap-1" onClick={() => setLinkModal({ open: true, proposalId: row.id, code: '' })}>
          <Link size={12} />
          Link
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <ClipboardList size={24} className="text-primary shrink-0" />
          <h1 className="text-2xl font-bold">Quản lý Đề xuất</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary btn-sm gap-1" onClick={() => setShowCreateForm(true)}>
            <Plus size={14} /> Tạo đề xuất
          </button>

          <div className="relative">
            <button
              className="btn btn-ghost btn-sm btn-circle"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              title="Thao tác"
            >
              <MoreVertical size={18} />
            </button>
            {showMoreMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-base-100 border border-base-300 rounded-lg shadow-lg py-1 w-52">
                  <button
                    className="w-full px-3 py-2 text-sm text-left hover:bg-base-200 flex items-center gap-2 gap-2"
                    onClick={() => { setShowMoreMenu(false); openPushConfirm(); }}
                    disabled={selectedIds.length === 0 || batchLoading}
                  >
                    <Upload size={14} className="text-success" />
                    Đẩy sang 1Office
                    {selectedIds.length > 0 && <span className="badge badge-success badge-sm ml-auto">{selectedIds.length}</span>}
                  </button>
                  <button
                    className="w-full px-3 py-2 text-sm text-left hover:bg-base-200 flex items-center gap-2"
                    onClick={() => { setShowMoreMenu(false); handleBatchPull(); }}
                    disabled={batchLoading}
                  >
                    <ArrowDownToLine size={14} className="text-info" />
                    Lấy về từ 1Office
                  </button>
                </div>
              </>
            )}
          </div>

          <button className="btn btn-ghost btn-sm gap-1" onClick={handleExportProposals}>
            <Download size={14} />
            Export
          </button>
          <button className="btn btn-ghost btn-sm gap-1" onClick={handleReset} title="Đặt lại bộ lọc">
            <RotateCcw size={14} />
            <span className="hidden sm:inline">Đặt lại</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
        <input
          type="text"
          className="input input-bordered input-sm w-full sm:flex-1 sm:max-w-md"
          placeholder="Tìm theo tên, địa chỉ, SĐT, mã đề xuất..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loadProposals(1)}
        />
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select className="select select-bordered select-sm flex-1 min-w-0 sm:flex-none sm:w-44" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            {statusOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select className="select select-bordered select-sm flex-1 min-w-0 sm:flex-none sm:w-44" value={filterUuTien} onChange={(e) => setFilterUuTien(e.target.value)}>
            <option value="">Tất cả loại ưu tiên</option>
            {PRIORITY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <DuplicateCheckPanel
        ref={dupRef}
        fetchDuplicates={(minM, maxM) => adminProposalService.duplicates(minM, maxM, token)}
        getProposalViewUrl={(id) => `/admin/proposals/view=${id}`}
        getStationViewUrl={(id) => `/admin/stations/view=${id}`}
        onModeChange={setDupMode}
        onViewItem={(kind, id) => {
          if (kind === 'proposal') setPopup({ open: true, record: null, mode: 'view', recordId: id });
          else if (kind === 'station') navigate(`/admin/stations/view=${id}`);
        }}
        exportDuplicatesUrl="/admin/excel/export/duplicates"
        exportToken={token}
      />

      {error && <ErrorMessage message={error} onRetry={() => { setError(''); loadProposals(1); }} />}

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Xóa đề xuất"
        message="Bạn có chắc chắn muốn xóa đề xuất này?"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete({ isOpen: false, id: null })}
        confirmText="Xóa"
        type="danger"
      />

      {linkModal.open && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Liên kết đề xuất #{linkModal.proposalId}</h3>
              <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={() => setLinkModal({ open: false, proposalId: null, code: '' })}>
                <X size={18} />
              </button>
            </div>
            <label className="label">
              <span className="label-text">Mã contact 1Office</span>
            </label>
            <input
              type="text"
              className="input input-bordered w-full"
              placeholder="Nhập mã contact trên 1Office..."
              value={linkModal.code}
              onChange={(e) => setLinkModal({ ...linkModal, code: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleLinkSubmit()}
            />
            <div className="modal-action">
              <button type="button" className="btn btn-ghost" onClick={() => setLinkModal({ open: false, proposalId: null, code: '' })}>Hủy</button>
              <button type="button" className="btn btn-primary gap-1" onClick={handleLinkSubmit} disabled={!linkModal.code.trim() || batchLoading}>
                <Link size={14} /> Liên kết
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setLinkModal({ open: false, proposalId: null, code: '' })}>close</button>
          </form>
        </dialog>
      )}

      <ConfirmDialog
        isOpen={confirmBulkDelete}
        title="Xóa nhiều đề xuất"
        message={`Bạn có chắc chắn muốn xóa ${selectedIds.length} đề xuất đã chọn?`}
        onConfirm={handleConfirmBulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
        confirmText="Xóa"
        type="danger"
      />

      {pushConfirm.open && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Đẩy sang 1Office</h3>
              <button className="btn btn-ghost btn-sm btn-circle" onClick={() => setPushConfirm({ open: false, blocked: [] })}>
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-base-content/80">Đề xuất gửi sang 1Office <b>không thể hoàn tác</b>. Hãy xác nhận chắc chắn muốn gửi đề xuất này rồi mới thực hiện.</p>
            <p className="text-sm text-base-content/60 mt-2">Số đề xuất đã chọn: <b>{selectedIds.length}</b></p>
            <div className="mt-3 border border-base-300 rounded-lg p-3 max-h-56 overflow-y-auto">
              <p className="text-xs font-bold uppercase text-base-content/50 mb-2">Thông tin gửi sang 1Office</p>
              {selectedIds.map(id => {
                const row = proposals.find(p => p.id === id);
                if (!row) return null;
                return (
                  <div key={id} className="mb-2 last:mb-0">
                    <p className="text-sm font-semibold">#{row.id}{row.ma_de_xuat ? ` · ${row.ma_de_xuat}` : ''}</p>
                    {pushUserRows(row).map(r => (
                      <div key={r.key} className="flex justify-between gap-2 text-sm py-0.5">
                        <span className="text-base-content/70">{r.label}</span>
                        <span className={`font-medium ${r.value ? '' : 'text-error'}`}>{r.value || 'Thiếu'}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            {pushConfirm.blocked.length > 0 && (
              <div className="alert alert-warning py-2 px-3 mt-3 text-xs">
                <div>
                  <p className="font-bold mb-1">{pushConfirm.blocked.length} đề xuất sẽ bị chặn (thiếu thông tin):</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {pushConfirm.blocked.map(b => (
                      <li key={b.id}>#{b.id}: thiếu {b.missing.map(m => `"${m}"`).join(', ')}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <div className="modal-action">
              <button className="btn btn-ghost btn-sm" onClick={() => setPushConfirm({ open: false, blocked: [] })}>Hủy</button>
              <button className="btn btn-success btn-sm" disabled={batchLoading} onClick={handleBatchPush}>
                {batchLoading ? 'Đang gửi...' : 'Xác nhận gửi 1Office'}
              </button>
            </div>
          </div>
          <div className="modal-backdrop bg-black/50" onClick={() => setPushConfirm({ open: false, blocked: [] })} />
        </dialog>
      )}

      {blockModal.open && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Chưa thể duyệt</h3>
              <button className="btn btn-ghost btn-sm btn-circle" onClick={() => setBlockModal({ open: false, missing: [] })}>
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-base-content/80">Đề xuất thiếu thông tin bắt buộc để gửi sang 1Office:</p>
            <ul className="list-disc pl-6 mt-2 text-sm font-semibold text-error">
              {blockModal.missing.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
            <p className="text-sm text-base-content/70 mt-3">Vui lòng cập nhật các trường trên trước khi duyệt đề xuất.</p>
            <div className="modal-action">
              <button className="btn btn-primary btn-sm" onClick={() => setBlockModal({ open: false, missing: [] })}>Đã hiểu</button>
            </div>
          </div>
          <div className="modal-backdrop bg-black/50" onClick={() => setBlockModal({ open: false, missing: [] })} />
        </dialog>
      )}

      {approveModal.open && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Duyệt đề xuất</h3>
              <button className="btn btn-ghost btn-sm btn-circle" onClick={() => setApproveModal({ open: false, id: null, saving: false })}>
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-base-content/80">Đề xuất gửi sang 1Office <b>không thể hoàn tác</b>. Hãy xác nhận chắc chắn muốn gửi đề xuất này rồi mới thực hiện.</p>
            {approveRow && (
              <div className="mt-3 border border-base-300 rounded-lg p-3">
                <p className="text-xs font-bold uppercase text-base-content/50 mb-2">Thông tin gửi sang 1Office</p>
                {pushUserRows(approveRow).map(r => (
                  <div key={r.key} className="flex justify-between gap-2 text-sm py-0.5">
                    <span className="text-base-content/70">{r.label}</span>
                    <span className={`font-medium ${r.value ? '' : 'text-error'}`}>{r.value || 'Thiếu'}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-action">
              <button className="btn btn-ghost btn-sm" onClick={() => setApproveModal({ open: false, id: null, saving: false })}>Hủy</button>
              <button
                className="btn btn-success btn-sm"
                disabled={approveModal.saving}
                onClick={handleConfirmApprove}
              >
                {approveModal.saving ? 'Đang duyệt...' : 'Duyệt & gửi 1Office'}
              </button>
            </div>
          </div>
          <div className="modal-backdrop bg-black/50" onClick={() => setApproveModal({ open: false, id: null, saving: false })} />
        </dialog>
      )}

      {rejectModal.open && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Từ chối đề xuất</h3>
              <button className="btn btn-ghost btn-sm btn-circle" onClick={() => setRejectModal({ open: false, id: null, reason: '', saving: false })}>
                <X size={18} />
              </button>
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text">Lý do từ chối *</span></label>
              <textarea
                className="textarea textarea-bordered"
                rows={4}
                value={rejectModal.reason}
                onChange={(e) => setRejectModal(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="Nhập lý do và nội dung cần chỉnh sửa..."
              />
            </div>
            <div className="modal-action">
              <button className="btn btn-ghost btn-sm" onClick={() => setRejectModal({ open: false, id: null, reason: '', saving: false })}>Hủy</button>
              <button
                className="btn btn-error btn-sm"
                disabled={!rejectModal.reason.trim() || rejectModal.saving}
                onClick={handleConfirmReject}
              >
                {rejectModal.saving ? 'Đang gửi...' : 'Từ chối & thông báo'}
              </button>
            </div>
          </div>
          <div className="modal-backdrop bg-black/50" onClick={() => setRejectModal({ open: false, id: null, reason: '', saving: false })} />
        </dialog>
      )}

      {showCreateForm && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Tạo đề xuất mới</h3>
              <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={() => setShowCreateForm(false)}>
                <X size={18} />
              </button>
            </div>
            <DynamicForm
              entity="station_proposals"
              purpose="create"
              formId={PROPOSALS_CREATE_FORM_ID}
              onSubmit={handleCreateSubmit}
            >
              <button type="button" className="btn btn-ghost" onClick={() => setShowCreateForm(false)}>Hủy</button>
            </DynamicForm>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setShowCreateForm(false)}>close</button>
          </form>
        </dialog>
      )}

      {popup.open && (
        <RecordDetailPopup
          entity="station_proposals"
          record={popup.record}
          recordId={popup.record ? undefined : (popup.recordId || parseInt(location.pathname.match(/=(\d+)/)?.[1]))}
          viewId={PROPOSALS_VIEW_ID}
          mode={popup.mode}
          allowEdit={isAdmin}
          onClose={() => {
            setPopup({ open: false, record: null, mode: 'view', recordId: null });
            navigate('/admin/proposals');
          }}
          onSaved={() => loadProposals(pagination.page)}
          onSwitchMode={(newMode) => {
            const id = popup.recordId || location.pathname.match(/=(\d+)/)?.[1];
            if (id) navigate(`/admin/proposals/${newMode}=${id}`, { replace: true });
          }}
        />
      )}

      {!dupMode && (
      <>
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 px-3 py-2 bg-base-200 rounded-lg">
          <span className="text-sm font-medium">Đã chọn: {selectedIds.length} đề xuất</span>
          <button className="btn btn-error btn-sm gap-1" onClick={() => setConfirmBulkDelete(true)} disabled={batchLoading}>
            <Trash2 size={14} /> Xóa ({selectedIds.length})
          </button>
          <button className="btn btn-ghost btn-sm gap-1" onClick={() => setSelectedIds([])}>
            <X size={14} /> Bỏ chọn
          </button>
        </div>
      )}
      <DynamicTable
        ref={tableRef}
        entity="station_proposals"
        viewId={PROPOSALS_VIEW_ID}
        data={proposals}
        actions={renderActions}
        startIndex={(pagination.page - 1) * pagination.limit}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
      />

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={loadProposals}
      />
      </>
      )}
    </div>
  );
};

export default AdminProposalsPage;
