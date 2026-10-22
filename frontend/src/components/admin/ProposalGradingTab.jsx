import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { proposalGradingService } from '../../services/api';
import useDefaultViewId from '../../hooks/useDefaultViewId';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import useFieldOptions from '../../hooks/useFieldOptions';
import Pagination from '../Pagination';
import RecordDetailPopup from './RecordDetailPopup';
import ProposalGradingModal from './ProposalGradingModal';
import ProposalGradingSummary from './ProposalGradingSummary';
import { ProposalCodeLink, ProposalPersonLink } from './ProposalLinkCells';
import Toast from '../Toast';
import {
  getModelLabel,
  formatScore,
  formatProposalCost,
  formatProposalScale,
  getProposalAddress,
  getProposalLegalName,
  getProposalPhone,
  getMissingLegalDocs,
  isLegalDocsComplete
} from '../../utils/proposalGrading';
import { Eye, Pencil, Search, X } from 'lucide-react';

const PROPOSALS_VIEW_ID = 8;
const DEPT_LABELS = { QH: 'Quy hoạch', PL: 'Pháp lý' };

const QuyHoachStatusCell = ({ row, onShowScore }) => {
  const done = row.quy_hoach_score !== null && row.quy_hoach_score !== undefined;
  if (done) {
    return (
      <button
        type="button"
        className="link link-success underline cursor-pointer"
        title="Xem điểm và đánh giá của Quy hoạch"
        onClick={() => onShowScore({ open: true, dept: 'QH', title: 'Quy hoạch', row })}
      >
        Quy hoạch đã chấm xong
      </button>
    );
  }
  return <span className="text-base-content/60">Quy hoạch chưa chấm xong</span>;
};

const PhapLyStatusCell = ({ row, onShowScore }) => {
  const complete = isLegalDocsComplete(row);
  const done = row.phap_ly_score !== null && row.phap_ly_score !== undefined;
  if (done) {
    return (
      <button
        type="button"
        className="link link-success underline cursor-pointer"
        title="Xem điểm và đánh giá của Pháp lý"
        onClick={() => onShowScore({ open: true, dept: 'PL', title: 'Pháp lý', row })}
      >
        Pháp lý đã chấm xong
      </button>
    );
  }
  if (!complete) {
    const missing = getMissingLegalDocs(row);
    return (
      <span className="badge badge-warning badge-sm" title={`Thiếu: ${missing.join(', ')}`}>
        Pháp lý chờ bổ sung thông tin
      </span>
    );
  }
  return <span className="text-base-content/60">Pháp lý chưa chấm xong</span>;
};

const ScoreDetailDialog = ({ detail, onClose }) => {
  if (!detail?.open) return null;
  const missing = getMissingLegalDocs(detail.row);
  const score = detail.dept === 'QH' ? detail.row?.quy_hoach_score : detail.row?.phap_ly_score;
  const note = detail.dept === 'QH' ? detail.row?.quy_hoach_note : detail.row?.phap_ly_note;
  return (
    <dialog className="modal modal-open" style={{ zIndex: 60 }}>
      <div className="modal-box max-w-md">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="font-bold">Điểm {detail.title}</h3>
            <p className="text-sm text-base-content/70">
              {detail.row?.ma_de_xuat || `#${detail.row?.id}`}
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={onClose} title="Đóng">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-base-content/70">Điểm:</span>
            <span className="badge badge-primary">{formatScore(score)}</span>
          </div>
          <div>
            <span className="text-sm text-base-content/70">Đánh giá:</span>
            <p className="text-sm whitespace-pre-wrap">{note || '(không có)'}</p>
          </div>
          {detail.dept === 'PL' && missing.length > 0 && (
            <p className="text-xs text-warning">Thiếu hồ sơ pháp lý: {missing.join(', ')}</p>
          )}
        </div>
        <div className="modal-action">
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>Đóng</button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop" onClick={onClose}>
        <button type="button">close</button>
      </form>
    </dialog>
  );
};

const gradeButtonTitle = (canQH, canPL) => {
  if (canQH && canPL) return 'Chấm / cập nhật điểm của 2 phòng';
  return canQH ? 'Chấm điểm Quy hoạch' : 'Chấm điểm Pháp lý';
};

const ProposalGradingTab = ({ tab, canGradeQH, canGradePL, defaultDepartment }) => {
  const { token } = useAuth();
  const viewId = useDefaultViewId('station_proposals', PROPOSALS_VIEW_ID);
  const { getSelectOptions } = useFieldOptions('station_proposals', ['mo_hinh_dau_tu']);
  const modelOptions = getSelectOptions('mo_hinh_dau_tu');

  const isPending = tab === 'pending';
  const isAll = tab === 'all';
  const showDeptFilter = isPending && canGradeQH && canGradePL;
  const canGrade = canGradeQH || canGradePL;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [departmentFilter, setDepartmentFilter] = useState(defaultDepartment || '');
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');

  const [scoreModal, setScoreModal] = useState({ open: false, record: null });
  const [scoreDetail, setScoreDetail] = useState({ open: false, dept: null, title: '', row: null });
  const [detailPopup, setDetailPopup] = useState({ open: false, record: null });

  const loadItems = useCallback(async (targetPage = 1, targetSize = pageSize, targetSearch = debouncedSearch, targetDept = departmentFilter) => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('tab', tab);
      if (isPending && targetDept) params.set('department', targetDept);
      if (targetSearch) params.set('search', targetSearch);
      params.set('page', targetPage);
      params.set('limit', targetSize);
      const res = await proposalGradingService.getAll(params.toString(), token);
      setItems(res?.data || []);
      setPagination(res?.pagination || { page: targetPage, limit: targetSize, total: 0, totalPages: 0 });
    } catch (err) {
      setError(err?.message || 'Không tải được danh sách đề xuất');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, tab, isPending, pageSize, debouncedSearch, departmentFilter]);

  useEffect(() => {
    setPage(1);
    loadItems(1);
  }, [tab, debouncedSearch, departmentFilter]);

  const openDetail = (record) => setDetailPopup({ open: true, record });

  const openScoreModal = (record) => {
    setDetailPopup({ open: false, record: null });
    setScoreModal({ open: true, record });
  };

  const handleSaved = (result, message) => {
    setScoreModal({ open: false, record: null });
    const transition = result?.transition;
    let extra = '';
    if (transition?.status === 'CANCELLED') extra = ' — Đề xuất bị hủy vì có điểm 0';
    else if (transition?.status === 'DESIGNING') extra = ' — Đề xuất chuyển sang Đang vẽ Layout';
    else if (transition?.status === 'GDTTKD_EVALUATING') extra = ' — Đề xuất chuyển sang GĐTTKD đánh giá';
    else if (result?.transitionError) extra = ` — ${result.transitionError}`;
    setToastMessage((message || 'Đã cập nhật đánh giá') + extra);
    setToastType(result?.transitionError ? 'warning' : 'success');
    loadItems(page, pageSize);
  };

  const colCount = 12;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="input input-bordered flex items-center gap-2 input-sm w-64">
          <Search size={14} />
          <input
            className="grow"
            placeholder="Tìm mã, tên, SĐT, địa chỉ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setSearch('')}>
              <X size={14} />
            </button>
          )}
        </label>
        {showDeptFilter && (
          <label className="flex items-center gap-1 text-sm">
            <span className="whitespace-nowrap">Phòng ban:</span>
            <select
              className="select select-bordered select-sm"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
            >
              <option value="">Cả 2 phòng</option>
              <option value="QH">Quy hoạch</option>
              <option value="PL">Pháp lý</option>
            </select>
          </label>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <span className="loading loading-spinner" />
        </div>
      ) : error ? (
        <div className="alert alert-error text-sm">{error}</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="table table-sm table-zebra min-w-[1500px]">
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Mã đề xuất</th>
                  <th>Tên pháp nhân</th>
                  <th>SĐT liên hệ</th>
                  <th>Mô hình đầu tư</th>
                  <th>Địa chỉ chi tiết</th>
                  <th>Quy mô trụ đề xuất</th>
                  <th>Tổng chi phí dự kiến</th>
                  <th>Người đề xuất</th>
                  <th>Trạng thái Quy hoạch</th>
                  <th>Trạng thái Pháp lý</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="text-center text-base-content/60 py-6">
                      Không có đề xuất nào phù hợp
                    </td>
                  </tr>
                ) : (
                  items.map((row, index) => (
                    <tr key={row.id}>
                      <td>{(page - 1) * pageSize + index + 1}</td>
                      <td>
                        <ProposalCodeLink
                          id={row.id}
                          code={row.ma_de_xuat || `#${row.id}`}
                          onOpen={() => openDetail(row)}
                        />
                      </td>
                      <td>{getProposalLegalName(row)}</td>
                      <td>{getProposalPhone(row)}</td>
                      <td>{getModelLabel(row.mo_hinh_dau_tu, modelOptions)}</td>
                      <td className="min-w-[220px]">{getProposalAddress(row)}</td>
                      <td>{formatProposalScale(row)}</td>
                      <td>{formatProposalCost(row)}</td>
                      <td>
                        <ProposalPersonLink id={row.user_id} name={row.user_name} />
                      </td>
                      <td><QuyHoachStatusCell row={row} onShowScore={setScoreDetail} /></td>
                      <td><PhapLyStatusCell row={row} onShowScore={setScoreDetail} /></td>
                      <td className="whitespace-nowrap">
                        <div className="flex gap-1">
                          {isAll && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs gap-1"
                              title="Xem chi tiết đề xuất"
                              onClick={() => openDetail(row)}
                            >
                              <Eye size={14} />
                              Xem chi tiết
                            </button>
                          )}
                          {isPending && canGrade && (
                            <button
                              type="button"
                              className="btn btn-xs btn-primary gap-1"
                              title={gradeButtonTitle(canGradeQH, canGradePL)}
                              onClick={() => openScoreModal(row)}
                            >
                              <Pencil size={14} />
                              Chấm điểm
                            </button>
                          )}
                          {!isPending && canGrade && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs gap-1"
                              title="Cập nhật lại điểm và đánh giá"
                              onClick={() => openScoreModal(row)}
                            >
                              <Pencil size={14} />
                              Cập nhật
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={(p) => { setPage(p); loadItems(p); }}
            pageSize={pageSize}
            onPageSizeChange={(s) => { setPageSize(s); loadItems(1, s); }}
          />
        </>
      )}

      {detailPopup.open && (
        <RecordDetailPopup
          entity="station_proposals"
          record={detailPopup.record}
          viewId={viewId}
          mode="view"
          allowEdit={false}
          beforeActions={(ctx) => (
            <ProposalGradingSummary
              formData={ctx?.formData || detailPopup.record}
              record={detailPopup.record}
              canGradeQH={canGradeQH}
              canGradePL={canGradePL}
              onUpdate={() => openScoreModal(detailPopup.record)}
            />
          )}
          onClose={() => setDetailPopup({ open: false, record: null })}
        />
      )}

      <ProposalGradingModal
        open={scoreModal.open}
        record={scoreModal.record}
        canGradeQH={canGradeQH}
        canGradePL={canGradePL}
        onClose={() => setScoreModal({ open: false, record: null })}
        onSaved={handleSaved}
      />

      <ScoreDetailDialog
        detail={scoreDetail}
        onClose={() => setScoreDetail({ open: false, dept: null, title: '', row: null })}
      />

      <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />
    </div>
  );
};

export default ProposalGradingTab;
