import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { proposalReviewService } from '../../services/api';
import useDefaultViewId from '../../hooks/useDefaultViewId';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import useFieldOptions from '../../hooks/useFieldOptions';
import Pagination from '../Pagination';
import RecordDetailPopup from './RecordDetailPopup';
import ProposalGradingModal from './ProposalGradingModal';
import ProposalGradingSummary from './ProposalGradingSummary';
import ReviewActionDialog from './ReviewActionDialog';
import { ProposalCodeLink, ProposalPersonLink } from './ProposalLinkCells';
import Toast from '../Toast';
import { getStatusColor, getStatusLabel } from '../../utils/mapStatuses';
import { getReviewLevelLabel } from '../../utils/proposalReview';
import {
  formatScore,
  formatProposalCost,
  formatProposalScale,
  getModelLabel,
  getProposalAddress,
  getProposalLegalName,
  getProposalPhone
} from '../../utils/proposalGrading';
import { Check, Eye, Pencil, RotateCcw, Search, Send, X, XCircle } from 'lucide-react';

const PROPOSALS_VIEW_ID = 8;

const ACTION_CONFIG = {
  regrade: {
    title: 'Yêu cầu đánh giá lại',
    description: 'Đề xuất sẽ chuyển sang trạng thái Yêu cầu chấm điểm lại và gửi thông báo tới Phòng Quy hoạch và Phòng Pháp lý.',
    confirmText: 'Gửi yêu cầu',
    confirmClass: 'btn-warning',
    reasonLabel: 'Lý do yêu cầu đánh giá lại',
    reasonPlaceholder: 'Ví dụ: Điểm Quy hoạch chưa phù hợp với thực tế, đề nghị xem xét lại...',
    api: proposalReviewService.requestRegrade
  },
  toTgd: {
    title: 'Trình Tổng giám đốc xem xét',
    description: 'Đề xuất sẽ chuyển sang trạng thái Trình Tổng giám đốc xem xét.',
    confirmText: 'Trình TGĐ',
    confirmClass: 'btn-primary',
    reasonLabel: 'Lý do trình Tổng giám đốc',
    reasonPlaceholder: 'Nhập lý do trình Tổng giám đốc...',
    api: proposalReviewService.toTgd
  },
  cancel: {
    title: 'Xác nhận hủy đề xuất',
    description: 'Đề xuất sẽ bị hủy và không tiếp tục quy trình. Vui lòng nhập lý do cụ thể.',
    confirmText: 'Xác nhận hủy',
    confirmClass: 'btn-error',
    reasonLabel: 'Lý do hủy đề xuất',
    reasonPlaceholder: 'Nhập lý do hủy đề xuất...',
    api: proposalReviewService.cancel
  },
  approve: {
    title: 'Duyệt đề xuất',
    description: 'Đề xuất sẽ chuyển sang trạng thái Đang vẽ Layout.',
    confirmText: 'Duyệt đề xuất',
    confirmClass: 'btn-success',
    reasonLabel: 'Lý do duyệt đề xuất',
    reasonPlaceholder: 'Nhập lý do duyệt đề xuất...',
    api: proposalReviewService.approve
  },
  reject: {
    title: 'Không duyệt đề xuất',
    description: 'Đề xuất sẽ bị hủy. Vui lòng nhập lý do cụ thể.',
    confirmText: 'Không duyệt',
    confirmClass: 'btn-error',
    reasonLabel: 'Lý do không duyệt đề xuất',
    reasonPlaceholder: 'Nhập lý do không duyệt đề xuất...',
    api: proposalReviewService.reject
  }
};

const ScoreCell = ({ score, note }) => {
  if (score === null || score === undefined) {
    return <span className="text-base-content/60">Chưa chấm</span>;
  }
  return (
    <span
      className="badge badge-primary badge-sm"
      title={note || 'Chưa có đánh giá chi tiết'}
    >
      {formatScore(score)}
    </span>
  );
};

const ProposalReviewTab = ({ tab, reviewRole = '', region = '', roleKey, isAdmin = false }) => {
  const { token } = useAuth();
  const viewId = useDefaultViewId('station_proposals', PROPOSALS_VIEW_ID);
  const { getSelectOptions } = useFieldOptions('station_proposals', ['mo_hinh_dau_tu']);
  const modelOptions = getSelectOptions('mo_hinh_dau_tu');

  const canGradeQH = roleKey === 'QH' || roleKey === 'ADMIN';
  const canGradePL = roleKey === 'PL' || roleKey === 'ADMIN';
  const canGrade = canGradeQH || canGradePL;
  const canActAsGdttkd = roleKey === 'GDTTKD' || roleKey === 'ADMIN';
  const canActAsGrading = roleKey === 'QH' || roleKey === 'PL' || roleKey === 'ADMIN';
  const canActAsTgd = roleKey === 'TGD' || roleKey === 'ADMIN';
  const isPending = tab === 'pending';

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');

  const [detailPopup, setDetailPopup] = useState({ open: false, record: null });
  const [editPopup, setEditPopup] = useState({ open: false, record: null });
  const [scoreModal, setScoreModal] = useState({ open: false, record: null });
  const [actionDialog, setActionDialog] = useState({
    open: false, type: null, row: null, error: '', saving: false
  });

  const loadItems = useCallback(async (targetPage = 1, targetSize = pageSize, targetSearch = debouncedSearch) => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('tab', tab);
      if (reviewRole) params.set('reviewRole', reviewRole);
      if (region) params.set('region', region);
      if (targetSearch) params.set('search', targetSearch);
      params.set('page', targetPage);
      params.set('limit', targetSize);
      const res = await proposalReviewService.getAll(params.toString(), token);
      setItems(res?.data || []);
      setPagination(res?.pagination || { page: targetPage, limit: targetSize, total: 0, totalPages: 0 });
    } catch (err) {
      setError(err?.message || 'Không tải được danh sách đề xuất');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, tab, reviewRole, region, pageSize, debouncedSearch]);

  useEffect(() => {
    setPage(1);
    loadItems(1);
  }, [tab, reviewRole, region, debouncedSearch]);

  const openDetail = (record) => setDetailPopup({ open: true, record });

  const openEditOrGrade = (record) => {
    setDetailPopup({ open: false, record: null });
    if (canGrade) {
      setScoreModal({ open: true, record });
    } else {
      setEditPopup({ open: true, record });
    }
  };

  const openAction = (row, type) => {
    setActionDialog({ open: true, type, row, error: '', saving: false });
  };

  const closeAction = () => {
    setActionDialog({ open: false, type: null, row: null, error: '', saving: false });
  };

  const runAction = async (reason) => {
    const config = ACTION_CONFIG[actionDialog.type];
    if (!config || !actionDialog.row) return;
    setActionDialog((prev) => ({ ...prev, saving: true, error: '' }));
    try {
      const res = await config.api(actionDialog.row.id, { reason }, token);
      const roundNo = res?.data?.roundNo;
      const suffix = actionDialog.type === 'regrade' && roundNo ? ` (lần chấm lại ${roundNo})` : '';
      setToastMessage(`${res?.message || config.confirmText}${suffix}`);
      setToastType('success');
      closeAction();
      loadItems(page, pageSize);
    } catch (err) {
      setActionDialog((prev) => ({
        ...prev,
        saving: false,
        error: err?.message || 'Không thực hiện được thao tác'
      }));
    }
  };

  const handleGradeSaved = (result, message) => {
    setScoreModal({ open: false, record: null });
    const transition = result?.transition;
    let extra = '';
    if (transition?.status === 'CANCELLED') extra = ' — Đề xuất bị hủy vì có điểm 0';
    else if (transition?.status === 'DESIGNING') extra = ' — Đề xuất chuyển sang Đang vẽ Layout';
    else if (transition?.status === 'RE_GDTTKD_EVALUATING') extra = ' — Đề xuất chuyển sang GĐTTKD xem xét lại';
    else if (transition?.status === 'GDTTKD_EVALUATING') extra = ' — Đề xuất chuyển sang GĐTTKD đánh giá';
    else if (result?.transitionError) extra = ` — ${result.transitionError}`;
    setToastMessage((message || 'Đã cập nhật đánh giá') + extra);
    setToastType(result?.transitionError ? 'warning' : 'success');
    loadItems(page, pageSize);
  };

  const handleEditSaved = () => {
    setEditPopup({ open: false, record: null });
    setToastMessage('Đã cập nhật thông tin đề xuất');
    setToastType('success');
    loadItems(page, pageSize);
  };

  const renderActions = (row) => {
    if (isPending) {
      return (
        <div className="flex flex-wrap gap-1">
          <button type="button" className="btn btn-ghost btn-xs gap-1" onClick={() => openDetail(row)}>
            <Eye size={14} />
            Xem chi tiết
          </button>
          {canActAsGdttkd && row.status === 'GDTTKD_EVALUATING' && (
            <>
              <button
                type="button"
                className="btn btn-warning btn-xs gap-1"
                onClick={() => openAction(row, 'regrade')}
              >
                <RotateCcw size={14} />
                Yêu cầu đánh giá lại
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs text-error gap-1"
                onClick={() => openAction(row, 'cancel')}
              >
                <XCircle size={14} />
                Xác nhận hủy
              </button>
            </>
          )}
          {canActAsGdttkd && row.status === 'RE_GDTTKD_EVALUATING' && (
            <>
              <button
                type="button"
                className="btn btn-primary btn-xs gap-1"
                onClick={() => openAction(row, 'toTgd')}
              >
                <Send size={14} />
                Trình TGĐ xem xét
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs text-error gap-1"
                onClick={() => openAction(row, 'cancel')}
              >
                <XCircle size={14} />
                Xác nhận hủy
              </button>
            </>
          )}
          {canActAsGrading && row.status === 'RE_GRADING' && (
            <button
              type="button"
              className="btn btn-primary btn-xs gap-1"
              onClick={() => setScoreModal({ open: true, record: row })}
            >
              <Pencil size={14} />
              Chấm điểm lại
            </button>
          )}
          {canActAsTgd && row.status === 'TGD_REVIEW' && (
            <>
              <button
                type="button"
                className="btn btn-success btn-xs gap-1"
                onClick={() => openAction(row, 'approve')}
              >
                <Check size={14} />
                Duyệt đề xuất
              </button>
              <button
                type="button"
                className="btn btn-error btn-xs gap-1"
                onClick={() => openAction(row, 'reject')}
              >
                <X size={14} />
                Không duyệt đề xuất
              </button>
            </>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-wrap gap-1">
        <button type="button" className="btn btn-ghost btn-xs gap-1" onClick={() => openDetail(row)}>
          <Eye size={14} />
          Xem chi tiết
        </button>
        <button type="button" className="btn btn-ghost btn-xs gap-1" onClick={() => openEditOrGrade(row)}>
          <Pencil size={14} />
          Cập nhật
        </button>
      </div>
    );
  };

  const colCount = 13;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="input input-bordered flex items-center gap-2 input-sm w-72">
          <Search size={14} />
          <input
            className="grow"
            placeholder="Tìm mã, pháp nhân, SĐT, địa chỉ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setSearch('')}>
              <X size={14} />
            </button>
          )}
        </label>
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
            <table className="table table-sm table-zebra min-w-[1600px]">
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
                  <th>Mức độ xem xét</th>
                  <th>Điểm Quy hoạch</th>
                  <th>Điểm Pháp lý</th>
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
                  items.map((row, index) => {
                    const statusColor = getStatusColor(row.status);
                    return (
                      <tr key={row.id}>
                        <td>{(page - 1) * pageSize + index + 1}</td>
                        <td>
                          <div className="flex flex-col items-start gap-1">
                            <ProposalCodeLink
                              id={row.id}
                              code={row.ma_de_xuat || `#${row.id}`}
                              onOpen={() => openDetail(row)}
                            />
                            <span
                              className="badge badge-xs text-white"
                              style={statusColor ? { backgroundColor: statusColor } : undefined}
                            >
                              {getStatusLabel(row.status)}
                            </span>
                          </div>
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
                        <td>
                          <span className="badge badge-ghost badge-sm">
                            {getReviewLevelLabel(row.review_level)}
                          </span>
                        </td>
                        <td>
                          <ScoreCell score={row.quy_hoach_score} note={row.quy_hoach_note} />
                        </td>
                        <td>
                          <ScoreCell score={row.phap_ly_score} note={row.phap_ly_note} />
                        </td>
                        <td className="whitespace-nowrap">{renderActions(row)}</td>
                      </tr>
                    );
                  })
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
              onUpdate={() => openEditOrGrade(detailPopup.record)}
            />
          )}
          onClose={() => setDetailPopup({ open: false, record: null })}
        />
      )}

      {editPopup.open && (
        <RecordDetailPopup
          entity="station_proposals"
          record={editPopup.record}
          viewId={viewId}
          mode="edit"
          allowEdit
          onSaved={handleEditSaved}
          onClose={() => setEditPopup({ open: false, record: null })}
        />
      )}

      <ProposalGradingModal
        open={scoreModal.open}
        record={scoreModal.record}
        canGradeQH={canGradeQH}
        canGradePL={canGradePL}
        onClose={() => setScoreModal({ open: false, record: null })}
        onSaved={handleGradeSaved}
      />

      <ReviewActionDialog
        isOpen={actionDialog.open}
        title={ACTION_CONFIG[actionDialog.type]?.title || ''}
        description={ACTION_CONFIG[actionDialog.type]?.description || ''}
        confirmText={ACTION_CONFIG[actionDialog.type]?.confirmText || 'Xác nhận'}
        confirmClass={ACTION_CONFIG[actionDialog.type]?.confirmClass || 'btn-primary'}
        reasonLabel={ACTION_CONFIG[actionDialog.type]?.reasonLabel || 'Lý do'}
        reasonPlaceholder={ACTION_CONFIG[actionDialog.type]?.reasonPlaceholder || 'Nhập lý do...'}
        requireReason
        saving={actionDialog.saving}
        error={actionDialog.error}
        onClose={closeAction}
        onConfirm={runAction}
      />

      <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />
    </div>
  );
};

export default ProposalReviewTab;
