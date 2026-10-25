import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { proposalReportService } from '../../services/api';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import useFieldOptions from '../../hooks/useFieldOptions';
import useMediaQuery from '../../hooks/useMediaQuery';
import DynamicTable from '../dynamic/DynamicTable';
import Pagination from '../Pagination';
import Toast from '../Toast';
import ProposalReportUpdateModal from './ProposalReportUpdateModal';
import { ProposalCodeLink, ProposalPersonLink } from './ProposalLinkCells';
import {
  PROPOSAL_CONTEXT_COLUMNS,
  ProposalAddressCell,
  ProposalManagerCell,
  ProposalProvinceCell,
  ProposalRegionCell
} from './ProposalTableCells';
import { ProposalModelBadge, ProposalStatusBadge } from './ProposalTableBadges';
import { FilterBody, FilterToggle } from '../ui/FilterPanel';
import ProposalAdvancedFilters from './ProposalAdvancedFilters';
import {
  formatProposalScale,
  getProposalAddress,
  getProposalLegalName,
  getProposalPhone
} from '../../utils/proposalGrading';
import {
  canUploadReport,
  formatCommittedPoles,
  uploadButtonLabel
} from '../../utils/proposalReport';
import { Pencil, RotateCcw, Search } from 'lucide-react';

const EMPTY_FILTERS = {
  proposalStatus: '', model: '', province: '', region: '',
  ownerUserId: '', managerUserId: '', dateFrom: '', dateTo: ''
};
const TAB_STATUSES = {
  all: ['PROPOSAL_REPORT_CREATING', 'PROPOSAL_REPORT_RE_CREATING', 'PROPOSAL_REPORT_UPDATING', 'PROPOSAL_REPORT_REVIEWING', 'SIGNATURE_PENDING', 'COMPLETED', 'CANCELLED'],
  pending: ['PROPOSAL_REPORT_CREATING', 'PROPOSAL_REPORT_RE_CREATING', 'PROPOSAL_REPORT_UPDATING'],
  completed: ['PROPOSAL_REPORT_REVIEWING', 'SIGNATURE_PENDING', 'COMPLETED', 'CANCELLED']
};

const REPORT_COLUMNS = [
  { key: 'ma_de_xuat', field_key: 'ma_de_xuat', label: 'Mã đề xuất', width: 120, sortable: true, filterable: false, visible: true },
  { key: 'legal_name', field_key: 'legal_name', label: 'Tên pháp nhân', width: 180, sortable: false, filterable: false, visible: true },
  { key: 'phone', field_key: 'phone', label: 'SĐT liên hệ', width: 120, sortable: false, filterable: false, visible: true },
  { key: 'mo_hinh_dau_tu', field_key: 'mo_hinh_dau_tu', label: 'Mô hình đầu tư', width: 140, sortable: false, filterable: false, visible: true },
  ...PROPOSAL_CONTEXT_COLUMNS,
  { key: 'scale', field_key: 'scale', label: 'Quy mô trụ đề xuất', width: 160, sortable: false, filterable: false, visible: true },
  { key: 'chot_so_luong_tru', field_key: 'chot_so_luong_tru', label: 'Số lượng trụ chốt', width: 240, sortable: false, filterable: false, visible: true },
  { key: 'user_name', field_key: 'user_name', label: 'Người đề xuất', width: 160, sortable: false, filterable: false, visible: true },
  { key: 'status', field_key: 'status', label: 'Trạng thái Quy trình', width: 150, sortable: true, filterable: false, visible: true },
  { key: 'task_description', field_key: 'task_description', label: 'Mô tả việc cần làm', width: 200, sortable: false, filterable: false, visible: true }
];

const ProposalReportTab = ({ tab }) => {
  const { token } = useAuth();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const { getSelectOptions } = useFieldOptions('station_proposals', ['mo_hinh_dau_tu', 'status']);

  const modelOptions = getSelectOptions('mo_hinh_dau_tu');
  const statusOptions = getSelectOptions('status');
  const tabStatusOptions = useMemo(() => {
    const statusMap = new Map(statusOptions.map((option) => [option.value, option]));
    return TAB_STATUSES[tab].map((value) => statusMap.get(value) || {
      value,
      label: value.replaceAll('_', ' ')
    });
  }, [statusOptions, tab]);
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
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [filterOptions, setFilterOptions] = useState({ owners: [], managers: [], provinces: [], models: [], regions: [] });
  const [filterOptionsError, setFilterOptionsError] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');

  const [uploadModal, setUploadModal] = useState({ open: false, record: null });

  const loadItems = useCallback(async (
    targetPage = 1,
    targetSize = pageSize,
    targetSearch = debouncedSearch,
    targetFilters = appliedFilters
  ) => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('tab', tab);
      if (targetSearch) params.set('search', targetSearch);
      const filterKeys = {
        proposalStatus: 'proposal_status',
        model: 'model',
        province: 'province',
        region: 'region',
        ownerUserId: 'owner_user_id',
        managerUserId: 'manager_user_id',
        dateFrom: 'date_from',
        dateTo: 'date_to'
      };
      Object.entries(filterKeys).forEach(([key, queryKey]) => {
        if (targetFilters[key]) params.set(queryKey, targetFilters[key]);
      });
      params.set('page', targetPage);
      params.set('limit', targetSize);
      const res = await proposalReportService.getAll(params.toString(), token);
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
    loadItems(1, pageSize, debouncedSearch, appliedFilters);
  }, [tab, debouncedSearch, appliedFilters, pageSize]);

  const openUpload = (record) => {
    setUploadModal({ open: true, record });
  };

  const handleUploaded = (result) => {
    setUploadModal({ open: false, record: null });
    setToastType('success');
    setToastMessage('Đã tải lên tờ trình BCĐX — đề xuất chuyển sang Đang duyệt BCĐX');
    loadItems(page, pageSize, debouncedSearch, appliedFilters);
  };

  useEffect(() => {
    let cancelled = false;
    proposalReportService.getFilterOptions(token)
      .then((response) => {
        if (!cancelled) {
          setFilterOptions(response?.data || {});
          setFilterOptionsError('');
        }
      })
      .catch((optionsError) => {
        if (!cancelled) setFilterOptionsError(optionsError?.message || 'Không tải được dữ liệu bộ lọc');
      });
    return () => { cancelled = true; };
  }, [token]);

  const cellRenderers = {
    ma_de_xuat: (row, value) => (
      <ProposalCodeLink
        id={row.id}
        code={value || `#${row.id}`}
        to={`/admin/proposals/lap-to-trinh/${row.id}`}
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
    chot_so_luong_tru: (row) => <span className="block min-w-[240px]">{formatCommittedPoles(row.chot_so_luong_tru)}</span>,
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
      {row.can_upload && canUploadReport(row) && (
        <button
          type="button"
          className="btn btn-xs btn-primary gap-1"
          title="Tải lên tờ trình BCĐX"
          onClick={() => openUpload(row)}
        >
          <Pencil size={14} />
          {uploadButtonLabel(row)}
        </button>
      )}
    </div>
  );

  const handleSearch = () => {
    setSearch(searchInput.trim());
    setPage(1);
  };
  const applyFilters = () => {
    setAppliedFilters(filters);
    setPage(1);
    setShowFilter(false);
  };
  const resetFilters = () => {
    setSearch('');
    setSearchInput('');
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  };
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const columns = tab === 'all'
    ? REPORT_COLUMNS.filter((column) => column.key !== 'task_description')
    : REPORT_COLUMNS;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          className="input input-bordered input-sm flex-1 min-w-0"
          placeholder="Tìm mã, pháp nhân, SĐT, địa chỉ..."
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
        onApply={applyFilters}
        onReset={resetFilters}
        title="Bộ lọc đề xuất"
      >
        <ProposalAdvancedFilters
          values={filters}
          onChange={setFilters}
          options={filterOptions}
          statusOptions={tabStatusOptions}
          dateLabel="Ngày tạo đề xuất"
        />
        {isDesktop && (
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost btn-sm gap-1" onClick={resetFilters}>
              <RotateCcw size={14} /> Xóa lọc
            </button>
            <button type="button" className="btn btn-primary btn-sm gap-1" onClick={applyFilters}>
              <Search size={14} /> Áp dụng
            </button>
          </div>
        )}
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
            columns={columns}
            data={items}
            startIndex={(page - 1) * pageSize}
            cellRenderers={cellRenderers}
            actions={tab === 'completed' ? undefined : renderActions}
            showActions={tab !== 'completed'}
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

      <ProposalReportUpdateModal
        open={uploadModal.open}
        record={uploadModal.record}
        onClose={() => setUploadModal({ open: false, record: null })}
        onSaved={handleUploaded}
      />

      <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />
    </div>
  );
};

export default ProposalReportTab;
