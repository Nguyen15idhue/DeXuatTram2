import { useCallback, useEffect, useState } from 'react';
import { adminProposalService, proposalRequestService } from '../../services/api';
import DynamicTable from '../dynamic/DynamicTable';
import Pagination from '../Pagination';
import useDefaultViewId from '../../hooks/useDefaultViewId';
import useFieldOptions from '../../hooks/useFieldOptions';
import useMediaQuery from '../../hooks/useMediaQuery';
import { FilterBody, FilterToggle } from '../ui/FilterPanel';
import ProposalAdvancedFilters from './ProposalAdvancedFilters';
import { ProposalCodeLink, ProposalPersonLink } from './ProposalLinkCells';
import { ProposalModelBadge, ProposalStatusBadge } from './ProposalTableBadges';
import {
  PROPOSAL_CONTEXT_COLUMNS,
  PROPOSAL_MONEY_COLUMN_KEYS,
  ProposalAddressCell,
  ProposalManagerCell,
  ProposalProvinceCell,
  ProposalRegionCell
} from './ProposalTableCells';
import { RotateCcw, Search } from 'lucide-react';

const PROPOSALS_VIEW_ID = 8;
const STATUS_VALUES = ['COMPLETED', 'CANCELLED'];
const EMPTY_FILTERS = {
  proposalStatus: '', model: '', province: '', region: '',
  ownerUserId: '', managerUserId: '', dateFrom: '', dateTo: ''
};

const ProposalCompletedTab = ({ token }) => {
  const viewId = useDefaultViewId('station_proposals', PROPOSALS_VIEW_ID);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const { getSelectOptions } = useFieldOptions('station_proposals', ['mo_hinh_dau_tu', 'status']);
  const modelOptions = getSelectOptions('mo_hinh_dau_tu');
  const statusOptionMap = Object.fromEntries(getSelectOptions('status').map((option) => [option.value, option]));
  const statusFilters = STATUS_VALUES.map((value) => ({
    value,
    label: statusOptionMap[value]?.label || (value === 'COMPLETED' ? 'Đã hoàn thành' : 'Đã hủy')
  }));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filterOptions, setFilterOptions] = useState({ owners: [], managers: [], provinces: [], models: [], regions: [] });
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    proposalRequestService.getFilterOptions(token)
      .then((res) => {
        if (!cancelled && res?.success) setFilterOptions(res.data || {});
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Không tải được dữ liệu bộ lọc');
      });
    return () => { cancelled = true; };
  }, [token]);

  const load = useCallback(async (targetPage = page) => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('statuses', filters.proposalStatus || STATUS_VALUES.join(','));
      params.set('page', String(targetPage));
      params.set('limit', String(pageSize));
      if (search) params.set('search', search);
      if (filters.model) params.set('model', filters.model);
      if (filters.province) params.set('province', filters.province);
      if (filters.region) params.set('region', filters.region);
      if (filters.ownerUserId) params.set('owner_user_id', filters.ownerUserId);
      if (filters.managerUserId) params.set('manager_user_id', filters.managerUserId);
      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo) params.set('date_to', filters.dateTo);
      params.set('date_field', 'created_at');
      const res = await adminProposalService.getAllWithParams(params.toString(), token);
      if (res?.success) {
        setItems(res.data || []);
        setPagination(res.pagination || { page: targetPage, limit: pageSize, total: 0, totalPages: 0 });
      } else {
        setError(res?.message || 'Không tải được danh sách đề xuất đã hoàn thành');
      }
    } catch (e) {
      setError(e?.message || 'Không tải được danh sách đề xuất đã hoàn thành');
    } finally {
      setLoading(false);
    }
  }, [token, page, pageSize, search, filters]);

  useEffect(() => { load(); }, [load]);

  const cellRenderers = {
    ma_de_xuat: (row, value) => <ProposalCodeLink id={row.id} code={value} />,
    nguoi_de_xuat: (row, value) => (
      row.user_id ? <ProposalPersonLink id={row.user_id} name={row.user_name || value} /> : <span>{value || 'Khách'}</span>
    ),
    mo_hinh_dau_tu: (row, value) => <ProposalModelBadge value={value} options={modelOptions} />,
    manager_name: (row) => <ProposalManagerCell row={row} />,
    vung_mien: (row, value) => <ProposalRegionCell value={value || row.vung_mien} />,
    province: (row, value) => <ProposalProvinceCell value={value || row.province} />,
    address: (row, value) => <ProposalAddressCell row={row} value={value || row.address} />,
    status: (row, value) => <ProposalStatusBadge value={value || row.status} optionMap={statusOptionMap} />
  };

  const updateFilters = (next) => {
    setFilters(next);
    setPage(1);
  };

  const handleSearch = () => {
    setSearch(searchInput.trim());
    setPage(1);
  };

  const handleReset = () => {
    setSearch('');
    setSearchInput('');
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <input
          type="search"
          className="input input-bordered input-sm flex-1 min-w-0"
          placeholder="Tìm mã đề xuất, người đề xuất, địa chỉ..."
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
        />
        <button type="button" className="btn btn-primary btn-sm gap-1 shrink-0" onClick={handleSearch}>
          <Search size={14} /> <span className="hidden sm:inline">Tìm</span>
        </button>
        <FilterToggle open={showFilter} onToggle={() => setShowFilter((value) => !value)} count={activeFilterCount} />
      </div>
      <FilterBody
        open={showFilter}
        isDesktop={isDesktop}
        onClose={() => setShowFilter(false)}
        onApply={() => load(1)}
        onReset={handleReset}
        title="Bộ lọc đề xuất"
      >
        <ProposalAdvancedFilters
          values={filters}
          onChange={updateFilters}
          options={filterOptions}
          statusOptions={statusFilters}
          dateLabel="Ngày tạo đề xuất"
        />
        {isDesktop && (
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost btn-sm gap-1" onClick={handleReset}>
              <RotateCcw size={14} /> Xóa lọc
            </button>
            <button type="button" className="btn btn-primary btn-sm gap-1" onClick={() => load(1)}>
              <Search size={14} /> Áp dụng
            </button>
          </div>
        )}
      </FilterBody>
      <div className="text-sm text-base-content/60 mb-3">{pagination.total} đề xuất</div>
      {error && <div className="alert alert-error text-sm mb-3">{error}</div>}
      {loading && items.length === 0 ? (
        <div className="text-center py-10 text-base-content/60">Đang tải...</div>
      ) : (
        <DynamicTable
          entity="station_proposals"
          viewId={viewId}
          showActions={false}
          columnLabelOverrides={{
            status: 'Trạng thái Quy trình',
            manager_name: 'Người phụ trách',
            vung_mien: 'Miền',
            province: 'Tỉnh/Thành phố',
            address: 'Địa chỉ chi tiết'
          }}
          additionalColumns={PROPOSAL_CONTEXT_COLUMNS}
          hiddenColumnKeys={['review_level', ...PROPOSAL_MONEY_COLUMN_KEYS]}
          density="compact"
          data={items}
          startIndex={(pagination.page - 1) * pagination.limit}
          cellRenderers={cellRenderers}
          frozenColumns={3}
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

export default ProposalCompletedTab;
