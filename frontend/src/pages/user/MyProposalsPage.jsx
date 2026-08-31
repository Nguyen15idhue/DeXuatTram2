import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { myProposalService } from '../../services/api';
import DynamicTable from '../../components/dynamic/DynamicTable';
import RecordDetailPopup from '../../components/admin/RecordDetailPopup';
import Loading from '../../components/Loading';
import Toast from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import ErrorMessage from '../../components/ErrorMessage';
import Pagination from '../../components/Pagination';
import useFieldOptions from '../../hooks/useFieldOptions';

const PROPOSALS_VIEW_ID = 8;

const MyProposalsPage = () => {
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
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null });
  const [popup, setPopup] = useState({ open: false, record: null, mode: 'view' });

  useEffect(() => {
    const match = location.pathname.match(/\/my-proposals\/(view|edit)=(\d+)/);
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
      const res = await myProposalService.getAllWithParams('', token);
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
      const res = await myProposalService.getAllWithParams(params.toString(), token);
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

  const handleDeleteClick = (id) => {
    setConfirmDelete({ isOpen: true, id });
  };

  const handleConfirmDelete = async () => {
    const { id } = confirmDelete;
    setConfirmDelete({ isOpen: false, id: null });
    try {
      const res = await myProposalService.delete(id, token);
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

  const renderActions = (row) => (
    <div className="action-buttons">
      <button className="btn btn-sm btn-primary" onClick={() => navigate(`/my-proposals/view=${row.id}`)}>Xem</button>
      {row.status === 'PENDING' && (
        <>
          <button className="btn btn-sm btn-edit" onClick={() => navigate(`/my-proposals/edit=${row.id}`)}>Sửa</button>
          <button className="btn btn-sm btn-delete" onClick={() => handleDeleteClick(row.id)}>Xóa</button>
        </>
      )}
    </div>
  );

  if (loading && proposals.length === 0) return <Loading message="Đang tải đề xuất..." />;

  return (
    <div className="proposals-page">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Xóa đề xuất"
        message="Bạn có chắc chắn muốn xóa đề xuất này?"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete({ isOpen: false, id: null })}
        confirmText="Xóa"
        type="danger"
      />

      <div className="page-header">
        <h1>Đề xuất của tôi</h1>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="filter-select">
          <option value="">Tất cả</option>
          {statusOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {error && <ErrorMessage message={error} onRetry={() => { setError(''); loadProposals(1); }} />}

      {popup.open && (
        <RecordDetailPopup
          entity="station_proposals"
          record={popup.record}
          recordId={popup.record ? undefined : parseInt(location.pathname.match(/=(\d+)/)?.[1])}
          viewId={PROPOSALS_VIEW_ID}
          mode={popup.mode}
          onClose={() => navigate('/my-proposals')}
          onSaved={() => { loadProposals(pagination.page); navigate('/my-proposals'); }}
          onSwitchMode={(newMode) => {
            const id = location.pathname.match(/=(\d+)/)?.[1];
            navigate(`/my-proposals/${newMode}=${id}`, { replace: true });
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

export default MyProposalsPage;
