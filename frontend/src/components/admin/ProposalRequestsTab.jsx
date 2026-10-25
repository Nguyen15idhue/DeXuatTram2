import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { proposalRequestService } from '../../services/api';
import DynamicTable from '../dynamic/DynamicTable';
import Pagination from '../Pagination';
import Toast from '../Toast';
import ReviewActionDialog from './ReviewActionDialog';
import ProposalAdvancedFilters from './ProposalAdvancedFilters';
import { FilterBody, FilterToggle } from '../ui/FilterPanel';
import useMediaQuery from '../../hooks/useMediaQuery';
import { ProposalCodeLink, ProposalPersonLink } from './ProposalLinkCells';
import { ProposalStatusBadge } from './ProposalTableBadges';
import { RotateCcw, Search } from 'lucide-react';

const REQUEST_TYPES = [
  { value: 'UPDATE_INFO', label: 'Yêu cầu cập nhật thông tin' },
  { value: 'SUPPLEMENT', label: 'Yêu cầu bổ sung thông tin' },
  { value: 'LAYOUT_SUPPLEMENT', label: 'Yêu cầu bổ sung thông tin để vẽ layout' },
  { value: 'RE_GRADE', label: 'Yêu cầu chấm điểm lại' },
  { value: 'REVISE_BCDX', label: 'Yêu cầu sửa BCĐX' },
  { value: 'TGD_REVIEW', label: 'Trình Tổng giám đốc' },
  { value: 'OTHER', label: 'Yêu cầu khác' }
];

const REQUEST_COLUMNS = [
  { key: 'ma_de_xuat', field_key: 'ma_de_xuat', label: 'Mã đề xuất', width: 120, sortable: true, filterable: false, visible: true },
  { key: 'owner_name', field_key: 'owner_name', label: 'Người đề xuất', width: 160, sortable: true, filterable: false, visible: true },
  { key: 'proposal_status', field_key: 'proposal_status', label: 'Trạng thái hiện tại', width: 140, sortable: true, filterable: false, visible: true },
  { key: 'description', field_key: 'description', label: 'Mô tả công việc cần thực hiện', width: 300, sortable: false, filterable: false, visible: true },
  { key: 'requested_by_name', field_key: 'requested_by_name', label: 'Yêu cầu cập nhật từ', width: 160, sortable: true, filterable: false, visible: true },
  { key: 'previous_status', field_key: 'previous_status', label: 'Trạng thái trước đó', width: 140, sortable: true, filterable: false, visible: true },
  { key: 'created_at', field_key: 'created_at', label: 'Ngày cập nhật', width: 130, sortable: true, filterable: false, visible: true },
  { key: 'round_no', field_key: 'round_no', label: 'Lần yêu cầu thứ', width: 90, sortable: true, filterable: false, visible: true },
  { key: 'note', field_key: 'note', label: 'Ghi chú', width: 200, sortable: false, filterable: false, visible: true }
];

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
};

const EMPTY_FILTERS = {
  proposalStatus: '', model: '', province: '', region: '',
  ownerUserId: '', managerUserId: '', dateFrom: '', dateTo: ''
};

const ProposalRequestsTab = ({ token }) => {
  const navigate = useNavigate();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [type, setType] = useState('');
  const [workScope, setWorkScope] = useState('mine');
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filterOptions, setFilterOptions] = useState({ owners: [], managers: [], workScopes: [] });
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [completeDialog, setCompleteDialog] = useState({ open: false, row: null });
  const [completeNote, setCompleteNote] = useState('');
  const [completeSaving, setCompleteSaving] = useState(false);
  const [completeError, setCompleteError] = useState('');
  const [toastMessage, setToastMessage] = useState('');

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
        if (cancelled || !res?.success) return;
        const data = res.data || {};
        setFilterOptions(data);
        if (data.workScopes?.length) {
          setWorkScope((current) => data.workScopes.some((item) => item.value === current)
            ? current
            : data.workScopes[0].value);
        }
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
      const params = new URLSearchParams({
        status: 'OPEN',
        page: String(targetPage),
        limit: String(pageSize),
        work_scope: workScope
      });
      if (search) params.set('search', search);
      if (type) params.set('type', type);
      if (filters.proposalStatus) params.set('proposal_status', filters.proposalStatus);
      if (filters.model) params.set('model', filters.model);
      if (filters.province) params.set('province', filters.province);
      if (filters.region) params.set('region', filters.region);
      if (filters.ownerUserId) params.set('owner_user_id', filters.ownerUserId);
      if (filters.managerUserId) params.set('manager_user_id', filters.managerUserId);
      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo) params.set('date_to', filters.dateTo);
      const res = await proposalRequestService.getAll(params.toString(), token);
      if (res?.success) {
        setItems(res.data || []);
        setPagination(res.pagination || { page: targetPage, limit: pageSize, total: 0, totalPages: 0 });
      } else {
        setError(res?.message || 'Không tải được danh sách yêu cầu đề xuất');
      }
    } catch (e) {
      setError(e?.message || 'Không tải được danh sách yêu cầu đề xuất');
    } finally {
      setLoading(false);
    }
  }, [token, page, pageSize, search, type, workScope, filters]);

  useEffect(() => { load(); }, [load]);

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
    setType('');
    setWorkScope('mine');
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const activeFilterCount = [
    type,
    workScope !== 'mine' ? workScope : '',
    ...Object.values(filters)
  ].filter(Boolean).length;

  const openCompleteDialog = (row) => {
    setCompleteNote('');
    setCompleteError('');
    setCompleteDialog({ open: true, row });
  };

  const handleComplete = async () => {
    if (!completeDialog.row) return;
    setCompleteSaving(true);
    setCompleteError('');
    try {
      const res = await proposalRequestService.complete(completeDialog.row.id, { resolution_note: completeNote }, token);
      setToastMessage(res?.message || 'Đã đánh dấu yêu cầu hoàn thành');
      setCompleteDialog({ open: false, row: null });
      load();
    } catch (e) {
      setCompleteError(e?.message || 'Không đánh dấu được yêu cầu');
    } finally {
      setCompleteSaving(false);
    }
  };

  const cellRenderers = {
    ma_de_xuat: (row, value) => <ProposalCodeLink id={row.proposal_id} code={value} />,
    owner_name: (row, value) => (
      row.owner_id ? <ProposalPersonLink id={row.owner_id} name={value} /> : <span>Khách</span>
    ),
    proposal_status: (row, value) => <ProposalStatusBadge value={value} />,
    description: (row, value) => (
      <div>
        <div className="text-xs text-base-content/60 mb-0.5">
          {REQUEST_TYPES.find((item) => item.value === row.request_type)?.label || row.request_type}
        </div>
        <div className="whitespace-pre-wrap break-words">{value || '-'}</div>
      </div>
    ),
    requested_by_name: (row, value) => (
      row.requested_by ? <ProposalPersonLink id={row.requested_by} name={value} /> : <span>Hệ thống</span>
    ),
    previous_status: (row, value) => <ProposalStatusBadge value={value} />,
    created_at: (row, value) => <span className="whitespace-nowrap">{formatDateTime(value)}</span>,
    round_no: (row, value) => <span className="text-center">{value}</span>,
    note: (row, value) => <span className="block max-w-[220px] whitespace-pre-wrap break-words">{value || '-'}</span>
  };

  const renderActions = (row) => (
    <div className="flex flex-wrap gap-1">
      {row.can_update && (
        <button
          type="button"
          className="btn btn-xs btn-primary whitespace-nowrap"
          onClick={() => navigate(`/admin/proposals/yeu-cau-cap-nhat/${row.id}`)}
        >
          Cập nhật
        </button>
      )}
      {row.can_complete && !row.can_update && (
        <button
          type="button"
          className="btn btn-xs btn-outline btn-success whitespace-nowrap"
          title="Đánh dấu yêu cầu đã hoàn thành"
          onClick={() => openCompleteDialog(row)}
        >
          Đánh dấu đã hoàn thành
        </button>
      )}
    </div>
  );

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <input
          type="search"
          className="input input-bordered input-sm flex-1 min-w-0"
          placeholder="Tìm mã đề xuất, người đề xuất, địa chỉ, mô tả..."
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
        title="Bộ lọc yêu cầu"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <select
            className="select select-bordered select-sm w-full"
            value={type}
            onChange={(event) => { setType(event.target.value); setPage(1); }}
          >
            <option value="">Tất cả loại yêu cầu</option>
            {REQUEST_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select
            className="select select-bordered select-sm w-full"
            value={workScope}
            onChange={(event) => { setWorkScope(event.target.value); setPage(1); }}
          >
            {(filterOptions.workScopes || [{ value: 'mine', label: 'Công việc của tôi' }])
              .map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
        <ProposalAdvancedFilters
          values={filters}
          options={filterOptions}
          dateLabel="Ngày tạo yêu cầu"
          onChange={updateFilters}
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

      <div className="text-sm text-base-content/60 mb-3">{pagination.total} yêu cầu đang mở</div>

      {error && <div className="alert alert-error text-sm mb-3">{error}</div>}

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-8"><span className="loading loading-spinner" /></div>
      ) : (
        <DynamicTable
          entity="station_proposals"
          columns={REQUEST_COLUMNS}
          data={items}
          actions={renderActions}
          cellRenderers={cellRenderers}
          startIndex={(pagination.page - 1) * pagination.limit}
          frozenColumns={3}
        />
      )}

      <ReviewActionDialog
        isOpen={completeDialog.open}
        title="Đánh dấu đã hoàn thành"
        description={`Yêu cầu ${completeDialog.row?.ma_de_xuat || ''} (lần ${completeDialog.row?.round_no || 1}): nhập kết quả xử lý của bạn.`}
        confirmText="Xác nhận hoàn thành"
        confirmClass="btn-success"
        reasonLabel="Kết quả xử lý"
        reasonPlaceholder="VD: Đã hoàn thành theo yêu cầu..."
        saving={completeSaving}
        error={completeError}
        onClose={() => setCompleteDialog({ open: false, row: null })}
        onConfirm={handleComplete}
      />

      {toastMessage && <Toast message={toastMessage} type="success" onClose={() => setToastMessage('')} />}

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

export default ProposalRequestsTab;
