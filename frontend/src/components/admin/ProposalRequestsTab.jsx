import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { proposalRequestService } from '../../services/api';
import { getStatusColor, getStatusLabel } from '../../utils/mapStatuses';
import Pagination from '../Pagination';
import ReviewActionDialog from './ReviewActionDialog';
import { ProposalCodeLink, ProposalPersonLink } from './ProposalLinkCells';

const REQUEST_TYPES = [
  { value: 'UPDATE_INFO', label: 'Yêu cầu cập nhật thông tin' },
  { value: 'SUPPLEMENT', label: 'Yêu cầu bổ sung thông tin' },
  { value: 'RE_GRADE', label: 'Yêu cầu chấm điểm lại' },
  { value: 'REVISE_BCDX', label: 'Yêu cầu sửa BCĐX' },
  { value: 'TGD_REVIEW', label: 'Trình Tổng giám đốc' },
  { value: 'OTHER', label: 'Yêu cầu khác' }
];

const typeLabel = (value) => REQUEST_TYPES.find((t) => t.value === value)?.label || value || '-';

const formatDateTime = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
};

const StatusBadge = ({ value }) => {
  if (!value) return <span className="field-empty">-</span>;
  const color = getStatusColor(value, 'proposal');
  return (
    <span
      className="badge badge-sm badge-outline whitespace-nowrap"
      style={color ? { color, borderColor: color } : undefined}
    >
      {getStatusLabel(value, 'proposal')}
    </span>
  );
};

const ProposalRequestsTab = ({ token, onOpenProposal }) => {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [type, setType] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [completeDialog, setCompleteDialog] = useState({ open: false, row: null });
  const [completeNote, setCompleteNote] = useState('');
  const [completeSaving, setCompleteSaving] = useState(false);
  const [completeError, setCompleteError] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  const canComplete = !!user && !['CTV', 'NPP', 'MKT'].includes(user.role);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('status', 'OPEN');
      params.set('page', String(page));
      params.set('limit', String(pageSize));
      if (search) params.set('search', search);
      if (type) params.set('type', type);
      if (onlyMine) params.set('my', '1');
      const res = await proposalRequestService.getAll(params.toString(), token);
      if (res && res.success) {
        setItems(res.data || []);
        setPagination(res.pagination || { page, limit: pageSize, total: 0, totalPages: 0 });
      } else {
        setError(res?.message || 'Không tải được danh sách yêu cầu đề xuất');
      }
    } catch (e) {
      setError(e?.message || 'Không tải được danh sách yêu cầu đề xuất');
    } finally {
      setLoading(false);
    }
  }, [token, page, pageSize, search, type, onlyMine]);

  useEffect(() => { load(); }, [load]);

  const openCompleteDialog = (row) => {
    setCompleteNote('');
    setCompleteError('');
    setCompleteDialog({ open: true, row });
  };

  const handleComplete = async () => {
    if (!completeDialog.row) return;
    setCompleteSaving(true);
    setCompleteError('');
    try {
      const res = await proposalRequestService.complete(completeDialog.row.id, { resolution_note: completeNote }, token);
      setToastMessage(res?.message || 'Đã đánh dấu yêu cầu hoàn thành');
      setCompleteDialog({ open: false, row: null });
      load();
    } catch (e) {
      setCompleteError(e?.message || 'Không đánh dấu được yêu cầu');
    } finally {
      setCompleteSaving(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
        <input
          type="search"
          className="input input-bordered input-sm w-full sm:w-72"
          placeholder="Tìm mã đề xuất, người đề xuất, mô tả..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <select
          className="select select-bordered select-sm w-full sm:w-60"
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1); }}
        >
          <option value="">Tất cả loại yêu cầu</option>
          {REQUEST_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <label className="label cursor-pointer gap-2 text-sm">
          <input
            type="checkbox"
            className="toggle toggle-sm toggle-primary"
            checked={onlyMine}
            onChange={(e) => { setOnlyMine(e.target.checked); setPage(1); }}
          />
          Việc của tôi
        </label>
        <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
          Làm mới
        </button>
        <span className="text-sm text-base-content/60 sm:ml-auto">
          {pagination.total} yêu cầu đang mở
        </span>
      </div>

      {error && <div className="alert alert-error text-sm mb-3">{error}</div>}

      <div className="overflow-x-auto bg-base-100 border border-base-300 rounded-lg">
        <table className="table table-sm table-zebra min-w-[1180px]">
          <thead>
            <tr>
              <th className="w-14 text-center">STT</th>
              <th>Mã đề xuất</th>
              <th>Người đề xuất</th>
              <th>Trạng thái hiện tại</th>
              <th>Mô tả công việc cần thực hiện</th>
              <th>Yêu cầu cập nhật từ</th>
              <th>Trạng thái trước đó</th>
              <th>Ngày cập nhật</th>
              <th className="text-center">Lần yêu cầu thứ</th>
              <th>Ghi chú</th>
              {canComplete && <th className="text-right">Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={canComplete ? 11 : 10} className="text-center py-8 text-base-content/60">Đang tải...</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={canComplete ? 11 : 10} className="text-center py-10 text-base-content/40">
                  Không có đề xuất nào cần thực hiện
                </td>
              </tr>
            ) : items.map((row, idx) => (
              <tr key={row.id} className="hover">
                <td className="text-center">{(pagination.page - 1) * pagination.limit + idx + 1}</td>
                <td className="whitespace-nowrap">
                  <ProposalCodeLink id={row.proposal_id} code={row.ma_de_xuat} onOpen={onOpenProposal} />
                </td>
                <td className="whitespace-nowrap">
                  {row.owner_id
                    ? <ProposalPersonLink id={row.owner_id} name={row.owner_name} />
                    : <span>Khách</span>}
                </td>
                <td><StatusBadge value={row.proposal_status} /></td>
                <td className="max-w-[300px]">
                  <div className="text-xs text-base-content/60 mb-0.5">{typeLabel(row.request_type)}</div>
                  <div className="whitespace-pre-wrap break-words">{row.description || '-'}</div>
                </td>
                <td className="whitespace-nowrap">
                  {row.requested_by
                    ? <ProposalPersonLink id={row.requested_by} name={row.requested_by_name} />
                    : <span>Hệ thống</span>}
                </td>
                <td><StatusBadge value={row.previous_status} /></td>
                <td className="whitespace-nowrap">{formatDateTime(row.created_at)}</td>
                <td className="text-center">{row.round_no}</td>
                <td className="max-w-[220px] whitespace-pre-wrap break-words">{row.note || '-'}</td>
                {canComplete && (
                  <td className="text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="btn btn-xs btn-outline btn-success"
                      title="Đánh dấu yêu cầu đã hoàn thành"
                      onClick={() => openCompleteDialog(row)}
                    >
                      Đánh dấu đã hoàn thành
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ReviewActionDialog
        isOpen={completeDialog.open}
        title="Đánh dấu đã hoàn thành"
        description={`Yêu cầu ${completeDialog.row?.ma_de_xuat || ''} (lần ${completeDialog.row?.round_no || 1}): nhập kết quả xử lý của bạn.`}
        confirmText="Xác nhận hoàn thành"
        confirmClass="btn-success"
        reasonLabel="Kết quả xử lý"
        reasonPlaceholder="VD: Đã chấm điểm hoàn tất, đã tái trình BCĐX..."
        saving={completeSaving}
        error={completeError}
        onClose={() => setCompleteDialog({ open: false, row: null })}
        onConfirm={handleComplete}
      />

      {toastMessage && (
        <Toast
          message={toastMessage}
          type="success"
          onClose={() => setToastMessage('')}
        />
      )}

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={setPage}
        pageSize={pageSize}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
      />
    </div>
  );
};

export default ProposalRequestsTab;
