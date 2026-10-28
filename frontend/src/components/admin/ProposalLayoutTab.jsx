import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { proposalLayoutService } from '../../services/api';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import useFieldOptions from '../../hooks/useFieldOptions';
import useMediaQuery from '../../hooks/useMediaQuery';
import DynamicTable from '../dynamic/DynamicTable';
import Pagination from '../Pagination';
import Toast from '../Toast';
import ReviewActionDialog from './ReviewActionDialog';
import ProposalLayoutUpdateModal from './ProposalLayoutUpdateModal';
import { ProposalCodeLink, ProposalPersonLink } from './ProposalLinkCells';
import ProposalAdvancedFilters from './ProposalAdvancedFilters';
import { FilterBody, FilterToggle } from '../ui/FilterPanel';
import {
  PROPOSAL_CONTEXT_COLUMNS,
  PROPOSAL_HIDDEN_COLUMN_KEYS,
  PROPOSAL_HIDDEN_COLUMN_LABELS,
  ProposalAddressCell,
  ProposalManagerCell,
  ProposalProvinceCell,
  ProposalRegionCell
} from './ProposalTableCells';
import { ProposalModelBadge, ProposalStatusBadge } from './ProposalTableBadges';
import {
  formatProposalScale,
  getProposalAddress,
  getProposalLegalName,
  getProposalPhone
} from '../../utils/proposalGrading';
import { getSupplementCount } from '../../utils/proposalDesign';
import { Pencil, RotateCcw, Search } from 'lucide-react';

const EMPTY_FILTERS = {
  proposalStatus: '',
  model: '',
  province: '',
  region: '',
  ownerUserId: '',
  managerUserId: '',
  dateFrom: '',
  dateTo: ''
};

const LAYOUT_COLUMNS = [
  { key: 'ma_de_xuat', field_key: 'ma_de_xuat', label: 'Mã đề xuất', width: 120, sortable: true, filterable: false, visible: true },
  { key: 'legal_name', field_key: 'legal_name', label: 'Tên pháp nhân', width: 180, sortable: false, filterable: false, visible: true },
  { key: 'phone', field_key: 'phone', label: 'SĐT liên hệ', width: 120, sortable: false, filterable: false, visible: true },
  { key: 'mo_hinh_dau_tu', field_key: 'mo_hinh_dau_tu', label: 'Mô hình đầu tư', width: 140, sortable: false, filterable: false, visible: true },
  { key: 'scale', field_key: 'scale', label: 'Quy mô trụ', width: 160, sortable: false, filterable: false, visible: true },
  { key: 'user_name', field_key: 'user_name', label: 'Người đề xuất', width: 160, sortable: false, filterable: false, visible: true },
  ...PROPOSAL_CONTEXT_COLUMNS,
  { key: 'supplement_count', field_key: 'supplement_count', label: 'Số lần YC cập nhật thông tin', width: 160, sortable: false, filterable: false, visible: true },
  { key: 'status', field_key: 'status', label: 'Trạng thái Quy trình', width: 150, sortable: true, filterable: false, visible: true }
];

const ProposalLayoutTab = ({ tab, canManage }) => {
  const { token } = useAuth();
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
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [filterOptions, setFilterOptions] = useState({ owners: [], managers: [], provinces: [], models: [], regions: [] });
  const [filterOptionsError, setFilterOptionsError] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');

  const [layoutModal, setLayoutModal] = useState({ open: false, record: null });
  const [actionDialog, setActionDialog] = useState({ open: false, type: null, row: null });
  const [actionSaving, setActionSaving] = useState(false);
  const [actionError, setActionError] = useState('');

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
      const res = await proposalLayoutService.getAll(params.toString(), token);
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
    if (!token) return () => { cancelled = true; };
    proposalLayoutService.getFilterOptions(token)
      .then((response) => {
        if (!cancelled) {
          setFilterOptions(response?.data || {});
          setFilterOptionsError('');
        }
      })
      .catch((filterError) => {
        if (!cancelled) {
          setFilterOptionsError(filterError?.message || 'Không tải được tùy chọn bộ lọc');
        }
      });
    return () => { cancelled = true; };
  }, [token]);

  const openLayoutModal = (record) => {
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
    else setToastMessage('Đã lưu nháp bản vẽ layout');
    loadItems(page, pageSize, debouncedSearch, appliedFilters);
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
      loadItems(page, pageSize, debouncedSearch, appliedFilters);
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
        to={`/admin/proposals/danh-gia-layout/${row.id}`}
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
    supplement_count: (row) => <span className="text-center font-semibold">{getSupplementCount(row)}</span>,
    status: (row, value) => <ProposalStatusBadge value={value} optionMap={statusOptionMap} />
  };

  const renderActions = (row) => (
    <div className="flex flex-wrap gap-1">
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

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const applyFilters = () => {
    setAppliedFilters(filters);
    setPage(1);
    setShowFilter(false);
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

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
            columns={LAYOUT_COLUMNS}
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
            onPageChange={(nextPage) => { setPage(nextPage); loadItems(nextPage); }}
            pageSize={pageSize}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          />
        </>
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
