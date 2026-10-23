import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { proposalApprovalService } from '../../services/api';
import useDefaultViewId from '../../hooks/useDefaultViewId';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import useFieldOptions from '../../hooks/useFieldOptions';
import DynamicTable from '../dynamic/DynamicTable';
import Pagination from '../Pagination';
import Toast from '../Toast';
import RecordDetailPopup from './RecordDetailPopup';
import ReviewActionDialog from './ReviewActionDialog';
import ProposalApprovalSummary from './ProposalApprovalSummary';
import ProposalSignatureConfigModal from './ProposalSignatureConfigModal';
import { ProposalCodeLink, ProposalPersonLink } from './ProposalLinkCells';
import { ProposalModelBadge, ProposalStatusBadge, PROPOSAL_VIEW_BUTTON_CLASS } from './ProposalTableBadges';
import {
  formatProposalCost,
  formatProposalScale,
  getProposalAddress,
  getProposalLegalName,
  getProposalPhone
} from '../../utils/proposalGrading';
import { canConfigureSignature, canRequestUpdate } from '../../utils/proposalApproval';
import { Eye, PenSquare, Search, X } from 'lucide-react';

const PROPOSALS_VIEW_ID = 8;

const APPROVAL_COLUMNS = [
  { key: 'ma_de_xuat', field_key: 'ma_de_xuat', label: 'Mã đề xuất', width: 120, sortable: true, filterable: false, visible: true },
  { key: 'legal_name', field_key: 'legal_name', label: 'Tên pháp nhân', width: 180, sortable: false, filterable: false, visible: true },
  { key: 'phone', field_key: 'phone', label: 'SĐT liên hệ', width: 120, sortable: false, filterable: false, visible: true },
  { key: 'mo_hinh_dau_tu', field_key: 'mo_hinh_dau_tu', label: 'Mô hình đầu tư', width: 140, sortable: false, filterable: false, visible: true },
  { key: 'address', field_key: 'address', label: 'Địa chỉ chi tiết', width: 240, sortable: false, filterable: false, visible: true },
  { key: 'scale', field_key: 'scale', label: 'Quy mô trụ đề xuất', width: 160, sortable: false, filterable: false, visible: true },
  { key: 'cost', field_key: 'cost', label: 'Tổng chi phí dự kiến', width: 150, sortable: false, filterable: false, visible: true },
  { key: 'user_name', field_key: 'user_name', label: 'Người đề xuất', width: 160, sortable: false, filterable: false, visible: true },
  { key: 'status', field_key: 'status', label: 'Trạng thái', width: 150, sortable: true, filterable: false, visible: true },
  { key: 'task_description', field_key: 'task_description', label: 'Mô tả việc cần làm', width: 200, sortable: false, filterable: false, visible: true }
];

const ProposalApprovalTab = ({ tab }) => {
  const { token } = useAuth();
  const viewId = useDefaultViewId('station_proposals', PROPOSALS_VIEW_ID);
  const { getSelectOptions } = useFieldOptions('station_proposals', ['mo_hinh_dau_tu', 'status']);

  const modelOptions = getSelectOptions('mo_hinh_dau_tu');
  const statusOptions = getSelectOptions('status');
  const statusOptionMap = useMemo(() => {
    const map = {};
    (statusOptions || []).forEach((option) => { map[option.value] = option; });
    return map;
  }, [statusOptions]);

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
  const [requestDialog, setRequestDialog] = useState({ open: false, row: null });
  const [requestSaving, setRequestSaving] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [signatureModal, setSignatureModal] = useState({ open: false, record: null });
  const [meta, setMeta] = useState({});
  const [rejectDialog, setRejectDialog] = useState({ open: false, row: null });
  const [rejectSaving, setRejectSaving] = useState(false);
  const [rejectError, setRejectError] = useState('');

  const isTgdReadOnly = meta.roleKey === 'TGD' && !meta.isAdmin;
  const canTgdReject = !!(meta.isAdmin || meta.roleKey === 'TGD');

  const loadItems = useCallback(async (targetPage = 1, targetSize = pageSize, targetSearch = debouncedSearch) => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('tab', tab);
      if (targetSearch) params.set('search', targetSearch);
      params.set('page', targetPage);
      params.set('limit', targetSize);
      const res = await proposalApprovalService.getAll(params.toString(), token);
      setItems(res?.data || []);
      setMeta(res?.meta || {});
      setPagination(res?.pagination || { page: targetPage, limit: targetSize, total: 0, totalPages: 0 });
    } catch (err) {
      setError(err?.message || 'Không tải được danh sách đề xuất');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, tab, pageSize, debouncedSearch]);

  useEffect(() => {
    setPage(1);
    loadItems(1);
  }, [tab, debouncedSearch]);

  const openDetail = (record) => setDetailPopup({ open: true, record });

  const openRequestDialog = (record) => {
    setDetailPopup({ open: false, record: null });
    setRequestError('');
    setRequestDialog({ open: true, row: record });
  };

  const openSignatureModal = (record) => {
    setDetailPopup({ open: false, record: null });
    setSignatureModal({ open: true, record });
  };

  const handleRequestUpdate = async (description) => {
    if (!requestDialog.row) return;
    setRequestSaving(true);
    setRequestError('');
    try {
      const res = await proposalApprovalService.requestUpdate(
        requestDialog.row.id,
        { description },
        token
      );
      setToastMessage(res?.message || 'Đã yêu cầu cập nhật thông tin');
      setToastType('success');
      setRequestDialog({ open: false, row: null });
      loadItems(page, pageSize);
    } catch (err) {
      setRequestError(err?.message || 'Không gửi được yêu cầu cập nhật');
    } finally {
      setRequestSaving(false);
    }
  };

  const openRejectDialog = (record) => {
    setRejectError('');
    setRejectDialog({ open: true, row: record });
  };

  const handleTgdReject = async (reason) => {
    if (!rejectDialog.row) return;
    setRejectSaving(true);
    setRejectError('');
    try {
      const res = await proposalApprovalService.tgdReject(rejectDialog.row.id, { reason }, token);
      setToastMessage(res?.message || 'Đã từ chối duyệt BCĐX');
      setToastType('success');
      setRejectDialog({ open: false, row: null });
      loadItems(page, pageSize);
    } catch (err) {
      setRejectError(err?.message || 'Không từ chối duyệt được');
    } finally {
      setRejectSaving(false);
    }
  };

  const handleSignatureSaved = (result) => {
    setSignatureModal({ open: false, record: null });
    setToastMessage('Đã cấu hình trình ký BCĐX — đề xuất chuyển sang Đang trình ký');
    setToastType('success');
    loadItems(page, pageSize);
  };

  const handleRevisionRequested = (result) => {
    setSignatureModal({ open: false, record: null });
    setToastMessage(result?.message || 'Đã yêu cầu cập nhật thông tin');
    setToastType('success');
    loadItems(page, pageSize);
  };

  const cellRenderers = {
    ma_de_xuat: (row, value) => (
      <ProposalCodeLink
        id={row.id}
        code={value || `#${row.id}`}
      />
    ),
    legal_name: (row) => getProposalLegalName(row),
    phone: (row) => getProposalPhone(row),
    mo_hinh_dau_tu: (row, value) => <ProposalModelBadge value={value} options={modelOptions} />,
    address: (row) => <span className="block min-w-[220px]">{getProposalAddress(row)}</span>,
    scale: (row) => formatProposalScale(row),
    cost: (row) => formatProposalCost(row),
    user_name: (row, value) => <ProposalPersonLink id={row.user_id} name={value} />,
    status: (row, value) => <ProposalStatusBadge value={value} optionMap={statusOptionMap} />,
    task_description: (row, value) => (
      <span className="block min-w-[180px] text-sm">
        {value ? value : <span className="text-base-content/50">-</span>}
      </span>
    )
  };

  const renderActions = (row) => (
    <div className="flex flex-wrap gap-1">
      <button
        type="button"
        className={PROPOSAL_VIEW_BUTTON_CLASS}
        title="Xem chi tiết đề xuất"
        onClick={() => openDetail(row)}
      >
        <Eye size={14} />
        Xem chi tiết
      </button>
      {!isTgdReadOnly && canRequestUpdate(row) && (
        <button
          type="button"
          className="btn btn-xs btn-outline btn-warning"
          title="Yêu cầu cập nhật thông tin / file BCĐX"
          onClick={() => openRequestDialog(row)}
        >
          Yêu cầu cập nhật thông tin
        </button>
      )}
      {canTgdReject && row.status === 'PROPOSAL_REPORT_REVIEWING' && (
        <button
          type="button"
          className="btn btn-xs btn-outline btn-error"
          title="Tổng giám đốc từ chối duyệt BCĐX"
          onClick={() => openRejectDialog(row)}
        >
          Từ chối duyệt
        </button>
      )}
      {!isTgdReadOnly && canConfigureSignature(row) && (
        <button
          type="button"
          className="btn btn-xs btn-success gap-1"
          title="Cấu hình ký và trình ký"
          onClick={() => openSignatureModal(row)}
        >
          <PenSquare size={14} />
          Cấu hình ký
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="input input-bordered flex items-center gap-2 input-sm w-64">
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
          <DynamicTable
            entity="station_proposals"
            columns={APPROVAL_COLUMNS}
            data={items}
            startIndex={(page - 1) * pageSize}
            cellRenderers={cellRenderers}
            actions={renderActions}
            frozenColumns={3}
          />
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
            <ProposalApprovalSummary
              record={detailPopup.record}
              formData={ctx?.formData}
            />
          )}
          onClose={() => setDetailPopup({ open: false, record: null })}
        />
      )}

      <ReviewActionDialog
        isOpen={requestDialog.open}
        title="Yêu cầu cập nhật thông tin"
        description={`Đề xuất ${requestDialog.row?.ma_de_xuat || ''}: mô tả nội dung cần cập nhật (file BCĐX, thông tin đề xuất).`}
        confirmText="Gửi yêu cầu"
        confirmClass="btn-warning"
        reasonLabel="Nội dung cần cập nhật"
        reasonPlaceholder="Nhập nội dung cần cập nhật..."
        saving={requestSaving}
        error={requestError}
        onClose={() => setRequestDialog({ open: false, row: null })}
        onConfirm={handleRequestUpdate}
      />

      <ReviewActionDialog
        isOpen={rejectDialog.open}
        title="Từ chối duyệt BCĐX"
        description={`Đề xuất ${rejectDialog.row?.ma_de_xuat || ''}: nêu lý do từ chối. Đề xuất sẽ chuyển sang chờ cập nhật lại BCĐX và thông báo cho GĐTTKD khu vực.`}
        confirmText="Từ chối duyệt"
        confirmClass="btn-error"
        reasonLabel="Lý do từ chối"
        reasonPlaceholder="Nhập lý do từ chối duyệt..."
        saving={rejectSaving}
        error={rejectError}
        onClose={() => setRejectDialog({ open: false, row: null })}
        onConfirm={handleTgdReject}
      />

      <ProposalSignatureConfigModal
        open={signatureModal.open}
        record={signatureModal.record}
        onClose={() => setSignatureModal({ open: false, record: null })}
        onSaved={handleSignatureSaved}
        onRequestUpdate={handleRevisionRequested}
      />

      <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />
    </div>
  );
};

export default ProposalApprovalTab;
