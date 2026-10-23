import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { proposalApprovalService } from '../../services/api';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import useFieldOptions from '../../hooks/useFieldOptions';
import DynamicTable from '../dynamic/DynamicTable';
import Pagination from '../Pagination';
import { ProposalCodeLink, ProposalPersonLink } from './ProposalLinkCells';
import { ProposalModelBadge, ProposalStatusBadge, PROPOSAL_VIEW_BUTTON_CLASS } from './ProposalTableBadges';
import {
  formatProposalCost,
  formatProposalScale,
  getProposalAddress,
  getProposalLegalName,
  getProposalPhone
} from '../../utils/proposalGrading';
import { Eye, Search, X } from 'lucide-react';

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
  const navigate = useNavigate();
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
        onClick={() => navigate(`/admin/proposals/duyet-bcdx/${row.id}`)}
      >
        <Eye size={14} />
        Xem chi tiết
      </button>
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

    </div>
  );
};

export default ProposalApprovalTab;
