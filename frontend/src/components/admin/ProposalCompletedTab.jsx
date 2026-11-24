import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { adminProposalService, proposalRequestService } from '../../services/api';
import DynamicTable from '../dynamic/DynamicTable';
import Pagination from '../Pagination';
import useDefaultViewId from '../../hooks/useDefaultViewId';
import useFieldOptions from '../../hooks/useFieldOptions';
import useMediaQuery from '../../hooks/useMediaQuery';
import { FilterBody, FilterToggle } from '../ui/FilterPanel';
import ProposalAdvancedFilters from './ProposalAdvancedFilters';
import { ProposalCodeLink, ProposalProposerCell } from './ProposalLinkCells';
import { ProposalModelBadge, ProposalStatusBadge } from './ProposalTableBadges';
import {
  PROPOSAL_CONTEXT_COLUMNS,
  PROPOSAL_LEGAL_NAME_COLUMN_STYLES,
  PROPOSAL_HIDDEN_COLUMN_KEYS,
  PROPOSAL_HIDDEN_COLUMN_LABELS,
  PROPOSAL_MONEY_COLUMN_KEYS,
  PROPOSAL_SCALE_COLUMN,
  ProposalAddressCell,
  ProposalLegalNameCell,
  ProposalManagerCell,
  ProposalProvinceCell,
  ProposalRegionCell
} from './ProposalTableCells';
import { formatProposalScale } from '../../utils/proposalGrading';
import { RotateCcw, Search } from 'lucide-react';
import { appendMultiFilter, hasFilterValue } from '../../utils/proposalMultiFilters';
import SearchableMultiSelect from '../ui/SearchableMultiSelect';

const PROPOSALS_VIEW_ID = 8;
const STATUS_VALUES = ['APPROVED', 'CANCELLED'];
const EMPTY_FILTERS = {
  proposalStatus: [], model: [], province: [], region: [],
  ownerUserId: [], managerUserId: [], dateFrom: '', dateTo: ''
};

const DEFAULT_COMPLETED_FROZEN = 3;
const DEFAULT_COMPLETED_HIDDEN_KEYS = ['review_level', ...PROPOSAL_MONEY_COLUMN_KEYS, ...PROPOSAL_HIDDEN_COLUMN_KEYS];
const DEFAULT_COMPLETED_HIDDEN_LABELS = ['ID 1Office', ...PROPOSAL_HIDDEN_COLUMN_LABELS];
const USER_TABLE_PREFS_PREFIX = 'tmt.userTablePrefs';

const completedTablePrefsKey = (userId) => `${USER_TABLE_PREFS_PREFIX}.${userId}.proposals.completed`;

const COMPLETED_COLUMN_TOGGLES = [
  { key: 'ma_de_xuat', label: 'Mã đề xuất' },
  { key: 'owner_name', label: 'Tên chủ trạm / Pháp nhân' },
  { key: 'owner_department', label: 'Phòng ban đề xuất' },
  { key: 'vung_mien', label: 'Miền đề xuất' },
  { key: 'manager_name', label: 'Người phụ trách' },
  { key: 'province', label: 'Tỉnh/Thành phố' },
  { key: 'address', label: 'Địa chỉ chi tiết' },
  { key: 'created_at', label: 'Thời gian tạo' },
  { key: 'updated_at', label: 'Lần cập nhật cuối' },
  { key: 'nguoi_de_xuat', label: 'Người đề xuất' },
  { key: 'status', label: 'Trạng thái Quy trình' },
  { key: 'cost', label: 'Tổng chi phí' },
  { key: 'investment_cost', label: 'Giá trị đầu tư' },
  { key: 'tong_chi_phi', label: 'Tổng chi phí' },
  { key: 'tong_gia_tri_chot', label: 'Tổng giá trị chốt' },
  { key: PROPOSAL_SCALE_COLUMN.key, label: PROPOSAL_SCALE_COLUMN.label }
];

const ProposalCompletedTab = ({ token }) => {
  const viewId = useDefaultViewId('station_proposals', PROPOSALS_VIEW_ID);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const { getSelectOptions } = useFieldOptions('station_proposals', ['mo_hinh_dau_tu', 'status']);
  const modelOptions = getSelectOptions('mo_hinh_dau_tu');
  const statusOptionMap = Object.fromEntries(getSelectOptions('status').map((option) => [option.value, option]));
  const statusFilters = STATUS_VALUES.map((value) => ({
    value,
    label: statusOptionMap[value]?.label || (value === 'APPROVED' ? 'Đã duyệt BCĐX' : 'Đã hủy')
  }));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [columnStatus, setColumnStatus] = useState([]);
  const tableRef = useRef(null);
  const loadedRef = useRef(false);
  const [filterOptions, setFilterOptions] = useState({ owners: [], managers: [], provinces: [], models: [], regions: [] });
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const { user } = useAuth();
  const [hiddenKeysOverride, setHiddenKeysOverride] = useState(null);
  const [frozenOverride, setFrozenOverride] = useState(null);
  const [columnWidths, setColumnWidths] = useState({});

  const userTablePrefsKey = user?.id ? completedTablePrefsKey(user.id) : null;

  useEffect(() => {
    if (!userTablePrefsKey) return undefined;
    try {
      const raw = localStorage.getItem(userTablePrefsKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.hiddenColumnKeys) && parsed.hiddenColumnKeys.length) setHiddenKeysOverride(parsed.hiddenColumnKeys);
        if (typeof parsed.frozenColumns === 'number') setFrozenOverride(parsed.frozenColumns);
        if (parsed.columnWidths && typeof parsed.columnWidths === 'object') setColumnWidths(parsed.columnWidths);
      }
    } catch { /* ignore */ }
    return undefined;
  }, [userTablePrefsKey]);

  useEffect(() => {
    if (!userTablePrefsKey) return;
    if (hiddenKeysOverride === null && frozenOverride === null && Object.keys(columnWidths).length === 0) return;
    try {
      localStorage.setItem(
        userTablePrefsKey,
        JSON.stringify({
          hiddenColumnKeys: hiddenKeysOverride || DEFAULT_COMPLETED_HIDDEN_KEYS,
          columnWidths,
          frozenColumns: frozenOverride ?? DEFAULT_COMPLETED_FROZEN
        })
      );
    } catch { /* ignore */ }
  }, [userTablePrefsKey, hiddenKeysOverride, frozenOverride, columnWidths]);

  const effectiveHiddenKeys = hiddenKeysOverride ?? DEFAULT_COMPLETED_HIDDEN_KEYS;

  const handleColumnWidthsChange = (key, width) => {
    setColumnWidths((prev) => ({ ...prev, [key]: width }));
  };

  const visibleToggleKeys = useMemo(
    () => COMPLETED_COLUMN_TOGGLES.filter((t) => !effectiveHiddenKeys.includes(t.key)).map((t) => t.key),
    [effectiveHiddenKeys]
  );

  const visibleColumnsCount = visibleToggleKeys.length;

  const handleColumnVisibilityChange = (nextSelected) => {
    const selectedSet = new Set((Array.isArray(nextSelected) ? nextSelected : []).map(String));
    const toggleableKeys = new Set(COMPLETED_COLUMN_TOGGLES.map((t) => t.key));
    const nextHiddenSet = new Set(
      DEFAULT_COMPLETED_HIDDEN_KEYS.filter((k) => !toggleableKeys.has(k))
    );
    COMPLETED_COLUMN_TOGGLES.forEach((t) => {
      if (!selectedSet.has(t.key)) nextHiddenSet.add(t.key);
    });
    setHiddenKeysOverride([...nextHiddenSet]);
  };

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
      params.set('statuses', (filters.proposalStatus.length ? filters.proposalStatus : STATUS_VALUES).join(','));
      appendMultiFilter(params, 'status', columnStatus);
      params.set('signed_approval_only', '1');
      params.set('page', String(targetPage));
      params.set('limit', String(pageSize));
      if (search) params.set('search', search);
      appendMultiFilter(params, 'model', filters.model);
      appendMultiFilter(params, 'province', filters.province);
      appendMultiFilter(params, 'region', filters.region);
      appendMultiFilter(params, 'owner_user_id', filters.ownerUserId);
      appendMultiFilter(params, 'manager_user_id', filters.managerUserId);
      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo) params.set('date_to', filters.dateTo);
      params.set('date_field', 'created_at');
      const res = await adminProposalService.getAllWithParams(params.toString(), token);
      loadedRef.current = true;
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
  }, [token, page, pageSize, search, filters, columnStatus]);

  useEffect(() => { load(); }, [load]);

  const cellRenderers = {
    ma_de_xuat: (row, value) => <ProposalCodeLink id={row.id} code={value} />,
    owner_name: (row, value) => <ProposalLegalNameCell value={value} />,
    nguoi_de_xuat: (row, value) => <ProposalProposerCell row={row} value={value} />,
    mo_hinh_dau_tu: (row, value) => <ProposalModelBadge value={value} options={modelOptions} />,
    scale: (row) => formatProposalScale(row),
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
    setColumnStatus([]);
    tableRef.current?.clearFilters();
    setPage(1);
  };

  const activeFilterCount = Object.values(filters).filter(hasFilterValue).length;
  const handleColumnStatusChange = useCallback((selected) => {
    setColumnStatus((current) => JSON.stringify(current) === JSON.stringify(selected) ? current : selected);
    setPage(1);
  }, []);

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
          multiple
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
      {loading && !loadedRef.current ? (
        <div className="text-center py-10 text-base-content/60">Đang tải...</div>
      ) : (
        <>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-xs text-base-content/70">Cột đóng băng:</span>
          <select
            className="select select-bordered select-xs"
            value={frozenOverride ?? DEFAULT_COMPLETED_FROZEN}
            onChange={(e) => setFrozenOverride(Number(e.target.value))}
          >
            {[0, 1, 2, 3, 4].map((n) => (<option key={n} value={n}>{n}</option>))}
          </select>
          <span className="text-xs text-base-content/70">Chọn cột hiển thị ({visibleColumnsCount}):</span>
          <div className="w-72 max-w-full">
            <SearchableMultiSelect
              options={COMPLETED_COLUMN_TOGGLES.map((t) => ({ value: t.key, label: t.label }))}
              values={visibleToggleKeys}
              onChange={handleColumnVisibilityChange}
              placeholder="-- Chọn cột hiển thị --"
              selectedLabel="cột"
              ariaLabel="Chọn cột hiển thị"
              showSelectedChips={false}
            />
          </div>
        </div>
        <DynamicTable
          ref={tableRef}
          entity="station_proposals"
          viewId={viewId}
          columnStyleOverrides={PROPOSAL_LEGAL_NAME_COLUMN_STYLES}
          multiStatusFilter
          onStatusFilterChange={handleColumnStatusChange}
          showActions={false}
          columnLabelOverrides={{
            status: 'Trạng thái Quy trình',
            manager_name: 'Người phụ trách',
            vung_mien: 'Miền đề xuất',
            province: 'Tỉnh/Thành phố',
            address: 'Địa chỉ chi tiết'
          }}
          additionalColumns={[...PROPOSAL_CONTEXT_COLUMNS, PROPOSAL_SCALE_COLUMN]}
          columnsAfter={{ anchorKey: 'nguoi_de_xuat', keys: ['owner_department', 'vung_mien'] }}
          hiddenColumnKeys={effectiveHiddenKeys}
          hiddenColumnLabels={hiddenKeysOverride ? hiddenKeysOverride.map((k) => String(k).toLowerCase()) : DEFAULT_COMPLETED_HIDDEN_LABELS}
          density="compact"
          data={items}
          startIndex={(pagination.page - 1) * pagination.limit}
          cellRenderers={cellRenderers}
          frozenColumns={frozenOverride ?? DEFAULT_COMPLETED_FROZEN}
          columnWidths={columnWidths}
          onColumnWidthsChange={handleColumnWidthsChange}
        />
        </>
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
