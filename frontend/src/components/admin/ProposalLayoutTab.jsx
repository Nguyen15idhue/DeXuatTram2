import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { proposalLayoutService } from '../../services/api';
import useDefaultViewId from '../../hooks/useDefaultViewId';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import useFieldOptions from '../../hooks/useFieldOptions';
import DynamicTable from '../dynamic/DynamicTable';
import Pagination from '../Pagination';
import Toast from '../Toast';
import RecordDetailPopup from './RecordDetailPopup';
import ReviewActionDialog from './ReviewActionDialog';
import ProposalLayoutUpdateModal from './ProposalLayoutUpdateModal';
import { ProposalCodeLink, ProposalPersonLink } from './ProposalLinkCells';
import { ProposalModelBadge, ProposalStatusBadge, PROPOSAL_VIEW_BUTTON_CLASS } from './ProposalTableBadges';
import {
  formatProposalScale,
  getProposalAddress,
  getProposalLegalName,
  getProposalPhone
} from '../../utils/proposalGrading';
import { getSupplementCount } from '../../utils/proposalDesign';
import { Eye, Pencil, Search, X } from 'lucide-react';

const PROPOSALS_VIEW_ID = 8;

const LAYOUT_COLUMNS = [
  { key: 'ma_de_xuat', field_key: 'ma_de_xuat', label: 'Mã đề xuất', width: 120, sortable: true, filterable: false, visible: true },
  { key: 'legal_name', field_key: 'legal_name', label: 'Tên pháp nhân', width: 180, sortable: false, filterable: false, visible: true },
  { key: 'phone', field_key: 'phone', label: 'SĐT liên hệ', width: 120, sortable: false, filterable: false, visible: true },
  { key: 'mo_hinh_dau_tu', field_key: 'mo_hinh_dau_tu', label: 'Mô hình đầu tư', width: 140, sortable: false, filterable: false, visible: true },
  { key: 'address', field_key: 'address', label: 'Địa chỉ chi tiết', width: 240, sortable: false, filterable: false, visible: true },
  { key: 'scale', field_key: 'scale', label: 'Quy mô trụ đề xuất', width: 160, sortable: false, filterable: false, visible: true },
  { key: 'user_name', field_key: 'user_name', label: 'Người đề xuất', width: 160, sortable: false, filterable: false, visible: true },
  { key: 'supplement_count', field_key: 'supplement_count', label: 'Số lần YC cập nhật thông tin', width: 160, sortable: false, filterable: false, visible: true },
  { key: 'status', field_key: 'status', label: 'Trạng thái', width: 150, sortable: true, filterable: false, visible: true }
];

const ProposalLayoutTab = ({ tab, canManage }) => {
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
  const [layoutModal, setLayoutModal] = useState({ open: false, record: null });
  const [actionDialog, setActionDialog] = useState({ open: false, type: null, row: null });
  const [actionSaving, setActionSaving] = useState(false);
  const [actionError, setActionError] = useState('');

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
      const res = await proposalLayoutService.getAll(params.toString(), token);
      setItems(res?.data || []);
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

  const openLayoutModal = (record) => {
    setDetailPopup({ open: false, record: null });
    setLayoutModal({ open: true, record });
  };

  const openAction = (record, type) => {
    setActionError('');
    setActionDialog({ open: true, type, row: record });
  };

  const handleLayoutSaved = (result, approve) => {
    setLayoutModal({ open: false, record: null });
    setToastType('success');
    if (approve) setToastMessage('Đã duyệt bản vẽ layout — đề xuất chuyển sang Lập tờ trình BCĐX');
    else setToastMessage('Đã lưu bản vẽ layout');
    loadItems(page, pageSize);
  };

  const handleActionConfirm = async (value) => {
    if (!actionDialog.row) return;
    setActionSaving(true);
    setActionError('');
    try {
      if (actionDialog.type === 'supplement') {
        const res = await proposalLayoutService.requestSupplement(
          actionDialog.row.id,
          { description: value },
          token
        );
        setToastMessage(res?.message || 'Đã gửi yêu cầu bổ sung thông tin');
      } else {
        await proposalLayoutService.cancel(actionDialog.row.id, { reason: value }, token);
        setToastMessage('Đã hủy đề xuất');
      }
      setToastType('success');
      setActionDialog({ open: false, type: null, row: null });
      loadItems(page, pageSize);
    } catch (err) {
      setActionError(err?.message || 'Không thực hiện được thao tác');
    } finally {
      setActionSaving(false);
    }
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
    user_name: (row, value) => <ProposalPersonLink id={row.user_id} name={value} />,
    supplement_count: (row) => <span className="text-center font-semibold">{getSupplementCount(row)}</span>,
    status: (row, value) => <ProposalStatusBadge value={value} optionMap={statusOptionMap} />
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
      {canManage && row.status === 'DESIGNING' && (
        <>
          <button
            type="button"
            className="btn btn-xs btn-primary gap-1"
            title="Tải bản vẽ layout và duyệt"
            onClick={() => openLayoutModal(row)}
          >
            <Pencil size={14} />
            Cập nhật
          </button>
          <button
            type="button"
            className="btn btn-xs btn-outline btn-warning"
            title="Yêu cầu người đề xuất bổ sung thông tin"
            onClick={() => openAction(row, 'supplement')}
          >
            Yêu cầu bổ sung
          </button>
        </>
      )}
      {canManage && ['DESIGNING', 'INFOR_WAITING'].includes(row.status) && (
        <button
          type="button"
          className="btn btn-xs btn-outline btn-error"
          title="Hủy đề xuất"
          onClick={() => openAction(row, 'cancel')}
        >
          Hủy đề xuất
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
            columns={LAYOUT_COLUMNS}
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
          onClose={() => setDetailPopup({ open: false, record: null })}
        />
      )}

      <ProposalLayoutUpdateModal
        open={layoutModal.open}
        record={layoutModal.record}
        onClose={() => setLayoutModal({ open: false, record: null })}
        onSaved={handleLayoutSaved}
      />

      <ReviewActionDialog
        isOpen={actionDialog.open}
        title={actionDialog.type === 'supplement' ? 'Yêu cầu bổ sung thông tin' : 'Hủy đề xuất'}
        description={
          actionDialog.type === 'supplement'
            ? `Đề xuất ${actionDialog.row?.ma_de_xuat || ''}: mô tả thông tin cần người đề xuất bổ sung để vẽ layout.`
            : `Đề xuất ${actionDialog.row?.ma_de_xuat || ''} sẽ bị hủy và không thể tiếp tục quy trình.`
        }
        confirmText={actionDialog.type === 'supplement' ? 'Gửi yêu cầu' : 'Hủy đề xuất'}
        confirmClass={actionDialog.type === 'supplement' ? 'btn-warning' : 'btn-error'}
        reasonLabel={actionDialog.type === 'supplement' ? 'Thông tin cần bổ sung' : 'Lý do hủy'}
        reasonPlaceholder={
          actionDialog.type === 'supplement'
            ? 'Nhập thông tin cần bổ sung...'
            : 'Nhập lý do hủy đề xuất...'
        }
        saving={actionSaving}
        error={actionError}
        onClose={() => setActionDialog({ open: false, type: null, row: null })}
        onConfirm={handleActionConfirm}
      />

      <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />
    </div>
  );
};

export default ProposalLayoutTab;
