import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { adminProposalService, excelService } from '../../services/api';
import DynamicTable from '../../components/dynamic/DynamicTable';
import RecordDetailPopup from '../../components/admin/RecordDetailPopup';
import Toast from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import ErrorMessage from '../../components/ErrorMessage';
import Pagination from '../../components/Pagination';
import useFieldOptions from '../../hooks/useFieldOptions';

const PROPOSALS_VIEW_ID = 8;

const AdminProposalsPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { getSelectOptions } = useFieldOptions('station_proposals');
  const statusOptions = getSelectOptions('status');
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null });
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [popup, setPopup] = useState({ open: false, record: null, mode: 'view' });

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
      const res = await adminProposalService.getAllWithParams('', token);
      if (res.success) {
        const p = res.data.find(x => x.id === id);
        if (p) setPopup(prev => ({ ...prev, record: p }));
      }
    } catch { /* silent */ }
  };

  useEffect(() => {
    loadProposals(1);
  }, []);

  const loadProposals = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page, limit: 10 });
      if (filter) params.append('status', filter);
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
  }, [filter, token]);

  useEffect(() => { loadProposals(1); }, [loadProposals]);

  const handleStatusChange = async (id, newStatus) => {
    try {
      const res = await adminProposalService.updateStatus(id, newStatus, token);
      if (res.success) {
        setToast({ message: 'Cập nhật trạng thái thành công', type: 'success' });
        loadProposals(pagination.page);
      } else {
        setError(res.message || 'Cập nhật thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
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

  const handleExportProposals = async () => {
    try {
      await excelService.exportData('station_proposals', token);
      setToast({ message: 'Export proposals thành công', type: 'success' });
    } catch {
      setError('Lỗi export proposals');
    }
  };

  const renderActions = (row) => (
    <div className="action-buttons">
      <button className="btn btn-sm btn-primary" onClick={() => navigate(`/admin/proposals/view=${row.id}`)}>Xem</button>
      <button className="btn btn-sm btn-edit" onClick={() => navigate(`/admin/proposals/edit=${row.id}`)}>Sửa</button>
      <select value={row.status} onChange={(e) => handleStatusChange(row.id, e.target.value)} className="status-select btn-sm">
        {statusOptions.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <button className="btn btn-sm btn-delete" onClick={() => handleDeleteClick(row.id)}>Xóa</button>
    </div>
  );

  return (
    <div className="admin-proposals-page">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      <div className="page-header">
        <h1>Quản lý Đề xuất</h1>
        <div className="page-header-actions">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="filter-select">
            <option value="">Tất cả</option>
            {statusOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button className="btn btn-secondary" onClick={handleExportProposals}>Export Excel</button>
        </div>
      </div>

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

      {popup.open && (
        <RecordDetailPopup
          entity="station_proposals"
          record={popup.record}
          recordId={popup.record ? undefined : parseInt(location.pathname.match(/=(\d+)/)?.[1])}
          viewId={PROPOSALS_VIEW_ID}
          mode={popup.mode}
          onClose={() => navigate('/admin/proposals')}
          onSaved={() => { loadProposals(pagination.page); navigate('/admin/proposals'); }}
          onSwitchMode={(newMode) => {
            const id = location.pathname.match(/=(\d+)/)?.[1];
            navigate(`/admin/proposals/${newMode}=${id}`, { replace: true });
          }}
        />
      )}

      <DynamicTable
        entity="station_proposals"
        viewId={PROPOSALS_VIEW_ID}
        data={proposals}
        actions={renderActions}
      />

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={loadProposals}
      />
    </div>
  );
};

export default AdminProposalsPage;
