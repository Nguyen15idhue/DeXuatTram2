import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { proposalApprovalService } from '../../services/api';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import useFieldOptions from '../../hooks/useFieldOptions';
import useMediaQuery from '../../hooks/useMediaQuery';
import DynamicTable from '../dynamic/DynamicTable';
import Pagination from '../Pagination';
import { FilterBody, FilterToggle } from '../ui/FilterPanel';
import ProposalAdvancedFilters from './ProposalAdvancedFilters';
import { appendMultiFilter, hasFilterValue } from '../../utils/proposalMultiFilters';
import { ProposalCodeLink, ProposalPersonLink } from './ProposalLinkCells';
import {
  PROPOSAL_CONTEXT_COLUMNS,
  PROPOSAL_HIDDEN_COLUMN_KEYS,
  PROPOSAL_HIDDEN_COLUMN_LABELS,
  ProposalAddressCell,
  ProposalManagerCell,
  ProposalProvinceCell,
  ProposalRegionCell
} from './ProposalTableCells';
import { ProposalModelBadge, ProposalStatusBadge, PROPOSAL_VIEW_BUTTON_CLASS } from './ProposalTableBadges';
import {
  formatProposalScale,
  getProposalAddress,
  getProposalLegalName,
  getProposalPhone
} from '../../utils/proposalGrading';
import { Eye, Search, X, RotateCcw } from 'lucide-react';

const APPROVAL_COLUMNS = [
  { key: 'ma_de_xuat', field_key: 'ma_de_xuat', label: 'Mã đề xuất', width: 120, sortable: true, filterable: false, visible: true },
  { key: 'legal_name', field_key: 'legal_name', label: 'Tên pháp nhân', width: 180, sortable: false, filterable: false, visible: true },
  { key: 'phone', field_key: 'phone', label: 'SĐT liên hệ', width: 120, sortable: false, filterable: false, visible: true },
  { key: 'mo_hinh_dau_tu', field_key: 'mo_hinh_dau_tu', label: 'Mô hình đầu tư', width: 140, sortable: false, filterable: false, visible: true },
  { key: 'scale', field_key: 'scale', label: 'Quy mô trụ', width: 160, sortable: false, filterable: false, visible: true },
  { key: 'user_name', field_key: 'user_name', label: 'Người đề xuất', width: 160, sortable: false, filterable: false, visible: true },
  ...PROPOSAL_CONTEXT_COLUMNS,
  { key: 'status', field_key: 'status', label: 'Trạng thái Quy trình', width: 150, sortable: true, filterable: false, visible: true },
  { key: 'task_description', field_key: 'task_description', label: 'Mô tả việc cần làm', width: 200, sortable: false, filterable: false, visible: true }
];

const ProposalApprovalTab = ({ tab }) => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const isDesktop = useMediaQuery('(min-width: 768px)');
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
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState({});
  const [appliedFilters, setAppliedFilters] = useState({});
  const [filterOptions, setFilterOptions] = useState({});
  const [filterOptionsError, setFilterOptionsError] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });

  const loadItems = useCallback(async (targetPage = 1, targetSize = pageSize, targetSearch = debouncedSearch) => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('tab', tab);
      if (targetSearch) params.set('search', targetSearch);
      Object.entries({
        proposalStatus: 'proposal_status', model: 'model', province: 'province', region: 'region',
        ownerUserId: 'owner_user_id', managerUserId: 'manager_user_id',
        dateFrom: 'date_from', dateTo: 'date_to'
      }).forEach(([key, queryKey]) => appendMultiFilter(params, queryKey, appliedFilters[key]));
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
  }, [token, tab, pageSize, debouncedSearch, appliedFilters]);

  useEffect(() => {
    setPage(1);
    loadItems(1);
  }, [loadItems]);

  useEffect(() => {
    let cancelled = false;
    if (token) proposalApprovalService.getFilterOptions(token)
      .then((response) => {
        if (!cancelled) {
          setFilterOptions(response?.data || {});
          setFilterOptionsError('');
        }
      })
      .catch((err) => {
        if (!cancelled) setFilterOptionsError(err?.message || 'Không tải được tùy chọn bộ lọc');
      });
    return () => { cancelled = true; };
  }, [token]);

  const applyFilters = () => {
    setPage(1);
    setAppliedFilters(filters);
    setShowFilter(false);
  };
  const resetFilters = () => {
    setSearch('');
    setFilters({});
    setAppliedFilters({});
    setPage(1);
  };

  const cellRenderers = {
    ma_de_xuat: (row, value) => (
      <ProposalCodeLink
        id={row.id}
        code={value || `#${row.id}`}
        to={`/admin/proposals/duyet-bcdx/${row.id}`}
      />
    ),
    legal_name: (row) => getProposalLegalName(row),
    phone: (row) => getProposalPhone(row),
    mo_hinh_dau_tu: (row, value) => <ProposalModelBadge value={value} options={modelOptions} />,
    manager_name: (row) => <ProposalManagerCell row={row} />,
    vung_mien: (row, value) => <ProposalRegionCell value={value || row.vung_mien} />,
    province: (row, value) => <ProposalProvinceCell value={value || row.province} />,
    address: (row, value) => <ProposalAddressCell row={row} value={value || getProposalAddress(row)} />,
    scale: (row) => formatProposalScale(row),
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
        title="Xem và duyệt đề xuất"
        onClick={() => navigate(`/admin/proposals/duyet-bcdx/${row.id}`)}
      >
        <Eye size={14} />
        Xem và duyệt
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
        <FilterToggle open={showFilter} onToggle={() => setShowFilter(value => !value)} count={Object.values(filters).filter(hasFilterValue).length} />
      </div>

      <FilterBody open={showFilter} isDesktop={isDesktop} onClose={() => setShowFilter(false)} onApply={applyFilters} onReset={resetFilters} title="Bộ lọc đề xuất">
        <ProposalAdvancedFilters multiple values={filters} onChange={setFilters} options={filterOptions} />
        {isDesktop && <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost btn-sm gap-1" onClick={resetFilters}><RotateCcw size={14} /> Xóa lọc</button>
          <button type="button" className="btn btn-primary btn-sm gap-1" onClick={applyFilters}><Search size={14} /> Áp dụng</button>
        </div>}
      </FilterBody>
      {filterOptionsError && <div className="alert alert-warning py-2 text-sm">{filterOptionsError}</div>}

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
            density="compact"
            columns={APPROVAL_COLUMNS}
            hiddenColumnKeys={PROPOSAL_HIDDEN_COLUMN_KEYS}
            hiddenColumnLabels={PROPOSAL_HIDDEN_COLUMN_LABELS}
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
